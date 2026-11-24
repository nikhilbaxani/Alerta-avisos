import { findCall } from "@/data/scenarios";
import { LANG_NAMES } from "@/lib/labels";
import type { ProcessInput } from "@/lib/process";
import { INCIDENT_TYPES, RISK_TAGS } from "@/lib/types";
import type { Aml, IncidentSnapshot, IncidentType, RiskTag } from "@/lib/types";

/**
 * Límites de las API (MEMORIA §16.1). Holgados frente a lo que manda la consola, para no romperla:
 * - El escenario completo de la DANA manda unos 10 KB de incidentes; una llamada del guion tiene < 200 caracteres.
 * - Cada llamada aporta 1 punto, hasta 12 palabras clave y 1 lugar a su incidente: 500 elementos por lista
 *   son más de 40 llamadas fusionadas en un mismo incidente.
 * - El audio en directo (Opus a ~32 kbit/s) ocupa unos 4 KB por segundo: 10 MB son más de 30 minutos.
 * Si se supera un tamaño se responde 413; si el dato no tiene la forma o el rango esperados, 400.
 */
export const LIMITS = {
  /** Cuerpo JSON de /api/process. */
  processBodyBytes: 1024 * 1024,
  /** Transcripción enviada por la consola (llamada en directo): unos 5 minutos de habla. */
  transcriptChars: 4_000,
  /** Incidentes abiertos en el snapshot. */
  incidents: 200,
  /** Puntos, palabras clave o lugares por incidente. */
  listItems: 500,
  /** Caracteres de cada palabra clave o lugar. */
  itemChars: 200,
  /** Caracteres del resumen de un incidente. */
  summaryChars: 1_000,
  /** Radio de precisión AML máximo admitido, en metros (el AML real da 15–20 m). */
  accMaxM: 10_000,
  /** Cuerpo JSON de /api/translate. */
  translateBodyBytes: 16 * 1024,
  /** Frase del operador que se traduce. */
  translateChars: 500,
  /** Audio de la llamada en directo. */
  audioBytes: 10 * 1024 * 1024,
  /** Margen del multipart (cabeceras y separadores) sobre el audio. */
  formOverheadBytes: 64 * 1024,
} as const;

export type Validated<T> = { ok: true; value: T } | { ok: false; status: 400 | 413; error: string };

class Invalid extends Error {
  constructor(
    readonly status: 400 | 413,
    message: string,
  ) {
    super(message);
  }
}
const bad = (msg: string): never => {
  throw new Invalid(400, msg);
};
const tooBig = (msg: string): never => {
  throw new Invalid(413, msg);
};

function run<T>(fn: () => T): Validated<T> {
  try {
    return { ok: true, value: fn() };
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, status: e.status, error: e.message };
    throw e;
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const ID = /^[A-Za-z0-9_-]{1,32}$/;
const CALL_ID = /^[A-Za-z0-9_-]{1,16}$/;
/** «La transcripción» se queda igual; una ruta como `incidents[2].type` pasa a «El campo incidents[2].type». */
const field = (name: string) => (/^[A-ZÁÉÍÓÚ]/.test(name) ? name : `El campo ${name}`);

function num(v: unknown, name: string, min: number, max: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) bad(`${field(name)} debe ser un número finito`);
  const n = v as number;
  if (n < min || n > max) bad(`${field(name)} está fuera de rango (${min} a ${max})`);
  return n;
}

function aml(v: unknown, name: string): Aml {
  if (!isObject(v)) bad(`Falta ${name} con lat, lng y acc`);
  const o = v as Record<string, unknown>;
  return {
    lat: num(o.lat, `${name}.lat`, -90, 90),
    lng: num(o.lng, `${name}.lng`, -180, 180),
    acc: num(o.acc, `${name}.acc`, 0, LIMITS.accMaxM),
  };
}

function text(v: unknown, name: string, max: number): string {
  if (typeof v !== "string") bad(`${field(name)} debe ser texto`);
  const s = v as string;
  if (s.length > max) tooBig(`${field(name)} supera ${max} caracteres`);
  return s;
}

function list<T>(v: unknown, name: string, item: (x: unknown, name: string) => T, max: number = LIMITS.listItems): T[] {
  if (!Array.isArray(v)) bad(`${field(name)} debe ser una lista`);
  const a = v as unknown[];
  if (a.length > max) tooBig(`${field(name)} tiene más de ${max} elementos`);
  return a.map((x, n) => item(x, `${name}[${n}]`));
}

