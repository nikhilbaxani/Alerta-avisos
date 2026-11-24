import { afterEach, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createRelay, defaultBootTag, type RelayOptions } from "@/server/relay";
import { isPublicCallEvent, PUBLIC_CALL_ID, type PublicCallEvent } from "@/lib/publicCall";
import type { Extraction } from "@/lib/types";

const TOKEN = "secreto-de-prueba";
const ORIGIN = "https://consola.example.app";

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
const extract: RelayOptions["extract"] = () => ({
  extraction: EXTRACTION,
  location: { place: "Calle Larios", known: true, aml: { lat: 36.72, lng: -4.42, acc: 150 } },
});

interface Stt {
  calls: { task: string; model: string; hasFile: boolean }[];
  fetch: typeof fetch;
}
function fakeStt(reply: { text?: string; language?: string; duration?: number; fail?: boolean } = {}): Stt {
  const calls: Stt["calls"] = [];
  return {
    calls,
    fetch: (async (url: string | URL | Request, init?: RequestInit) => {
      const form = init?.body as FormData;
      const task = String(form.get("task"));
      calls.push({ task, model: String(form.get("model")), hasFile: form.get("file") instanceof Blob });
      expect(String(url)).toBe("http://stt.test/v1/audio/transcriptions");
      if (reply.fail) return new Response("boom", { status: 500 });
      const text = task === "translate" ? "There is a fire" : (reply.text ?? "Hay un incendio en la calle Larios");
      return Response.json({ text, language: reply.language ?? "es", duration: reply.duration ?? 20 });
    }) as typeof fetch,
  };
}

const servers: http.Server[] = [];
async function boot(stt: Stt, over: Partial<RelayOptions> = {}) {
  const relay = createRelay({
    sttBaseUrl: "http://stt.test/v1",
    sttModel: "m",
    token: TOKEN,
    allowedOrigins: [ORIGIN],
    fetch: stt.fetch,
    extract,
    bootTag: "",
    log: () => undefined,
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

function call(base: string, o: { consent?: string | null; type?: string; bytes?: number; origin?: string } = {}) {
  const fd = new FormData();
  fd.set("file", new Blob([new Uint8Array(o.bytes ?? 2000)], { type: o.type ?? "audio/webm" }), "c.webm");
  if (o.consent !== null) fd.set("consent", o.consent ?? "1");
  return fetch(`${base}/llamar`, { method: "POST", body: fd, headers: o.origin ? { Origin: o.origin } : {} });
}

/** Lee eventos SSE hasta tener `n` o agotar el tiempo. */
async function readEvents(base: string, n: number, token = TOKEN): Promise<PublicCallEvent[]> {
  const ctrl = new AbortController();
  const res = await fetch(`${base}/events?token=${token}`, { signal: ctrl.signal });
  const out: PublicCallEvent[] = [];
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const timer = setTimeout(() => ctrl.abort(), 1500);
  try {
    while (out.length < n) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value);
      let i: number;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (block.startsWith("event: call\ndata: ")) out.push(JSON.parse(block.slice("event: call\ndata: ".length)));
      }
    }
  } catch {
    /* abortado por tiempo */
  }
  clearTimeout(timer);
  ctrl.abort();
  return out;
}

