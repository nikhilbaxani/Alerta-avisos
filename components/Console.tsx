"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { callMeta, useConsole } from "@/lib/useConsole";
import { actionIncidents, canApprove } from "@/lib/actions";
import { proposalsFor } from "@/lib/consoleActions";
import type { EngineStatus, Speed } from "@/lib/useConsole";
import { buildAuditLog } from "@/lib/audit";
import { STATIC_EXPORT } from "@/lib/config";
import { getScenario } from "@/data/scenarios";
import ActionsView from "./ActionsView";
import AgentFeed from "./AgentFeed";
import { useCallAudio } from "./useCallAudio";
import CallQueue from "./CallQueue";
import DecisionBanner from "./DecisionBanner";
import HelpDialog from "./HelpDialog";
import Icon from "./Icon";
import IncidentDetail from "./IncidentDetail";
import MapView from "./MapView";
import PriorityList from "./PriorityList";
import SimStrip from "./SimStrip";
import TopBar from "./TopBar";
import type { Tab, TabBadge, Theme } from "./TopBar";
import TranslateView from "./TranslateView";

export default function Console() {
  const { s, dispatch, fxDone } = useConsole();
  const [status, setStatus] = useState<EngineStatus>({ mode: "simulated", label: "Modo simulado" });
  const [sttUp, setSttUp] = useState(false);
  const [help, setHelp] = useState(false);
  const [tab, setTab] = useState<Tab>("calls");
  const [theme, setTheme] = useState<Theme>("dark");
  const audio = useCallAudio(s);

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  }, []);
  const toggleTheme = useCallback(() => {
    setTheme((t) => {
      const next: Theme = t === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem("theme", next); } catch { /* sin almacenamiento: solo esta sesión */ }
      return next;
    });
  }, []);

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
  const openIncident = useCallback((id: string) => {
    if (id.startsWith("INC")) dispatch({ type: "select", incidentId: id });
    setTab("incidents");
  }, [dispatch]);
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
  const actionsByIncident: Record<string, number> = {};
  for (const a of s.actions) for (const id of actionIncidents(a)) actionsByIncident[id] = (actionsByIncident[id] ?? 0) + 1;
  const sent = s.actions.filter((a) => a.status === "enviada").length;
  const scn = getScenario(s.scenarioId);
  const langs = new Set(scn.calls.map((c) => c.lang)).size;
  const notStarted = s.clock === 0 && !s.running && s.arrived.length === 0;
  const foreignIncidents = s.engine.incidents.filter((i) => i.callIds.some((id) => (s.calls[id]?.extraction.language ?? "es") !== "es")).length;

  const badges: Partial<Record<Tab, TabBadge>> = {
    calls: { n: pending || s.arrived.length, tone: pending ? "amber" : undefined },
    incidents: { n: s.engine.incidents.length },
    translate: { n: foreignIncidents },
    actions: { n: toApprove.length, tone: "amber" },
  };

  let view: React.ReactNode;
  if (tab === "calls") {
    view = (
      <div className="view view-calls">
        <CallQueue s={s} playing={audio.playing} sttUp={sttUp} onSelect={select} onLive={(call, result) => dispatch({ type: "live", call, result })} />
        <MapView s={s} onSelect={select} onFxDone={fxDone} onOpen={setTab} pendingActions={pendingByIncident} actionCount={actionsByIncident}>
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
        </MapView>
      </div>
    );
  } else if (tab === "incidents") {
    view = (
      <div className="view view-incidents">
        <section className="panel"><PriorityList s={s} onSelect={select} pendingActions={pendingByIncident} /></section>
        <section className="panel" aria-label="Detalle de la emergencia">
          <IncidentDetail s={s} actions={s.actions} audio={audio} onOpen={setTab} onSplit={(callId) => dispatch({ type: "split", callId })} />
        </section>
      </div>
    );
  } else if (tab === "translate") {
    view = <TranslateView s={s} localAI={status.mode === "local"} audio={audio} onSelect={select} onReply={(reply) => dispatch({ type: "reply", reply })} />;
  } else if (tab === "actions") {
    view = <ActionsView actions={s.actions} provisional={pending} onApprove={approve} onDiscard={discard} onIncident={openIncident} />;
  } else {
    const done = Object.values(s.recs).filter((r) => r.status === "done").length;
    const incidents = s.engine.incidents.length;
    view = (
      <div className="view view-analysis">
        <div className="an-kpis">
          <div className="an-kpi card"><b>{done}</b><span>llamadas recibidas</span><small>de {scn.calls.length} del escenario</small></div>
          <div className="an-kpi card"><b>{incidents}</b><span>emergencias distintas</span><small>tras agrupar las repetidas</small></div>
          <div className="an-kpi card good"><b>{Math.max(0, done - incidents)}</b><span>líneas liberadas</span><small>llamadas repetidas agrupadas</small></div>
          <div className={`an-kpi card ${pending ? "warn" : ""}`}><b>{pending}</b><span>{pending === 1 ? "decisión pendiente" : "decisiones pendientes"}</span><small>la IA duda y te pregunta</small></div>
          <div className="an-kpi card"><b>{sent}</b><span>{sent === 1 ? "acción enviada" : "acciones enviadas"}</span><small>{toApprove.length ? `${toApprove.length} por aprobar` : "a servicios simulados"}</small></div>
        </div>
        <SimStrip s={s} />
      </div>
    );
  }

  return (
    <div className="console">
      <TopBar
        s={s}
        status={status}
        tab={tab}
        badges={badges}
        theme={theme}
        pending={pending}
        actionsSent={sent}
        actionsToApprove={toApprove.length}
        sound={audio.enabled}
        onTab={setTab}
        onTheme={toggleTheme}
        onSound={audio.toggle}
        onPlay={play}
        onPause={() => dispatch({ type: "pause" })}
        onSpeed={(speed: Speed) => dispatch({ type: "speed", speed })}
        onReset={() => dispatch({ type: "reset" })}
        onExport={exportLog}
        onScenario={(id) => dispatch({ type: "scenario", id })}
        onHelp={() => setHelp(true)}
      />
      {/* La decisión ámbar se ve en todas las zonas: nunca queda escondida en otra pestaña. */}
      <div className="decision-slot" aria-live="polite"><DecisionBanner s={s} onDecide={decide} /></div>
      <main className="stage" id="stage" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {view}
      </main>
      <AgentFeed actions={s.actions} epoch={s.epoch} />
      <HelpDialog open={help} onClose={() => setHelp(false)} />
    </div>
  );
}