function incident(v: unknown, name: string): IncidentSnapshot {
  if (!isObject(v)) bad(`${field(name)} debe ser un incidente`);
  const o = v as Record<string, unknown>;
  if (typeof o.id !== "string" || !ID.test(o.id)) bad(`${field(`${name}.id`)} no es un identificador válido`);
  if (!INCIDENT_TYPES.includes(o.type as IncidentType)) bad(`${field(`${name}.type`)} no es un tipo de incidente válido`);
  if (o.provisional !== undefined && typeof o.provisional !== "boolean") bad(`${field(`${name}.provisional`)} debe ser verdadero o falso`);
  const word = (x: unknown, n: string) => text(x, n, LIMITS.itemChars);
  return {
    id: o.id as string,
    type: o.type as IncidentType,
    points: list(o.points, `${name}.points`, aml),
    keywords: list(o.keywords, `${name}.keywords`, word),
    risks: list(o.risks, `${name}.risks`, (x, n) => {
      if (!RISK_TAGS.includes(x as RiskTag)) bad(`${field(n)} no es un riesgo válido`);
      return x as RiskTag;
    }),
    summary: text(o.summary, `${name}.summary`, LIMITS.summaryChars),
    locations: o.locations === undefined ? undefined : list(o.locations, `${name}.locations`, word),
    provisional: o.provisional as boolean | undefined,
  };
}

/** Cuerpo de POST /api/process: devuelve una copia con solo los campos conocidos. */
export function validateProcessInput(body: unknown): Validated<ProcessInput> {
  return run(() => {
    if (!isObject(body)) bad("El cuerpo debe ser un objeto JSON");
    const o = body as Record<string, unknown>;
    let callId: string | undefined;
    if (o.callId !== undefined) {
      if (typeof o.callId !== "string" || !CALL_ID.test(o.callId)) bad("El callId no es válido: solo letras, números, guion o guion bajo (hasta 16)");
      callId = o.callId as string;
    }
    let transcript: string | undefined;
    if (o.transcript !== undefined) {
      transcript = text(o.transcript, "La transcripción", LIMITS.transcriptChars);
      if (!transcript.trim()) bad("La transcripción está vacía");
    }
    if (transcript === undefined) {
      if (callId === undefined) bad("Falta la transcripción o el callId de una llamada del escenario");
      if (!findCall(callId!)) bad(`La llamada ${callId} no está en ningún escenario y no trae transcripción`);
    }
    const point = aml(o.aml, "aml");
    const incidents = list(o.incidents, "incidents", incident, LIMITS.incidents);
    return {
      ...(callId !== undefined ? { callId } : {}),
      ...(transcript !== undefined ? { transcript } : {}),
      aml: point,
      incidents,
    };
  });
}

/** Cuerpo de POST /api/translate: frase corta del operador y un idioma de LANG_NAMES. */
export function validateTranslateInput(body: unknown): Validated<{ text: string; lang: string }> {
  return run(() => {
    if (!isObject(body)) bad("El cuerpo debe ser un objeto JSON");
    const o = body as Record<string, unknown>;
    if (typeof o.text !== "string" || !o.text.trim()) bad("Falta el texto que hay que traducir");
    const t = text((o.text as string).trim(), "El texto", LIMITS.translateChars);
    if (typeof o.lang !== "string" || !Object.hasOwn(LANG_NAMES, o.lang)) bad("Idioma no admitido para la traducción");
    return { text: t, lang: o.lang as string };
  });
}

/** Archivo de audio de POST /api/transcribe. */
export function validateAudio(file: unknown): Validated<Blob> {
  return run(() => {
    if (!(file instanceof Blob)) bad("Falta el archivo de audio");
    const f = file as Blob;
    if (f.size === 0) bad("El archivo de audio está vacío");
    if (f.size > LIMITS.audioBytes) tooBig(`El audio supera ${LIMITS.audioBytes / (1024 * 1024)} MB`);
    // MediaRecorder manda audio/webm, audio/ogg o audio/mp4 (Safari); algunos navegadores lo marcan como vídeo.
    if (f.type && !/^(audio|video)\//.test(f.type) && f.type !== "application/octet-stream") bad("El archivo no es audio");
    return f;
  });
}
