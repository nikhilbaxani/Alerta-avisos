/**
 * Relay del VPS para las llamadas del público (S1, S4, S9).
 *   POST /llamar   multipart (file + consent=1) → 202 {id}; el id es secreto (128 bits). Procesa en cola: Whisper.
 *                  La llamada queda PENDIENTE en memoria: no se publica hasta que la persona la confirma (S14).
 *   GET  /llamar/:id          → {status: transcribing|ready|failed|expired|sent, transcript?, language?, error?}
 *   POST /llamar/:id/enviar   → publica el evento exactamente una vez (idempotente)
 *   DELETE /llamar/:id        → «Volver a grabar»: descarta la llamada
 *   GET  /events   SSE (token obligatorio): últimos 50 eventos + en vivo
 *   GET  /health   {ok, queue, maxCallSeconds}
 * Uso: npx tsx server/relay.ts   (variables de entorno: ver server/README.md)
 * El audio solo vive en memoria y se descarta tras transcribir. No se registra texto ni IPs completas.
 */
import http from "node:http";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { isIPv6 } from "node:net";
import { pathToFileURL } from "node:url";
import {
  DEFAULT_MAX_CALL_SECONDS,
  KNOWN_LOCATION_ACC,
  MAX_TRANSCRIPT_CHARS,
  UNKNOWN_LOCATION_AML,
  isPublicCallEvent,
} from "../lib/publicCall";
import type { PublicCallEvent, PublicLocation } from "../lib/publicCall";
import { chatJSON } from "../lib/ai";
import { getConfig, llmEnabled } from "../lib/config";
import type { AppConfig } from "../lib/config";
import { locate } from "../lib/gazetteer";
import { EXTRACTION_SYSTEM, extractionUser } from "../lib/prompts";
import { sanitizeExtraction } from "../lib/sanitize";
import type { Extraction } from "../lib/types";

export type Extractor = (input: {
  transcript: string;
  language: string;
  translation_en: string | null;
}) => { extraction: Extraction; location: PublicLocation } | Promise<{ extraction: Extraction; location: PublicLocation }>;

export type LlmExtractor = (transcript: string, language: string) => Promise<Extraction>;

const DEFAULT_LLM_TIMEOUT_MS = 20_000;
const RELAY_EXTRACTION_SYSTEM = `${EXTRACTION_SYSTEM}\nIncluye también la clave "translation_es": traducción fiel al castellano si la llamada no está en castellano, o null si ya está en castellano.`;

export function createLlmExtractor(cfg: AppConfig, timeoutMs = DEFAULT_LLM_TIMEOUT_MS): LlmExtractor {
  return async (transcript: string, language: string) => {
    const raw = await chatJSON(
      cfg,
      [
        { role: "system", content: RELAY_EXTRACTION_SYSTEM },
        { role: "user", content: extractionUser(transcript) },
      ],
      timeoutMs,
    );
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("respuesta no válida");
    // Con idioma conocido manda el del STT; con "" se queda el que detecta el LLM en esta misma petición.
    return sanitizeExtraction(language ? { ...(raw as Record<string, unknown>), language } : raw, language);
  };
}

const originOf = (u: string): string | null => {
  try {
    return new URL(u).origin;
  } catch {
    return null;
  }
};

/**
 * Clave del STT: STT_API_KEY; si está vacía, la del LLM solo cuando STT_BASE_URL tiene el mismo origen que
 * LLM_BASE_URL (el STT del sobremesa va tras el mismo gateway). A cualquier otro origen no se envía ninguna clave.
 */
