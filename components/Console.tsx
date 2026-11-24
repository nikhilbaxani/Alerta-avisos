"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { callMeta, useConsole } from "@/lib/useConsole";
import { actionIncidents, canApprove } from "@/lib/actions";
import { proposalsFor } from "@/lib/consoleActions";
import type { EngineStatus, Speed } from "@/lib/useConsole";
import { buildAuditLog } from "@/lib/audit";
import { STATIC_EXPORT } from "@/lib/config";
import { getScenario } from "@/data/scenarios";
import ActionsBox from "./ActionsBox";
import ArchiveDialog from "./ArchiveDialog";
import AgentFeed from "./AgentFeed";
import { useCallAudio } from "./useCallAudio";
import CallQueue from "./CallQueue";
import DecisionBanner from "./DecisionBanner";
import DeckReturn from "./DeckReturn";
import HelpDialog from "./HelpDialog";
import Icon from "./Icon";
import IncidentDetail from "./IncidentDetail";
import { ranksOf } from "./IncToken";
import MapView from "./MapView";
import type { FocusBox } from "./MapView";
import PriorityList from "./PriorityList";
import TopBar from "./TopBar";
import type { Theme } from "./TopBar";
import TranslateBox from "./TranslateBox";

/** Lleva la vista a una caja (útil en pantallas pequeñas) y la resalta un instante. */
function focusBox(box: FocusBox) {
  const el = document.getElementById(`box-${box}`);
  if (!el) return;
  el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  el.focus({ preventScroll: true });
  el.classList.remove("flash");
  void el.offsetWidth; // reinicia la animación
  el.classList.add("flash");
}

export default function Console() {
  const { s, dispatch, fxDone } = useConsole();
  const [status, setStatus] = useState<EngineStatus>({ mode: "simulated", label: "Modo simulado" });
  const [sttUp, setSttUp] = useState(false);
  const [help, setHelp] = useState(false);
  const [theme, setTheme] = useState<Theme>("dark");
  const [actionsFilter, setActionsFilter] = useState<string | null>(null);
  const [archive, setArchive] = useState<{ open: boolean; focus: string | null }>({ open: false, focus: null });
  const openArchive = useCallback((focus: string | null = null) => setArchive({ open: true, focus }), []);
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
  const selectIncident = useCallback((id: string) => {
    if (!id.startsWith("INC")) return; // los ES-Alert son de zona, no de un incidente
    dispatch({ type: "select", incidentId: id });
    focusBox("detail");
  }, [dispatch]);
  const resolve = useCallback((id: string) => dispatch({ type: "resolve", incidentId: id }), [dispatch]);
  const reopen = useCallback((id: string) => {
    dispatch({ type: "reopen", incidentId: id });
    setArchive({ open: false, focus: null });
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
  const sent = s.actions.filter((a) => a.status === "enviada").length;
  const scn = getScenario(s.scenarioId);
  const langs = new Set(scn.calls.map((c) => c.lang)).size;
  const notStarted = s.clock === 0 && !s.running && s.arrived.length === 0;
  const ranks = ranksOf(s);
  // Desde la ficha del mapa: «Aprobar» lleva a las acciones de esa emergencia ya filtradas
  const onMapFocus = useCallback((box: FocusBox) => {
    if (box === "actions") setActionsFilter(s.selected);
    focusBox(box);
  }, [s.selected]);
  useEffect(() => setActionsFilter(null), [s.epoch]);
  useEffect(() => {
    if (actionsFilter && !s.engine.incidents.some((i) => i.id === actionsFilter)) setActionsFilter(null);
  }, [actionsFilter, s.engine.incidents]);

  return (
    <div className="console">
      <TopBar
        s={s}
        status={status}
        theme={theme}
        pending={pending}
        actionsSent={sent}
        actionsToApprove={toApprove.length}
        onTheme={toggleTheme}
        onPlay={play}
        onPause={() => dispatch({ type: "pause" })}
        onSpeed={(speed: Speed) => dispatch({ type: "speed", speed })}
        onReset={() => dispatch({ type: "reset" })}
        onExport={exportLog}
        onScenario={(id) => dispatch({ type: "scenario", id })}
        onHelp={() => setHelp(true)}
        archived={s.archived.length}
        onArchive={() => openArchive()}
      />
      {/* Una sola pantalla: cada apartado en su caja, todos a la vista a la vez. */}
      <main className="board">
        <CallQueue s={s} ranks={ranks} onArchived={openArchive} playing={audio.playing} sttUp={sttUp} localAI={status.mode === "local"} onSelect={select} onLive={(call, result) => dispatch({ type: "live", call, result })} />

        <div className="col col-center">
          {/* La decisión ámbar va encima del mapa y nunca se resuelve sola. */}
          <div className="decision-slot" aria-live="polite"><DecisionBanner s={s} onDecide={decide} /></div>
          <MapView s={s} onSelect={select} onFxDone={fxDone} onFocus={onMapFocus} pendingActions={pendingByIncident} onResolve={resolve}>
            {notStarted && (
              <div className="welcome">
                <h2>{scn.name}</h2>
                <p>{scn.calls.length} llamadas simuladas en {langs} idiomas. Pulsa Iniciar para reproducir el escenario y ver cómo el copiloto agrupa las llamadas repetidas, te pregunta cuando duda y traduce.</p>
                <div className="welcome-actions">
                  <button className="btn btn-dark btn-lg" onClick={play}><Icon name="play" />Iniciar simulación</button>
                  <button className="btn btn-lg" onClick={() => setHelp(true)}><Icon name="help" />Cómo funciona</button>
                  <Link href="/presentacion" className="btn btn-lg"><Icon name="slides" />Ver la presentación</Link>
                </div>
              </div>
            )}
          </MapView>
          <div className="pair">
            <ActionsBox actions={s.actions} archived={s.archived} onArchived={openArchive} selected={s.selected} incidents={s.engine.incidents} ranks={ranks} filter={actionsFilter} onFilter={setActionsFilter} provisional={pending} onApprove={approve} onDiscard={discard} onIncident={selectIncident} />
            <TranslateBox s={s} localAI={status.mode === "local"} onSelect={select} onReply={(reply) => dispatch({ type: "reply", reply })} />
          </div>
        </div>

        <div className="col col-side">
          <PriorityList s={s} onSelect={select} pendingActions={pendingByIncident} />
          <section className="box" id="box-detail" tabIndex={-1} aria-label="Ficha de la emergencia">
            <div className="box-body">
              <IncidentDetail s={s} audio={audio} onResolve={resolve} onSplit={(callId) => dispatch({ type: "split", callId })} />
            </div>
          </section>
        </div>
      </main>
      <AgentFeed actions={s.actions} epoch={s.epoch} />
      <HelpDialog open={help} onClose={() => setHelp(false)} />
      <ArchiveDialog open={archive.open} focus={archive.focus} s={s} onClose={() => setArchive({ open: false, focus: null })} onReopen={reopen} />
      <DeckReturn />
    </div>
  );
}
