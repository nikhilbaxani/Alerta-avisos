/**
 * Relay del VPS para las llamadas del público (S1, S4, S9).
 *   POST /llamar   multipart (file + consent=1) → 202 {id}; procesa en cola: Whisper → reglas → evento
 *   GET  /events   SSE (token obligatorio): últimos 50 eventos + en vivo
 *   GET  /health   {ok, queue, maxCallSeconds}
 * Uso: npx tsx server/relay.ts   (variables de entorno: ver server/README.md)
 * El audio solo vive en memoria y se descarta tras transcribir. No se registra texto ni IPs completas.
 */
import http from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";
import { DEFAULT_MAX_CALL_SECONDS, isPublicCallEvent } from "../lib/publicCall";
import type { PublicCallEvent, PublicLocation } from "../lib/publicCall";
import type { Extraction } from "../lib/types";

export type Extractor = (input: {
  transcript: string;
  language: string;
  translation_en: string | null;
}) => { extraction: Extraction; location: PublicLocation } | Promise<{ extraction: Extraction; location: PublicLocation }>;

/** Tres caracteres en base 36 derivados de la hora de arranque. */
export function defaultBootTag(now = Date.now()): string {
  return Math.floor(now / 1000).toString(36).toUpperCase().slice(-3);
}

export interface RelayOptions {
  sttBaseUrl: string;
  sttModel?: string;
  maxCallSeconds?: number;
  /** Token del operador para /events. Vacío → /events responde 503. */
  token?: string;
  allowedOrigins?: string[];
  rateLimit?: { max: number; windowMs: number };
  /** Confía en el primer salto de X-Forwarded-For (solo detrás de Caddy). */
  trustProxy?: boolean;
  /** Llamadas en espera (sin contar la que se procesa). */
  maxPending?: number;
  maxBytes?: number;
  heartbeatMs?: number;
  replay?: number;
  /** Etiqueta de arranque en los ids (P<tag><n>): evita repetir ids tras reiniciar el relay. */
  bootTag?: string;
  extract?: Extractor;
  fetch?: typeof fetch;
  log?: (msg: string) => void;
}

const MB = 1024 * 1024;
const AUDIO_TYPE = /^(audio\/[\w.+-]+|video\/(webm|mp4))(;.*)?$/i;

const short = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 8);

/** Comparación en tiempo constante: se comparan hashes, así las longitudes siempre coinciden. */
function sameToken(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

class TooBig extends Error {}

async function readCapped(req: http.IncomingMessage, maxBytes: number): Promise<Buffer> {
  const declared = Number(req.headers["content-length"] ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) throw new TooBig();
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const c of req) {
    total += (c as Buffer).length;
    if (total > maxBytes) throw new TooBig();
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks);
}

