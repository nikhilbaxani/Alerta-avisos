"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { actionIncidents, canApprove } from "@/lib/actions";
import { buildAuditLog } from "@/lib/audit";
import { callMeta, consoleProposals, scenarioEnd, useConsole } from "@/lib/useConsole";
import type { EngineStatus, Speed } from "@/lib/useConsole";
import AgentFeed from "@/components/AgentFeed";
import DecisionBanner from "@/components/DecisionBanner";
import HelpDialog from "@/components/HelpDialog";
import MapView from "@/components/MapView";
import PriorityList from "@/components/PriorityList";
import TopBar from "@/components/TopBar";
import { useCallAudio } from "@/components/useCallAudio";

const STATUS: EngineStatus = { mode: "simulated", label: "Modo simulado" };

/**
 * La consola de verdad, en pequeño: cabecera, resumen, decisión, mapa, avisos del agente y prioridad,
 * con el mismo estado (`useConsole`) y el mismo agente de acciones que la página principal. Siempre en
 * modo simulado en el navegador, para que la presentación no dependa del servidor ni de la GPU.
 */
export default function LiveConsole({ active }: { active: boolean }) {
  const { s, dispatch, fxDone } = useConsole({ offline: true });
  const audio = useCallAudio(s);
  const [help, setHelp] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const started = useRef(false);
  const resume = useRef(false);

  // Al llegar a la diapositiva arranca sola; al salir se pausa, y al volver continúa donde estaba.
  useEffect(() => {
    if (active) {
      if (!started.current) {
        started.current = true;
        const t = setTimeout(() => dispatch({ type: "play" }), 1100);
        return () => clearTimeout(t);
      }
      if (resume.current) dispatch({ type: "play" });
      return;
    }
    resume.current = s.running;
    if (s.running) dispatch({ type: "pause" });
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  const proposals = useMemo(() => consoleProposals(s), [s.engine, s.calls, s.arrived, s.live, s.scenarioId, s.actions]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    dispatch({ type: "plan", proposals });
  }, [proposals, dispatch]);

  const select = useCallback((id: string) => dispatch({ type: "select", incidentId: id }), [dispatch]);
  const decide = useCallback((incidentId: string, same: boolean) => dispatch({ type: "decide", incidentId, same }), [dispatch]);
  const exportLog = useCallback(() => {
    const blob = new Blob([JSON.stringify(buildAuditLog(s, STATUS.label), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `registro-112-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [s]);

  const pending = s.engine.incidents.filter((i) => i.provisional).length;
  const toApprove = s.actions.filter((a) => a.status === "propuesta" && canApprove(a.policy, "operador"));
  const pendingByIncident: Record<string, number> = {};
  for (const a of toApprove) for (const id of actionIncidents(a)) pendingByIncident[id] = (pendingByIncident[id] ?? 0) + 1;
  const sent = s.actions.filter((a) => a.status === "enviada").length;
  const finished = s.clock >= scenarioEnd(s.scenarioId) + 1;

  return (
    <>
      <TopBar
        s={s}
        status={STATUS}
        pending={pending}
        actionsSent={sent}
        actionsToApprove={toApprove.length}
        theme="dark"
        onPlay={() => dispatch({ type: "play" })}
        onPause={() => dispatch({ type: "pause" })}
        onSpeed={(speed: Speed) => dispatch({ type: "speed", speed })}
        onReset={() => dispatch({ type: "reset" })}
        onExport={exportLog}
        onScenario={(id) => dispatch({ type: "scenario", id })}
        onHelp={() => setHelp(true)}
      />
      <div className="embed-main" data-noswipe>
        <section className="center" aria-label="Mapa y decisiones">
          {/* Solo la diapositiva visible escucha las teclas M y D. */}
          <div className="decision-slot" aria-live="polite">{active && <DecisionBanner s={s} onDecide={decide} />}</div>
          <MapView s={s} onSelect={select} onFxDone={fxDone} pendingActions={pendingByIncident} />
          <AgentFeed actions={s.actions} epoch={s.epoch} />
        </section>
        <PriorityList s={s} onSelect={select} pendingActions={pendingByIncident} />
      </div>
      {finished && <span className="sr-only" role="status">Escenario terminado</span>}
      {mounted && createPortal(<HelpDialog open={help} onClose={() => setHelp(false)} />, document.body)}
    </>
  );
}
