"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { DEFAULT_SCENARIO_ID, getScenario } from "@/data/scenarios";
import { decide } from "@/lib/cluster";
import {
  applyDecision,
  confirmDifferent,
  confirmSame,
  initialState,
  snapshot,
  splitCall,
} from "@/lib/engine";
import type { EngineCall, EngineState } from "@/lib/engine";
import type { Aml, Decision, ProcessResult } from "@/lib/types";

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
}

export const callMeta = (s: ConsoleState, id: string): CallMeta | undefined =>
  s.live[id] ?? sortedCalls(s.scenarioId).find((c) => c.id === id);

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
  kind: "fusion_auto" | "incidente_nuevo" | "consulta" | "operador_mismo" | "operador_distinto" | "separar" | "respuesta";
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
}

const init = (epoch = 0, scenarioId = DEFAULT_SCENARIO_ID): ConsoleState => ({
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
});

type Action =
  | { type: "tick"; dt: number }
  | { type: "play" }
  | { type: "pause" }
  | { type: "speed"; speed: Speed }
  | { type: "reset" }
  | { type: "scenario"; id: string }
  | { type: "begin"; id: string }
  | { type: "processed"; epoch: number; id: string; result: ProcessResult }
  | { type: "live"; call: CallMeta; result: ProcessResult }
  | { type: "failed"; epoch: number; id: string; error: string }
  | { type: "decide"; incidentId: string; same: boolean }
  | { type: "split"; callId: string }
  | { type: "select"; incidentId: string | null }
  | { type: "fxDone"; key: string }
  | { type: "reply"; reply: Reply };

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
    recs: { ...s.recs, [id]: { ...s.recs[id], status: "done", result: { ...result, decision } } },
    audit,
    fx,
    selected: s.selected ?? incidentId,
  };
}

function reducer(s: ConsoleState, a: Action): ConsoleState {
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
    case "fxDone":
      return { ...s, fx: s.fx.filter((f) => f.key !== a.key) };
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

export function useConsole() {
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
    const src = sortedCalls(ref.current.scenarioId).find((c) => c.id === id)!;
    const incidents = ref.current.engine.incidents.map(snapshot);
    (async () => {
      try {
        const res = await fetch("/api/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ callId: id, aml: src.aml, incidents }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        dispatch({ type: "processed", epoch, id, result: (await res.json()) as ProcessResult });
      } catch {
        // Plan B sin servidor: mismo algoritmo en el navegador con la extracción simulada.
        const decision = decide({ aml: src.aml, extraction: src.mock }, incidents);
        const result: ProcessResult = {
          callId: id,
          transcript: src.transcript,
          language: src.lang,
          extraction: src.mock,
          decision,
          engine: { stt: "Transcripción del guion", llm: "Modo simulado" },
          timings: { sttMs: 0, llmMs: 0, totalMs: 0 },
        };
        dispatch({ type: "processed", epoch, id, result });
      }
    })();
  }, [s.inflight, s.queue, s.epoch]);

  const fxDone = useCallback((key: string) => dispatch({ type: "fxDone", key }), []);
  return { s, dispatch, fxDone };
}
