import { scenario } from "@/data/scenario-dana-malaga";
import type { ConsoleState } from "@/lib/useConsole";
import { mmss } from "./format";

export default function CallQueue({ s, onSelect }: { s: ConsoleState; onSelect: (incidentId: string) => void }) {
  const list = [...s.arrived].reverse();
  return (
    <section className="col calls-col" aria-label="Cola de llamadas">
      <div className="col-head"><span>Llamadas</span><span>{s.arrived.length} de {scenario.calls.length}</span></div>
      {list.length === 0 ? (
        <p className="empty">Pulsa Iniciar para reproducir el escenario. Las llamadas aparecerán aquí según entran.</p>
      ) : (
        <ul className="calls">
          {list.map((id) => {
            const call = scenario.calls.find((c) => c.id === id)!;
            const rec = s.recs[id];
            const incId = s.engine.assignment[id];
            const inc = s.engine.incidents.find((i) => i.id === incId);
            const gray = !!inc?.provisional && inc.callIds[0] === id;
            const text = rec.result?.extraction.summary_es ?? call.transcript;
            return (
              <li key={id} className={`call ${gray ? "gray" : ""} ${incId && incId === s.selected ? "sel" : ""}`}>
                <button disabled={!incId} onClick={() => incId && onSelect(incId)} aria-label={`Llamada ${id}, ${text}`}>
                  <div className="call-meta">
                    <span className="t">{mmss(call.t)}</span>
                    <span className="lang">{call.lang}</span>
                    <span>{id}</span>
                    <span className="inc">
                      {rec.status === "queued" && "En cola"}
                      {rec.status === "processing" && "Procesando…"}
                      {rec.status === "error" && "Error"}
                      {rec.status === "done" && (gray ? `Decidir · ${incId}` : incId)}
                    </span>
                  </div>
                  <div className="call-text">{text}</div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
