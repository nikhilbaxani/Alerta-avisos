/**
 * Agente de espera en la consola (X11): conecta `lib/waiting.ts` con el estado de la consola.
 *
 * Puro y sin red. Lo que el sistema «oye» de cada llamada al entrar (`heardOf`) se calcula igual en
 * `npm run agente` (`lib/agent.ts`) y en la consola (`lib/useConsole.ts`, al aplicar la decisión del
 * motor); la sala simulada se calcula sobre las llamadas ya llegadas según el reloj del escenario, con
 * los supuestos declarados de `lib/metrics.ts`. Es una simulación y la caja la rotula así.
 */
import type { EngineState, Incident } from "@/lib/engine";
import type { SimCall } from "@/lib/metrics";
import type { Decision, Extraction } from "@/lib/types";
import { DEFAULT_OPERATORS, compareWaiting } from "@/lib/waiting";
import type { Attention, WaitingCall, WaitingReport } from "@/lib/waiting";

/** Lo que sabe el sistema de una llamada al entrar, antes de que decida nadie. */
export type Heard = Omit<WaitingCall, keyof SimCall | "lang">;

/**
 * `before`: estado del motor antes de la llamada; `after`: justo después de aplicar la decisión del motor
 * (antes de que el operador resuelva una zona gris).
 */
export function heardOf(before: EngineState, after: EngineState, callId: string, decision: Decision): Heard {
  const entered = after.incidents.find((i) => i.id === after.assignment[callId])!;
  const target = decision.action === "merge" ? before.incidents.find((i) => i.id === decision.incidentId) : undefined;
  return {
    decision: decision.action,
    newInfo: entered.alerts.find((a) => a.callId === callId)?.risks ?? [],
    intoProvisional: decision.action === "merge" && entered.provisional,
    incidentType: entered.type,
    incidentRisks: [...entered.risks],
    known: target ? { risks: [...target.risks], severity: target.severity } : null,
  };
}

/** Llamada para la sala simulada: «primera de su incidente» con el incidente en el que está ahora. */
export function roomCall(
  c: { id: string; t: number; extraction: Pick<Extraction, "severity" | "risks" | "language"> },
  inc: Pick<Incident, "id" | "callIds"> | undefined,
  heard: Heard,
): WaitingCall {
  return {
    id: c.id,
    t: c.t,
    extraction: { severity: c.extraction.severity, risks: [...c.extraction.risks] },
    incidentId: inc?.id ?? "",
    first: inc ? inc.callIds[0] === c.id : true,
    lang: c.extraction.language,
    ...heard,
  };
}

/** Lo mínimo del estado de la consola que hace falta (`ConsoleState` lo cumple). */
export interface ConsoleWaitingInput {
  clock: number;
  arrived: string[];
  calls: Record<string, { id: string; t: number; extraction: Extraction }>;
  engine: EngineState;
  archived: { incident: Incident }[];
  heard: Record<string, Heard>;
}

export interface WaitingRow extends Attention {
  /** El operador ya la ha cogido a esta hora del escenario. */
  withOperator: boolean;
}

export interface ConsoleWaiting {
  operators: number;
  /** Llamadas ya procesadas que entran en la simulación. */
  calls: number;
  report: WaitingReport;
  /** Atendidas por el asistente, la más reciente primero. */
  rows: WaitingRow[];
  /** Escaladas que aún esperan a un operador a esta hora: el aviso visible. */
  escalatedWaiting: WaitingRow[];
}

/** Incidente en el que está ahora una llamada (abierto o archivado). */
function incidentOf(s: ConsoleWaitingInput, callId: string): Incident | undefined {
  const id = s.engine.assignment[callId];
  return s.engine.incidents.find((i) => i.id === id) ?? s.archived.find((a) => a.incident.id === id)?.incident;
}

/** Llamadas de la sala simulada a partir del estado de la consola (solo las ya llegadas y procesadas). */
export function consoleRoomCalls(s: ConsoleWaitingInput): WaitingCall[] {
  return s.arrived
    .filter((id) => s.calls[id] && s.heard[id])
    .map((id) => roomCall(s.calls[id], incidentOf(s, id), s.heard[id]));
}

/** Lo que pinta la caja «En espera»: sala simulada con `operators` operadores sobre lo que ya ha llegado. */
export function consoleWaiting(s: ConsoleWaitingInput, operators: number = DEFAULT_OPERATORS): ConsoleWaiting {
  const calls = consoleRoomCalls(s);
  const report = compareWaiting(calls, operators);
  const rows: WaitingRow[] = report.attentions
    .map((a) => ({ ...a, withOperator: a.operatorAt !== null && a.operatorAt <= s.clock }))
    .reverse();
  return {
    operators: report.operators,
    calls: calls.length,
    report,
    rows,
    escalatedWaiting: rows.filter((r) => r.outcome === "escalada" && !r.withOperator),
  };
}
