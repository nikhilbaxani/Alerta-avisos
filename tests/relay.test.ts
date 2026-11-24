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
function fakeStt(reply: { text?: string; language?: string; duration?: number; fail?: boolean; failTranslate?: boolean; status?: number; translation?: string } = {}): Stt {
  const calls: Stt["calls"] = [];
  return {
    calls,
    fetch: (async (url: string | URL | Request, init?: RequestInit) => {
      const form = init?.body as FormData;
      const task = String(form.get("task"));
      calls.push({ task, model: String(form.get("model")), hasFile: form.get("file") instanceof Blob });
      expect(String(url)).toBe("http://stt.test/v1/audio/transcriptions");
      if (reply.fail) return new Response("boom", { status: reply.status ?? 500 });
      if (reply.failTranslate && task === "translate") return new Response("boom", { status: 500 });
      const text = task === "translate" ? (reply.translation ?? "There is a fire") : (reply.text ?? "Hay un incendio en la calle Larios");
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

function call(base: string, o: { consent?: string | null; type?: string; bytes?: number; origin?: string; xff?: string } = {}) {
  const fd = new FormData();
  fd.set("file", new Blob([new Uint8Array(o.bytes ?? 2000)], { type: o.type ?? "audio/webm" }), "c.webm");
  if (o.consent !== null) fd.set("consent", o.consent ?? "1");
  return fetch(`${base}/llamar`, { method: "POST", body: fd, headers: { ...(o.origin ? { Origin: o.origin } : {}), ...(o.xff ? { "x-forwarded-for": o.xff } : {}) } });
}

/** Envía una llamada con el cuerpo partido: la segunda mitad llega tras `gate` (fuerza peticiones solapadas). */
async function slowCall(base: string, gate: Promise<void>): Promise<number> {
  const fd = new FormData();
  fd.set("file", new Blob([new Uint8Array(2000)], { type: "audio/webm" }), "c.webm");
  fd.set("consent", "1");
  const req = new Request("http://x/", { method: "POST", body: fd });
  const bytes = new Uint8Array(await req.arrayBuffer());
  const u = new URL(`${base}/llamar`);
  return new Promise<number>((resolve, reject) => {
    const r = http.request(
      { host: u.hostname, port: u.port, path: u.pathname, method: "POST", headers: { "content-type": req.headers.get("content-type")!, "content-length": bytes.length } },
      (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      },
    );
    r.on("error", reject);
    r.write(bytes.subarray(0, 100));
    void gate.then(() => r.end(bytes.subarray(100)));
  });
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

  it("cuerpo mayor de 3 MB → 413", async () => {
    const stt = fakeStt();
    const { base } = await boot(stt, { rateLimit: { max: 10, windowMs: 60_000 } });
    const res = await call(base, { bytes: 3 * 1024 * 1024 + 10 });
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
    expect(bad.status).toBe(403);
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
    const a = await boot(fakeStt(), { bootTag: "AB1" });
    const b = await boot(fakeStt(), { bootTag: "CD2" });
    const idA = (await (await call(a.base)).json()).id;
    const idB = (await (await call(b.base)).json()).id;
    expect(idA).not.toBe(idB);
    expect(idA).toMatch(PUBLIC_CALL_ID);
    expect(idB).toMatch(PUBLIC_CALL_ID);
    const tags = Array.from({ length: 40 }, () => defaultBootTag());
    for (const t of tags) expect(t).toMatch(/^[0-9A-Z]{1,3}$/);
    // Aleatoria: no depende del segundo actual (dos arranques seguidos no chocan).
    expect(new Set(tags).size).toBeGreaterThan(30);
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

  const go = (base: string, xff: string) => call(base, { bytes: 100, xff });

  it("TRUST_PROXY: se usa el último salto de X-Forwarded-For (el que añade Caddy), no el primero", async () => {
    const { base } = await boot(fakeStt(), { trustProxy: true, rateLimit: { max: 1, windowMs: 60_000 } });
    expect((await go(base, "6.6.6.6, 1.1.1.1")).status).toBe(202);
    // Mismo cliente real (1.1.1.1) con otro primer salto falsificado: sigue limitado.
    expect((await go(base, "7.7.7.7, 1.1.1.1")).status).toBe(429);
    expect((await go(base, "6.6.6.6, 2.2.2.2")).status).toBe(202);
  });

  it("TRUST_PROXY detrás de dos saltos locales (Funnel → Caddy → relay): se salta lo local y privado desde la derecha", async () => {
    const { base } = await boot(fakeStt(), { trustProxy: true, rateLimit: { max: 1, windowMs: 60_000 } });
    expect((await go(base, "1.2.3.4, 127.0.0.1")).status).toBe(202);
    // Mismo cliente real (1.2.3.4); las entradas de la izquierda las controla el cliente y se ignoran.
    expect((await go(base, "6.6.6.6, 1.2.3.4, 100.101.1.2, 127.0.0.1")).status).toBe(429);
    // Otro cliente real con las mismas direcciones locales a la derecha: cuota propia.
    expect((await go(base, "8.8.8.8, 127.0.0.1")).status).toBe(202);
    expect((await go(base, "5.5.5.5, 10.0.0.7, 192.168.1.1, 172.16.0.1, fd00::1, fe80::1, ::1")).status).toBe(202);
  });

  it("TRUST_PROXY: si todas las direcciones son locales/privadas se usa la dirección del socket", async () => {
    const { base } = await boot(fakeStt(), { trustProxy: true, rateLimit: { max: 1, windowMs: 60_000 } });
    expect((await go(base, "127.0.0.1")).status).toBe(202);
    expect((await go(base, "100.64.0.1, 10.1.1.1")).status).toBe(429); // misma clave: el socket (loopback)
    expect((await go(base, "9.9.9.9")).status).toBe(202);
  });

  it("IPv6: el límite agrupa por prefijo /64; IPv4 y ::ffff:a.b.c.d se tratan como IPv4", async () => {
    const { base } = await boot(fakeStt(), { trustProxy: true, rateLimit: { max: 1, windowMs: 60_000 } });
    expect((await go(base, "2001:db8:1:2::1")).status).toBe(202);
    expect((await go(base, "2001:0db8:0001:0002:ffff:aaaa:bbbb:cccc")).status).toBe(429);
    expect((await go(base, "2001:db8:1:3::1")).status).toBe(202);
    expect((await go(base, "3.3.3.3")).status).toBe(202);
    expect((await go(base, "::ffff:3.3.3.3")).status).toBe(429);
    expect((await go(base, "3.3.3.4")).status).toBe(202);
  });

  it("las peticiones rechazadas no gastan cuota: tres 415 y una llamada válida → 202", async () => {
    const { base } = await boot(fakeStt());
    for (let i = 0; i < 3; i++) expect((await call(base, { type: "image/png" })).status).toBe(415);
    for (let i = 0; i < 3; i++) expect((await call(base, { consent: "0" })).status).toBe(400);
    expect((await call(base)).status).toBe(202);
  });

  it("llamadas simultáneas desde la misma IP no superan la cuota (reserva antes de leer el cuerpo)", async () => {
    const { relay, base } = await boot(fakeStt());
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    const pending = Array.from({ length: 8 }, () => slowCall(base, gate));
    await new Promise((r) => setTimeout(r, 150));
    open();
    const codes = await Promise.all(pending);
    expect(codes.filter((c) => c === 202)).toHaveLength(3);
    expect(codes.filter((c) => c === 429)).toHaveLength(5);
    await relay.idle();
  });

  it("llamadas simultáneas no superan el máximo de la cola", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow = fakeStt();
    const inner = slow.fetch;
    slow.fetch = (async (...a: Parameters<typeof fetch>) => {
      await gate;
      return inner(...a);
    }) as typeof fetch;
    const { relay, base } = await boot(slow, { maxPending: 2, rateLimit: { max: 50, windowMs: 60_000 } });
    expect((await call(base)).status).toBe(202); // en proceso, fuera de la cola
    let open!: () => void;
    const bodies = new Promise<void>((r) => (open = r));
    const pending = Array.from({ length: 6 }, () => slowCall(base, bodies));
    await new Promise((r) => setTimeout(r, 150));
    open();
    const codes = await Promise.all(pending);
    expect(codes.filter((c) => c === 202)).toHaveLength(2);
    expect(codes.filter((c) => c === 503)).toHaveLength(4);
    release();
    await relay.idle();
  });

  it("un 503 por cola llena no gasta cuota", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow = fakeStt();
    const inner = slow.fetch;
    slow.fetch = (async (...a: Parameters<typeof fetch>) => {
      await gate;
      return inner(...a);
    }) as typeof fetch;
    const { relay, base } = await boot(slow, { maxPending: 1 });
    const codes: number[] = [];
    for (let i = 0; i < 4; i++) codes.push((await call(base)).status);
    expect(codes).toEqual([202, 202, 503, 503]);
    release();
    await relay.idle();
    expect((await call(base)).status).toBe(202); // 3.ª llamada aceptada de 3
    expect((await call(base)).status).toBe(429);
  });

  it("POST con Origin no permitido → 403 en castellano; sin Origin (curl) se admite", async () => {
    const stt = fakeStt();
    const { base } = await boot(stt);
    const bad = await call(base, { origin: "https://evil.example" });
    expect(bad.status).toBe(403);
    expect((await bad.json()).error).toMatch(/origen/i);
    expect(stt.calls).toHaveLength(0);
    expect((await call(base)).status).toBe(202);
    expect((await call(base, { origin: ORIGIN })).status).toBe(202);
  });

  it("si falla la pasada translate, la llamada se publica con translation_en null", async () => {
    const stt = fakeStt({ language: "en", text: "There is a fire", failTranslate: true });
    const { relay, base } = await boot(stt);
    expect((await call(base)).status).toBe(202);
    await relay.idle();
    expect(stt.calls.map((c) => c.task)).toEqual(["transcribe", "translate"]);
    const [ev] = await readEvents(base, 1);
    expect(ev).toBeTruthy();
    expect(ev.translation_en).toBeNull();
    expect(ev.transcript).toBe("There is a fire");
  });

  it("transcripción y traducción se recortan a 4000 caracteres", async () => {
    const stt = fakeStt({ language: "en", text: "x".repeat(9000), translation: "y".repeat(9000) });
    const { relay, base } = await boot(stt);
    await call(base);
    await relay.idle();
    const [ev] = await readEvents(base, 1);
    expect(isPublicCallEvent(ev)).toBe(true);
    expect(ev.transcript).toHaveLength(4000);
    expect(ev.translation_en).toHaveLength(4000);
  });

  it("STT responde 413 (audio demasiado largo) → llamada descartada con línea de log", async () => {
    const lines: string[] = [];
    const { relay, base } = await boot(fakeStt({ fail: true, status: 413 }), { log: (m) => lines.push(m) });
    expect((await call(base)).status).toBe(202);
    await relay.idle();
    expect(await readEvents(base, 1)).toHaveLength(0);
    expect(lines.some((l) => /P1 descartada.*(largo|413)/.test(l))).toBe(true);
  });

  describe("peticiones mal formadas (regresión)", () => {
    const raw = (base: string, body: BodyInit, headers: Record<string, string>) => fetch(`${base}/llamar`, { method: "POST", body, headers });

    it("tipo vacío o video/ogg → 415", async () => {
      const { base } = await boot(fakeStt());
      expect((await call(base, { type: "" })).status).toBe(415);
      expect((await call(base, { type: "video/ogg" })).status).toBe(415);
    });

    it("multipart roto → 400", async () => {
      const { base } = await boot(fakeStt());
      const res = await raw(base, "--x\r\nbasura sin cerrar", { "content-type": "multipart/form-data; boundary=x" });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBeTruthy();
    });

    it("audio vacío → 400", async () => {
      const { base } = await boot(fakeStt());
      const res = await call(base, { bytes: 0 });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/vac/i);
    });

    it("cuerpo JSON → 400", async () => {
      const { base } = await boot(fakeStt());
      expect((await raw(base, JSON.stringify({ consent: "1" }), { "content-type": "application/json" })).status).toBe(400);
    });

    it("consentimiento «true» (no «1») → 400", async () => {
      const { base } = await boot(fakeStt());
      expect((await call(base, { consent: "true" })).status).toBe(400);
    });

    it("GET /llamar y rutas con traversal → 404", async () => {
      const { base } = await boot(fakeStt());
      expect((await fetch(`${base}/llamar`)).status).toBe(404);
      expect((await fetch(`${base}/%2e%2e/etc/passwd`)).status).toBe(404);
    });

    it("sin TRUST_PROXY un X-Forwarded-For falsificado no evita el límite (4.ª → 429)", async () => {
      const { base } = await boot(fakeStt());
      for (let i = 0; i < 3; i++) expect((await call(base, { xff: `9.9.9.${i}` })).status).toBe(202);
      expect((await call(base, { xff: "9.9.9.200" })).status).toBe(429);
    });

    it("una transcripción con HTML llega intacta como texto", async () => {
      const html = `<script>alert(1)</script> <img src=x onerror=alert(2)> incendio en calle Larios`;
      const { relay, base } = await boot(fakeStt({ text: html }));
      await call(base);
      await relay.idle();
      const [ev] = await readEvents(base, 1);
      expect(ev.transcript).toBe(html);
    });
  });
});