export function createRelay(opts: RelayOptions) {
  const maxCall = opts.maxCallSeconds ?? DEFAULT_MAX_CALL_SECONDS;
  const maxPending = opts.maxPending ?? 20;
  const maxBytes = opts.maxBytes ?? 8 * MB;
  const limit = opts.rateLimit ?? { max: 3, windowMs: 10 * 60_000 };
  const origins = new Set(opts.allowedOrigins ?? []);
  const replayN = opts.replay ?? 50;
  const heartbeatMs = opts.heartbeatMs ?? 15_000;
  const doFetch = opts.fetch ?? fetch;
  const log = opts.log ?? ((m: string) => console.log(m));
  const sttUrl = `${opts.sttBaseUrl.replace(/\/$/, "")}/audio/transcriptions`;

  const history: PublicCallEvent[] = [];
  const clients = new Set<http.ServerResponse>();
  const hits = new Map<string, number[]>();
  const queue: (() => Promise<void>)[] = [];
  let running = false;
  let seq = 0;
  const bootTag = opts.bootTag ?? defaultBootTag();
  let idleWaiters: (() => void)[] = [];

  const extract: Extractor = opts.extract ?? (async (i) => (await import("../lib/rules")).extractByRules(i));

  function cors(req: http.IncomingMessage, res: http.ServerResponse) {
    const o = req.headers.origin;
    if (o && origins.has(o)) {
      res.setHeader("Access-Control-Allow-Origin", o);
      res.setHeader("Vary", "Origin");
    }
  }

  function json(req: http.IncomingMessage, res: http.ServerResponse, status: number, body: unknown) {
    cors(req, res);
    const data = JSON.stringify(body);
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(data) });
    res.end(data);
  }

  function clientIp(req: http.IncomingMessage): string {
    if (opts.trustProxy) {
      const xff = req.headers["x-forwarded-for"];
      const first = (Array.isArray(xff) ? xff[0] : xff)?.split(",")[0]?.trim();
      if (first) return first;
    }
    return req.socket.remoteAddress ?? "?";
  }

  function rateLimited(ip: string): boolean {
    const now = Date.now();
    for (const [k, v] of hits) {
      const fresh = v.filter((t) => now - t < limit.windowMs);
      if (fresh.length) hits.set(k, fresh);
      else hits.delete(k);
    }
    const mine = hits.get(ip) ?? [];
    if (mine.length >= limit.max) return true;
    mine.push(now);
    hits.set(ip, mine);
    return false;
  }

  function publish(ev: PublicCallEvent) {
    history.push(ev);
    if (history.length > replayN) history.shift();
    const frame = `event: call\ndata: ${JSON.stringify(ev)}\n\n`;
    for (const c of clients) c.write(frame);
  }

  async function stt(file: Blob, task: "transcribe" | "translate") {
    const form = new FormData();
    form.set("file", file, "llamada");
    form.set("model", opts.sttModel ?? "");
    form.set("task", task);
    const r = await doFetch(sttUrl, { method: "POST", body: form, signal: AbortSignal.timeout(180_000) });
    if (!r.ok) throw new Error(`STT ${task} respondió ${r.status}`);
    const j = (await r.json()) as { text?: unknown; language?: unknown; duration?: unknown };
    if (typeof j.text !== "string") throw new Error("STT sin texto");
    return { text: j.text.trim(), language: String(j.language ?? ""), duration: Number(j.duration ?? 0) };
  }

  async function processCall(id: string, file: Blob, receivedAt: number) {
    try {
      const t0 = Date.now();
      const first = await stt(file, "transcribe");
      const sttMs = Date.now() - t0;
      if (!Number.isFinite(first.duration) || first.duration > maxCall + 5) {
        log(`[relay] ${id} descartada: duración ${Math.round(first.duration)} s supera el máximo`);
        return;
      }
      if (!first.text) {
        log(`[relay] ${id} descartada: sin voz reconocible`);
        return;
      }
      if (!/^[a-z]{2}$/.test(first.language)) {
        log(`[relay] ${id} descartada: idioma no reconocido`);
        return;
      }
      let translation: string | null = null;
      if (first.language !== "es") translation = (await stt(file, "translate")).text || null;
      const { extraction, location } = await extract({ transcript: first.text, language: first.language, translation_en: translation });
      const ev: PublicCallEvent = {
        id,
        receivedAt: new Date(receivedAt).toISOString(),
        durationS: first.duration,
        language: first.language,
        transcript: first.text,
        translation_en: translation,
        extraction,
        location,
        timings: { sttMs, totalMs: Date.now() - t0 },
      };
      if (!isPublicCallEvent(ev)) {
        log(`[relay] ${id} descartada: el evento no cumple el contrato`);
        return;
      }
      publish(ev);
      log(`[relay] ${id} publicada (${first.language}, ${Math.round(first.duration)} s, stt ${sttMs} ms)`);
    } catch (e) {
      log(`[relay] ${id} error: ${e instanceof Error ? e.message : "desconocido"}`);
    }
  }

  async function drain() {
    if (running) return;
    running = true;
    while (queue.length) await queue.shift()!();
    running = false;
    const w = idleWaiters;
    idleWaiters = [];
    for (const f of w) f();
  }

  async function handleCall(req: http.IncomingMessage, res: http.ServerResponse) {
    const ip = clientIp(req);
    if (rateLimited(ip)) return json(req, res, 429, { error: "Demasiadas llamadas desde tu conexión. Espera unos minutos." });
    if (queue.length >= maxPending) return json(req, res, 503, { error: "Hay demasiadas llamadas en cola. Inténtalo en un minuto." });
    const ctype = req.headers["content-type"] ?? "";
    if (!ctype.startsWith("multipart/form-data")) return json(req, res, 400, { error: "Se esperaba multipart/form-data" });
    let body: Buffer;
    try {
      body = await readCapped(req, maxBytes);
    } catch (e) {
      if (e instanceof TooBig) {
        // Se descarta el resto sin guardarlo: así el navegador llega a leer el 413 en vez de ver la conexión rota.
        req.resume();
        return json(req, res, 413, { error: `El audio supera ${maxBytes / MB} MB` });
      }
      return json(req, res, 400, { error: "No se pudo leer la petición" });
    }
    let form: FormData;
    try {
      form = await new Response(new Uint8Array(body), { headers: { "content-type": ctype } }).formData();
    } catch {
      return json(req, res, 400, { error: "Formulario no válido" });
    }
    if (form.get("consent") !== "1") return json(req, res, 400, { error: "Falta el consentimiento para grabar y enviar tu voz" });
    const file = form.get("file");
    if (!(file instanceof Blob)) return json(req, res, 400, { error: "Falta el archivo de audio" });
    if (file.size === 0) return json(req, res, 400, { error: "El audio está vacío" });
    if (!AUDIO_TYPE.test(file.type)) return json(req, res, 415, { error: "El archivo no es un audio admitido" });

    const id = `P${bootTag}${++seq}`;
    const receivedAt = Date.now();
    log(`[relay] ${id} recibida (${Math.round(file.size / 1024)} KB, ip ${short(ip)})`);
    queue.push(() => processCall(id, file, receivedAt));
    void drain();
    json(req, res, 202, { id });
  }

  function handleEvents(req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
    if (!opts.token) return json(req, res, 503, { error: "El relay no tiene token configurado" });
    if (!sameToken(url.searchParams.get("token") ?? "", opts.token)) return json(req, res, 401, { error: "Token no válido" });
    cors(req, res);
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write(": conectado\n\n");
    for (const ev of history) res.write(`event: call\ndata: ${JSON.stringify(ev)}\n\n`);
    clients.add(res);
    const beat = setInterval(() => res.write(": ping\n\n"), heartbeatMs);
    const done = () => {
      clearInterval(beat);
      clients.delete(res);
    };
    req.on("close", done);
    res.on("close", done);
  }

  const handler: http.RequestListener = (req, res) => {
    const url = new URL(req.url ?? "/", "http://relay");
    if (req.method === "OPTIONS") {
      cors(req, res);
      if (res.hasHeader("Access-Control-Allow-Origin")) {
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        res.setHeader("Access-Control-Max-Age", "600");
      }
      res.writeHead(204);
      return void res.end();
    }
    if (req.method === "GET" && url.pathname === "/health") {
      return json(req, res, 200, { ok: true, queue: queue.length + (running ? 1 : 0), maxCallSeconds: maxCall });
    }
    if (req.method === "GET" && url.pathname === "/events") return handleEvents(req, res, url);
    if (req.method === "POST" && url.pathname === "/llamar") {
      handleCall(req, res).catch((e) => {
        log(`[relay] error: ${e instanceof Error ? e.message : "desconocido"}`);
        if (!res.headersSent) json(req, res, 500, { error: "Error interno del relay" });
      });
      return;
    }
    json(req, res, 404, { error: "No encontrado" });
  };

  return {
    handler,
    /** Se resuelve cuando la cola está vacía y no hay nada en proceso. */
    idle: () => (queue.length === 0 && !running ? Promise.resolve() : new Promise<void>((r) => idleWaiters.push(r))),
  };
}

function envInt(name: string, def: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : def;
}

export function start() {
  const relay = createRelay({
    sttBaseUrl: process.env.STT_BASE_URL ?? "http://stt:8000/v1",
    sttModel: process.env.STT_MODEL ?? "Systran/faster-whisper-small",
    maxCallSeconds: envInt("MAX_CALL_SECONDS", DEFAULT_MAX_CALL_SECONDS),
    token: process.env.RELAY_TOKEN,
    allowedOrigins: (process.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    rateLimit: { max: envInt("RATE_LIMIT", 3), windowMs: envInt("RATE_WINDOW_MIN", 10) * 60_000 },
    trustProxy: process.env.TRUST_PROXY === "1",
  });
  const port = envInt("PORT", 8080);
  const server = http.createServer(relay.handler);
  server.requestTimeout = 60_000;
  server.listen(port, () => {
    console.log(`[relay] escuchando en :${port} (token ${process.env.RELAY_TOKEN ? "configurado" : "NO configurado: /events devuelve 503"})`);
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) start();
