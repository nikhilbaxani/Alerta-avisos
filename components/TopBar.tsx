import Link from "next/link";
import { useRef, type KeyboardEvent } from "react";
import { PUBLIC_RELAY_URL } from "@/lib/consoleMode";
import { scenarioEnd } from "@/lib/useConsole";
import type { ConsoleMode, ConsoleState, EngineStatus, Speed } from "@/lib/useConsole";
import { SCENARIOS, getScenario } from "@/data/scenarios";
import logoLight from "@/docs/marca/agente-112/agente-112.svg";
import logoDark from "@/docs/marca/agente-112/agente-112-oscuro.svg";
import Icon from "./Icon";
import { mmss } from "./format";

const LIVE_UNAVAILABLE = "En directo no disponible: falta configurar el relay del VPS.";

export type Theme = "dark" | "light";

interface Props {
  s: ConsoleState;
  status: EngineStatus;
  theme: Theme;
  pending: number;
  actionsSent: number;
  actionsToApprove: number;
  onMode?: (mode: ConsoleMode) => void;
  onTheme?: () => void;
  onPlay: () => void;
  onPause: () => void;
  onSpeed: (v: Speed) => void;
  onReset: () => void;
  onExport: () => void;
  onScenario: (id: string) => void;
  onHelp: () => void;
  archived?: number;
  onArchive?: () => void;
}

