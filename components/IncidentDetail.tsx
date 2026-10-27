import { RISK_LABELS, SEVERITY_LABELS, TYPE_LABELS, LANG_NAMES } from "@/lib/labels";
import { callMeta } from "@/lib/useConsole";
import type { ConsoleState, Reply } from "@/lib/useConsole";
import ReplyPanel from "./ReplyPanel";
import { mmss } from "./format";

interface Props {
  s: ConsoleState;
  localAI: boolean;
  onSplit: (callId: string) => void;
  onReply: (r: Reply) => void;
}

export default function IncidentDetail({ s, localAI, onSplit, onReply }: Props) {
  const inc = s.engine.incidents.find((i) => i.id === s.selected);
  if (!inc) {
    return <div className="detail"><p className="empty" style={{ padding: 0 }}>Selecciona un incidente para ver el detalle.</p></div>;
  }
  const langs = [...new Set(inc.callIds.map((id) => s.calls[id]?.extraction.language ?? "es"))];
  return (
    <div className="detail" aria-label={`Detalle de ${inc.id}`}>
      <div>
        <h2>{inc.id} · {TYPE_LABELS[inc.type]}</h2>
        <p style={{ margin: "2px 0 6px" }}>{inc.summary}</p>
        <div className="chips">
          <span className={`chip ${inc.severity >= 5 ? "red" : ""}`}>Gravedad {inc.severity}/5 · {SEVERITY_LABELS[inc.severity]}</span>
          {inc.people > 0 && <span className="chip">{inc.people} {inc.people === 1 ? "persona" : "personas"} en peligro</span>}
          <span className="chip">{inc.callIds.length} {inc.callIds.length === 1 ? "llamada" : "llamadas"}</span>
          {inc.provisional && <span className="chip" style={{ background: "var(--amber)" }}>Por decidir</span>}
        </div>
      </div>

      {inc.alerts.length > 0 && (
        <div>
          <h3>Información nueva</h3>
          {inc.alerts.map((a) => (
            <p key={a.callId + a.t} className="newinfo">
              <b>{a.risks.map((r) => RISK_LABELS[r]).join(", ")}</b> · llamada {a.callId} a las {mmss(a.t)}
            </p>
          ))}
        </div>
      )}

      <div>
        <h3>Riesgos</h3>
        <div className="chips">
          {inc.risks.map((r) => (
            <span key={r} className={`chip ${r === "vida" ? "red" : ""}`}>{RISK_LABELS[r]}</span>
          ))}
        </div>
      </div>

      <div>
        <h3>Llamadas (original | traducción)</h3>
        <div style={{ display: "grid", gap: 8 }}>
          {inc.callIds.map((id) => {
            const call = callMeta(s, id)!;
            const ex = s.calls[id]!.extraction;
            return (
              <article className="callcard" key={id}>
                <header>
                  <b>{id}</b>
                  <span>{mmss(call.t)}</span>
                  <span>{LANG_NAMES[ex.language] ?? ex.language}</span>
                  <span>{call.phone}</span>
                  {inc.callIds.length > 1 && (
                    <button className="btn" onClick={() => onSplit(id)} aria-label={`Separar llamada ${id}`}>Separar llamada</button>
                  )}
                </header>
                <div className="cols2">
                  <div>
                    <h4>Original</h4>
                    <p lang={ex.language} dir={ex.language === "ar" ? "rtl" : "ltr"}>{call.transcript}</p>
                  </div>
                  <div>
                    <h4>Castellano</h4>
                    <p>{ex.translation_es ?? call.transcript}</p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      <ReplyPanel key={inc.id} incidentId={inc.id} langs={langs} clock={s.clock} localAI={localAI} replies={s.replies} onReply={onReply} />
    </div>
  );
}
