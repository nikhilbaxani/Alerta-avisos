import type { Incident } from "@/lib/engine";

export const NEW_INFO_WINDOW_S = 60;
/** Estados clínicos que ponen en peligro la vida de inmediato (DECISIONES 2026-10-28). */
const CRITICAL_STATE = ["sin_respuesta", "inconsciente", "dolor_pecho"] as const;

export interface PriorityBreakdown {
  total: number;
  reasons: string[];
}

/** Prioridad según MEMORIA §10. `now` en segundos del escenario. */
export function priorityOf(i: Incident, now: number): number {
  return priorityBreakdown(i, now).total;
}

export function priorityBreakdown(i: Incident, now: number): PriorityBreakdown {
  const recentInfo = i.lastNewInfoAt !== null && now - i.lastNewInfoAt <= NEW_INFO_WINDOW_S;
  const unattendedMin = i.attended ? 0 : Math.max(0, now - i.createdAt) / 60;
  const total =
    i.severity * 20 +
    Math.min(i.people, 5) * 4 +
    (i.risks.includes("vida") ? 10 : 0) +
    (CRITICAL_STATE.some((r) => i.risks.includes(r)) ? 10 : 0) +
    (recentInfo ? 8 : 0) +
    Math.min(i.callIds.length, 10) +
    unattendedMin;

  const reasons: string[] = [`Gravedad ${i.severity}/5`];
  if (i.risks.includes("vida")) reasons.push("riesgo vital");
  if (i.risks.includes("sin_respuesta")) reasons.push("no responde");
  if (i.risks.includes("inconsciente")) reasons.push("inconsciente");
  if (i.risks.includes("dolor_pecho")) reasons.push("dolor torácico");
  if (i.people > 0) reasons.push(`${i.people} ${i.people === 1 ? "persona" : "personas"}`);
  if (recentInfo) reasons.push("información nueva");
  if (i.callIds.length > 1) reasons.push(`${i.callIds.length} llamadas`);
  return { total, reasons };
}

export function rankIncidents(incidents: Incident[], now: number): Incident[] {
  return [...incidents].sort((a, b) => priorityOf(b, now) - priorityOf(a, now));
}
