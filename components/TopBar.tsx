import { scenarioEnd } from "@/lib/useConsole";
import type { ConsoleState, EngineStatus, Speed } from "@/lib/useConsole";
import { SCENARIOS, getScenario } from "@/data/scenarios";
import animatedLogo from "@/docs/marca/avance-112/avance-112-animado.svg";
import staticLogo from "@/docs/marca/avance-112/avance-112.png";
import Icon from "./Icon";
import { mmss } from "./format";

interface Props {
  s: ConsoleState;
  status: EngineStatus;
  pending: number;
  onPlay: () => void;
  onPause: () => void;
  onSpeed: (v: Speed) => void;
  onReset: () => void;
  onExport: () => void;
  onScenario: (id: string) => void;
  onHelp: () => void;
}

export default function TopBar({ s, status, pending, onPlay, onPause, onSpeed, onReset, onExport, onScenario, onHelp }: Props) {
  const done = Object.values(s.recs).filter((r) => r.status === "done").length;
  const total = getScenario(s.scenarioId).calls.length;
  const incidents = s.engine.incidents.length;
  const freed = Math.max(0, done - incidents);
  const finished = s.clock >= scenarioEnd(s.scenarioId) + 1;
  const local = status.mode === "local";
  return (
    <>
      <header className="topbar">
        <picture className="brand">
          <source media="(prefers-reduced-motion: reduce)" srcSet={staticLogo.src} />
          <img className="brand-logo" src={animatedLogo.src} width={1100} height={300}
            alt="Avance 112. La IA propone. El operador decide." />
        </picture>

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

        <div className="topbar-end">
          <span
            className={`engine ${local ? "on" : ""}`}
            title={local ? "Transcripción y extracción con modelos locales en esta máquina" : "Sin GPU ni internet: usa las extracciones grabadas del escenario. La agrupación y la prioridad se calculan en directo."}
          >
            <i aria-hidden="true" />{status.label}
          </span>
          <button className="btn btn-ghost" onClick={onHelp} aria-label="Cómo funciona"><Icon name="help" /><span className="btn-text">Cómo funciona</span></button>
          <button className="btn btn-ghost" onClick={onExport} disabled={s.audit.length === 0} aria-label="Exportar registro" title="Descarga en JSON cada decisión de la IA y del operador">
            <Icon name="download" /><span className="btn-text">Exportar registro</span>
          </button>
        </div>
      </header>

      <section className="kpis" aria-label="Resumen" aria-live="polite">
        <div className="kpi" data-kpi="calls" data-value={done}>
          <span className="kpi-val">{done}<small> / {total}</small></span>
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
