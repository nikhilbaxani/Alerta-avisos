import type { Extraction } from "@/lib/types";

/** Supuestos de la simulación de sala (ilustrativos, no son datos reales). */
export const NEW_CALL_SECONDS = 60;
export const DUPLICATE_SECONDS = 15;
const CRITICAL_STATE = ["dolor_pecho", "inconsciente", "sin_respuesta"];

export interface SimCall {
  id: string;
  t: number;
  extraction: Pick<Extraction, "severity" | "risks">;
  incidentId: string;
  /** Primera llamada de su incidente. */
  first: boolean;
}

export interface SimResult {
  /** Segundos de espera hasta que un operador atiende cada llamada. */
  wait: Record<string, number>;
}

type Mode = "sin_copiloto" | "con_copiloto";

/** Sala con `operators` operadores. Sin copiloto: orden de llegada y 60 s por llamada. Con copiloto: primero los incidentes nuevos por gravedad; los duplicados cuestan 15 s. */
export function simulate(calls: SimCall[], operators: number, mode: Mode): SimResult {
  const pending = [...calls].sort((a, b) => a.t - b.t);
  const free = Array<number>(Math.max(1, operators)).fill(0);
  const wait: Record<string, number> = {};
  const rank = (c: SimCall) => (c.first ? 0 : 1);
  while (pending.length) {
    const k = free.indexOf(Math.min(...free));
    let now = free[k];
    if (!pending.some((c) => c.t <= now)) now = pending[0].t;
    const ready = pending.filter((c) => c.t <= now);
    const pick =
      mode === "sin_copiloto"
        ? ready[0]
        : [...ready].sort((a, b) => rank(a) - rank(b) || b.extraction.severity - a.extraction.severity || a.t - b.t)[0];
    pending.splice(pending.indexOf(pick), 1);
    wait[pick.id] = now - pick.t;
    free[k] = now + (mode === "con_copiloto" && !pick.first ? DUPLICATE_SECONDS : NEW_CALL_SECONDS);
  }
  return { wait };
}

/** Llamada crítica: primera de un incidente con estado clínico crítico; si no hay, la de gravedad 5 más temprana. */
export function criticalCall(calls: SimCall[]): SimCall | undefined {
  const firsts = calls.filter((c) => c.first).sort((a, b) => a.t - b.t);
  return (
    firsts.find((c) => c.extraction.risks.some((r) => CRITICAL_STATE.includes(r))) ??
    firsts.find((c) => c.extraction.severity >= 5)
  );
}

export interface Comparison {
  critical: { id: string; sin: number; con: number } | null;
  meanNew: { sin: number; con: number } | null;
}

export function compare(calls: SimCall[], operators: number): Comparison {
  if (calls.length === 0) return { critical: null, meanNew: null };
  const sin = simulate(calls, operators, "sin_copiloto").wait;
  const con = simulate(calls, operators, "con_copiloto").wait;
  const crit = criticalCall(calls);
  const firsts = calls.filter((c) => c.first);
  const mean = (w: Record<string, number>) => firsts.reduce((a, c) => a + w[c.id], 0) / firsts.length;
  return {
    critical: crit ? { id: crit.id, sin: sin[crit.id], con: con[crit.id] } : null,
    meanNew: { sin: mean(sin), con: mean(con) },
  };
}
