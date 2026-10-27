import { priorityBreakdown, rankIncidents } from "@/lib/priority";
import { SEVERITY_LABELS, TYPE_LABELS } from "@/lib/labels";
import type { ConsoleState } from "@/lib/useConsole";

export default function PriorityList({ s, onSelect }: { s: ConsoleState; onSelect: (id: string) => void }) {
  const ranked = rankIncidents(s.engine.incidents, s.clock);
  return (
    <>
      <div className="col-head"><span>Prioridad</span><span>{ranked.length} incidentes</span></div>
      {ranked.length === 0 ? (
        <p className="empty">Todavía no hay incidentes.</p>
      ) : (
        <ol className="prio">
          {ranked.map((i, n) => {
            const b = priorityBreakdown(i, s.clock);
            return (
              <li key={i.id} className={`${i.id === s.selected ? "sel" : ""} ${i.provisional ? "prov" : ""}`}>
                <button onClick={() => onSelect(i.id)} aria-current={i.id === s.selected}>
                  <span className="rank">{n + 1}</span>
                  <span className="title">{i.id} · {TYPE_LABELS[i.type]}{i.provisional ? " · por decidir" : ""}</span>
                  <span className={`sev s${i.severity}`}>{SEVERITY_LABELS[i.severity]}</span>
                  <span className="why">{b.reasons.join(" · ")}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
