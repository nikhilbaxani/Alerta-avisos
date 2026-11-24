"use client";

import { useCallback, useEffect, useState } from "react";
import { useConsole } from "@/lib/useConsole";
import type { EngineStatus, Speed } from "@/lib/useConsole";
import { buildAuditLog } from "@/lib/audit";
import { STATIC_EXPORT } from "@/lib/config";
import { getScenario } from "@/data/scenarios";
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
    const payload = buildAuditLog(s, s.mode === "sim" ? status.label : "Relay del VPS");
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `registro-112-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [s, status.label]);
  const pending = s.engine.incidents.filter((i) => i.provisional).length;
  const scn = getScenario(s.scenarioId);
  const langs = new Set(scn.calls.map((c) => c.lang)).size;
  const notStartedSim = s.mode === "sim" && s.clock === 0 && !s.running && s.arrived.length === 0;
  const emptyLive = s.mode === "live" && s.arrived.length === 0;

  return (
    <div className="console">
      <TopBar
        s={s}
        status={status}
        pending={pending}
        onMode={(mode) => dispatch({ type: "mode", mode })}
        onPlay={play}
        onPause={() => dispatch({ type: "pause" })}
        onSpeed={(speed: Speed) => dispatch({ type: "speed", speed })}
        onReset={() => dispatch({ type: "reset" })}
        onExport={exportLog}
        onScenario={(id) => dispatch({ type: "scenario", id })}
        onHelp={() => setHelp(true)}
      />
      <div className={s.mode === "live" ? "main main-live" : "main"} id="console-panel" role="tabpanel" aria-labelledby={s.mode === "sim" ? "tab-sim" : "tab-live"}>
        <CallQueue
          s={s}
          sttUp={sttUp}
          onSelect={select}
          onLive={(call, result) => dispatch({ type: "live", call, result })}
          onMicrophone={(epoch, call, result) => dispatch({ type: "microphone", epoch, call, result })}
        />
        <section className="center" aria-label="Mapa y decisiones">
          <div aria-live="polite"><DecisionBanner s={s} onDecide={decide} /></div>
          <div className="map-wrap">
            <MapView s={s} onSelect={select} onFxDone={fxDone} />
            {notStartedSim && (
              <div className="welcome">
                <h2>{scn.name}</h2>
                <p>{scn.calls.length} llamadas simuladas en {langs} idiomas. Pulsa Iniciar para reproducir el escenario y ver cómo el copiloto agrupa las llamadas repetidas, te pregunta cuando duda y traduce.</p>
                <div className="welcome-actions">
                  <button className="btn btn-dark btn-lg" onClick={play}><Icon name="play" />Iniciar simulación</button>
                  <button className="btn btn-lg" onClick={() => setHelp(true)}><Icon name="help" />Cómo funciona</button>
                </div>
              </div>
            )}
            {emptyLive && (
              <div className="welcome welcome-live">
                <h2>En directo: esperando llamadas del público</h2>
                <p>Escanea el QR de la bandeja para enviar una llamada desde el móvil. Cada llamada entra primero en la bandeja y solo pasa al mapa cuando pulsas Aceptar.</p>
              </div>
            )}
          </div>
          {s.mode === "sim" && <SimStrip s={s} />}
        </section>
        <section className="panel side-col" aria-label="Prioridad y detalle">
          <PriorityList s={s} onSelect={select} />
          <IncidentDetail
            key={s.epoch}
            s={s}
            localAI={status.mode === "local"}
            onSplit={(callId) => dispatch({ type: "split", callId })}
            onReply={(reply) => dispatch({ type: "reply", reply })}
          />
        </section>
      </div>
      <HelpDialog open={help} onClose={() => setHelp(false)} />
    </div>
  );
}
