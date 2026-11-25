"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { getScenario } from "@/data/scenarios";
import { RESOURCE_LABELS, type AgentAction, type Proposal } from "@/lib/actions";
import { decide } from "@/lib/cluster";
import { STATIC_EXPORT } from "@/lib/config";
import { factsFrom, proposalsFor } from "@/lib/consoleActions";
import { callMeta, consoleReducer, incidentPoint, initialConsoleState, PUBLIC_RELAY_URL, sortedCalls, type ConsoleState } from "@/lib/consoleMode";
import { liveSessionKey, loadLiveSession, saveLiveSession } from "@/lib/liveSession";
import { snapshot } from "@/lib/engine";
import { hazardsFrom, unitHazardWarnings, type Hazard, type UnitHazardWarning } from "@/lib/hazards";
import { analyzeLostCalls, type LostReport } from "@/lib/lostCalls";
import type { CallChannel, ProcessResult } from "@/lib/types";
import { SIMULATION_LABEL, formatDistance, nearestFree, unitAt, unitServiceOf, unitsAt, type Unit } from "@/lib/units";

export { callMeta, consoleReducer, initialConsoleState, scenarioEnd, resolvedReason } from "@/lib/consoleMode";
export { consoleReducer as reducer, initialConsoleState as init } from "@/lib/consoleMode";
export type { ArchivedIncident, AuditEntry, CallMeta, CallRec, ConsoleAction, ConsoleMode, ConsoleModeSnapshot, ConsoleState, Fx, Reply, Speed, UnitAssignment } from "@/lib/consoleMode";

function arrivedMeta(s: ConsoleState) {
  const phones: Record<string, string> = {};
  const channels: Record<string, CallChannel | undefined> = {};
  for (const id of s.arrived) {
    const m = callMeta(s, id);
    phones[id] = m?.phone ?? "";
    channels[id] = m?.channel;
  }
  return { phones, channels };
}

/** Reglas por incidente y zona, avisos de duplicado y propuestas por llamadas perdidas. */
export function consoleProposals(s: ConsoleState): Proposal[] {
  if (s.mode !== "sim") return [];
  const { phones, channels } = arrivedMeta(s);
  return [...proposalsFor(s.engine.incidents, s.calls, phones, { channels, actions: s.actions }), ...consoleLostCalls(s).proposals];
}

export function consoleLostCalls(s: ConsoleState): LostReport {
  const { phones, channels } = arrivedMeta(s);
  return analyzeLostCalls(s.mode === "sim" ? getScenario(s.scenarioId).lost ?? [] : [], s.clock, {
    incidents: s.engine.incidents,
    facts: factsFrom(s.calls, phones, channels),
    actions: s.actions,
  });
}

export function consoleUnits(s: ConsoleState): Unit[] {
  return unitsAt(s.units, s.clock);
}

export function consoleHazards(s: ConsoleState): Hazard[] {
  if (s.mode !== "sim") return [];
  const open = s.engine.incidents.map((i) => ({ id: i.id, callIds: i.callIds }));
  const solved = s.archived
    .filter((a) => !s.engine.incidents.some((i) => i.id === a.incident.id))
    .map((a) => ({ id: a.incident.id, callIds: a.incident.callIds, resolved: true }));
  return hazardsFrom([...open, ...solved], s.calls);
}

export function consoleHazardWarnings(s: ConsoleState): UnitHazardWarning[] {
  return unitHazardWarnings(consoleUnits(s), consoleHazards(s));
}

/** Lo que la tarjeta de `proponer_recursos` muestra sobre la unidad. */
export interface ActionUnit {
  kind: "propuesta" | "asignada" | "sin_libre";
  unit: Unit | null;
  distance: number | null;
  text: string;
}

export function actionUnit(s: ConsoleState, action: AgentAction | Proposal): ActionUnit | null {
  if (s.mode !== "sim" || action.tool !== "proponer_recursos") return null;
  const label = RESOURCE_LABELS[action.args.servicio];
  const done = s.unitAssignments[action.key];
  if (done) {
    if (!done.unitId) return { kind: "sin_libre", unit: null, distance: null, text: `No había unidad libre de ${label} al aprobar ${SIMULATION_LABEL}` };
    const stored = s.units.find((u) => u.id === done.unitId && u.actionKey === action.key);
    const unit = stored ? unitAt(stored, s.clock) : null;
    const where = unit ? ` · ${unitStatusText(unit)}` : " · ya libre";
    return { kind: "asignada", unit, distance: done.distance, text: `Unidad asignada: ${done.unitId} a ${formatDistance(done.distance ?? 0)}${where} ${SIMULATION_LABEL}` };
  }
  const st = "status" in action ? action.status : "propuesta";
  if (st !== "propuesta") return null;
  const point = incidentPoint(s, action.incidentId);
  if (!point) return null;
  const near = nearestFree(s.units, unitServiceOf(action.args.servicio), point);
  if (!near) return { kind: "sin_libre", unit: null, distance: null, text: `Sin unidades libres de ${label} ${SIMULATION_LABEL}` };
  return { kind: "propuesta", unit: near.unit, distance: near.distance, text: `Unidad libre más cercana: ${near.unit.id} a ${formatDistance(near.distance)} ${SIMULATION_LABEL}` };
}

