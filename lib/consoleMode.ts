import { DEFAULT_SCENARIO_ID, getScenario } from "@/data/scenarios";
import { decide } from "@/lib/cluster";
import {
  applyDecision,
  confirmDifferent,
  confirmSame,
  initialState,
  reopenIncident,
  resolveIncident,
  snapshot,
  splitCall,
} from "@/lib/engine";
import type { EngineCall, EngineState, Incident } from "@/lib/engine";
import type { Aml, CallChannel, Decision, ECallData, ProcessResult } from "@/lib/types";
import { RESOURCE_LABELS, actionIncidents, addProposals, approve, approveBatch, discard, discardOrphans, dispatch, toolTarget } from "@/lib/actions";
import type { AgentAction, Proposal } from "@/lib/actions";
import { isEcall } from "@/lib/ecall";
import { heardOf, type Heard } from "@/lib/waitingConsole";
import { SIMULATION_LABEL, assignUnit, centerOf, formatDistance, initialUnits, nearestFree, releaseIncident, unitServiceOf, type Unit } from "@/lib/units";

export const PUBLIC_RELAY_URL = (process.env.NEXT_PUBLIC_RELAY_URL ?? "").trim().replace(/\/$/, "");

export type ConsoleMode = "sim" | "live";
export type Speed = 1 | 4 | 10;

export const sortedCalls = (id: string) => [...getScenario(id).calls].sort((a, b) => a.t - b.t);
export const scenarioEnd = (id: string) => Math.max(...getScenario(id).calls.map((c) => c.t));

export interface CallRec {
  id: string;
  t: number;
  status: "queued" | "processing" | "done" | "error";
  result?: ProcessResult;
  error?: string;
}

/** Metadatos de una llamada (del escenario o en directo). */
export interface CallMeta {
  id: string;
  t: number;
  lang: string;
  phone: string;
  aml: Aml;
  transcript: string;
  live?: boolean;
  channel?: CallChannel;
  ecall?: ECallData;
}

export interface Fx {
  key: string;
  callId: string;
  incidentId: string;
}

export interface Reply {
  incidentId: string;
  t: number;
  lang: string;
  es: string;
  tr: string;
}

export interface AuditEntry {
  t: number;
  kind: "fusion_auto" | "incidente_nuevo" | "consulta" | "operador_mismo" | "operador_distinto" | "separar" | "respuesta"
    | "accion_auto" | "accion_aprobada" | "accion_descartada" | "solucionada" | "reabierta";
  callId?: string;
  incidentId?: string;
  detail: string;
}

/** Estado completo de un modo (simulación o directo), conservado al cambiar de pestaña. */
export interface ConsoleModeSnapshot {
  epoch: number;
  relayEpoch?: string;
  scenarioId: string;
  /** En simulación: segundos del escenario. En directo: segundos reales desde la primera llamada aceptada (para prioridad por espera). */
  clock: number;
  running: boolean;
  speed: Speed;
  arrived: string[];
  recs: Record<string, CallRec>;
  queue: string[];
  inflight: string | null;
  engine: EngineState;
  calls: Record<string, EngineCall>;
  selected: string | null;
  fx: Fx[];
  replies: Reply[];
  audit: AuditEntry[];
  actions: AgentAction[];
  archived: ArchivedIncident[];
  heard: Record<string, Heard>;
  units: Unit[];
  unitAssignments: Record<string, UnitAssignment>;
  /** Llamadas en directo (público QR o micrófono), por id. */
  live: Record<string, CallMeta>;
}

export interface ArchivedIncident {
  incident: Incident;
  at: number;
}

export interface UnitAssignment {
  unitId: string | null;
  incidentId: string;
  service: Unit["service"];
  distance: number | null;
  at: number;
}

export const resolvedReason = (id: string) => `${id} solucionado por el operador`;

export interface ConsoleState extends ConsoleModeSnapshot {
  mode: ConsoleMode;
  saved: Partial<Record<ConsoleMode, ConsoleModeSnapshot>>;
}

