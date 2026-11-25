import { afterEach, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import * as relayModule from "@/server/relay";
import { createRelay, type RelayOptions } from "@/server/relay";
import type { Extraction } from "@/lib/types";

/** S17 · ráfaga de llamadas: el relay limita sus peticiones simultáneas al LLM y reintenta el STT ante 429/5xx transitorios. */

const EXTRACTION: Extraction = {
  language: "es",
  translation_es: null,
  summary_es: "Incendio en un portal",
  incident_type: "arbol_caido",
  location_text: "Calle Larios",
  keywords: ["fuego"],
  risks: [],
  people_at_risk: 0,
  severity: 3,
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** STT que devuelve un texto distinto por petición («llamada N») para poder identificar cada llamada en el LLM. */
function numberedStt(script?: (n: number) => Response | Error | null) {
  let n = 0;
  const calls: number[] = [];
  const fetchFn = (async () => {
    const k = ++n;
    calls.push(k);
    const s = script?.(k);
    if (s instanceof Error) throw s;
    if (s) return s;
    return Response.json({ text: `llamada ${k}`, language: "es", duration: 10 });
  }) as typeof fetch;
  return { fetch: fetchFn, calls };
}

const servers: http.Server[] = [];
async function boot(fetchFn: typeof fetch, over: Partial<RelayOptions> = {}) {
  const relay = createRelay({
    sttBaseUrl: "http://stt.test/v1",
    sttModel: "m",
    token: "t",
    fetch: fetchFn,
    extract: () => ({ extraction: EXTRACTION, location: { place: null, known: false, aml: { lat: 36.72, lng: -4.42, acc: 1500 } } }),
    bootTag: "",
    log: () => undefined,
    maxPending: 60,
    pendingPerIp: 60,
    uploadLimit: 1000,
    rateLimit: { max: 100, windowMs: 60_000 },
    ...over,
  });
  const server = http.createServer(relay.handler);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  servers.push(server);
  return { relay, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}
afterEach(async () => {
  for (const s of servers.splice(0)) {
    s.closeAllConnections();
    await new Promise((r) => s.close(r));
  }
});

const upload = async (base: string) => {
  const fd = new FormData();
  fd.set("file", new Blob([new Uint8Array(2000)], { type: "audio/webm" }), "c.webm");
  fd.set("consent", "1");
  const r = await fetch(`${base}/llamar`, { method: "POST", body: fd });
  return { code: r.status, id: r.status === 202 ? ((await r.json()).id as string) : "" };
};
const statusOf = async (base: string, id: string) => {
  const r = await fetch(`${base}/llamar/${id}`);
  return r.status === 200 ? await r.json() : { status: `http ${r.status}` };
};
const send = (base: string, id: string) => fetch(`${base}/llamar/${id}/enviar`, { method: "POST" });

/** LLM falso: cuenta peticiones simultáneas; cada llamada termina tras `ms` o cuando se abre su puerta. */
function fakeLlm(ms = 25) {
  const started: number[] = [];
  const gates = new Map<number, () => void>();
  const st = { inFlight: 0, max: 0, total: 0, gated: false };
  const fn = async (transcript: string): Promise<Extraction> => {
    const n = Number(/(\d+)$/.exec(transcript)![1]);
    started.push(n);
    st.total++;
    st.inFlight++;
    st.max = Math.max(st.max, st.inFlight);
    try {
      if (st.gated) await new Promise<void>((r) => gates.set(n, r));
      else await wait(ms);
      return EXTRACTION;
    } finally {
      st.inFlight--;
    }
  };
  return { fn, st, started, open: (n: number) => gates.get(n)?.(), openAll: () => gates.forEach((g) => g()) };
}

describe("S17 · LLM_CONCURRENCY", () => {
  it("(a) con LLM_CONCURRENCY=2 y 10 llamadas a la vez, el LLM nunca ve más de 2 en vuelo y las 10 acaban con extracción", async () => {
    const llm = fakeLlm();
    const stt = numberedStt();
    const { relay, base } = await boot(stt.fetch, { llmExtract: llm.fn, llmConcurrency: 2 });
    const ids: string[] = [];
    for (let i = 0; i < 10; i++) ids.push((await upload(base)).id);
    await relay.idle();
    const sent = await Promise.all(ids.map((id) => send(base, id)));
    expect(sent.map((r) => r.status)).toEqual(Array(10).fill(200));
    const res = await fetch(`${base}/events?token=t`);
    const reader = res.body!.getReader();
    let buf = "";
    const dec = new TextDecoder();
    while ((buf.match(/event: call/g) ?? []).length < 10) buf += dec.decode((await reader.read()).value);
    void reader.cancel();
    expect((buf.match(/"extractor":"llm"/g) ?? []).length).toBe(10);
    expect(llm.st.total).toBe(10);
    expect(llm.st.max).toBe(2);
  });

  it("(b) por defecto son 2; 0, -1, «abc», 1.5 y vacío vuelven al valor por defecto", async () => {
    const parse = (relayModule as unknown as { parseLlmConcurrency?: (v: unknown) => number }).parseLlmConcurrency;
    expect(parse).toBeTypeOf("function");
    expect(parse!(undefined)).toBe(2);
    for (const bad of ["0", "-1", "abc", "1.5", "", " "]) expect(parse!(bad)).toBe(2);
    expect(parse!("1")).toBe(1);
    expect(parse!("5")).toBe(5);
    // Sin opción, el relay aplica 2; con una opción inválida, también.
    for (const over of [{}, { llmConcurrency: 0 }, { llmConcurrency: -1 }, { llmConcurrency: Number.NaN }] as Partial<RelayOptions>[]) {
      const llm = fakeLlm();
      const { relay, base } = await boot(numberedStt().fetch, { llmExtract: llm.fn, ...over });
      const ids: string[] = [];
      for (let i = 0; i < 6; i++) ids.push((await upload(base)).id);
      await relay.idle();
      await Promise.all(ids.map((id) => send(base, id)));
      await expect.poll(() => llm.st.total).toBe(6);
      expect(llm.st.max).toBe(2);
    }
  });

  it("(c) una llamada descartada mientras espera hueco nunca llega al LLM y no pierde el hueco (la 11.ª se atiende)", async () => {
    const llm = fakeLlm();
    llm.st.gated = true;
    const { relay, base } = await boot(numberedStt().fetch, { llmExtract: llm.fn, llmConcurrency: 2 });
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) ids.push((await upload(base)).id);
    await relay.idle();
    await wait(20);
    expect(llm.started).toEqual([1, 2]); // 3 y 4 esperan
    expect((await fetch(`${base}/llamar/${ids[2]}`, { method: "DELETE" })).status).toBe(200);
    llm.st.gated = false;
    llm.openAll();
    const sent = await Promise.all([ids[0], ids[1], ids[3]].map((id) => send(base, id)));
    expect(sent.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(llm.started).toEqual([1, 2, 4]); // la 3 jamás
    // Siguen disponibles los 2 huecos: llamadas nuevas se atienden y, de nuevo, nunca más de 2 a la vez.
    const more: string[] = [];
    for (let i = 0; i < 6; i++) more.push((await upload(base)).id);
    await relay.idle();
    const again = await Promise.all(more.map((id) => send(base, id)));
    expect(again.map((r) => r.status)).toEqual(Array(6).fill(200));
    await expect.poll(() => llm.started.length).toBe(9);
    expect(llm.st.max).toBe(2);
  });

  it("(c2) una llamada caducada mientras espera hueco tampoco llega al LLM", async () => {
    const llm = fakeLlm();
    llm.st.gated = true;
    const { relay, base } = await boot(numberedStt().fetch, { llmExtract: llm.fn, llmConcurrency: 1, pendingTtlMs: 150 });
    const a = (await upload(base)).id;
    const b = (await upload(base)).id;
    await relay.idle();
    await wait(220);
    expect((await statusOf(base, b)).status).toBe("expired");
    llm.st.gated = false;
    llm.openAll();
    await wait(50);
    expect(llm.started).toEqual([1]);
    expect(a).toBeTruthy();
  });

  it("(i) las llamadas con «Enviar» pendiente pasan por delante de las que nadie ha enviado", async () => {
    const llm = fakeLlm();
    llm.st.gated = true;
    const { relay, base } = await boot(numberedStt().fetch, { llmExtract: llm.fn, llmConcurrency: 2 });
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) ids.push((await upload(base)).id);
    await relay.idle();
    await wait(20);
    expect(llm.started).toEqual([1, 2]);
    const pendingSend = send(base, ids[3]); // la 4.ª está esperando hueco y la persona ya pulsó «Enviar»
    await wait(20);
    llm.open(1); // se libera un hueco: debe entrar la 4, no la 3
    await wait(30);
    expect(llm.started).toEqual([1, 2, 4]);
    llm.st.gated = false;
    llm.openAll();
    expect((await pendingSend).status).toBe(200);
    await wait(30);
    expect(llm.started).toEqual([1, 2, 4, 3]);
  });

  it("(h) una llamada normal hace exactamente una petición al STT y una al LLM", async () => {
    const llm = fakeLlm();
    const stt = numberedStt();
    const { relay, base } = await boot(stt.fetch, { llmExtract: llm.fn });
    const { id } = await upload(base);
    await relay.idle();
    expect((await send(base, id)).status).toBe(200);
    expect(stt.calls.length).toBe(1);
    expect(llm.st.total).toBe(1);
  });
});

describe("S17 · STT_RETRIES", () => {
  const sleeps = () => {
    const ms: number[] = [];
    return { ms, sleep: async (n: number) => void ms.push(n) };
  };
  const stat = (s: number, h?: Record<string, string>) => new Response("x", { status: s, headers: h });

  it("(d) 429, 429 y luego 200: la llamada queda lista con exactamente 3 peticiones al STT y esperas 500 ms y 1 s", async () => {
    const stt = numberedStt((k) => (k <= 2 ? stat(429) : null));
    const s = sleeps();
    const lines: string[] = [];
    const { relay, base } = await boot(stt.fetch, { sleep: s.sleep, log: (m) => lines.push(m) });
    const { id } = await upload(base);
    await relay.idle();
    expect((await statusOf(base, id)).status).toBe("ready");
    expect(stt.calls.length).toBe(3);
    expect(s.ms).toEqual([500, 1000]);
    const retries = lines.filter((l) => /reintento/.test(l));
    expect(retries.length).toBe(2);
    expect(retries[0]).toMatch(/^\[relay\] P\d* /);
    expect(retries[0]).not.toContain("llamada 1");
  });

  it("(e) 429 más allá de STT_RETRIES → failed como hoy (1 + 3 peticiones) y devuelve la cuota", async () => {
    const stt = numberedStt(() => stat(429));
    const s = sleeps();
    const { relay, base } = await boot(stt.fetch, { sleep: s.sleep, sttRetries: 3, rateLimit: { max: 1, windowMs: 60_000 } });
    const { id } = await upload(base);
    await relay.idle();
    const st = await statusOf(base, id);
    expect(st.status).toBe("failed");
    expect(st.error).toBe("No se pudo transcribir el audio. Vuelve a grabar.");
    expect(stt.calls.length).toBe(4);
    expect(s.ms).toEqual([500, 1000, 2000]);
    // El 429 del STT es un fallo del servicio; queda presupuesto de subidas.
    expect((await upload(base)).code).toBe(202);
  });

  it.each(["red", "plazo"])("tres fallos de %s consecutivos vacían la espera y una subida nueva vuelve a probar el STT", async (mode) => {
    const gate = Promise.withResolvers<void>();
    let attempts = 0;
    const script = numberedStt();
    const { relay, base } = await boot(async (input, init) => {
      const n = ++attempts;
      if (n <= 3 || (n >= 5 && n <= 6)) {
        await gate.promise;
        if (mode === "red") throw new TypeError("fetch failed");
        const signal = init!.signal!;
        if (signal.aborted) throw signal.reason;
        return new Promise<Response>((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
      }
      return script.fetch(input, init);
    }, { sttRetries: 0, sttTimeoutMs: 60, rateLimit: { max: 5, windowMs: 60_000 } });
    const ids = [];
    for (let i = 0; i < 5; i++) {
      const call = await upload(base);
      expect(call.code).toBe(202);
      ids.push(call.id);
    }
    gate.resolve();
    await relay.idle();
    expect(attempts).toBe(3);
    for (const id of ids.slice(3)) {
      expect(await statusOf(base, id)).toEqual({ status: "failed", error: "El servicio de transcripción no responde. Inténtalo de nuevo en unos minutos." });
    }
    for (const expected of ["ready", "failed", "failed", "ready"]) {
      const call = await upload(base);
      expect(call.code).toBe(202);
      await relay.idle();
      expect((await statusOf(base, call.id)).status).toBe(expected);
    }
  });

  it.each([400, 413])("un rechazo STT %s por el contenido mantiene la cuota", async (code) => {
    const stt = numberedStt(() => stat(code));
    const { relay, base } = await boot(stt.fetch, { rateLimit: { max: 1, windowMs: 60_000 } });
    const call = await upload(base);
    expect(call.code).toBe(202);
    await relay.idle();
    expect(await statusOf(base, call.id)).toEqual({ status: "failed", error: code === 413 ? "La llamada es demasiado larga. Graba una más corta." : "No se pudo transcribir el audio. Vuelve a grabar." });
    expect((await upload(base)).code).toBe(429);
    expect(stt.calls).toEqual([1]);
  });

  it("tres fallos 503 devuelven cuota y huecos, pero no el presupuesto de subidas", async () => {
    const stt = numberedStt((n) => n <= 3 ? stat(503) : null);
    const { relay, base } = await boot(stt.fetch, { sttRetries: 0, uploadLimit: 4, rateLimit: { max: 3, windowMs: 60_000 } });
    for (let i = 0; i < 3; i++) {
      const { code, id } = await upload(base);
      expect(code).toBe(202);
      await relay.idle();
      expect(await statusOf(base, id)).toEqual({ status: "failed", error: "No se pudo transcribir el audio. Vuelve a grabar." });
    }
    expect((await upload(base)).code).toBe(202);
    expect((await upload(base)).code).toBe(429);
  });

  it("(f) 400, 413 y 500 fallan de inmediato, sin reintento", async () => {
    for (const code of [400, 413, 500]) {
      const stt = numberedStt(() => stat(code));
      const s = sleeps();
      const { relay, base } = await boot(stt.fetch, { sleep: s.sleep });
      const { id } = await upload(base);
      await relay.idle();
      expect((await statusOf(base, id)).status).toBe("failed");
      expect(stt.calls.length).toBe(1);
      expect(s.ms).toEqual([]);
    }
  });

  it("502, 503, 504 y errores de red también se reintentan", async () => {
    for (const first of [stat(502), stat(503), stat(504), new TypeError("fetch failed")]) {
      const stt = numberedStt((k) => (k === 1 ? first : null));
      const s = sleeps();
      const { relay, base } = await boot(stt.fetch, { sleep: s.sleep });
      const { id } = await upload(base);
      await relay.idle();
      expect((await statusOf(base, id)).status).toBe("ready");
      expect(stt.calls.length).toBe(2);
      expect(s.ms).toEqual([500]);
    }
  });

  it("STT_RETRIES=0 desactiva los reintentos", async () => {
    const stt = numberedStt(() => stat(429));
    const s = sleeps();
    const { relay, base } = await boot(stt.fetch, { sleep: s.sleep, sttRetries: 0 });
    const { id } = await upload(base);
    await relay.idle();
    expect((await statusOf(base, id)).status).toBe("failed");
    expect(stt.calls.length).toBe(1);
    expect(s.ms).toEqual([]);
  });

  it("parseSttRetries: por defecto 3, 0 válido, inválidos vuelven a 3", () => {
    const parse = (relayModule as unknown as { parseSttRetries?: (v: unknown) => number }).parseSttRetries;
    expect(parse).toBeTypeOf("function");
    expect(parse!(undefined)).toBe(3);
    expect(parse!("0")).toBe(0);
    expect(parse!("5")).toBe(5);
    for (const bad of ["-1", "abc", "2.5", ""]) expect(parse!(bad)).toBe(3);
  });

  it("(g) Retry-After en segundos se respeta con la espera inyectada y se limita a 5 s", async () => {
    const s1 = sleeps();
    const a = await boot(numberedStt((k) => (k === 1 ? stat(429, { "Retry-After": "1" }) : null)).fetch, { sleep: s1.sleep });
    await a.relay.idle();
    const ua = await upload(a.base);
    await a.relay.idle();
    expect((await statusOf(a.base, ua.id)).status).toBe("ready");
    expect(s1.ms).toEqual([1000]);

    const s2 = sleeps();
    const b = await boot(numberedStt((k) => (k === 1 ? stat(503, { "Retry-After": "99" }) : null)).fetch, { sleep: s2.sleep });
    const ub = await upload(b.base);
    await b.relay.idle();
    expect((await statusOf(b.base, ub.id)).status).toBe("ready");
    expect(s2.ms).toEqual([5000]);
  });

  it("los reintentos no superan STT_TIMEOUT_MS: sin presupuesto restante, la llamada falla sin esperar", async () => {
    const stt = numberedStt(() => stat(429));
    const waited: number[] = [];
    const { relay, base } = await boot(stt.fetch, { sttTimeoutMs: 300, sleep: async (n) => void waited.push(n) });
    const { id } = await upload(base);
    await relay.idle();
    expect((await statusOf(base, id)).status).toBe("failed");
    // 500 ms de espera no caben en 300 ms de presupuesto: ninguna espera, una sola petición.
    expect(waited).toEqual([]);
    expect(stt.calls.length).toBe(1);
  });
});

/** T15 · S17: las transcripciones van antes que las extracciones de llamadas aún no enviadas. */
describe("S17 · LLM_DEFER_MAX_MS (T15)", () => {
  /** STT serie falso con retardo; `done` cuenta las transcripciones ya devueltas. */
  function slowStt(ms: number) {
    const inner = numberedStt();
    const st = { done: 0 };
    const fetchFn = (async (...a: Parameters<typeof fetch>) => {
      await wait(ms);
      const r = await inner.fetch(...a);
      st.done++;
      return r;
    }) as typeof fetch;
    return { fetch: fetchFn, st };
  }
  /** LLM falso que anota cuántas transcripciones estaban listas cuando recibió cada petición. */
  function watchedLlm(stt: { st: { done: number } }, ms = 10) {
    const llm = fakeLlm(ms);
    const doneAtStart: number[] = [];
    const fn = (t: string) => {
      doneAtStart.push(stt.st.done);
      return llm.fn(t);
    };
    return { llm, fn, doneAtStart };
  }
  const waitFor = async (cond: () => boolean, ms = 3000) => {
    const t0 = Date.now();
    while (!cond() && Date.now() - t0 < ms) await wait(5);
    expect(cond()).toBe(true);
  };
  const waitReady = async (base: string, id: string) => {
    for (let i = 0; i < 600 && (await statusOf(base, id)).status !== "ready"; i++) await wait(5);
  };

  it("(1) 10 llamadas sin enviar: el LLM no recibe nada hasta la 10.ª transcripción y luego las 10 se extraen con ≤ LLM_CONCURRENCY", async () => {
    const stt = slowStt(30);
    const w = watchedLlm(stt);
    const { relay, base } = await boot(stt.fetch, { llmExtract: w.fn, llmConcurrency: 2, llmDeferMaxMs: 20_000 });
    for (let i = 0; i < 10; i++) await upload(base);
    await relay.idle();
    await waitFor(() => w.llm.st.total === 10);
    expect(w.doneAtStart).toEqual(Array(10).fill(10));
    expect(w.llm.st.max).toBeLessThanOrEqual(2);
    expect(w.llm.st.max).toBe(2);
  });

  it("(2) una llamada enviada mientras otras se transcriben arranca su extracción antes de que el STT quede libre", async () => {
    const stt = slowStt(80);
    const w = watchedLlm(stt);
    const { relay, base } = await boot(stt.fetch, { llmExtract: w.fn, llmConcurrency: 2, llmDeferMaxMs: 20_000 });
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) ids.push((await upload(base)).id);
    await waitReady(base, ids[0]);
    const sent = send(base, ids[0]);
    await waitFor(() => w.doneAtStart.length === 1);
    expect(w.doneAtStart[0]).toBeLessThan(6);
    expect((await sent).status).toBe(200);
    await relay.idle();
  });

  it("(3) bajo carga continua del STT, una extracción diferida arranca pasado LLM_DEFER_MAX_MS", async () => {
    const stt = slowStt(120);
    const w = watchedLlm(stt);
    const { relay, base } = await boot(stt.fetch, { llmExtract: w.fn, llmConcurrency: 2, llmDeferMaxMs: 150 });
    for (let i = 0; i < 10; i++) await upload(base);
    await waitFor(() => w.doneAtStart.length > 0);
    expect(w.doneAtStart[0]).toBeLessThan(10);
    expect(w.doneAtStart[0]).toBeGreaterThanOrEqual(2); // no antes de pasar el plazo (≥ 150 ms tras la 1.ª)
    await relay.idle();
    await waitFor(() => w.llm.st.total === 10);
    expect(w.llm.st.max).toBeLessThanOrEqual(2);
  });

  it("(4) LLM_DEFER_MAX_MS=0 conserva el comportamiento anterior: la extracción arranca al tener la transcripción", async () => {
    const stt = slowStt(60);
    const w = watchedLlm(stt);
    const { relay, base } = await boot(stt.fetch, { llmExtract: w.fn, llmConcurrency: 2, llmDeferMaxMs: 0 });
    for (let i = 0; i < 5; i++) await upload(base);
    await waitFor(() => w.doneAtStart.length > 0);
    expect(w.doneAtStart[0]).toBe(1);
    await relay.idle();
    await waitFor(() => w.llm.st.total === 5);
  });

  it("(5) una llamada diferida y descartada nunca llega al LLM", async () => {
    const stt = slowStt(80);
    const w = watchedLlm(stt);
    const { relay, base } = await boot(stt.fetch, { llmExtract: w.fn, llmConcurrency: 2, llmDeferMaxMs: 20_000 });
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) ids.push((await upload(base)).id);
    await waitReady(base, ids[0]);
    expect(w.llm.st.total).toBe(0); // diferida
    expect((await fetch(`${base}/llamar/${ids[0]}`, { method: "DELETE" })).status).toBe(200);
    await relay.idle();
    await waitFor(() => w.llm.st.total === 3);
    await wait(40);
    expect(w.llm.started).not.toContain(1);
    expect(w.llm.st.total).toBe(3);
  });

  it("(6) regresión: una sola llamada ordinaria recibe su extracción sin que nadie pulse «Enviar»", async () => {
    const stt = slowStt(5);
    const w = watchedLlm(stt);
    const { relay, base } = await boot(stt.fetch, { llmExtract: w.fn });
    await upload(base);
    await relay.idle();
    await waitFor(() => w.llm.st.total === 1);
    expect(w.doneAtStart).toEqual([1]);
  });
});