const unitStatusText = (u: Unit) => ({ libre: "libre", asignada: "asignada", en_camino: "en camino", en_el_lugar: "en el lugar" })[u.status];

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

/** `offline`: no consulta /api/process; la presentación siempre funciona así. */
export function useConsole({ offline = false, persistLive = false }: { offline?: boolean; persistLive?: boolean } = {}) {
  const [s, dispatch] = useReducer(consoleReducer, 0, initialConsoleState);
  const ref = useRef(s);
  ref.current = s;
  const relay = persistLive ? PUBLIC_RELAY_URL : "";
  const [restored, setRestored] = useState(false);
  const storageReport = useRef({ warned: false, warn: (message: string) => console.warn(message) });
  const lastSaved = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!relay) return;
    try { dispatch({ type: "restoreLiveSession", state: loadLiveSession(window.localStorage, relay) }); }
    catch { /* el acceso a localStorage puede estar desactivado */ }
    setRestored(true);
  }, [relay]);

  const persist = useCallback((onlyIfUnchanged = false) => {
    try {
      const store = window.localStorage;
      // No sobrescribir una sesión borrada, modificada desde otra pestaña o corrupta al salir.
      if (onlyIfUnchanged && (lastSaved.current === undefined || store.getItem(liveSessionKey(relay)) !== lastSaved.current)) return;
      lastSaved.current = saveLiveSession(store, relay, ref.current, storageReport.current);
    } catch { /* el acceso a localStorage puede estar desactivado */ }
  }, [relay]);
  const currentLive = s.mode === "live" ? s : s.saved.live;
  // No reserializamos las transcripciones en cada tic; pagehide guarda también el último reloj.
  const { arrived, engine, archived, audit, selected, relayEpoch } = currentLive ?? {};
  useEffect(() => {
    if (relay && restored) persist();
  }, [relay, restored, persist, s.mode, arrived, engine, archived, audit, selected, relayEpoch]);
  useEffect(() => {
    if (!relay || !restored) return;
    const flushClock = () => persist(true);
    window.addEventListener("pagehide", flushClock);
    return () => window.removeEventListener("pagehide", flushClock);
  }, [relay, restored, persist]);

  useEffect(() => {
    if (s.mode !== "sim" || !s.running) return;
    const id = setInterval(() => dispatch({ type: "tick", dt: 0.1 * s.speed }), 100);
    return () => clearInterval(id);
  }, [s.mode, s.running, s.speed]);

  useEffect(() => {
    if (s.mode !== "live" || s.arrived.length === 0) return;
    const id = setInterval(() => dispatch({ type: "liveTick", dt: 1 }), 1000);
    return () => clearInterval(id);
  }, [s.mode, s.arrived.length]);

  // Cola SERIE de simulación: cada llamada ve los incidentes creados por las anteriores.
  useEffect(() => {
    if (s.mode !== "sim" || s.inflight || s.queue.length === 0) return;
    const id = s.queue[0];
    const epoch = s.epoch;
    dispatch({ type: "begin", id });
    const scenarioId = ref.current.scenarioId;
    const src = sortedCalls(scenarioId).find((c) => c.id === id)!;
    const incidents = ref.current.engine.incidents.map(snapshot);
    (async () => {
      try {
        if (STATIC_EXPORT || offline) throw new Error("Sin servidor");
        const res = await fetch("/api/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ callId: id, aml: src.aml, incidents }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        dispatch({ type: "processed", epoch, id, result: (await res.json()) as ProcessResult });
      } catch {
        dispatch({ type: "processed", epoch, id, result: simulatedResult(scenarioId, id, incidents) });
      }
    })();
  }, [s.mode, s.inflight, s.queue, s.epoch, offline]);

  const fxDone = useCallback((key: string) => dispatch({ type: "fxDone", key }), []);
  return { s, dispatch, fxDone };
}