export type ConsoleAction =
  | { type: "restoreLiveSession"; state: ConsoleState }
  | { type: "relayEpoch"; epoch: string }
  | { type: "mode"; mode: ConsoleMode }
  | { type: "tick"; dt: number }
  | { type: "liveTick"; dt: number }
  | { type: "play" }
  | { type: "pause" }
  | { type: "speed"; speed: Speed }
  | { type: "reset" }
  | { type: "scenario"; id: string }
  | { type: "begin"; id: string }
  | { type: "processed"; epoch: number; id: string; result: ProcessResult }
  | { type: "live"; call: CallMeta; result: ProcessResult }
  | { type: "microphone"; epoch: number; call: CallMeta; result: ProcessResult }
  | { type: "failed"; epoch: number; id: string; error: string }
  | { type: "decide"; incidentId: string; same: boolean }
  | { type: "split"; callId: string }
  | { type: "select"; incidentId: string | null }
  | { type: "fxDone"; key: string }
  | { type: "reply"; reply: Reply }
  | { type: "plan"; proposals: Proposal[] }
  | { type: "actionApprove"; key: string }
  | { type: "actionApproveBatch"; incidentId: string }
  | { type: "actionDiscard"; key: string }
  | { type: "resolve" | "reopen"; incidentId: string };

export const callMeta = (s: ConsoleState, id: string): CallMeta | undefined =>
  s.live[id] ?? (s.mode === "sim" ? sortedCalls(s.scenarioId).find((c) => c.id === id) : undefined);

function initSnapshot(epoch = 0, scenarioId = DEFAULT_SCENARIO_ID): ConsoleModeSnapshot {
  return {
    epoch,
    scenarioId,
    clock: 0,
    running: false,
    speed: 4,
    arrived: [],
    recs: {},
    queue: [],
    inflight: null,
    engine: initialState(),
    calls: {},
    selected: null,
    fx: [],
    replies: [],
    audit: [],
    actions: [],
    archived: [],
    heard: {},
    units: scenarioId === "live" ? [] : initialUnits(),
    unitAssignments: {},
    live: {},
  };
}

export function initialConsoleState(epoch = 0, scenarioId = DEFAULT_SCENARIO_ID): ConsoleState {
  return {
    ...initSnapshot(epoch, scenarioId),
    mode: "sim",
    saved: {},
  };
}

function toSnapshot(s: ConsoleState): ConsoleModeSnapshot {
  const { mode: _m, saved: _sv, ...snap } = s;
  return snap;
}

function nextEpoch(s: ConsoleState): number {
  return Math.max(s.epoch, s.saved.sim?.epoch ?? 0, s.saved.live?.epoch ?? 0) + 1;
}

function applyResultToSnapshot(s: ConsoleModeSnapshot, src: CallMeta, result: ProcessResult): ConsoleModeSnapshot {
  const id = src.id;
  const call: EngineCall = { id, t: src.t, aml: src.aml, extraction: result.extraction };
  let decision: Decision = result.decision;
  // Si el operador ha cambiado los incidentes mientras se procesaba, se recalcula en local.
  if (decision.action !== "new" && !s.engine.incidents.some((i) => i.id === decision.incidentId)) {
    decision = decide({ aml: call.aml, extraction: call.extraction }, s.engine.incidents.map(snapshot));
  }
  const engine = applyDecision(s.engine, call, decision);
  const incidentId = engine.assignment[id];
  const audit: AuditEntry[] = [
    ...s.audit,
    {
      t: src.t,
      kind: decision.action === "merge" ? "fusion_auto" : decision.action === "ask" ? "consulta" : "incidente_nuevo",
      callId: id,
      incidentId,
      detail: decision.reason,
    },
  ];
  const fx = decision.action === "merge" ? [...s.fx, { key: `${id}-${s.epoch}`, callId: id, incidentId }] : s.fx;
  return {
    ...s,
    inflight: src.live ? s.inflight : null,
    engine,
    calls: { ...s.calls, [id]: call },
    heard: s.scenarioId === "live" || isEcall(src) ? s.heard : { ...s.heard, [id]: heardOf(s.engine, engine, id, decision) },
    recs: { ...s.recs, [id]: { ...s.recs[id], status: "done", result: { ...result, decision } } },
    audit,
    fx,
    selected: s.selected ?? incidentId,
  };
}

function applyLiveCallToSnapshot(s: ConsoleModeSnapshot, call: CallMeta, result: ProcessResult): ConsoleModeSnapshot {
  const meta: CallMeta = { ...call, t: Math.round(s.clock), live: true };
  const withCall: ConsoleModeSnapshot = {
    ...s,
    live: { ...s.live, [meta.id]: meta },
    arrived: [...s.arrived, meta.id],
    recs: { ...s.recs, [meta.id]: { id: meta.id, t: meta.t, status: "processing" } },
  };
  return applyResultToSnapshot(withCall, meta, result);
}

