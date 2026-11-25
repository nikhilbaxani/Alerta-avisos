import type { EngineCall, Incident } from "@/lib/engine";
import { MISSING_PHRASES, PHRASES, type Phrase } from "@/lib/phrases";
import type { Extraction, IncidentType, RiskTag } from "@/lib/types";

/**
 * «Falta saber» (X12): qué datos clave de un incidente no ha aportado todavía ninguna de sus llamadas,
 * con la pregunta pretraducida para hacérsela al llamante. Es solo una guía para el operador: no decide nada.
 * Se calcula con la extracción (tipo, riesgos, personas, ubicación y textos en castellano), nunca con
 * instrucciones del llamante: los textos solo se usan para comprobar si un dato ya se conoce.
 */

export const MISSING_IDS = ["respira", "direccion", "personas", "altura_agua", "planta", "heridos"] as const;
export type MissingId = (typeof MISSING_IDS)[number];

/** Lo que el sistema sabe de un incidente, unido de todas sus llamadas. */
export interface MissingFacts {
  type: IncidentType;
  risks: RiskTag[];
  /** Máximo de personas en peligro que ha dado alguna llamada. */
  people: number;
  /** Ubicaciones dichas por los llamantes (`location_text`). */
  locations: string[];
  /** Textos en castellano de la extracción (resumen, traducción y palabras clave). */
  texts: string[];
}

export interface MissingItem {
  id: MissingId;
  /** Rótulo corto en castellano para la lista «Falta saber». */
  label: string;
  /** Id de la frase en `PHRASES` o `MISSING_PHRASES`. */
  phraseId: string;
  phrase: Phrase;
}

interface MissingRule {
  label: string;
  phraseId: string;
  /** Tipos de incidente en los que se pregunta. */
  types: readonly IncidentType[] | "todos";
  /** Además del tipo, riesgos que hacen que se pregunte (si alguno está presente). */
  alsoIfRisks?: readonly RiskTag[];
  /** El dato ya se conoce. */
  known: (f: MissingFacts) => boolean;
}

const hasRisk = (f: MissingFacts, ...r: RiskTag[]) => r.some((x) => f.risks.includes(x));
const anyText = (f: MissingFacts, re: RegExp) => f.texts.some((t) => re.test(t)) || f.locations.some((t) => re.test(t));

/** Vía con nombre o carretera con código: lo que el AML solo no da. */
const STREET_RE =
  /\b(calle|c\/|avenida|avda\.?|av\.|paseo|camino|plaza|pza\.|carretera|ronda|glorieta|travesía|callejón|bulevar|autovía|autopista)\b|\b[A-Z]{1,3}-\d{1,4}\b/i;
const CONSCIOUS_RE = /\b(in)?consciente\b/i;
const WATER_LEVEL_RE =
  /\b(tobillos?|rodillas?|cintura|pecho|cuello|puertas?|ventanillas?|techo|\d+\s?(cm|centímetros|metros?))\b|medio metro/i;
const FLOOR_RE = /\b(planta|piso|sótano|ático|bajo)\b|\d+\s?\.?\s?[ºª]/i;
const INJURED_RE = /\b(herid[oa]s?|ilesos?)\b/i;

const FLOOD: readonly IncidentType[] = ["inundacion_vehiculo", "inundacion_vivienda", "garaje_inundado"];

/**
 * Tabla de datos clave, en el orden en que se muestran (primero lo vital). Cambiar aquí, con su test.
 * - respira: médica (o heridos/inconsciente); se sabe si el riesgo «inconsciente» o el texto habla de consciencia.
 * - direccion: todos; se sabe si alguna ubicación nombra una vía o una carretera (si solo hay AML, falta).
 * - personas: inundaciones, incendio y ascensor; se sabe si alguna llamada da personas en peligro (> 0).
 * - altura_agua: inundaciones; se sabe si el texto dice hasta dónde llega (rodillas, cintura, puertas, cm…).
 * - planta: vivienda inundada, incendio, ascensor y médica; se sabe si el texto dice la planta o el piso.
 * - heridos: accidente, árbol caído, incendio y delito; se sabe con riesgo «herido»/«inconsciente» o si el texto
 *   habla de heridos o ilesos.
 */
