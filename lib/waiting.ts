import { smsText } from "@/lib/actions";
import type { SmsPhraseId } from "@/lib/actions";
import { DUPLICATE_SECONDS, NEW_CALL_SECONDS } from "@/lib/metrics";
import { PHRASES, WAITING_PROMPTS, phraseText } from "@/lib/phrases";
import type { DecisionAction, IncidentType, RiskTag } from "@/lib/types";

/** Mismo valor inicial que el selector de la franja de sala. */
export const DEFAULT_OPERATORS = 2;

export interface WaitingCall {
  id: string;
  t: number;
  lang: string;
  type: IncidentType;
  severity: number;
  risks: readonly RiskTag[];
  /** Decisión original del motor, antes de que el operador resuelva una zona gris. */
  decision: DecisionAction;
}

const LIFE_RISKS = ["vida", "dolor_pecho", "inconsciente", "sin_respuesta"] as const;
type EscalationReason = (typeof LIFE_RISKS)[number] | "severity_5";

interface Assistance {
  outcome: "queued" | "duplicate" | "escalated";
  reasons: EscalationReason[];
  script: string[] | null;
}

export interface WaitingResult {
  callId: string;
  arrival: number;
  humanAt: number | null;
  waiting: Assistance | null;
}

export interface WaitingRun {
  operators: number;
  calls: WaitingResult[];
}

const INTAKE = [...WAITING_PROMPTS, PHRASES.find((p) => p.id === "direccion")!];

function scriptFor(call: WaitingCall): string[] | null {
  const intake = INTAKE.map((p) => phraseText(p, call.lang));
  if (!intake.every((p): p is string => p !== undefined)) return null;
  const safety: SmsPhraseId[] = [];
  if (call.type === "garaje_inundado" || call.type === "inundacion_vivienda") safety.push("garaje");
  if (call.risks.includes("cables_electricos")) safety.push("cables");
  const instructions = smsText(safety, call.lang);
  return instructions ? [...intake, instructions] : intake;
}

/** Simulación de capacidad; no ejecuta decisiones de agrupación ni interrumpe llamadas activas. */
export function simulateWaiting(input: readonly WaitingCall[], operators = DEFAULT_OPERATORS): WaitingRun {
  if (!Number.isSafeInteger(operators) || operators < 1) throw new RangeError("El número de operadores debe ser un entero positivo.");
  // No hacen falta más huecos que llamadas, incluso si se declara una sala mucho mayor.
  const free = Array<number>(Math.min(input.length, operators)).fill(0);
  const queued: { call: WaitingCall; result: WaitingResult; critical: boolean }[] = [];
  const calls: WaitingResult[] = [];
  const next = () => free.indexOf(Math.min(...free));
  const take = (slot: number, at: number, call: WaitingCall, result: WaitingResult) => {
    result.humanAt = at;
    free[slot] = at + (call.decision === "merge" ? DUPLICATE_SECONDS : NEW_CALL_SECONDS);
  };
  const drain = (until: number) => {
    while (queued.length && free[next()] <= until) {
      const slot = next();
      const { call, result } = queued.shift()!;
      take(slot, free[slot], call, result);
    }
  };

  for (const call of [...input].sort((a, b) => a.t - b.t)) {
    const result: WaitingResult = { callId: call.id, arrival: call.t, humanAt: null, waiting: null };
    calls.push(result);
    // En el mismo instante, la cola ya existente tiene preferencia sobre la nueva llegada.
    drain(call.t);
    const slot = next();
    if (free[slot] <= call.t) {
      take(slot, call.t, call, result);
      continue;
    }
    const reasons: EscalationReason[] = LIFE_RISKS.filter((r) => call.risks.includes(r));
    if (call.severity === 5) reasons.push("severity_5");
    const critical = reasons.length > 0;
    const script = scriptFor(call);
    const outcome = critical ? "escalated" : call.decision === "merge" && script ? "duplicate" : "queued";
    result.waiting = { outcome, reasons, script };
    if (outcome === "duplicate") continue;
    queued.push({ call, result, critical });
    // Críticas por orden de escalado; luego nuevas/ámbar antes que repetidas y mayor gravedad primero.
    queued.sort((a, b) => Number(b.critical) - Number(a.critical) || (a.critical ? 0 :
      Number(a.call.decision === "merge") - Number(b.call.decision === "merge") || b.call.severity - a.call.severity));
  }
  drain(Infinity);
  return { operators, calls };
}
