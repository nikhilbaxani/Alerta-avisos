import { decide, newInfo } from "@/lib/cluster";
import type {
  Aml,
  Decision,
  Extraction,
  IncidentSnapshot,
  IncidentType,
  RiskTag,
} from "@/lib/types";

export interface NewInfoAlert {
  callId: string;
  risks: RiskTag[];
  t: number;
}

export interface Incident {
  id: string;
  type: IncidentType;
  points: Aml[];
  keywords: string[];
  locations: string[];
  risks: RiskTag[];
  summary: string;
  severity: number;
  people: number;
  callIds: string[];
  createdAt: number;
  lastCallAt: number;
  lastNewInfoAt: number | null;
  alerts: NewInfoAlert[];
  /** Incidente en ámbar: el operador debe decidir si es el mismo que `linkedTo`. */
  provisional: boolean;
  linkedTo?: string;
  /** Llamadas que se han fusionado con este incidente (para "Separar"). */
  attended: boolean;
}

export interface EngineCall {
  id: string;
  t: number;
  aml: Aml;
  extraction: Extraction;
}

export interface EngineState {
  incidents: Incident[];
  nextId: number;
  /** callId → incidente en el que está ahora. */
  assignment: Record<string, string>;
  /** Decisión original por llamada, para mostrar el motivo. */
  decisions: Record<string, Decision>;
}

export const initialState = (): EngineState => ({
  incidents: [],
  nextId: 1,
  assignment: {},
  decisions: {},
});

export const incidentLabel = (n: number) => `INC-${String(n).padStart(2, "0")}`;

export function snapshot(i: Incident): IncidentSnapshot {
  return {
    id: i.id,
    type: i.type,
    points: i.points,
    keywords: i.keywords,
    risks: i.risks,
    summary: i.summary,
    locations: i.locations,
    provisional: i.provisional,
  };
}

const uniq = <T,>(a: T[]) => [...new Set(a)];

function fresh(state: EngineState, call: EngineCall): Incident {
  const e = call.extraction;
  const id = incidentLabel(state.nextId);
  return {
    id,
    type: e.incident_type,
    points: [call.aml],
    keywords: uniq(e.keywords),
    locations: e.location_text ? [e.location_text] : [],
    risks: uniq(e.risks),
    summary: e.summary_es,
    severity: e.severity,
    people: e.people_at_risk,
    callIds: [call.id],
    createdAt: call.t,
    lastCallAt: call.t,
    lastNewInfoAt: null,
    alerts: [],
    provisional: false,
    attended: false,
  };
}

function absorb(target: Incident, call: EngineCall, flagNew: boolean): Incident {
  const e = call.extraction;
  const added = flagNew ? newInfo(e.risks, target.risks) : [];
  return {
    ...target,
    points: [...target.points, call.aml],
    keywords: uniq([...target.keywords, ...e.keywords]),
    locations: uniq([...target.locations, ...(e.location_text ? [e.location_text] : [])]),
    risks: uniq([...target.risks, ...e.risks]),
    severity: Math.min(5, Math.max(target.severity, e.severity) + (added.length ? 1 : 0)),
    people: Math.max(target.people, e.people_at_risk),
    callIds: [...target.callIds, call.id],
    lastCallAt: call.t,
    lastNewInfoAt: added.length ? call.t : target.lastNewInfoAt,
    alerts: added.length ? [...target.alerts, { callId: call.id, risks: added, t: call.t }] : target.alerts,
  };
}

/** Aplica una decisión (ya calculada, por el algoritmo o impuesta) a una llamada nueva. */
export function applyDecision(state: EngineState, call: EngineCall, decision: Decision): EngineState {
  const decisions = { ...state.decisions, [call.id]: decision };
  if (decision.action === "merge" && decision.incidentId) {
    const incidents = state.incidents.map((i) =>
      i.id === decision.incidentId ? absorb(i, call, !i.provisional) : i,
    );
    return { ...state, incidents, decisions, assignment: { ...state.assignment, [call.id]: decision.incidentId } };
  }
  const inc = fresh(state, call);
  if (decision.action === "ask" && decision.incidentId) {
    inc.provisional = true;
    inc.linkedTo = decision.incidentId;
  }
  return {
    ...state,
    nextId: state.nextId + 1,
    incidents: [...state.incidents, inc],
    decisions,
    assignment: { ...state.assignment, [call.id]: inc.id },
  };
}

export function processCall(state: EngineState, call: EngineCall): { state: EngineState; decision: Decision } {
  const decision = decide(
    { aml: call.aml, extraction: call.extraction },
    state.incidents.map(snapshot),
  );
  return { state: applyDecision(state, call, decision), decision };
}

/** El operador confirma que el incidente provisional es el mismo que el enlazado. */
export function confirmSame(
  state: EngineState,
  provisionalId: string,
  calls: Record<string, EngineCall>,
): EngineState {
  const prov = state.incidents.find((i) => i.id === provisionalId && i.provisional);
  if (!prov || !prov.linkedTo) return state;
  const target = state.incidents.find((i) => i.id === prov.linkedTo);
  if (!target) return confirmDifferent(state, provisionalId);
  let merged = target;
  for (const cid of prov.callIds) merged = absorb(merged, calls[cid], true);
  const assignment = { ...state.assignment };
  for (const cid of prov.callIds) assignment[cid] = target.id;
  // Otros provisionales enlazados al que desaparece pasan a apuntar al destino.
  const incidents = state.incidents
    .filter((i) => i.id !== provisionalId)
    .map((i) => (i.id === target.id ? merged : i.linkedTo === provisionalId ? { ...i, linkedTo: target.id } : i));
  // Si el provisional era el último creado, se libera su número para no dejar huecos.
  const lastNum = Number(provisionalId.slice(4));
  const nextId = lastNum === state.nextId - 1 ? lastNum : state.nextId;
  return { ...state, incidents, assignment, nextId };
}

/** El operador confirma que es un incidente distinto: deja de ser provisional. */
export function confirmDifferent(state: EngineState, provisionalId: string): EngineState {
  return {
    ...state,
    incidents: state.incidents.map((i) =>
      i.id === provisionalId ? { ...i, provisional: false, linkedTo: undefined } : i,
    ),
  };
}

/** Saca una llamada de un incidente fusionado y la convierte en uno propio. */
export function splitCall(state: EngineState, callId: string, calls: Record<string, EngineCall>): EngineState {
  const from = state.incidents.find((i) => i.callIds.includes(callId));
  if (!from || from.callIds.length < 2) return state;
  const rebuild = (ids: string[]): Incident => {
    const [first, ...rest] = ids.map((id) => calls[id]);
    let inc = { ...fresh({ ...state, nextId: 0 }, first), id: from.id, createdAt: from.createdAt };
    for (const c of rest) inc = absorb(inc, c, true);
    return { ...inc, provisional: from.provisional, linkedTo: from.linkedTo, attended: from.attended };
  };
  const remaining = rebuild(from.callIds.filter((id) => id !== callId));
  const own = { ...fresh(state, calls[callId]) };
  return {
    ...state,
    nextId: state.nextId + 1,
    incidents: state.incidents.map((i) => (i.id === from.id ? remaining : i)).concat(own),
    assignment: { ...state.assignment, [callId]: own.id },
  };
}
