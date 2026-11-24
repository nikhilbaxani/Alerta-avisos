import { priorityBreakdown, rankIncidents } from "@/lib/priority";
import { SEVERITY_LABELS, TYPE_LABELS } from "@/lib/labels";
import type { ConsoleState } from "@/lib/useConsole";
import { placeOf, toneOf } from "./format";

export default function PriorityList({ s, onSelect, pendingActions = {} }: { s: ConsoleState; onSelect: (id: string) => void; pendingActions?: Record<string, number> }) {
  const ranked = rankIncidents(s.engine.incidents, s.clock);
  return (
    <section className="box" id="box-prio" aria-labelledby="prio-h">
      <div className="panel-head">
        <h2 id="prio-h">Emergencias por prioridad</h2>
        <span className="panel-count">{ranked.length}</span>
      </div>
      {ranked.length === 0 ? (
        <p className="empty box-body">Cuando entren llamadas, las emergencias se ordenarán aquí de más a menos urgente.</p>
      ) : (
        <ol className="prio box-body">
          {ranked.map((i, n) => {
            const b = priorityBreakdown(i, s.clock);
            const tone = toneOf(i);
            const why = b.reasons.slice(1).join(" · ");
            return (
              <li key={i.id} className={`tone-${tone} ${i.id === s.selected ? "is-sel" : ""}`}>
                <button
                  onClick={() => onSelect(i.id)}
                  aria-current={i.id === s.selected}
                  aria-label={`Prioridad ${n + 1}: ${i.id} · ${TYPE_LABELS[i.type]}, ${placeOf(i)}. Gravedad ${SEVERITY_LABELS[i.severity]}${i.provisional ? ", pendiente de tu decisión" : ""}. ${why}`}
                >
                  <span className="rank">{n + 1}</span>
                  <span className="prio-main">
                    <span className="prio-title">{TYPE_LABELS[i.type]}</span>
                    <span className="prio-place">{placeOf(i)}</span>
                    {why && <span className="prio-why">{why}</span>}
                  </span>
                  <span className="prio-side">
                    {i.provisional ? <span className="badge badge-ask">Decidir</span> : <span className={`badge sev-${i.severity}`}>{SEVERITY_LABELS[i.severity]}</span>}
                    {pendingActions[i.id] ? <span className="badge badge-todo">{pendingActions[i.id]} por aprobar</span> : null}
                    <span className="prio-id">{i.id}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
