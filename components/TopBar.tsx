import { SCENARIO_END } from "@/lib/useConsole";
import type { ConsoleState, EngineStatus, Speed } from "@/lib/useConsole";
import { scenario } from "@/data/scenario-dana-malaga";
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
}

export default function TopBar({ s, status, pending, onPlay, onPause, onSpeed, onReset, onExport }: Props) {
  const done = Object.values(s.recs).filter((r) => r.status === "done").length;
  const incidents = s.engine.incidents.length;
  const freed = Math.max(0, done - incidents);
  const finished = s.clock >= SCENARIO_END + 1;
  return (
    <header className="topbar">
      <div className="topbar-row">
        <span className="brand">Copiloto 112</span>
        <span className="scn">{scenario.name}</span>
        <span className="clock" aria-label="Tiempo del escenario">T+{mmss(s.clock)}</span>
        <div className="controls" role="group" aria-label="Controles del escenario">
          {s.running ? (
            <button className="btn primary" onClick={onPause}>Pausar</button>
          ) : (
            <button className="btn primary" onClick={onPlay} disabled={finished}>
              {s.clock === 0 ? "Iniciar" : "Continuar"}
            </button>
          )}
          {([1, 4, 10] as Speed[]).map((v) => (
            <button key={v} className="btn" aria-pressed={s.speed === v} onClick={() => onSpeed(v)} aria-label={`Velocidad por ${v}`}>
              ×{v}
            </button>
          ))}
          <button className="btn" onClick={onReset}>Reiniciar</button>
        </div>
      </div>
      <div className="topbar-row">
        <div className="counters" aria-live="polite" style={{ marginRight: "auto" }}>
          <span><b>{done}</b> llamadas → <b>{incidents}</b> incidentes</span>
          <span><b>{freed}</b> líneas liberadas</span>
          {pending > 0 ? (
            <span className="pending-chip">{pending} {pending === 1 ? "decisión pendiente" : "decisiones pendientes"}</span>
          ) : (
            <span>Sin decisiones pendientes</span>
          )}
        </div>
        <button className="btn" style={{ minHeight: 26, padding: "0 8px", fontSize: 13 }} onClick={onExport} disabled={s.audit.length === 0}>Exportar registro</button>
        <span className={`engine ${status.mode === "local" ? "local" : ""}`} >{status.label}</span>
      </div>
    </header>
  );
}
