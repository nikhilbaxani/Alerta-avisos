import { scenarioEnd } from "@/lib/useConsole";
import type { ConsoleState, EngineStatus, Speed } from "@/lib/useConsole";
import { SCENARIOS, getScenario } from "@/data/scenarios";
import animatedLogo from "@/docs/marca/avance-112/avance-112-animado.svg";
import staticLogo from "@/docs/marca/avance-112/avance-112.png";
import animatedLogoDark from "@/docs/marca/avance-112/avance-112-animado-oscuro.svg";
import staticLogoDark from "@/docs/marca/avance-112/avance-112-oscuro.png";
import Icon from "./Icon";
import { mmss } from "./format";

export type Theme = "dark" | "light";

interface Props {
  s: ConsoleState;
  status: EngineStatus;
  theme: Theme;
  pending: number;
  actionsSent: number;
  actionsToApprove: number;
  onTheme: () => void;
  onPlay: () => void;
  onPause: () => void;
  onSpeed: (v: Speed) => void;
  onReset: () => void;
  onExport: () => void;
  onScenario: (id: string) => void;
  onHelp: () => void;
  archived: number;
  onArchive: () => void;
}

/** Cabecera única: marca, simulación, cifras de la sala y ajustes. */
export default function TopBar(p: Props) {
  const { s, status, theme, pending, actionsSent, actionsToApprove } = p;
  const done = Object.values(s.recs).filter((r) => r.status === "done").length;
  const total = getScenario(s.scenarioId).calls.length;
  const incidents = s.engine.incidents.length;
  const freed = Math.max(0, done - incidents);
  const finished = s.clock >= scenarioEnd(s.scenarioId) + 1;
  const local = status.mode === "local";
  return (
    <header className="topbar">
      {/* Una versión del logo por tema: tinta oscura sobre claro y clara sobre oscuro. */}
      <picture className="brand brand-light">
        <source media="(prefers-reduced-motion: reduce)" srcSet={staticLogo.src} />
        <img className="brand-logo" src={animatedLogo.src} width={1100} height={300} alt="Avance 112. La IA propone. El operador decide." />
      </picture>
      <picture className="brand brand-dark">
        <source media="(prefers-reduced-motion: reduce)" srcSet={staticLogoDark.src} />
        <img className="brand-logo" src={animatedLogoDark.src} width={1100} height={300} alt="Avance 112. La IA propone. El operador decide." />
      </picture>

      <div className="playback" role="group" aria-label="Controles de la simulación">
        {s.running ? (
          <button className="btn btn-dark" onClick={p.onPause}><Icon name="pause" />Pausar</button>
        ) : (
          <button className="btn btn-dark" onClick={p.onPlay} disabled={finished}>
            <Icon name="play" />{s.clock === 0 ? "Iniciar" : finished ? "Terminado" : "Continuar"}
          </button>
        )}
        <div className="seg" role="group" aria-label="Velocidad">
          {([1, 4, 10] as Speed[]).map((v) => (
            <button key={v} aria-pressed={s.speed === v} onClick={() => p.onSpeed(v)} aria-label={`Velocidad por ${v}`}>
              ×{v}
            </button>
          ))}
        </div>
        <button className="btn btn-icon" onClick={p.onReset} aria-label="Reiniciar" title="Reiniciar"><Icon name="restart" /></button>
        <span className="clock" title="Tiempo transcurrido en el escenario">
          <span className="sr-only">Tiempo del escenario </span>{mmss(s.clock)}
        </span>
        <span
          className={`engine ${local ? "on" : ""}`}
          title={local ? "Transcripción y extracción con modelos locales en esta máquina" : "Sin GPU ni internet: usa las extracciones grabadas del escenario. La agrupación y la prioridad se calculan en directo."}
        >
          <i aria-hidden="true" />{status.label}
        </span>
      </div>

      <section className="kpis" aria-label="Resumen" aria-live="polite">
        <div className="kpi" data-kpi="calls" data-value={done}>
          <span className="kpi-val">{done}<small>/{total}</small></span>
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
        <div className="kpi" data-kpi="actions" data-value={actionsSent} title={`Acciones del agente enviadas a servicios${actionsToApprove ? ` · ${actionsToApprove} por aprobar` : ""}`}>
          <span className="kpi-val">{actionsSent}</span>
          <span className="kpi-label">{actionsSent === 1 ? "enviada" : "enviadas"}</span>
        </div>
      </section>

      <div className="topbar-end">
        <button
          className="btn btn-ghost btn-icon"
          onClick={p.onTheme}
          aria-label={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
          title={theme === "dark" ? "Modo claro" : "Modo oscuro"}
        >
          <Icon name={theme === "dark" ? "sun" : "moon"} />
        </button>
        <button className="btn btn-ghost btn-icon btn-badge" onClick={p.onArchive} aria-label={`Incidencias archivadas (${p.archived})`} title="Incidencias archivadas">
          <Icon name="archive" />{p.archived > 0 && <span className="dot-count">{p.archived}</span>}
        </button>
        <button className="btn btn-ghost btn-icon" onClick={p.onHelp} aria-label="Cómo funciona" title="Cómo funciona"><Icon name="help" /></button>
        <button className="btn btn-ghost btn-icon" onClick={p.onExport} disabled={s.audit.length === 0} aria-label="Exportar registro" title="Descarga en JSON cada decisión de la IA y del operador">
          <Icon name="download" />
        </button>
        <label className="scn">
          <span className="sr-only">Escenario</span>
          <select value={s.scenarioId} onChange={(e) => p.onScenario(e.target.value)} aria-label="Escenario">
            {SCENARIOS.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>
      </div>
    </header>
  );
}
