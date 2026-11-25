"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { actionUnit, callMeta, consoleHazards, consoleHazardWarnings, consoleLostCalls, consoleProposals, consoleUnits, useConsole } from "@/lib/useConsole";
import { actionIncidents, canApprove } from "@/lib/actions";
import type { EngineStatus, Speed } from "@/lib/useConsole";
import { buildAuditLog } from "@/lib/audit";
import { STATIC_EXPORT } from "@/lib/config";
import { getScenario } from "@/data/scenarios";
import ActionsBox from "./ActionsBox";
import ArchiveDialog from "./ArchiveDialog";
import AgentFeed from "./AgentFeed";
import { useCallAudio } from "./useCallAudio";
import CallsBox from "./CallsBox";
import type { CallsTab } from "./CallsBox";
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
import type { Ask } from "./ReplyPanel";

/** Lleva la vista a una caja (útil en pantallas pequeñas) y la resalta un instante. */
function focusBox(box: FocusBox | "calls") {
  // Las llamadas perdidas son una pestaña de la caja de llamadas: se resalta la caja entera.
  const el = document.getElementById(`box-${box === "lost" ? "calls" : box}`);
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
  const [callsTab, setCallsTab] = useState<CallsTab>("incoming");
  const [archive, setArchive] = useState<{ open: boolean; focus: string | null }>({ open: false, focus: null });
  // «Falta saber» (X12): pregunta que el operador ha pedido preparar en la caja de traducción (n cambia en cada clic).
  const [ask, setAsk] = useState<Ask | null>(null);
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
  const prepareAsk = useCallback((incidentId: string, phraseId: string, foreign: boolean) => {
    setAsk((a) => ({ incidentId, phraseId, n: (a?.n ?? 0) + 1 }));
    if (foreign) focusBox("translate");
  }, []);
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
  // Unidades simuladas (X16): posición y estado según el reloj del escenario.
  const units = useMemo(() => consoleUnits(s), [s.units, s.clock]); // eslint-disable-line react-hooks/exhaustive-deps
  // Peligros en la vía (X17): los peligros cambian con los incidentes; los avisos, con la posición de las unidades.
  const hazards = useMemo(() => consoleHazards(s), [s.engine, s.calls, s.archived]); // eslint-disable-line react-hooks/exhaustive-deps
  const hazardWarnings = useMemo(() => consoleHazardWarnings(s), [s.units, s.clock, hazards]); // eslint-disable-line react-hooks/exhaustive-deps

  // Agente de acciones (X05): las reglas proponen a partir del estado de los incidentes; las automáticas se envían al añadirse.
  // Llamadas perdidas (X15): dependen del reloj; basta con recalcular cuando ocurre una nueva.
  const lostSeen = (getScenario(s.scenarioId).lost ?? []).filter((l) => l.t <= s.clock).length;
  const proposals = useMemo(() => consoleProposals(s), [s.engine, s.calls, s.arrived, s.live, s.scenarioId, s.actions, lostSeen]); // eslint-disable-line react-hooks/exhaustive-deps
  const lost = useMemo(() => consoleLostCalls(s), [s.engine, s.calls, s.arrived, s.scenarioId, s.actions, lostSeen]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    dispatch({ type: "plan", proposals });
  }, [proposals, dispatch]);
  const approve = useCallback((key: string) => dispatch({ type: "actionApprove", key }), [dispatch]);
  const discard = useCallback((key: string) => dispatch({ type: "actionDiscard", key }), [dispatch]);
  const approveBatch = useCallback((incidentId: string) => dispatch({ type: "actionApproveBatch", incidentId }), [dispatch]);
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
    if (box === "lost") setCallsTab("lost");
    focusBox(box);
  }, [s.selected]);
  const goLost = useCallback(() => {
    setCallsTab("lost");
    focusBox("lost");
  }, []);
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
        <div className="col col-left">
          <CallsBox
            s={s}
            ranks={ranks}
            tab={callsTab}
            onTab={setCallsTab}
            playing={audio.playing}
            sttUp={sttUp}
            localAI={status.mode === "local"}
            lost={lost}
            actions={s.actions}
            onSelect={select}
            onSelectIncident={selectIncident}
            onArchived={openArchive}
            onLive={(call, result) => dispatch({ type: "live", call, result })}
            onApprove={approve}
            onDiscard={discard}
          />
        </div>

        <div className="col col-center">
          {/* La decisión ámbar va encima del mapa y nunca se resuelve sola. */}
          <div className="decision-slot" aria-live="polite"><DecisionBanner s={s} onDecide={decide} /></div>
          <MapView s={s} onSelect={select} onFxDone={fxDone} onFocus={onMapFocus} pendingActions={pendingByIncident} onResolve={resolve} units={units} hazards={hazards} hazardWarnings={hazardWarnings}>
            {/* Avisos del agente en la esquina del mapa: no tapan tarjetas ni el detalle. */}
            <AgentFeed actions={s.actions} epoch={s.epoch} />
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
            <ActionsBox actions={s.actions} archived={s.archived} onArchived={openArchive} selected={s.selected} incidents={s.engine.incidents} ranks={ranks} filter={actionsFilter} onFilter={setActionsFilter} provisional={pending} onApprove={approve} onDiscard={discard} onApproveBatch={approveBatch} onIncident={selectIncident} onLost={goLost} unitOf={(a) => actionUnit(s, a)} hazardWarnings={hazardWarnings} />
            <TranslateBox s={s} ask={ask} localAI={status.mode === "local"} onSelect={select} onReply={(reply) => dispatch({ type: "reply", reply })} />
          </div>
        </div>

        <div className="col col-side">
          <PriorityList s={s} onSelect={select} pendingActions={pendingByIncident} />
          <section className="box" id="box-detail" tabIndex={-1} aria-label="Ficha de la emergencia">
            <div className="box-body">
              <IncidentDetail s={s} audio={audio} ask={ask} onAsk={prepareAsk} onResolve={resolve} onSplit={(callId) => dispatch({ type: "split", callId })} />
            </div>
          </section>
        </div>
      </main>
      <HelpDialog open={help} onClose={() => setHelp(false)} />
      <ArchiveDialog open={archive.open} focus={archive.focus} s={s} onClose={() => setArchive({ open: false, focus: null })} onReopen={reopen} />
      <DeckReturn />
    </div>
  );
}
