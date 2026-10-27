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

/** Fuerza la salida del modelo a los vocabularios cerrados y rangos válidos. */
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
  return {
    language,
    translation_es: translation,
    summary_es: str(o.summary_es),
    incident_type: type,
    location_text: str(o.location_text),
    keywords,
    risks,
    people_at_risk: Number.isFinite(people) ? Math.max(0, Math.min(50, people)) : 0,
    severity: (Number.isFinite(sev) ? Math.max(1, Math.min(5, sev)) : 3) as Extraction["severity"],
  };
}
