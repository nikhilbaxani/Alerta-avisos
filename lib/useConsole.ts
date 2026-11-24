"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { decide } from "@/lib/cluster";
import { STATIC_EXPORT } from "@/lib/config";
import { consoleReducer, initialConsoleState, sortedCalls } from "@/lib/consoleMode";
import { snapshot } from "@/lib/engine";
import type { ProcessResult } from "@/lib/types";

export { callMeta, consoleReducer, initialConsoleState, scenarioEnd } from "@/lib/consoleMode";
export type {
  AuditEntry,
  CallMeta,
  CallRec,
  ConsoleAction,
  ConsoleMode,
  ConsoleModeSnapshot,
  ConsoleState,
  Fx,
  Reply,
  Speed,
} from "@/lib/consoleMode";

export interface EngineStatus {
  mode: "simulated" | "local";
  label: string;
}

export function useConsole() {
  const [s, dispatch] = useReducer(consoleReducer, 0, initialConsoleState);
  const ref = useRef(s);
  ref.current = s;

  // Reloj de simulación (solo en modo sim).
  useEffect(() => {
    if (s.mode !== "sim" || !s.running) return;
    const id = setInterval(() => dispatch({ type: "tick", dt: 0.1 * s.speed }), 100);
    return () => clearInterval(id);
  }, [s.mode, s.running, s.speed]);

  // Reloj real en modo directo: avanza 1 s cada segundo tras la primera llamada aceptada
  // para que la prioridad por tiempo sin atender funcione en tiempo real.
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
    const src = sortedCalls(ref.current.scenarioId).find((c) => c.id === id)!;
    const incidents = ref.current.engine.incidents.map(snapshot);
    (async () => {
      try {
        if (STATIC_EXPORT) throw new Error("Versión estática: sin servidor"); // directo al plan B
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
  }, [s.mode, s.inflight, s.queue, s.epoch]);

  const fxDone = useCallback((key: string) => dispatch({ type: "fxDone", key }), []);
  return { s, dispatch, fxDone };
}
