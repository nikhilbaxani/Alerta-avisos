"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { callMeta, useConsole } from "@/lib/useConsole";
import { actionIncidents, canApprove } from "@/lib/actions";
import { proposalsFor } from "@/lib/consoleActions";
import type { EngineStatus, Speed } from "@/lib/useConsole";
import { buildAuditLog } from "@/lib/audit";
import { STATIC_EXPORT } from "@/lib/config";
import { getScenario } from "@/data/scenarios";
import AgentFeed from "./AgentFeed";
import CallQueue from "./CallQueue";
import DecisionBanner from "./DecisionBanner";
import HelpDialog from "./HelpDialog";
import Icon from "./Icon";
import IncidentDetail from "./IncidentDetail";
import MapView from "./MapView";
import PriorityList from "./PriorityList";
import SimStrip from "./SimStrip";
import TopBar from "./TopBar";

export default function Console() {
  const { s, dispatch, fxDone } = useConsole();
  const [status, setStatus] = useState<EngineStatus>({ mode: "simulated", label: "Modo simulado" });
  const [sttUp, setSttUp] = useState(false);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    if (STATIC_EXPORT) return; // GitHub Pages: no hay servidor que consultar
    fetch("/api/status")
      .then((r) => r.json())
      .then((d) => {
        setStatus({ mode: d.mode, label: d.label });
        setSttUp(!!d.stt?.up);
      })
      .catch(() => undefined);
  }, []);

  const select = useCallback((id: string) => dispatch({ type: "select", incidentId: id }), [dispatch]);
  const decide = useCallback((incidentId: string, same: boolean) => dispatch({ type: "decide", incidentId, same }), [dispatch]);
  const play = useCallback(() => dispatch({ type: "play" }), [dispatch]);
  const exportLog = useCallback(() => {
    const blob = new Blob([JSON.stringify(buildAuditLog(s, status.label), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `registro-112-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [s, status.label]);
  const pending = s.engine.incidents.filter((i) => i.provisional).length;

  // Agente de acciones (X05): las reglas proponen a partir del estado de los incidentes; las automáticas se envían al añadirse.
  const proposals = useMemo(() => {
    const phones = Object.fromEntries(s.arrived.map((id) => [id, callMeta(s, id)?.phone ?? ""]));
    return proposalsFor(s.engine.incidents, s.calls, phones);
  }, [s.engine, s.calls, s.arrived, s.live, s.scenarioId]);
  useEffect(() => {
    dispatch({ type: "plan", proposals });
  }, [proposals, dispatch]);
  const approve = useCallback((key: string) => dispatch({ type: "actionApprove", key }), [dispatch]);
  const discard = useCallback((key: string) => dispatch({ type: "actionDiscard", key }), [dispatch]);
  const toApprove = s.actions.filter((a) => a.status === "propuesta" && canApprove(a.policy, "operador"));
  const pendingByIncident: Record<string, number> = {};
  for (const a of toApprove) for (const id of actionIncidents(a)) pendingByIncident[id] = (pendingByIncident[id] ?? 0) + 1;
  const sent = s.actions.filter((a) => a.status === "enviada").length;
  const scn = getScenario(s.scenarioId);
  const langs = new Set(scn.calls.map((c) => c.lang)).size;
  const notStarted = s.clock === 0 && !s.running && s.arrived.length === 0;

  return (
    <div className="console">
      <TopBar
        s={s}
        status={status}
        pending={pending}
        actionsSent={sent}
        actionsToApprove={toApprove.length}
        onPlay={play}
        onPause={() => dispatch({ type: "pause" })}
        onSpeed={(speed: Speed) => dispatch({ type: "speed", speed })}
        onReset={() => dispatch({ type: "reset" })}
        onExport={exportLog}
        onScenario={(id) => dispatch({ type: "scenario", id })}
        onHelp={() => setHelp(true)}
      />
      <main className="main">
        <CallQueue s={s} sttUp={sttUp} onSelect={select} onLive={(call, result) => dispatch({ type: "live", call, result })} />
        <section className="center" aria-label="Mapa y decisiones">
          <div aria-live="polite"><DecisionBanner s={s} onDecide={decide} /></div>
          <div className="map-wrap">
            <MapView s={s} onSelect={select} onFxDone={fxDone} />
            <AgentFeed actions={s.actions} epoch={s.epoch} />
            {notStarted && (
              <div className="welcome">
                <h2>{scn.name}</h2>
                <p>{scn.calls.length} llamadas simuladas en {langs} idiomas. Pulsa Iniciar para reproducir el escenario y ver cómo el copiloto agrupa las llamadas repetidas, te pregunta cuando duda y traduce.</p>
                <div className="welcome-actions">
                  <button className="btn btn-dark btn-lg" onClick={play}><Icon name="play" />Iniciar simulación</button>
                  <button className="btn btn-lg" onClick={() => setHelp(true)}><Icon name="help" />Cómo funciona</button>
                </div>
              </div>
            )}
          </div>
          <SimStrip s={s} />
        </section>
        <section className="panel side-col" aria-label="Prioridad y detalle">
          <PriorityList s={s} onSelect={select} pendingActions={pendingByIncident} />
          <IncidentDetail
            s={s}
            localAI={status.mode === "local"}
            actions={s.actions}
            onApprove={approve}
            onDiscard={discard}
            onSplit={(callId) => dispatch({ type: "split", callId })}
            onReply={(reply) => dispatch({ type: "reply", reply })}
          />
        </section>
      </main>
      <HelpDialog open={help} onClose={() => setHelp(false)} />
    </div>
  );
}