describe("relay /llamar + /events", () => {
  it("responde 202 y entrega un PublicCallEvent válido por SSE", async () => {
    const stt = fakeStt();
    const { relay, base } = await boot(stt);
    const ctrl = new AbortController();
    const sse = await fetch(`${base}/events?token=${TOKEN}`, { signal: ctrl.signal });
    expect(sse.status).toBe(200);
    expect(sse.headers.get("content-type")).toContain("text/event-stream");
    expect(sse.headers.get("x-accel-buffering")).toBe("no");
    const res = await call(base);
    expect(res.status).toBe(202);
    const { id } = await res.json();
    expect(id).toBe("P1");
    await relay.idle();
    const reader = sse.body!.getReader();
    let text = "";
    while (!text.includes("event: call")) text += new TextDecoder().decode((await reader.read()).value);
    ctrl.abort();
    const data = text.split("event: call\ndata: ")[1].split("\n\n")[0];
    const ev = JSON.parse(data);
    expect(isPublicCallEvent(ev)).toBe(true);
    expect(ev.id).toBe("P1");
    expect(ev.transcript).toBe("Hay un incendio en la calle Larios");
    expect(ev.durationS).toBe(20);
    expect(stt.calls.map((c) => c.task)).toEqual(["transcribe"]);
    expect(stt.calls[0]).toMatchObject({ model: "m", hasFile: true });
  });

  it("/events sin token o con token incorrecto → 401; sin RELAY_TOKEN → 503", async () => {
    const { base } = await boot(fakeStt());
    expect((await fetch(`${base}/events?token=nope`)).status).toBe(401);
    expect((await fetch(`${base}/events?token=${TOKEN}x`)).status).toBe(401);
    expect((await fetch(`${base}/events`)).status).toBe(401);
    const b2 = await boot(fakeStt(), { token: "" });
    expect((await fetch(`${b2.base}/events?token=`)).status).toBe(503);
  });

  it("sin consentimiento → 400 en castellano", async () => {
    const { base } = await boot(fakeStt());
    for (const consent of [null, "0"]) {
      const res = await call(base, { consent });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/consentimiento/i);
    }
  });

  it("tipo de archivo no permitido → 415", async () => {
    const { base } = await boot(fakeStt());
    const res = await call(base, { type: "image/png" });
    expect(res.status).toBe(415);
    expect((await res.json()).error).toBeTruthy();
    expect((await call(base, { type: "video/webm" })).status).toBe(202);
  });

  it("cuerpo mayor de 8 MB → 413", async () => {
    const stt = fakeStt();
    const { base } = await boot(stt, { rateLimit: { max: 10, windowMs: 60_000 } });
    const res = await call(base, { bytes: 8 * 1024 * 1024 + 10 });
    expect(res.status).toBe(413);
    expect(stt.calls).toHaveLength(0);
  });

  it("límite por IP: la 4.ª llamada → 429", async () => {
    const { base } = await boot(fakeStt());
    for (let i = 0; i < 3; i++) expect((await call(base)).status).toBe(202);
    const res = await call(base);
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBeTruthy();
  });

  it("con TRUST_PROXY el límite usa el primer salto de X-Forwarded-For", async () => {
    const { base } = await boot(fakeStt(), { trustProxy: true, rateLimit: { max: 1, windowMs: 60_000 } });
    const go = (ip: string) => {
      const fd = new FormData();
      fd.set("file", new Blob([new Uint8Array(100)], { type: "audio/webm" }));
      fd.set("consent", "1");
      return fetch(`${base}/llamar`, { method: "POST", body: fd, headers: { "x-forwarded-for": ip } });
    };
    expect((await go("1.1.1.1")).status).toBe(202);
    expect((await go("2.2.2.2")).status).toBe(202);
    expect((await go("1.1.1.1")).status).toBe(429);
  });

  it("cola llena → 503", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow = fakeStt();
    const inner = slow.fetch;
    slow.fetch = (async (...a: Parameters<typeof fetch>) => {
      await gate;
      return inner(...a);
    }) as typeof fetch;
    const { relay, base } = await boot(slow, { maxPending: 2, rateLimit: { max: 50, windowMs: 60_000 } });
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) codes.push((await call(base)).status);
    expect(codes.slice(0, 3)).toEqual([202, 202, 202]); // 1 en curso + 2 en cola
    expect(codes.slice(3)).toEqual([503, 503]);
    release();
    await relay.idle();
  });

  it("duración mayor que el máximo + 5 s → sin evento", async () => {
    const { relay, base } = await boot(fakeStt({ duration: 126 }));
    expect((await call(base)).status).toBe(202);
    await relay.idle();
    expect(await readEvents(base, 1)).toHaveLength(0);
  });

  it("duración justo en máximo + 5 s se acepta", async () => {
    const { relay, base } = await boot(fakeStt({ duration: 125 }));
    await call(base);
    await relay.idle();
    expect(await readEvents(base, 1)).toHaveLength(1);
  });

  it("idioma distinto de es → segunda pasada translate y translation_en", async () => {
    const stt = fakeStt({ language: "en", text: "There is a fire" });
    const { relay, base } = await boot(stt);
    await call(base);
    await relay.idle();
    expect(stt.calls.map((c) => c.task)).toEqual(["transcribe", "translate"]);
    const [ev] = await readEvents(base, 1);
    expect(ev.translation_en).toBe("There is a fire");
    expect(ev.language).toBe("en");
  });

  it("castellano → sin llamada translate y translation_en null", async () => {
    const stt = fakeStt();
    const { relay, base } = await boot(stt);
    await call(base);
    await relay.idle();
    expect(stt.calls.map((c) => c.task)).toEqual(["transcribe"]);
    const [ev] = await readEvents(base, 1);
    expect(ev.translation_en).toBeNull();
  });

  it("fallo de STT → sin evento y el relay sigue vivo", async () => {
    const { relay, base } = await boot(fakeStt({ fail: true }));
    expect((await call(base)).status).toBe(202);
    await relay.idle();
    expect(await readEvents(base, 1)).toHaveLength(0);
    expect((await fetch(`${base}/health`)).status).toBe(200);
  });

  it("CORS solo para orígenes permitidos (también preflight)", async () => {
    const { base } = await boot(fakeStt());
    const ok = await call(base, { origin: ORIGIN });
    expect(ok.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    const bad = await call(base, { origin: "https://evil.example" });
    expect(bad.headers.get("access-control-allow-origin")).toBeNull();
    const pre = await fetch(`${base}/llamar`, { method: "OPTIONS", headers: { Origin: ORIGIN, "Access-Control-Request-Method": "POST" } });
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    const preBad = await fetch(`${base}/llamar`, { method: "OPTIONS", headers: { Origin: "https://evil.example" } });
    expect(preBad.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("una conexión nueva recibe los últimos 50 eventos", async () => {
    const { relay, base } = await boot(fakeStt(), { rateLimit: { max: 100, windowMs: 60_000 } });
    for (let i = 0; i < 52; i++) await call(base, { bytes: 100 });
    await relay.idle();
    const evs = await readEvents(base, 60);
    expect(evs).toHaveLength(50);
    expect(evs[0].id).toBe("P3");
    expect(evs[49].id).toBe("P52");
  });

  it("tras reiniciar el relay los ids no se repiten (etiqueta de arranque)", async () => {
    const a = await boot(fakeStt(), { bootTag: defaultBootTag(1_000_000_000_000) });
    const b = await boot(fakeStt(), { bootTag: defaultBootTag(1_000_000_600_000) });
    const idA = (await (await call(a.base)).json()).id;
    const idB = (await (await call(b.base)).json()).id;
    expect(idA).not.toBe(idB);
    expect(idA).toMatch(PUBLIC_CALL_ID);
    expect(idB).toMatch(PUBLIC_CALL_ID);
    expect(defaultBootTag()).toMatch(/^[0-9A-Z]{1,3}$/);
  });

  it("con el extractor de reglas real produce un evento válido con ubicación conocida", async () => {
    const { relay, base } = await boot(fakeStt(), { extract: undefined });
    expect((await call(base)).status).toBe(202);
    await relay.idle();
    const [ev] = await readEvents(base, 1);
    expect(isPublicCallEvent(ev)).toBe(true);
    expect(ev.extraction.incident_type).toBe("incendio");
    expect(ev.location.known).toBe(true);
    expect(ev.extraction.location_text.toLowerCase()).toContain("larios");
  });

  it("/health informa de la cola y del máximo", async () => {
    const { base } = await boot(fakeStt(), { maxCallSeconds: 90 });
    expect(await (await fetch(`${base}/health`)).json()).toEqual({ ok: true, queue: 0, maxCallSeconds: 90 });
  });
});
