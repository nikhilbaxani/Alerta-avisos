import { useRef } from "react";
import { PUBLIC_RELAY_URL } from "@/lib/consoleMode";
import { scenarioEnd } from "@/lib/useConsole";
import type { ConsoleMode, ConsoleState, EngineStatus, Speed } from "@/lib/useConsole";
import { SCENARIOS, getScenario } from "@/data/scenarios";
import Icon from "./Icon";
import { mmss } from "./format";

const LIVE_UNAVAILABLE = "En directo no disponible: falta configurar el relay del VPS.";

interface Props {
  s: ConsoleState;
  status: EngineStatus;
  pending: number;
  onMode: (mode: ConsoleMode) => void;
  onPlay: () => void;
  onPause: () => void;
  onSpeed: (v: Speed) => void;
  onReset: () => void;
  onExport: () => void;
  onScenario: (id: string) => void;
  onHelp: () => void;
}

export default function TopBar({
  s,
  status,
  pending,
  onMode,
  onPlay,
  onPause,
  onSpeed,
  onReset,
  onExport,
  onScenario,
  onHelp,
}: Props) {
  const relayEnabled = Boolean(PUBLIC_RELAY_URL);
  const simTabRef = useRef<HTMLButtonElement>(null);
  const liveTabRef = useRef<HTMLButtonElement>(null);
  const isSim = s.mode === "sim";
  const done = Object.values(s.recs).filter((r) => r.status === "done").length;
  const total = getScenario(s.scenarioId).calls.length;
  const incidents = s.engine.incidents.length;
  const freed = Math.max(0, done - incidents);
  const finished = isSim && s.clock >= scenarioEnd(s.scenarioId) + 1;
  const local = status.mode === "local";

  const onTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!relayEnabled) return;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const next: ConsoleMode = s.mode === "sim" ? "live" : "sim";
      onMode(next);
      (next === "sim" ? simTabRef : liveTabRef).current?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      onMode("sim");
      simTabRef.current?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      onMode("live");
      liveTabRef.current?.focus();
    }
  };

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">112</span>
          <span className="brand-name">Copiloto</span>
        </div>

        <div className="mode-tabs" role="tablist" aria-label="Modo de la consola">
          <button
            ref={simTabRef}
            type="button"
            role="tab"
            id="tab-sim"
            aria-controls="console-panel"
            aria-selected={isSim}
            tabIndex={isSim ? 0 : -1}
            onClick={() => onMode("sim")}
            onKeyDown={onTabKeyDown}
          >
            Simulación
          </button>
          <button
            ref={liveTabRef}
            type="button"
            role="tab"
            id="tab-live"
            aria-controls="console-panel"
            aria-selected={!isSim}
            tabIndex={!isSim ? 0 : -1}
            disabled={!relayEnabled}
            aria-describedby={!relayEnabled ? "live-unavailable" : undefined}
            onClick={() => relayEnabled && onMode("live")}
            onKeyDown={onTabKeyDown}
          >
            En directo (QR)
          </button>
        </div>

        {!relayEnabled && <p className="mode-notice" id="live-unavailable">{LIVE_UNAVAILABLE}</p>}

        {isSim ? (
          <>
            <label className="scn">
              <span className="sr-only">Escenario</span>
              <select value={s.scenarioId} onChange={(e) => onScenario(e.target.value)} aria-label="Escenario">
                {SCENARIOS.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </label>

            <div className="playback" role="group" aria-label="Controles de la simulación">
              {s.running ? (
                <button className="btn btn-dark" onClick={onPause}><Icon name="pause" />Pausar</button>
              ) : (
                <button className="btn btn-dark" onClick={onPlay} disabled={finished}>
                  <Icon name="play" />{s.clock === 0 ? "Iniciar" : finished ? "Terminado" : "Continuar"}
                </button>
              )}
              <div className="seg" role="group" aria-label="Velocidad">
                {([1, 4, 10] as Speed[]).map((v) => (
                  <button key={v} aria-pressed={s.speed === v} onClick={() => onSpeed(v)} aria-label={`Velocidad por ${v}`}>
                    ×{v}
                  </button>
                ))}
              </div>
              <button className="btn btn-icon" onClick={onReset} aria-label="Reiniciar" title="Reiniciar"><Icon name="restart" /></button>
              <span className="clock" title="Tiempo transcurrido en el escenario">
                <span className="sr-only">Tiempo del escenario </span>{mmss(s.clock)}
              </span>
            </div>
          </>
        ) : (
          <div className="live-indicator" role="status">
            <i aria-hidden="true" />
            <span>En directo · llamadas por QR</span>
            {s.arrived.length > 0 && (
              <button
                type="button"
                className="btn btn-icon btn-sm"
                onClick={onReset}
                aria-label="Limpiar sesión en directo"
                title="Limpiar sesión en directo"
              >
                <Icon name="restart" size={16} />
              </button>
            )}
          </div>
        )}

        <div className="topbar-end">
          {isSim && <span
            className={`engine ${local ? "on" : ""}`}
            title={local ? "Transcripción y extracción con modelos locales en esta máquina" : "Sin GPU ni internet: usa las extracciones grabadas del escenario. La agrupación y la prioridad se calculan en directo."}
          >
            <i aria-hidden="true" />{status.label}
          </span>}
          <button className="btn btn-ghost" onClick={onHelp} aria-label="Cómo funciona"><Icon name="help" /><span className="btn-text">Cómo funciona</span></button>
          <button className="btn btn-ghost" onClick={onExport} disabled={s.audit.length === 0} aria-label="Exportar registro" title="Descarga en JSON cada decisión de la IA y del operador">
            <Icon name="download" /><span className="btn-text">Exportar registro</span>
          </button>
        </div>
      </header>

      <section className="kpis" aria-label="Resumen" aria-live="polite">
        <div className="kpi" data-kpi="calls" data-value={done}>
          <span className="kpi-val">{done}{isSim && <small> / {total}</small>}</span>
          <span className="kpi-label">llamadas recibidas</span>
        </div>
        <div className="kpi" data-kpi="incidents" data-value={incidents}>
          <span className="kpi-val">{incidents}</span>
          <span className="kpi-label">emergencias distintas</span>
        </div>
        <div className="kpi good" data-kpi="freed" data-value={freed}>
          <span className="kpi-val">{freed}</span>
          <span className="kpi-label">líneas liberadas <span className="kpi-hint">llamadas repetidas agrupadas</span></span>
        </div>
        <div className={`kpi ${pending > 0 ? "warn" : ""}`} data-kpi="pending" data-value={pending}>
          <span className="kpi-val">{pending}</span>
          <span className="kpi-label">{pending === 1 ? "decisión pendiente" : "decisiones pendientes"}</span>
        </div>
      </section>
    </>
  );
}
