import { INCIDENT_TYPES, RISK_TAGS } from "@/lib/types";
import type { Aml, Extraction } from "@/lib/types";

/** Llamada grabada por el público (QR → /llamar → relay del VPS → SSE → bandeja de la consola). */
export interface PublicCallEvent {
  /** "P" + etiqueta de arranque del relay + número ("PK3F1"…), asignado por el relay. */
  id: string;
  /** ISO 8601. */
  receivedAt: string;
  durationS: number;
  /** ISO 639-1 detectado por Whisper. */
  language: string;
  /** Transcripción original (texto no confiable). */
  transcript: string;
  /** Traducción al inglés de Whisper (solo si la llamada no está en castellano). */
  translation_en: string | null;
  /** Extracción del extractor de reglas (lib/rules.ts). */
  extraction: Extraction;
  /** Ubicación dicha en el audio; `known = false` si el nomenclátor no reconoce ningún lugar. */
  location: PublicLocation;
  timings: { sttMs: number; totalMs: number };
}

export interface PublicLocation {
  place: string | null;
  known: boolean;
  aml: Aml;
}

/** Duración máxima de una llamada del público, en segundos (S4). */
export const DEFAULT_MAX_CALL_SECONDS = 120;
/** Ubicación por defecto si no se reconoce ningún lugar (S5). */
export const UNKNOWN_LOCATION_AML: Aml = { lat: 36.7213, lng: -4.4214, acc: 1500 };
export const KNOWN_LOCATION_ACC = 150;
export const PUBLIC_CALL_ID = /^P[0-9A-Z]{1,12}$/;

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null;
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const isStr = (x: unknown): x is string => typeof x === "string";

function isAml(x: unknown): x is Aml {
  return isObj(x) && isNum(x.lat) && isNum(x.lng) && isNum(x.acc) && x.acc >= 0;
}

function isExtraction(x: unknown): x is Extraction {
  if (!isObj(x)) return false;
  return (
    isStr(x.language) &&
    (x.translation_es === null || isStr(x.translation_es)) &&
    isStr(x.summary_es) &&
    (INCIDENT_TYPES as readonly string[]).includes(x.incident_type as string) &&
    isStr(x.location_text) &&
    Array.isArray(x.keywords) && x.keywords.every(isStr) &&
    Array.isArray(x.risks) && x.risks.every((r) => (RISK_TAGS as readonly string[]).includes(r as string)) &&
    isNum(x.people_at_risk) && x.people_at_risk >= 0 &&
    isNum(x.severity) && Number.isInteger(x.severity) && x.severity >= 1 && x.severity <= 5
  );
}

/** Valida un evento recibido por SSE: la consola descarta cualquier cosa que no cumpla el contrato. */
export function isPublicCallEvent(x: unknown): x is PublicCallEvent {
  if (!isObj(x)) return false;
  const loc = x.location;
  const tim = x.timings;
  return (
    isStr(x.id) && PUBLIC_CALL_ID.test(x.id) &&
    isStr(x.receivedAt) && !Number.isNaN(Date.parse(x.receivedAt)) &&
    isNum(x.durationS) && x.durationS >= 0 &&
    isStr(x.language) && /^[a-z]{2}$/.test(x.language) &&
    isStr(x.transcript) &&
    (x.translation_en === null || isStr(x.translation_en)) &&
    isExtraction(x.extraction) &&
    isObj(loc) && (loc.place === null || isStr(loc.place)) && typeof loc.known === "boolean" && isAml(loc.aml) &&
    isObj(tim) && isNum(tim.sttMs) && isNum(tim.totalMs)
  );
}
