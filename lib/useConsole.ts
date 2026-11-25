"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { DEFAULT_SCENARIO_ID, getScenario } from "@/data/scenarios";
import { decide } from "@/lib/cluster";
import { STATIC_EXPORT } from "@/lib/config";
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
import { isEcall } from "@/lib/ecall";
import { actionIncidents, addProposals, approve, approveBatch, discard, discardOrphans, dispatch, toolTarget } from "@/lib/actions";
import { proposalsFor } from "@/lib/consoleActions";
import type { AgentAction, Proposal } from "@/lib/actions";
import { heardOf } from "@/lib/waitingConsole";
import type { Heard } from "@/lib/waitingConsole";

export type Speed = 1 | 4 | 10;
const sortedCalls = (id: string) => [...getScenario(id).calls].sort((a, b) => a.t - b.t);
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
  /** X13: `ecall` = datos del vehículo, sin voz. */
  channel?: CallChannel;
  ecall?: ECallData;
}

export const callMeta = (s: ConsoleState, id: string): CallMeta | undefined =>
  s.live[id] ?? sortedCalls(s.scenarioId).find((c) => c.id === id);

/**
 * Propuestas del agente para el estado actual de la consola: reglas por incidente, zona (ES-Alert) y
 * avisos de duplicado (X14, dependen del registro de acciones). La usan la consola, la presentación y `replay`.
 */
export function consoleProposals(s: ConsoleState): Proposal[] {
  const phones: Record<string, string> = {};
  const channels: Record<string, CallChannel | undefined> = {};
  for (const id of s.arrived) {
    const m = callMeta(s, id);
    phones[id] = m?.phone ?? "";
    channels[id] = m?.channel;
  }
  return proposalsFor(s.engine.incidents, s.calls, phones, { channels, actions: s.actions });
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
  kind:
    | "fusion_auto"
    | "incidente_nuevo"
    | "consulta"
    | "operador_mismo"
    | "operador_distinto"
    | "separar"
    | "respuesta"
    | "accion_auto"
    | "accion_aprobada"
    | "accion_descartada"
    | "solucionada"
    | "reabierta";
  callId?: string;
  incidentId?: string;
  detail: string;
}

export interface ConsoleState {
  epoch: number;
  scenarioId: string;
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
  /** Llamadas en directo (micrófono), por id. */
  live: Record<string, CallMeta>;
  /** Registro del agente de acciones (X05): propuestas, aprobadas, enviadas y descartadas. */
  actions: AgentAction[];
  /** Incidentes que el operador ha dado por solucionados, con cuándo. */
  archived: ArchivedIncident[];
  /** Lo que el sistema sabía de cada llamada al entrar (para el agente de espera, X11). */
  heard: Record<string, Heard>;
}

export interface ArchivedIncident {
  incident: Incident;
  at: number;
}

/** Motivo con el que se cierran las acciones pendientes de un incidente solucionado (y se recuperan al reabrirlo). */
export const resolvedReason = (id: string) => `${id} solucionado por el operador`;

export const init = (epoch = 0, scenarioId = DEFAULT_SCENARIO_ID): ConsoleState => ({
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
  live: {},
  actions: [],
  archived: [],
  heard: {},
});

export type ConsoleAction =
  | { type: "tick"; dt: number }
  | { type: "play" }
  | { type: "pause" }
  | { type: "speed"; speed: Speed }
  | { type: "reset" }
  | { type: "scenario"; id: string }
  | { type: "begin"; id: string }
  | { type: "processed"; epoch: number; id: string; result: ProcessResult }
  | { type: "live"; call: CallMeta; result: ProcessResult }
  | { type: "resolve"; incidentId: string }
  | { type: "reopen"; incidentId: string }
  | { type: "failed"; epoch: number; id: string; error: string }
  | { type: "decide"; incidentId: string; same: boolean }
  | { type: "split"; callId: string }
  | { type: "select"; incidentId: string | null }
  | { type: "fxDone"; key: string }
  | { type: "reply"; reply: Reply }
  | { type: "plan"; proposals: Proposal[] }
  | { type: "actionApprove"; key: string }
  /** «Aprobar todos» (X14): los avisos de duplicado del lote de un incidente. */
  | { type: "actionApproveBatch"; incidentId: string }
  | { type: "actionDiscard"; key: string };