export const MISSING_RULES: Record<MissingId, MissingRule> = {
  respira: {
    label: "Si respira y está consciente",
    phraseId: "respira",
    types: ["medica"],
    alsoIfRisks: ["herido", "inconsciente"],
    known: (f) => hasRisk(f, "inconsciente") || anyText(f, CONSCIOUS_RE),
  },
  direccion: {
    label: "Dirección exacta",
    phraseId: "direccion",
    types: "todos",
    known: (f) => f.locations.some((l) => STREET_RE.test(l)),
  },
  personas: {
    label: "Cuántas personas hay en peligro",
    phraseId: "personas",
    types: [...FLOOD, "incendio", "ascensor"],
    known: (f) => f.people > 0,
  },
  altura_agua: {
    label: "Hasta dónde llega el agua",
    phraseId: "altura_agua",
    types: FLOOD,
    known: (f) => anyText(f, WATER_LEVEL_RE),
  },
  planta: {
    label: "Planta o piso",
    phraseId: "planta",
    types: ["inundacion_vivienda", "incendio", "ascensor", "medica"],
    known: (f) => anyText(f, FLOOR_RE),
  },
  heridos: {
    label: "Si hay heridos",
    phraseId: "heridos",
    types: ["accidente", "arbol_caido", "incendio", "delito"],
    known: (f) => hasRisk(f, "herido", "inconsciente") || anyText(f, INJURED_RE),
  },
};

const ALL_PHRASES: readonly Phrase[] = [...PHRASES, ...MISSING_PHRASES];

/** Frase (castellano + traducciones) por id, de `PHRASES` o de `MISSING_PHRASES`. */
export const missingPhrase = (id: string): Phrase | undefined => ALL_PHRASES.find((p) => p.id === id);

const applies = (r: MissingRule, f: MissingFacts) =>
  r.types === "todos" || r.types.includes(f.type) || (r.alsoIfRisks ?? []).some((x) => f.risks.includes(x));

/** Datos clave que faltan, en el orden de `MISSING_IDS`. Puro y determinista. */
export function missingInfo(f: MissingFacts): MissingItem[] {
  return MISSING_IDS.flatMap((id) => {
    const r = MISSING_RULES[id];
    if (!applies(r, f) || r.known(f)) return [];
    const phrase = missingPhrase(r.phraseId);
    return phrase ? [{ id, label: r.label, phraseId: r.phraseId, phrase }] : [];
  });
}

/** Une las extracciones de las llamadas de un incidente. El tipo es el del incidente (o el de la primera). */
export function factsFrom(extractions: Extraction[], type?: IncidentType): MissingFacts {
  return {
    type: type ?? extractions[0]?.incident_type ?? "otro",
    risks: [...new Set(extractions.flatMap((e) => e.risks))],
    people: Math.max(0, ...extractions.map((e) => e.people_at_risk)),
    locations: extractions.map((e) => e.location_text).filter(Boolean),
    texts: extractions.flatMap((e) => [e.summary_es, e.translation_es ?? "", ...e.keywords]).filter(Boolean),
  };
}

/** Lo que falta de un incidente de la consola: `calls` es `ConsoleState.calls` (callId → EngineCall). */
export function incidentMissing(incident: Incident, calls: Record<string, EngineCall>): MissingItem[] {
  const ex = incident.callIds.flatMap((id) => (calls[id] ? [calls[id].extraction] : []));
  const f = factsFrom(ex, incident.type);
  return missingInfo({
    ...f,
    risks: [...new Set([...incident.risks, ...f.risks])],
    people: Math.max(incident.people, f.people),
    locations: [...new Set([...incident.locations, ...f.locations])],
  });
}
