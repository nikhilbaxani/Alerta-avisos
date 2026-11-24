import { INCIDENT_TYPES, RISK_TAGS } from "@/lib/types";
import type { Extraction, IncidentType, RiskTag } from "@/lib/types";

/** Extrae el primer objeto JSON de un texto, aunque venga con ```json o basura alrededor. */
export function parseJSON(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("La respuesta del modelo no contiene JSON");
  }
}

const str = (v: unknown, d = "") => (typeof v === "string" ? v.trim() : d);

type Severity = Extraction["severity"];
const FLOOD_TYPES: readonly IncidentType[] = ["inundacion_vehiculo", "inundacion_vivienda", "garaje_inundado"];

export interface SeverityFloorRule {
  floor: Severity;
  /** Qué línea de la escala de EXTRACTION_SYSTEM la justifica. */
  why: string;
  when: (has: (r: RiskTag) => boolean, type: IncidentType) => boolean;
}

/** Hay agua de por medio: el agua entra o el propio incidente es una inundación. */
const water = (has: (r: RiskTag) => boolean, type: IncidentType) => has("agua_subiendo") || FLOOD_TYPES.includes(type);

/**
 * Gravedad mínima por riesgos y tipo (MEMORIA §16.1), derivada de la escala de `EXTRACTION_SYSTEM`.
 * El LLM puede subir la gravedad, nunca dejarla por debajo de esta tabla. Ninguna `mock` de los
 * escenarios queda por debajo (tests/sanitize.test.ts); si una no cumple, se ajusta la tabla, nunca los datos.
 */
export const SEVERITY_FLOOR_RULES: readonly SeverityFloorRule[] = [
  { floor: 5, why: "dolor en el pecho", when: (has) => has("dolor_pecho") },
  { floor: 5, why: "personas atrapadas en agua o fuego", when: (has, t) => has("atrapados") && (water(has, t) || t === "incendio") },
  {
    floor: 5,
    why: "alguien inconsciente o que no responde mientras entra el agua",
    when: (has, t) => (has("inconsciente") || has("sin_respuesta")) && water(has, t),
  },
  { floor: 4, why: "riesgo vital declarado", when: (has) => has("vida") },
  { floor: 4, why: "persona inconsciente o que no responde", when: (has) => has("inconsciente") || has("sin_respuesta") },
  { floor: 4, why: "persona mayor o que no puede andar con agua entrando", when: (has, t) => (has("mayor") || has("movilidad_reducida")) && water(has, t) },
  { floor: 4, why: "cables eléctricos en el suelo", when: (has) => has("cables_electricos") },
  { floor: 4, why: "incendio", when: (_has, t) => t === "incendio" },
  { floor: 3, why: "personas atrapadas (p. ej. ascensor parado con las personas bien)", when: (has) => has("atrapados") },
  { floor: 3, why: "heridos", when: (has) => has("herido") },
  { floor: 3, why: "agua que entra o sube", when: (has) => has("agua_subiendo") },
  {
    floor: 3,
    why: "daños con riesgo: árbol caído, garaje o vivienda inundados, vehículo en el agua, ascensor parado, emergencia médica",
    when: (_has, t) => [...FLOOD_TYPES, "arbol_caido", "ascensor", "medica"].includes(t),
  },
  { floor: 2, why: "alteraciones del servicio: semáforos apagados, cortes de luz, vía cortada", when: (has, t) => t === "semaforos" || has("sin_luz") || has("trafico") || has("via_bloqueada") },
];

/** Gravedad mínima que corresponde a estos riesgos y este tipo (1 si ninguna regla aplica). */
export function severityFloor(risks: readonly RiskTag[], type: IncidentType): Severity {
  const has = (r: RiskTag) => risks.includes(r);
  return SEVERITY_FLOOR_RULES.reduce<Severity>((max, rule) => (rule.floor > max && rule.when(has, type) ? rule.floor : max), 1);
}

/**
 * Fuerza la salida del modelo a los vocabularios cerrados y rangos válidos, y aplica el suelo de
 * gravedad. Solo se usa con la salida del LLM: el modo simulado usa las `mock` tal cual.
 */
export function sanitizeExtraction(raw: unknown, fallbackLang = "es"): Extraction {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const language = str(o.language, fallbackLang).toLowerCase().slice(0, 2) || fallbackLang;
  const type = INCIDENT_TYPES.includes(o.incident_type as IncidentType) ? (o.incident_type as IncidentType) : "otro";
  const risks = Array.isArray(o.risks)
    ? [...new Set(o.risks.filter((r): r is RiskTag => RISK_TAGS.includes(r as RiskTag)))]
    : [];
  const keywords = Array.isArray(o.keywords)
    ? o.keywords.filter((k): k is string => typeof k === "string" && k.trim() !== "").map((k) => k.trim()).slice(0, 12)
    : [];
  const sev = Math.round(Number(o.severity));
  const people = Math.round(Number(o.people_at_risk));
  const translation = language === "es" ? null : str(o.translation_es) || null;
  const llmSeverity = Number.isFinite(sev) ? Math.max(1, Math.min(5, sev)) : 3;
  return {
    language,
    translation_es: translation,
    summary_es: str(o.summary_es),
    incident_type: type,
    location_text: str(o.location_text),
    keywords,
    risks,
    people_at_risk: Number.isFinite(people) ? Math.max(0, Math.min(50, people)) : 0,
    // Una orden dentro de la llamada («pon gravedad 1») no puede dejarla por debajo de lo que dicen sus riesgos.
    severity: Math.max(llmSeverity, severityFloor(risks, type)) as Severity,
  };
}