export function sttApiKeyFromEnv(env: NodeJS.ProcessEnv): string {
  const own = env.STT_API_KEY?.trim() ?? "";
  if (own) return own;
  const sttOrigin = originOf(env.STT_BASE_URL?.trim() ?? "");
  const llmOrigin = originOf(env.LLM_BASE_URL?.trim() ?? "");
  return sttOrigin && sttOrigin === llmOrigin ? (env.LLM_API_KEY?.trim() ?? "") : "";
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`tiempo agotado (${ms} ms)`)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** Tres caracteres aleatorios en base 36 (mayúsculas): dos arranques seguidos no comparten etiqueta salvo 1 de cada 46 656. */
export function defaultBootTag(): string {
  const b = randomBytes(3);
  return Array.from(b, (x) => (x % 36).toString(36)).join("").toUpperCase();
}

/**
 * Clave de límite de ritmo: IPv4 tal cual (también ::ffff:a.b.c.d); IPv6 agrupada por prefijo /64,
 * porque un cliente IPv6 controla todo su /64 y cambiar de dirección dentro de él sería trivial.
 */
export function rateKey(ip: string): string {
  const v4 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (v4) return v4[1];
  const bare = ip.split("%")[0];
  if (!isIPv6(bare)) return ip;
  let [head, tail] = bare.split("::") as [string, string | undefined];
  // Un IPv6 con IPv4 incrustada al final (a::1.2.3.4) ocupa dos grupos.
  const fix = (part: string) => part.replace(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/, (_, a, b, c, d) => `${((+a << 8) | +b).toString(16)}:${((+c << 8) | +d).toString(16)}`);
  const h = head ? fix(head).split(":") : [];
  const t = tail === undefined ? [] : tail ? fix(tail).split(":") : [];
  const groups = tail === undefined ? h : [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t];
  return groups.slice(0, 4).map((g) => parseInt(g || "0", 16).toString(16)).join(":") + "::/64";
}

/** Loopback, RFC1918, CGNAT/Tailscale (100.64.0.0/10), link-local y ULA IPv6: direcciones de nuestros propios saltos. */
export function isLocalOrPrivate(ip: string): boolean {
  const v4m = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  const a = v4m ? v4m[1] : ip.split("%")[0];
  const m = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(a);
  if (m) {
    const [x, y] = [+m[1], +m[2]];
    return x === 10 || x === 127 || x === 0 || (x === 172 && y >= 16 && y <= 31) || (x === 192 && y === 168) || (x === 169 && y === 254) || (x === 100 && y >= 64 && y <= 127);
  }
  if (!isIPv6(a)) return true; // no es una dirección: no se puede confiar en ella
  const first = parseInt(a.split(":")[0] || "0", 16);
  return /^(0*:)+0*1?$|^::1?$/.test(a) || (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80;
}

export interface RelayOptions {
  sttBaseUrl: string;
  sttModel?: string;
  /** Clave del STT (Authorization: Bearer). Vacía → sin cabecera. */
  sttApiKey?: string;
  /** Tiempo máximo de una petición al STT (ms). */
  sttTimeoutMs?: number;
  maxCallSeconds?: number;
  /** Token del operador para /events. Vacío → /events responde 503. */
  token?: string;
  allowedOrigins?: string[];
  rateLimit?: { max: number; windowMs: number };
  /** Confía en X-Forwarded-For desde la derecha, saltando direcciones locales/privadas (solo detrás de Caddy/Funnel). */
  trustProxy?: boolean;
  /** Llamadas retenidas sin enviar (en transcripción o esperando «Enviar»), sin contar una en proceso. */
  maxPending?: number;
  /** Llamadas de una misma IP (/64 en IPv6) esperando «Enviar» (transcribing o ready). Por defecto 2. */
  pendingPerIp?: number;
  /** Audios aceptados por IP y ventana, sin devolución al descartar. Por defecto 3 × rateLimit.max. */
  uploadLimit?: number;
  /** Tiempo que una llamada pendiente espera a «Enviar» antes de caducar y liberar su memoria (ms). */
  pendingTtlMs?: number;
  maxBytes?: number;
  heartbeatMs?: number;
  replay?: number;
  /** Etiqueta de arranque en los ids (P<tag><n>): evita repetir ids tras reiniciar el relay. */
  bootTag?: string;
  extract?: Extractor;
  /** Extractor opcional por LLM (S11). Si falla o agota `llmTimeoutMs`, se usa `extract` (reglas). */
  llmExtract?: LlmExtractor;
  llmTimeoutMs?: number;
  fetch?: typeof fetch;
  log?: (msg: string) => void;
}

const MB = 1024 * 1024;
const SECRET_ID = /^[0-9a-f]{32}$/;
const AUDIO_TYPE = /^(audio\/[\w.+-]+|video\/(webm|mp4))(;.*)?$/i;

const short = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 8);

