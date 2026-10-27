export type Lang = string; // ISO 639-1: es, en, de, fr, ar, it…

export const RISK_TAGS = [
  "vida",
  "atrapados",
  "menor",
  "mayor",
  "movilidad_reducida",
  "agua_subiendo",
  "sin_respuesta",
  "inconsciente",
  "herido",
  "dolor_pecho",
  "sin_luz",
  "trafico",
  "via_bloqueada",
  "vehiculo_danado",
  "cables_electricos",
] as const;
export type RiskTag = (typeof RISK_TAGS)[number];

export const INCIDENT_TYPES = [
  "inundacion_vehiculo",
  "inundacion_vivienda",
  "garaje_inundado",
  "arbol_caido",
  "semaforos",
  "medica",
  "incendio",
  "accidente",
  "otro",
] as const;
export type IncidentType = (typeof INCIDENT_TYPES)[number];

export interface Aml {
  lat: number;
  lng: number;
  /** Radio de precisión en metros (Advanced Mobile Location). */
  acc: number;
}

/** Lo que el modelo extrae de una llamada. */
export interface Extraction {
  language: Lang;
  translation_es: string | null;
  summary_es: string;
  incident_type: IncidentType;
  location_text: string;
  keywords: string[];
  risks: RiskTag[];
  people_at_risk: number;
  severity: 1 | 2 | 3 | 4 | 5;
}

export interface ScenarioCall {
  id: string;
  /** Segundos desde el inicio del escenario. */
  t: number;
  lang: Lang;
  phone: string;
  aml: Aml;
  transcript: string;
  /** Incidente real (solo para evaluar, el sistema no lo ve). */
  gold: string;
  /** Extracción de referencia usada en modo simulado. */
  mock: Extraction;
}

export interface Scenario {
  id: string;
  name: string;
  place: string;
  calls: ScenarioCall[];
}

/** Incidente tal y como lo ve el agrupador. */
export interface IncidentSnapshot {
  id: string;
  type: IncidentType;
  points: Aml[];
  keywords: string[];
  risks: RiskTag[];
  summary: string;
  provisional?: boolean;
}

export interface Candidate {
  incidentId: string;
  score: number;
  distance: number;
  parts: { spatial: number; type: number; text: number };
}

export type DecisionAction = "merge" | "ask" | "new";

export interface Decision {
  action: DecisionAction;
  incidentId?: string;
  score: number;
  candidates: Candidate[];
  /** Explicación para el operador, en castellano. */
  reason: string;
  /** Opinión del modelo en la zona gris (solo con IA local). */
  judge?: { same: boolean; confidence: number; reason: string } | null;
}

export interface ProcessResult {
  callId: string;
  transcript: string;
  language: Lang;
  extraction: Extraction;
  decision: Decision;
  engine: { stt: string; llm: string };
  timings: { sttMs: number; llmMs: number; totalMs: number };
}