export function incidentPoint(s: ConsoleState, incidentId: string) {
  return centerOf(s.engine.incidents.find((i) => i.id === incidentId)?.points ?? []);
}

function assignOnApproval(s: ConsoleState, action: AgentAction): { units: Unit[]; assignment: UnitAssignment; note: string } | null {
  if (action.tool !== "proponer_recursos") return null;
  const service = unitServiceOf(action.args.servicio);
  const point = incidentPoint(s, action.incidentId);
  if (!point) return null;
  const near = nearestFree(s.units, service, point);
  if (!near) {
    return {
      units: s.units,
      assignment: { unitId: null, incidentId: action.incidentId, service, distance: null, at: s.clock },
      note: `No hay unidad libre de ${RESOURCE_LABELS[service]} ${SIMULATION_LABEL}.`,
    };
  }
  return {
    units: assignUnit(s.units, near.unit.id, action.incidentId, point, s.clock, action.key),
    assignment: { unitId: near.unit.id, incidentId: action.incidentId, service, distance: near.distance, at: s.clock },
    note: `Unidad asignada: ${near.unit.id} a ${formatDistance(near.distance)} ${SIMULATION_LABEL}.`,
  };
}

export function consoleReducer(s: ConsoleState, a: ConsoleAction): ConsoleState {
  switch (a.type) {
    case "restoreLiveSession":
      return a.state;
    case "relayEpoch": {
      const live = s.mode === "live" ? s : s.saved.live;
      if (live?.relayEpoch === a.epoch) return s;
      const fresh = { ...(live && !live.arrived.length ? live : initSnapshot(nextEpoch(s), "live")), relayEpoch: a.epoch };
      return s.mode === "live" ? { ...s, ...fresh } : { ...s, saved: { ...s.saved, live: fresh } };
    }
    case "mode": {
      if (a.mode === s.mode) return s;
      // El reloj solo avanza con Simulación visible; se conserva si estaba reproduciendo.
      const current = toSnapshot(s);
      const target =
        s.saved[a.mode] ?? initSnapshot(nextEpoch(s), a.mode === "live" ? "live" : DEFAULT_SCENARIO_ID);
      return {
        ...target,
        mode: a.mode,
        saved: { ...s.saved, [s.mode]: current },
      };
    }
    case "tick": {
      if (s.mode !== "sim") return s;
      const end = scenarioEnd(s.scenarioId);
      const clock = Math.min(s.clock + a.dt, end + 1);
      const due = sortedCalls(s.scenarioId).filter((c) => c.t <= clock && !s.recs[c.id]);
      const recs = { ...s.recs };
      for (const c of due) recs[c.id] = { id: c.id, t: c.t, status: "queued" };
      const running = clock >= end + 1 ? false : s.running;
      return {
        ...s,
        clock,
        running,
        recs,
        arrived: [...s.arrived, ...due.map((c) => c.id)],
        queue: [...s.queue, ...due.map((c) => c.id)],
      };
    }
    case "liveTick": {
      if (s.mode !== "live" || s.arrived.length === 0) return s;
      return { ...s, clock: s.clock + a.dt };
    }
    case "play":
      if (s.mode !== "sim") return s;
      return s.clock >= scenarioEnd(s.scenarioId) + 1 ? s : { ...s, running: true };
    case "pause":
      if (s.mode !== "sim") return s;
      return { ...s, running: false };
    case "speed":
      if (s.mode !== "sim") return s;
      return { ...s, speed: a.speed };
    case "reset": {
      const fresh = initSnapshot(nextEpoch(s), s.mode === "live" ? "live" : s.scenarioId);
      return {
        ...fresh,
        ...(s.relayEpoch === undefined ? {} : { relayEpoch: s.relayEpoch }),
        speed: s.mode === "sim" ? s.speed : fresh.speed,
        mode: s.mode,
        saved: s.saved,
      };
    }
    case "scenario": {
      if (s.mode !== "sim") return s;
      return {
        ...initSnapshot(nextEpoch(s), a.id),
        speed: s.speed,
        mode: "sim",
        saved: s.saved,
      };
    }
    case "begin": {
      if (s.mode !== "sim") return s;
      return {
        ...s,
        queue: s.queue.filter((x) => x !== a.id),
        inflight: a.id,
        recs: { ...s.recs, [a.id]: { ...s.recs[a.id], status: "processing" } },
      };
    }
    case "failed": {
      if (s.mode === "sim") {
        if (a.epoch !== s.epoch) return s;
        return {
          ...s,
          inflight: null,
          recs: { ...s.recs, [a.id]: { ...s.recs[a.id], status: "error", error: a.error } },
        };
      }
      const sim = s.saved.sim;
      if (!sim || sim.epoch !== a.epoch) return s;
      return {
        ...s,
        saved: {
          ...s.saved,
          sim: {
            ...sim,
            inflight: null,
            recs: { ...sim.recs, [a.id]: { ...sim.recs[a.id], status: "error", error: a.error } },
          },
        },
      };
    }
    case "processed": {
      if (s.mode === "sim") {
        if (a.epoch !== s.epoch) return s;
        const src = sortedCalls(s.scenarioId).find((c) => c.id === a.id);
        if (!src) return s;
        return { ...applyResultToSnapshot(toSnapshot(s), src, a.result), mode: s.mode, saved: s.saved };
      }
      const sim = s.saved.sim;
      if (!sim || sim.epoch !== a.epoch) return s;
      const src = sortedCalls(sim.scenarioId).find((c) => c.id === a.id);
      if (!src) return s;
      return {
        ...s,
        saved: { ...s.saved, sim: applyResultToSnapshot(sim, src, a.result) },
      };
    }
    case "microphone": {
      if (s.mode === "sim") {
        if (s.epoch !== a.epoch) return s;
        return { ...s, ...applyLiveCallToSnapshot(toSnapshot(s), a.call, a.result) };
      }
      const sim = s.saved.sim;
      if (!sim || sim.epoch !== a.epoch) return s;
      return { ...s, saved: { ...s.saved, sim: applyLiveCallToSnapshot(sim, a.call, a.result) } };
    }
    case "live": {
      if (s.mode === "live") {
        return { ...applyLiveCallToSnapshot(toSnapshot(s), a.call, a.result), mode: "live", saved: s.saved };
      }
      // Si llega una acción live estando en sim, se aplica siempre al estado live guardado.
      const liveSnap = s.saved.live ?? initSnapshot(nextEpoch(s), "live");
      return {
        ...s,
        saved: { ...s.saved, live: applyLiveCallToSnapshot(liveSnap, a.call, a.result) },
      };
    }
    case "decide": {
      const prov = s.engine.incidents.find((i) => i.id === a.incidentId && i.provisional);
      if (!prov) return s;
      const lead = prov.callIds[0];
      if (!a.same) {
        return {
          ...s,
          engine: confirmDifferent(s.engine, prov.id),
          audit: [
            ...s.audit,
            {
              t: s.clock,
              kind: "operador_distinto",
              callId: lead,
              incidentId: prov.id,
              detail: `El operador confirma que ${prov.id} es distinto de ${prov.linkedTo}.`,
            },
          ],
        };
      }
      const engine = confirmSame(s.engine, prov.id, s.calls);
      const target = engine.assignment[lead];
      return {
        ...s,
        engine,
        selected: s.selected === prov.id ? target : s.selected,
        fx: [...s.fx, ...prov.callIds.map((cid) => ({ key: `${cid}-op-${s.epoch}`, callId: cid, incidentId: target }))],
        audit: [
          ...s.audit,
          {
            t: s.clock,
            kind: "operador_mismo",
            callId: lead,
            incidentId: target,
            detail: `El operador confirma que ${prov.id} es el mismo incidente que ${target}.`,
          },
        ],
      };
    }
    case "split": {
      const engine = splitCall(s.engine, a.callId, s.calls);
      if (engine === s.engine) return s;
      return {
        ...s,
        engine,
        selected: engine.assignment[a.callId],
        audit: [
          ...s.audit,
          {
            t: s.clock,
            kind: "separar",
            callId: a.callId,
            incidentId: engine.assignment[a.callId],
            detail: `El operador separa la llamada ${a.callId} de su incidente.`,
          },
        ],
      };
    }
    case "select":
      return { ...s, selected: a.incidentId };
    case "resolve": {
      const inc = s.engine.incidents.find((i) => i.id === a.incidentId);
      const engine = resolveIncident(s.engine, a.incidentId);
      if (!inc || engine === s.engine) return s;
      const reason = resolvedReason(inc.id);
      const actions = s.actions.map((x): AgentAction =>
        (x.status === "propuesta" || x.status === "aprobada") && actionIncidents(x).includes(inc.id)
          ? { ...x, status: "descartada", discarded: { by: "sistema", at: s.clock, reason } }
          : x,
      );
      return {
        ...s, engine, actions,
        units: releaseIncident(s.units, inc.id),
        archived: [...s.archived, { incident: inc, at: s.clock }],
        selected: s.selected === inc.id ? engine.incidents[0]?.id ?? null : s.selected,
        audit: [...s.audit, { t: s.clock, kind: "solucionada", incidentId: inc.id, detail: `El operador da por solucionado ${inc.id} y pasa al archivo.` }],
      };
    }
    case "reopen": {
      const arch = s.archived.find((x) => x.incident.id === a.incidentId);
      if (!arch) return s;
      const reason = resolvedReason(a.incidentId);
      const actions = s.actions.map((x): AgentAction =>
        x.status === "descartada" && x.discarded?.reason === reason ? { ...x, status: "propuesta", discarded: null } : x,
      );
      return {
        ...s, actions,
        engine: reopenIncident(s.engine, arch.incident),
        archived: s.archived.filter((x) => x !== arch),
        selected: arch.incident.id,
        audit: [...s.audit, { t: s.clock, kind: "reabierta", incidentId: arch.incident.id, detail: `El operador vuelve a abrir ${arch.incident.id}.` }],
      };
    }
    case "fxDone":
      return { ...s, fx: s.fx.filter((f) => f.key !== a.key) };
    case "plan": {
      if (s.mode !== "sim") return s;
      const base = discardOrphans(s.actions, s.engine.incidents.map((i) => i.id), s.clock);
      const { actions, added } = addProposals(base, a.proposals, s.clock);
      if (added.length === 0 && base.every((x, i) => x === s.actions[i])) return s;
      const audit: AuditEntry[] = added
        .filter((x) => x.status === "enviada")
        .map((x) => ({ t: s.clock, kind: "accion_auto", incidentId: x.incidentId, detail: `Enviado automáticamente a ${toolTarget(x)} (acuse ${x.receipt?.reference}). ${x.reason}` }));
      return { ...s, actions, audit: audit.length ? [...s.audit, ...audit] : s.audit };
    }
    case "actionApprove": {
      if (s.mode !== "sim") return s;
      const ok = approve(s.actions, a.key, "operador", s.clock);
      if (!ok.ok) return s;
      const sent = dispatch(ok.actions, a.key, s.clock);
      if (!sent.ok) return s;
      const withUnit = assignOnApproval(s, sent.action);
      const unitNote = withUnit ? ` ${withUnit.note}` : "";
      return {
        ...s,
        ...(withUnit ? { units: withUnit.units, unitAssignments: { ...s.unitAssignments, [a.key]: withUnit.assignment } } : {}),
        actions: sent.actions,
        audit: [...s.audit, { t: s.clock, kind: "accion_aprobada", incidentId: sent.action.incidentId, detail: `El operador aprueba y se envía a ${toolTarget(sent.action)} (acuse ${sent.action.receipt?.reference}). ${sent.action.reason}${unitNote}` }],
      };
    }
    case "actionApproveBatch": {
      if (s.mode !== "sim") return s;
      const ok = approveBatch(s.actions, a.incidentId, "operador", s.clock);
      if (!ok.ok) return s;
      let actions = ok.actions;
      const audit: AuditEntry[] = [];
      for (const x of ok.approved) {
        const sent = dispatch(actions, x.key, s.clock);
        if (!sent.ok) continue;
        actions = sent.actions;
        audit.push({
          t: s.clock,
          kind: "accion_aprobada",
          incidentId: x.incidentId,
          detail: `El operador aprueba en lote («Aprobar todos», ${ok.approved.length} avisos de duplicado de ${a.incidentId}) y se envía a ${toolTarget(sent.action)} (acuse ${sent.action.receipt?.reference}). ${sent.action.reason}`,
        });
      }
      return { ...s, actions, audit: [...s.audit, ...audit] };
    }
    case "actionDiscard": {
      if (s.mode !== "sim") return s;
      const r = discard(s.actions, a.key, "operador", s.clock);
      if (!r.ok) return s;
      return {
        ...s,
        actions: r.actions,
        audit: [...s.audit, { t: s.clock, kind: "accion_descartada", incidentId: r.action.incidentId, detail: `El operador descarta el envío a ${toolTarget(r.action)}. ${r.action.reason}` }],
      };
    }
    case "reply":
      return {
        ...s,
        replies: [...s.replies, a.reply],
        audit: [
          ...s.audit,
          {
            t: s.clock,
            kind: "respuesta",
            incidentId: a.reply.incidentId,
            detail: `Respuesta (${a.reply.lang}): ${a.reply.es}`,
          },
        ],
      };
  }
}