/** Cabecera única: marca, modo, controles, cifras de la sala y ajustes. */
export default function TopBar(p: Props) {
  const { s, status, theme, pending, actionsSent, actionsToApprove, onMode } = p;
  const simTab = useRef<HTMLButtonElement>(null);
  const liveTab = useRef<HTMLButtonElement>(null);
  const relayEnabled = Boolean(PUBLIC_RELAY_URL);
  const isSim = s.mode === "sim";
  const done = Object.values(s.recs).filter((r) => r.status === "done").length;
  const total = isSim ? getScenario(s.scenarioId).calls.length : 0;
  const incidents = s.engine.incidents.length;
  const freed = Math.max(0, done - incidents);
  const finished = isSim && s.clock >= scenarioEnd(s.scenarioId) + 1;
  const local = status.mode === "local";
  const onTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!relayEnabled || !onMode) return;
    const next = e.key === "Home" ? "sim" : e.key === "End" ? "live" :
      e.key === "ArrowLeft" || e.key === "ArrowRight" ? (isSim ? "live" : "sim") : null;
    if (!next) return;
    e.preventDefault();
    onMode(next);
    (next === "sim" ? simTab : liveTab).current?.focus();
  };
  return (
    <header className={`topbar${onMode ? " topbar-modes" : ""}`}>
      <img className="brand brand-light" src={logoLight.src} width={150} height={34} alt="Agente 112. Coordina, actúa y escala. Decide el operador." />
      <img className="brand brand-dark" src={logoDark.src} width={150} height={34} alt="Agente 112. Coordina, actúa y escala. Decide el operador." />

      {onMode && <div className="mode-picker">
        <div className="mode-tabs" role="tablist" aria-label="Modo de la consola">
          <button ref={simTab} type="button" role="tab" id="tab-sim" aria-controls="console-panel" aria-selected={isSim} tabIndex={isSim ? 0 : -1} onClick={() => onMode("sim")} onKeyDown={onTabKeyDown}>Simulación</button>
          <button ref={liveTab} type="button" role="tab" id="tab-live" aria-controls="console-panel" aria-selected={!isSim} tabIndex={!isSim ? 0 : -1} disabled={!relayEnabled} aria-describedby={relayEnabled ? undefined : "live-unavailable"} onClick={() => onMode("live")} onKeyDown={onTabKeyDown}>En directo (QR)</button>
        </div>
        {!relayEnabled && <p className="mode-notice" id="live-unavailable">{LIVE_UNAVAILABLE}</p>}
      </div>}

      {isSim ? <div className="playback" role="group" aria-label="Controles de la simulación">
        {s.running ? (
          <button className="btn btn-dark" onClick={p.onPause}><Icon name="pause" />Pausar</button>
        ) : (
          <button className="btn btn-dark" onClick={p.onPlay} disabled={finished}>
            <Icon name="play" />{s.clock === 0 ? "Iniciar" : finished ? "Terminado" : "Continuar"}
          </button>
        )}
        <div className="seg" role="group" aria-label="Velocidad">
          {([1, 4, 10] as Speed[]).map((v) => (
            <button key={v} aria-pressed={s.speed === v} onClick={() => p.onSpeed(v)} aria-label={`Velocidad por ${v}`}>×{v}</button>
          ))}
        </div>
        <button className="btn btn-icon" onClick={p.onReset} aria-label="Reiniciar" title="Reiniciar"><Icon name="restart" /></button>
        <span className="clock" title="Tiempo transcurrido en el escenario">
          <span className="sr-only">Tiempo del escenario </span>{mmss(s.clock)}
        </span>
        <span className={`engine ${local ? "on" : ""}`} title={local ? "Transcripción y extracción con modelos locales en esta máquina" : "Sin GPU ni internet: usa las extracciones grabadas del escenario. La agrupación y la prioridad se calculan en directo."}>
          <i aria-hidden="true" />{status.label}
        </span>
      </div> : <div className="live-indicator" role="status">
        <i aria-hidden="true" /><span>En directo · llamadas por QR</span>
        {s.arrived.length > 0 && <button type="button" className="btn btn-icon btn-sm" onClick={p.onReset} aria-label="Limpiar sesión en directo" title="Limpiar sesión en directo"><Icon name="restart" size={16} /></button>}
      </div>}

      <section className="kpis" aria-label="Resumen" aria-live="polite">
        <div className="kpi" data-kpi="calls" data-value={done}>
          <span className="kpi-val">{done}{isSim && <small>/{total}</small>}</span>
          <span className="kpi-label">llamadas</span>
        </div>
        <div className="kpi" data-kpi="incidents" data-value={incidents}>
          <span className="kpi-val">{incidents}</span>
          <span className="kpi-label">emergencias</span>
        </div>
        <div className="kpi good" data-kpi="freed" data-value={freed} title="Llamadas repetidas agrupadas: líneas que quedan libres">
          <span className="kpi-val">{freed}</span>
          <span className="kpi-label">repetidas</span>
        </div>
        <div className={`kpi ${pending > 0 ? "warn" : ""}`} data-kpi="pending" data-value={pending}>
          <span className="kpi-val">{pending}</span>
          <span className="kpi-label">por decidir</span>
        </div>
        {isSim && <div className="kpi" data-kpi="actions" data-value={actionsSent} title={`Acciones del agente enviadas a servicios${actionsToApprove ? ` · ${actionsToApprove} por aprobar` : ""}`}>
          <span className="kpi-val">{actionsSent}</span>
          <span className="kpi-label">{actionsSent === 1 ? "enviada" : "enviadas"}</span>
        </div>}
      </section>

      <div className="topbar-end">
        {p.onTheme && <button className="btn btn-ghost btn-icon" onClick={p.onTheme} aria-label={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"} title={theme === "dark" ? "Modo claro" : "Modo oscuro"}><Icon name={theme === "dark" ? "sun" : "moon"} /></button>}
        {p.onArchive && <button className="btn btn-ghost btn-icon btn-badge" onClick={p.onArchive} aria-label={`Incidencias archivadas (${p.archived ?? 0})`} title="Incidencias archivadas"><Icon name="archive" />{!!p.archived && <span className="dot-count">{p.archived}</span>}</button>}
        <Link href="/presentacion" className="btn btn-ghost btn-icon deck-link" aria-label="Presentación" title="Presentación"><Icon name="slides" /></Link>
        <button className="btn btn-ghost btn-icon" onClick={p.onHelp} aria-label="Cómo funciona" title="Cómo funciona"><Icon name="help" /></button>
        <button className="btn btn-ghost btn-icon" onClick={p.onExport} disabled={s.audit.length === 0} aria-label="Exportar registro" title="Descarga en JSON cada decisión de la IA y del operador"><Icon name="download" /></button>
        {isSim && <label className="scn">
          <span className="sr-only">Escenario</span>
          <select value={s.scenarioId} onChange={(e) => p.onScenario(e.target.value)} aria-label="Escenario">
            {SCENARIOS.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>}
      </div>
    </header>
  );
}