function applyResult(s: ConsoleState, src: CallMeta, result: ProcessResult): ConsoleState {
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
    // Una eCall no tiene a nadie al teléfono: no entra en la sala de voz del agente de espera (DECISIONES X13).
    heard: isEcall(src) ? s.heard : { ...s.heard, [id]: heardOf(s.engine, engine, id, decision) },
    recs: { ...s.recs, [id]: { ...s.recs[id], status: "done", result: { ...result, decision } } },
    audit,
    fx,
    selected: s.selected ?? incidentId,
  };
}

export function reducer(s: ConsoleState, a: ConsoleAction): ConsoleState {
  switch (a.type) {
    case "tick": {
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
    case "play":
      return s.clock >= scenarioEnd(s.scenarioId) + 1 ? s : { ...s, running: true };
    case "pause":
      return { ...s, running: false };
    case "speed":
      return { ...s, speed: a.speed };
    case "reset":
      return { ...init(s.epoch + 1, s.scenarioId), speed: s.speed };
    case "scenario":
      return { ...init(s.epoch + 1, a.id), speed: s.speed };
    case "begin":
      return {
        ...s,
        queue: s.queue.filter((x) => x !== a.id),
        inflight: a.id,
        recs: { ...s.recs, [a.id]: { ...s.recs[a.id], status: "processing" } },
      };
    case "failed":
      if (a.epoch !== s.epoch) return s;
      return {
        ...s,
        inflight: null,
        recs: { ...s.recs, [a.id]: { ...s.recs[a.id], status: "error", error: a.error } },
      };
    case "processed": {
      if (a.epoch !== s.epoch) return s;
      return applyResult(s, sortedCalls(s.scenarioId).find((c) => c.id === a.id)!, a.result);
    }
    case "live": {
      const meta = { ...a.call, t: Math.round(s.clock), live: true };
      const withCall: ConsoleState = {
        ...s,
        live: { ...s.live, [meta.id]: meta },
        arrived: [...s.arrived, meta.id],
        recs: { ...s.recs, [meta.id]: { id: meta.id, t: meta.t, status: "processing" } },
      };
      return applyResult(withCall, meta, a.result);
    }
    case "decide": {
      const prov = s.engine.incidents.find((i) => i.id === a.incidentId && i.provisional);
      if (!prov) return s;
      const lead = prov.callIds[0];
      if (!a.same) {
        return {
          ...s,
          engine: confirmDifferent(s.engine, prov.id),
          audit: [...s.audit, { t: s.clock, kind: "operador_distinto", callId: lead, incidentId: prov.id, detail: `El operador confirma que ${prov.id} es distinto de ${prov.linkedTo}.` }],
        };
      }
      const engine = confirmSame(s.engine, prov.id, s.calls);
      const target = engine.assignment[lead];
      return {
        ...s,
        engine,
        selected: s.selected === prov.id ? target : s.selected,
        fx: [...s.fx, ...prov.callIds.map((cid) => ({ key: `${cid}-op-${s.epoch}`, callId: cid, incidentId: target }))],
        audit: [...s.audit, { t: s.clock, kind: "operador_mismo", callId: lead, incidentId: target, detail: `El operador confirma que ${prov.id} es el mismo incidente que ${target}.` }],
      };
    }
    case "split": {
      const engine = splitCall(s.engine, a.callId, s.calls);
      if (engine === s.engine) return s;
      return {
        ...s,
        engine,
        selected: engine.assignment[a.callId],
        audit: [...s.audit, { t: s.clock, kind: "separar", callId: a.callId, incidentId: engine.assignment[a.callId], detail: `El operador separa la llamada ${a.callId} de su incidente.` }],
      };
    }
    case "select":
      return { ...s, selected: a.incidentId };
    case "resolve": {
      const inc = s.engine.incidents.find((i) => i.id === a.incidentId);
      const engine = resolveIncident(s.engine, a.incidentId);
      if (!inc || engine === s.engine) return s;
      // Lo que quedaba sin enviar ya no hace falta: se cierra con el motivo (lo enviado no se deshace).
      const reason = resolvedReason(inc.id);
      const actions = s.actions.map((x): AgentAction =>
        (x.status === "propuesta" || x.status === "aprobada") && actionIncidents(x).includes(inc.id)
          ? { ...x, status: "descartada", discarded: { by: "sistema", at: s.clock, reason } }
          : x,
      );
      return {
        ...s,
        engine,
        actions,
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
        ...s,
        engine: reopenIncident(s.engine, arch.incident),
        actions,
        archived: s.archived.filter((x) => x !== arch),
        selected: arch.incident.id,
        audit: [...s.audit, { t: s.clock, kind: "reabierta", incidentId: arch.incident.id, detail: `El operador vuelve a abrir ${arch.incident.id}.` }],
      };
    }
    case "fxDone":
      return { ...s, fx: s.fx.filter((f) => f.key !== a.key) };
    case "plan": {
      // Las acciones sin enviar de un incidente que ya no existe se descartan; después solo se añade lo que falta.
      const base = discardOrphans(s.actions, s.engine.incidents.map((i) => i.id), s.clock);
      const { actions, added } = addProposals(base, a.proposals, s.clock);
      if (added.length === 0 && base.every((x, i) => x === s.actions[i])) return s;
      const audit: AuditEntry[] = added
        .filter((x) => x.status === "enviada")
        .map((x) => ({ t: s.clock, kind: "accion_auto", incidentId: x.incidentId, detail: `Enviado automáticamente a ${toolTarget(x)} (acuse ${x.receipt?.reference}). ${x.reason}` }));
      return { ...s, actions, audit: audit.length ? [...s.audit, ...audit] : s.audit };
    }
    case "actionApprove": {
      const ok = approve(s.actions, a.key, "operador", s.clock);
      if (!ok.ok) return s;
      const sent = dispatch(ok.actions, a.key, s.clock);
      if (!sent.ok) return s;
      return {
        ...s,
        actions: sent.actions,
        audit: [...s.audit, { t: s.clock, kind: "accion_aprobada", incidentId: sent.action.incidentId, detail: `El operador aprueba y se envía a ${toolTarget(sent.action)} (acuse ${sent.action.receipt?.reference}). ${sent.action.reason}` }],
      };
    }
    case "actionApproveBatch": {
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
        audit: [...s.audit, { t: s.clock, kind: "respuesta", incidentId: a.reply.incidentId, detail: `Respuesta (${a.reply.lang}): ${a.reply.es}` }],
      };
  }
}

export interface EngineStatus {
  mode: "simulated" | "local";
  label: string;
}

/** Resultado del plan B (sin servidor): mismo algoritmo en el navegador con la extracción simulada. */
export function simulatedResult(scenarioId: string, id: string, incidents: ReturnType<typeof snapshot>[]): ProcessResult {
  const src = sortedCalls(scenarioId).find((c) => c.id === id)!;
  return {
    callId: id,
    transcript: src.transcript,
    language: src.lang,
    extraction: src.mock,
    decision: decide({ aml: src.aml, extraction: src.mock }, incidents),
    engine: { stt: "Transcripción del guion", llm: "Modo simulado" },
    timings: { sttMs: 0, llmMs: 0, totalMs: 0 },
  };
}

/** `offline`: no consulta /api/process y calcula siempre en el navegador (la presentación lo usa así). */
export function useConsole({ offline = false }: { offline?: boolean } = {}) {
  const [s, dispatch] = useReducer(reducer, 0, init);
  const ref = useRef(s);
  ref.current = s;

  useEffect(() => {
    if (!s.running) return;
    const id = setInterval(() => dispatch({ type: "tick", dt: 0.1 * s.speed }), 100);
    return () => clearInterval(id);
  }, [s.running, s.speed]);

  // Cola SERIE: cada llamada ve los incidentes creados por las anteriores.
  useEffect(() => {
    if (s.inflight || s.queue.length === 0) return;
    const id = s.queue[0];
    const epoch = s.epoch;
    dispatch({ type: "begin", id });
    const scenarioId = ref.current.scenarioId;
    const src = sortedCalls(scenarioId).find((c) => c.id === id)!;
    const incidents = ref.current.engine.incidents.map(snapshot);
    (async () => {
      try {
        if (STATIC_EXPORT || offline) throw new Error("Sin servidor"); // directo al plan B
        const res = await fetch("/api/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ callId: id, aml: src.aml, incidents }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        dispatch({ type: "processed", epoch, id, result: (await res.json()) as ProcessResult });
      } catch {
        // Plan B sin servidor: mismo algoritmo en el navegador con la extracción simulada.
        dispatch({ type: "processed", epoch, id, result: simulatedResult(scenarioId, id, incidents) });
      }
    })();
  }, [s.inflight, s.queue, s.epoch, offline]);

  const fxDone = useCallback((key: string) => dispatch({ type: "fxDone", key }), []);
  return { s, dispatch, fxDone };
}