/** Comparación en tiempo constante: se comparan hashes, así las longitudes siempre coinciden. */
function sameToken(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Ventana deslizante por clave. `hit` reserva una unidad y devuelve su deshacer, que busca la unidad en la lista
 * vigente (la poda de `full` sustituye las listas) y es inofensivo si la unidad ya salió de la ventana.
 */
function slidingWindow(max: number, windowMs: number) {
  const m = new Map<string, number[]>();
  return {
    full(key: string): boolean {
      const now = Date.now();
      for (const [k, v] of m) {
        const fresh = v.filter((t) => now - t < windowMs);
        if (fresh.length) m.set(k, fresh);
        else m.delete(k);
      }
      return (m.get(key) ?? []).length >= max;
    },
    hit(key: string): () => void {
      const t = Date.now();
      const mine = m.get(key) ?? [];
      mine.push(t);
      m.set(key, mine);
      return () => {
        const cur = m.get(key);
        const i = cur ? cur.indexOf(t) : -1;
        if (cur && i >= 0) cur.splice(i, 1);
      };
    },
  };
}

/** Estado de una llamada pendiente de confirmación. `discarded` es interno (nunca se devuelve: el id pasa a 404). */
type PendingStatus = "transcribing" | "ready" | "failed" | "expired" | "sent" | "discarded";
interface Built {
  language: string;
  extraction: Extraction;
  location: PublicLocation;
  translation: string | null;
  extractor: "llm" | "rules";
  extractMs: number;
}
interface Pending {
  id: string; // id secreto (solo para sus temporizadores; nunca se escribe en los logs)
  label: string; // id público del evento (P<tag><n>); es lo único que se escribe en los logs
  status: PendingStatus;
  ip: string;
  /** Audio: solo hasta terminar la transcripción (y la traducción de Whisper si hace falta). */
  file?: Blob;
  transcript?: string;
  language?: string;
  durationS?: number;
  sttMs?: number;
  error?: string;
  built?: Promise<Built | null>;
  sending?: Promise<void>;
  /** Devuelve la unidad de cuota de esta llamada (una sola vez); se borra al usarla. */
  refund?: () => void;
  timers: ReturnType<typeof setTimeout>[];
}

class TooBig extends Error {}
class SttError extends Error {
  constructor(msg: string, readonly status: number) {
    super(msg);
  }
}

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
  // 120 s de Opus (MediaRecorder) ≈ 2 MB; 3 MB deja margen sin permitir audios mucho más largos.
  const maxBytes = opts.maxBytes ?? 3 * MB;
  const limit = opts.rateLimit ?? { max: 3, windowMs: 10 * 60_000 };
  const origins = new Set(opts.allowedOrigins ?? []);
  const replayN = opts.replay ?? 50;
  const heartbeatMs = opts.heartbeatMs ?? 15_000;
  const llmTimeoutMs = opts.llmTimeoutMs ?? DEFAULT_LLM_TIMEOUT_MS;
  const doFetch = opts.fetch ?? fetch;
  const log = opts.log ?? ((m: string) => console.log(m));
  const sttUrl = `${opts.sttBaseUrl.replace(/\/$/, "")}/audio/transcriptions`;

  const history: PublicCallEvent[] = [];
  const clients = new Set<http.ServerResponse>();
  const quota = slidingWindow(limit.max, limit.windowMs);
  const uploads = slidingWindow(opts.uploadLimit ?? limit.max * 3, limit.windowMs);
  const pendingPerIp = opts.pendingPerIp ?? 2;
  const reservingByIp = new Map<string, number>();
  const pendingTtlMs = opts.pendingTtlMs ?? 300_000;
  /** Llamadas del público por id secreto. Las enviadas, caducadas o fallidas quedan como marca ligera hasta 2×TTL. */
  const pending = new Map<string, Pending>();
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
      // Cada proxy local (Funnel → Caddy → relay) añade la dirección que ve a la derecha; lo de la izquierda lo
      // controla el cliente. Se recorre desde la derecha y se toma la primera dirección que no sea local ni privada.
      const parts = (Array.isArray(xff) ? xff.join(",") : xff)?.split(",").map((p) => p.trim()).filter(Boolean) ?? [];
      for (let i = parts.length - 1; i >= 0; i--) if (!isLocalOrPrivate(parts[i])) return parts[i];
    }
    return req.socket.remoteAddress ?? "?";
  }

  /** Llamadas que ya pasaron el control de cola y aún leen o validan el cuerpo. */
  let reserving = 0;

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
    // Un gateway puede devolver solo {text}; con verbose_json suele añadir language y duration.
    form.set("response_format", "verbose_json");
    const headers: Record<string, string> = opts.sttApiKey ? { Authorization: `Bearer ${opts.sttApiKey}` } : {};
    const r = await doFetch(sttUrl, { method: "POST", body: form, headers, signal: AbortSignal.timeout(opts.sttTimeoutMs ?? 180_000) });
    if (!r.ok) throw new SttError(`STT ${task} respondió ${r.status}`, r.status);
    const j = (await r.json()) as { text?: unknown; language?: unknown; duration?: unknown };
    if (typeof j.text !== "string") throw new Error("STT sin texto");
    const dur = Number(j.duration ?? 0);
    return { text: j.text.trim(), language: String(j.language ?? ""), duration: dur };
  }

  const held = () => {
    let n = 0;
    for (const p of pending.values()) if (p.status === "transcribing" || p.status === "ready") n++;
    return n;
  };

  /** Libera todo lo pesado de una llamada (audio, texto, extracción). */
  function release(p: Pending) {
    p.file = undefined;
    p.transcript = undefined;
    p.built = undefined;
  }

  function fail(p: Pending, error: string) {
    p.status = "failed";
    p.error = error;
    release(p);
    arm(p);
  }

  /** Devuelve a su IP la unidad de cuota de una llamada no enviada (una sola vez). */
  function refundQuota(p: Pending) {
    const r = p.refund;
    p.refund = undefined;
    r?.();
  }

  /** Extracción en segundo plano: LLM (con respaldo a reglas) o reglas (+ pasada translate de Whisper). Nunca rechaza. */
  async function build(p: Pending): Promise<Built | null> {
    const id = p.label;
    const transcript = p.transcript ?? "";
    let language = p.language ?? "";
    const t0 = Date.now();
    try {
      let extraction: Extraction | null = null;
      let location: PublicLocation | null = null;
      let translation: string | null = null;
      let extractor: "llm" | "rules" = "rules";

      if (opts.llmExtract) {
        try {
          const raw = await withTimeout(opts.llmExtract(transcript, language), llmTimeoutMs);
          if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("respuesta no válida");
          const sanitized = sanitizeExtraction(language ? { ...raw, language } : raw, language);
          if (!/^[a-z]{2}$/.test(sanitized.language)) throw new Error("idioma no detectado");
          if (sanitized.translation_es) sanitized.translation_es = sanitized.translation_es.slice(0, MAX_TRANSCRIPT_CHARS);
          const hit = (sanitized.location_text ? locate(sanitized.location_text) : null) ?? locate(transcript);
          if (hit) {
            location = { place: hit.place, known: true, aml: { ...hit.aml, acc: KNOWN_LOCATION_ACC } };
            if (!sanitized.location_text) sanitized.location_text = hit.location_text;
          } else {
            location = { place: null, known: false, aml: { ...UNKNOWN_LOCATION_AML } };
          }
          extraction = sanitized;
          language = sanitized.language;
          extractor = "llm";
        } catch (e) {
          const reason = (e instanceof Error ? e.message : "desconocido").slice(0, 120);
          log(`[relay] ${id} LLM no disponible (${reason}): reglas`);
        }
      }

      if (!extraction || !location) {
        if (!language) {
          log(`[relay] ${id} descartada: idioma no reconocido`);
          return null;
        }
        // Una sola pasada de Whisper por llamada: con LLM configurado nunca se pide `translate` (si el LLM falla,
        // las reglas trabajan con la transcripción). Sin LLM, como siempre; va delante en la cola serie del STT.
        if (language !== "es" && !opts.llmExtract && p.file) {
          const file = p.file;
          // Si la traducción falla o tarda demasiado, la llamada sigue: las reglas usan la transcripción.
          try {
            translation = (await inQueue(() => stt(file, "translate"))).text.slice(0, MAX_TRANSCRIPT_CHARS) || null;
          } catch (e) {
            log(`[relay] ${id} sin traducción: ${e instanceof Error ? e.message : "desconocido"}`);
          }
        }
        const res = await extract({ transcript, language, translation_en: translation });
        extraction = res.extraction;
        location = res.location;
        extractor = "rules";
      }
      return { language, extraction, location, translation, extractor, extractMs: Date.now() - t0 };
    } catch (e) {
      log(`[relay] ${id} error al extraer: ${e instanceof Error ? e.message : "desconocido"}`);
      return null;
    } finally {
      p.file = undefined; // el audio se descarta en cuanto no hace falta más
    }
  }

  /** Transcribe (paso de la cola serie). Deja la llamada en «ready» y lanza la extracción sin esperar a «Enviar». */
  async function processCall(p: Pending) {
    if (p.status !== "transcribing" || !p.file) return; // descartada o caducada mientras esperaba turno
    const id = p.label;
    try {
      const t0 = Date.now();
      const first = await stt(p.file, "transcribe");
      const sttMs = Date.now() - t0;
      if (p.status !== "transcribing") return release(p); // descartada o caducada durante la transcripción
      if (!Number.isFinite(first.duration) || first.duration > maxCall + 5) {
        log(`[relay] ${id} descartada: duración ${Math.round(first.duration)} s supera el máximo`);
        return fail(p, "La llamada es demasiado larga. Graba una más corta.");
      }
      if (!first.text) {
        log(`[relay] ${id} descartada: sin voz reconocible`);
        return fail(p, "No hemos podido entender voz en el audio. Vuelve a grabar y habla cerca del micrófono.");
      }
      // Sin idioma válido del STT, solo el LLM puede aportarlo (en la misma petición de extracción).
      const language = /^[a-z]{2}$/.test(first.language) ? first.language : "";
      if (!language && !opts.llmExtract) {
        log(`[relay] ${id} descartada: idioma no reconocido`);
        return fail(p, "No hemos reconocido el idioma del audio. Vuelve a grabar.");
      }
      p.transcript = first.text.slice(0, MAX_TRANSCRIPT_CHARS);
      p.language = language;
      p.durationS = first.duration;
      p.sttMs = sttMs;
      p.status = "ready";
      arm(p); // el TTL cuenta desde que la transcripción está lista, no desde la subida
      log(`[relay] ${id} transcrita (${language || "?"}, ${Math.round(first.duration)} s, stt ${sttMs} ms): esperando «Enviar»`);
      p.built = build(p);
    } catch (e) {
      if (e instanceof SttError && e.status === 413) log(`[relay] ${id} descartada: audio demasiado largo (STT 413)`);
      else log(`[relay] ${id} error: ${e instanceof Error ? e.message : "desconocido"}`);
      if (p.status === "transcribing") {
        fail(p, e instanceof SttError && e.status === 413 ? "La llamada es demasiado larga. Graba una más corta." : "No se pudo transcribir el audio. Vuelve a grabar.");
      }
    }
  }

  /** Publica la llamada confirmada: espera a la extracción (si sigue en curso) y emite el evento una sola vez. */
  async function publishPending(p: Pending) {
    const built = await p.built;
    if (p.status !== "ready") return; // descartada o caducada mientras se esperaba
    const id = p.label;
    if (!built) return fail(p, "No se pudo procesar la llamada. Vuelve a grabar.");
    const sttMs = p.sttMs ?? 0;
    const ev: PublicCallEvent = {
      id,
      receivedAt: new Date().toISOString(),
      durationS: p.durationS ?? 0,
      language: built.language,
      transcript: p.transcript ?? "",
      translation_en: built.translation,
      extraction: built.extraction,
      location: built.location,
      extractor: built.extractor,
      timings: { sttMs, totalMs: sttMs + built.extractMs },
    };
    if (!isPublicCallEvent(ev)) {
      log(`[relay] ${id} descartada: el evento no cumple el contrato`);
      return fail(p, "No se pudo procesar la llamada. Vuelve a grabar.");
    }
    publish(ev);
    p.status = "sent";
    release(p);
    log(`[relay] ${id} publicada (${built.language}, ${Math.round(ev.durationS)} s, stt ${sttMs} ms, ${built.extractor})`);
  }

  /** Añade una tarea al principio de la cola serie del STT (alguien está esperando) y devuelve su resultado. */
  function inQueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.unshift(() => fn().then(resolve, reject));
      void drain();
    });
  }

  function expire(p: Pending) {
    if (p.status === "transcribing" || p.status === "ready") {
      p.status = "expired";
      p.error = "La llamada caducó antes de enviarse. Vuelve a grabar.";
      release(p);
      refundQuota(p);
      log(`[relay] ${p.label} caducada sin enviar`);
    }
  }

  /**
   * Arranca los temporizadores al salir de «transcribing» (lista o fallida): una llamada que espera turno del STT
   * no caduca ni se olvida. Pasado el doble del TTL se olvida del todo (el id vuelve a ser 404).
   */
  function arm(p: Pending) {
    if (p.timers.length) return;
    const t1 = setTimeout(() => expire(p), pendingTtlMs);
    const t2 = setTimeout(() => {
      if (pending.get(p.id) === p) pending.delete(p.id);
    }, pendingTtlMs * 2);
    t1.unref();
    t2.unref();
    p.timers = [t1, t2];
  }

  /** Cuántas llamadas de esta IP esperan «Enviar» (más las que aún están subiendo el cuerpo). */
  function waitingOf(ip: string): number {
    let n = reservingByIp.get(ip) ?? 0;
    for (const p of pending.values()) if (p.ip === ip && (p.status === "transcribing" || p.status === "ready")) n++;
    return n;
  }

  /** Cola llena: libera el hueco de la llamada «ready» más antigua que aún no se está enviando. */
  function evictOldestReady(): boolean {
    for (const p of pending.values()) {
      if (p.status === "ready" && !p.sending) {
        log(`[relay] ${p.label} retirada: la cola estaba llena`);
        expire(p);
        return true;
      }
    }
    return false;
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
    const origin = req.headers.origin;
    if (origin && !origins.has(origin)) return json(req, res, 403, { error: "Origen no permitido" });
    const ip = rateKey(clientIp(req));
    if (quota.full(ip)) return json(req, res, 429, { error: "Demasiadas llamadas desde tu conexión. Espera unos minutos." });
    if (uploads.full(ip)) return json(req, res, 429, { error: "Has subido demasiados audios en poco tiempo. Espera unos minutos antes de grabar otro." });
    if (waitingOf(ip) >= pendingPerIp) {
      return json(req, res, 429, { error: "Ya tienes llamadas esperando a que pulses «Enviar». Envía o descarta la anterior antes de grabar otra." });
    }
    // Con la cola llena, la llamada «ready» más antigua cede su hueco; solo si no hay ninguna → 503.
    if (held() + reserving > maxPending && !evictOldestReady()) {
      return json(req, res, 503, { error: "Hay demasiadas llamadas en cola. Inténtalo en un minuto." });
    }
    // Cuota, tope de subidas y hueco de cola se reservan antes del primer await (sin carreras entre peticiones
    // simultáneas) y se devuelven si la llamada se rechaza. Si se acepta, la cuota queda en la llamada: se
    // devuelve si luego se descarta o caduca sin enviarse; el tope de subidas nunca se devuelve.
    const undoQuota = quota.hit(ip);
    const undoUpload = uploads.hit(ip);
    reserving++;
    reservingByIp.set(ip, (reservingByIp.get(ip) ?? 0) + 1);
    let reserved = true;
    const unreserve = () => {
      if (!reserved) return;
      reserved = false;
      reserving--;
      const n = (reservingByIp.get(ip) ?? 1) - 1;
      if (n > 0) reservingByIp.set(ip, n);
      else reservingByIp.delete(ip);
    };
    res.once("close", () => {
      unreserve();
      if (res.statusCode !== 202) {
        undoQuota();
        undoUpload();
      }
    });
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

    const label = `P${bootTag}${++seq}`;
    const id = randomBytes(16).toString("hex"); // 128 bits: quien tiene el id es quien grabó
    log(`[relay] ${label} recibida (${Math.round(file.size / 1024)} KB, ip ${short(ip)})`);
    const p: Pending = { id, label, status: "transcribing", ip, file, refund: undoQuota, timers: [] };
    unreserve(); // a partir de aquí la llamada ya cuenta como pendiente
    pending.set(id, p);
    queue.push(() => processCall(p));
    void drain();
    json(req, res, 202, { id });
  }

  /** GET/POST enviar/DELETE sobre una llamada pendiente: mismas reglas de Origin que POST /llamar, sin token ni cuota. */
  async function handlePending(req: http.IncomingMessage, res: http.ServerResponse, id: string, action: "status" | "send" | "discard") {
    const origin = req.headers.origin;
    if (origin && !origins.has(origin)) return json(req, res, 403, { error: "Origen no permitido" });
    res.setHeader("Cache-Control", "no-store");
    const p = SECRET_ID.test(id) ? pending.get(id) : undefined;
    if (!p) return json(req, res, 404, { error: "No encontramos esa llamada. Puede que haya caducado: vuelve a grabar." });

    if (action === "status") {
      if (p.status === "ready") return json(req, res, 200, { status: "ready", transcript: p.transcript, language: p.language });
      if (p.status === "failed" || p.status === "expired") return json(req, res, 200, { status: p.status, error: p.error });
      if (p.status === "transcribing") {
        // Cuántas se transcribirán antes que esta (0 = es la que está en proceso). Solo un número: nada de otras llamadas.
        let ahead = 0;
        for (const [k, q] of pending) {
          if (k === id) break;
          if (q.status === "transcribing") ahead++;
        }
        return json(req, res, 200, { status: "transcribing", ahead });
      }
      return json(req, res, 200, { status: p.status });
    }

    if (action === "discard") {
      if (p.status === "sent") return json(req, res, 409, { status: "sent", error: "La llamada ya se envió al operador." });
      p.timers.forEach(clearTimeout);
      refundQuota(p);
      p.status = "discarded";
      release(p);
      pending.delete(id);
      log(`[relay] ${p.label} descartada por la persona`);
      return json(req, res, 200, { ok: true });
    }

    // send
    if (p.status === "expired") return json(req, res, 410, { status: "expired", error: p.error });
    if (p.status === "transcribing") return json(req, res, 409, { status: "transcribing", error: "Todavía se está transcribiendo la llamada." });
    if (p.status === "failed") return json(req, res, 409, { status: "failed", error: p.error });
    if (p.status === "ready") {
      // Un solo publicador por llamada: las peticiones simultáneas esperan a la misma promesa.
      p.sending ??= publishPending(p).catch((e) => {
        log(`[relay] ${p.label} error al publicar: ${e instanceof Error ? e.message : "desconocido"}`);
        fail(p, "No se pudo procesar la llamada. Vuelve a grabar.");
      });
      await p.sending;
    }
    const st = p.status as PendingStatus;
    if (st === "sent") return json(req, res, 200, { status: "sent" });
    if (st === "failed") return json(req, res, 502, { status: "failed", error: p.error });
    if (st === "expired") return json(req, res, 410, { status: "expired", error: p.error });
    return json(req, res, 404, { error: "No encontramos esa llamada. Puede que haya caducado: vuelve a grabar." });
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
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
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
    const m = /^\/llamar\/([^/]+)(\/enviar)?$/.exec(url.pathname);
    if (m) {
      const action = m[2] ? (req.method === "POST" ? "send" : null) : req.method === "GET" ? "status" : req.method === "DELETE" ? "discard" : null;
      if (action) {
        handlePending(req, res, m[1], action).catch((e) => {
          log(`[relay] error: ${e instanceof Error ? e.message : "desconocido"}`);
          if (!res.headersSent) json(req, res, 500, { error: "Error interno del relay" });
        });
        return;
      }
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
  const cfg = getConfig(process.env);
  const llmTimeoutMs = envInt("LLM_TIMEOUT_MS", DEFAULT_LLM_TIMEOUT_MS);
  const rateMax = envInt("RATE_LIMIT", 3);
  const relay = createRelay({
    sttBaseUrl: process.env.STT_BASE_URL ?? "http://stt:8000/v1",
    sttModel: process.env.STT_MODEL ?? "Systran/faster-whisper-small",
    sttApiKey: sttApiKeyFromEnv(process.env),
    sttTimeoutMs: envInt("STT_TIMEOUT_MS", 180_000),
    maxCallSeconds: envInt("MAX_CALL_SECONDS", DEFAULT_MAX_CALL_SECONDS),
    token: process.env.RELAY_TOKEN,
    allowedOrigins: (process.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    rateLimit: { max: rateMax, windowMs: envInt("RATE_WINDOW_MIN", 10) * 60_000 },
    maxPending: envInt("MAX_PENDING", 20),
    pendingPerIp: envInt("PENDING_PER_IP", 2),
    uploadLimit: envInt("UPLOAD_LIMIT", rateMax * 3),
    trustProxy: process.env.TRUST_PROXY === "1",
    llmExtract: llmEnabled(cfg) ? createLlmExtractor(cfg, llmTimeoutMs) : undefined,
    llmTimeoutMs,
    pendingTtlMs: envInt("PENDING_TTL_SECONDS", 300) * 1000,
  });
  const port = envInt("PORT", 8080);
  // 0.0.0.0 por defecto (Docker: Caddy llega por la red de compose). En local, HOST=127.0.0.1.
  const host = process.env.HOST?.trim() || "0.0.0.0";
  const server = http.createServer(relay.handler);
  server.requestTimeout = 60_000;
  server.listen(port, host, () => {
    console.log(
      `[relay] escuchando en ${host}:${port} (token ${process.env.RELAY_TOKEN ? "configurado" : "NO configurado: /events devuelve 503"}, extractor ${llmEnabled(cfg) ? `LLM ${cfg.llmModel}` : "reglas"})`,
    );
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) start();
