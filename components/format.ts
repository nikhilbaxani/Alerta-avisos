import type { Incident } from "@/lib/engine";
import { LANG_NAMES } from "@/lib/labels";

export const mmss = (s: number) => {
  const t = Math.floor(s);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

/** Lugar del incidente tal como lo describió la primera llamada. */
export const placeOf = (i: Incident) => i.locations[0] ?? "";

/** Nivel visual: crítico (rojo), pendiente de decisión (ámbar) o normal. */
export const toneOf = (i: Incident): "pending" | "critical" | "normal" =>
  i.provisional ? "pending" : i.severity >= 5 || i.risks.includes("vida") ? "critical" : "normal";

export const hasIdentifiedLanguage = (code: string) => code.trim() !== "" && code.trim().toLowerCase() !== "und";

export const langName = (code: string) =>
  hasIdentifiedLanguage(code) ? LANG_NAMES[code] ?? code.toUpperCase() : "Idioma no detectado";

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
