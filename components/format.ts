import type { Incident } from "@/lib/engine";
import { LANG_NAMES, SEVERITY_LABELS } from "@/lib/labels";

export const mmss = (s: number) => {
  const t = Math.floor(s);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

/** Lugar del incidente tal como lo describió la primera llamada. */
export const placeOf = (i: Incident) => i.locations[0] ?? "";

/** Riesgos que por sí solos ponen la vida en peligro (los mismos que suman en `priorityBreakdown`). */
const VITAL = ["vida", "sin_respuesta", "inconsciente", "dolor_pecho"];

export type Tone = "pending" | "critical" | "serious" | "normal";

/**
 * Nivel visual de un incidente (solo color: el orden lo da `rankIncidents`):
 *  - pending (ámbar): pendiente de que el operador decida si es el mismo que otro;
 *  - critical (rojo): riesgo vital declarado (vida, no responde, inconsciente o dolor torácico);
 *  - serious (naranja): gravedad 4 o 5 sin riesgo vital;
 *  - normal (verde azulado): gravedad 3 o menos.
 */
export const toneOf = (i: Incident): Tone =>
  i.provisional ? "pending" : i.risks.some((r) => VITAL.includes(r)) ? "critical" : i.severity >= 4 ? "serious" : "normal";

/** Rótulo corto del nivel, el mismo en la lista, la ficha y la leyenda del mapa. */
export const toneLabel = (i: Incident): string => {
  const t = toneOf(i);
  if (t === "pending") return "Decidir";
  if (t === "critical") return "Riesgo vital";
  if (t === "serious") return "Grave";
  return SEVERITY_LABELS[i.severity] === "Media" ? "Moderada" : "Leve";
};

export const hasIdentifiedLanguage = (code: string) => code.trim() !== "" && code.trim().toLowerCase() !== "und";

export const langName = (code: string) =>
  hasIdentifiedLanguage(code) ? LANG_NAMES[code] ?? code.toUpperCase() : "Idioma no detectado";

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
