import { RISK_LABELS, SEVERITY_LABELS, TYPE_LABELS } from "@/lib/labels";
import { rankIncidents } from "@/lib/priority";
import { callMeta } from "@/lib/useConsole";
import type { ConsoleState, Reply } from "@/lib/useConsole";
import type { RiskTag } from "@/lib/types";
import { actionIncidents } from "@/lib/actions";
import type { AgentAction } from "@/lib/actions";
import Icon from "./Icon";
import AgentActions from "./AgentActions";
import ReplyPanel from "./ReplyPanel";
import { langName, mmss, placeOf, plural } from "./format";

interface Props {
  s: ConsoleState;
  localAI: boolean;
  onSplit: (callId: string) => void;
  onReply: (r: Reply) => void;
  actions: AgentAction[];
  onApprove: (key: string) => void;
  onDiscard: (key: string) => void;
}

const URGENT: RiskTag[] = ["vida", "inconsciente", "sin_respuesta", "dolor_pecho", "atrapados", "menor", "cables_electricos"];

export default function IncidentDetail({ s, localAI, onSplit, onReply, actions, onApprove, onDiscard }: Props) {
  const inc = s.engine.incidents.find((i) => i.id === s.selected);
  if (!inc) {
    return (
      <section className="detail detail-empty" aria-label="Detalle del incidente">
        <p>Elige una emergencia de la lista o del mapa para ver qué se sabe, escuchar las llamadas y responder en el idioma del llamante.</p>
      </section>
    );
  }
  const rank = rankIncidents(s.engine.incidents, s.clock).findIndex((i) => i.id === inc.id) + 1;
  const langs = [...new Set(inc.callIds.map((id) => s.calls[id]?.extraction.language ?? "es"))];
  const foreign = langs.filter((l) => l !== "es");
  return (
    <section className="detail" aria-labelledby="detail-h">
      <header className="detail-head">
        <p className="detail-kicker">{inc.id} · prioridad {rank}{inc.provisional ? ` · pendiente de decidir si es ${inc.linkedTo}` : ""}</p>
        <h2 id="detail-h">{TYPE_LABELS[inc.type]}</h2>
        {placeOf(inc) && <p className="detail-place">{placeOf(inc)}</p>}
        <p className="detail-summary">{inc.summary}</p>
        <ul className="facts">
          <li className={`badge sev-${inc.severity}`}>Gravedad {inc.severity}/5 · {SEVERITY_LABELS[inc.severity]}</li>
          {inc.people > 0 && <li><Icon name="people" size={15} />{plural(inc.people, "persona", "personas")} en peligro</li>}
          <li><Icon name="phone" size={15} />{plural(inc.callIds.length, "llamada", "llamadas")}</li>
          {foreign.length > 0 && <li><Icon name="globe" size={15} />{foreign.map(langName).join(", ")}</li>}
        </ul>
      </header>

      {inc.alerts.length > 0 && (
        <div className="newinfo" role="status">
          <Icon name="alert" size={18} />
          <div>
            <b>Información nueva de llamadas repetidas</b>
            <ul>
              {inc.alerts.map((a) => (
                <li key={a.callId + a.t}>{a.risks.map((r) => RISK_LABELS[r]).join(", ")} <span>· llamada {a.callId}, {mmss(a.t)}</span></li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <AgentActions
        actions={actions.filter((a) => actionIncidents(a).includes(inc.id))}
        provisional={inc.provisional}
        onApprove={onApprove}
        onDiscard={onDiscard}
      />

      {inc.risks.length > 0 && (
        <div className="block">
          <h3>Riesgos detectados</h3>
          <ul className="tags">
            {inc.risks.map((r) => (
              <li key={r} className={URGENT.includes(r) ? "urgent" : ""}>{RISK_LABELS[r]}</li>
            ))}
          </ul>
        </div>
      )}

      <ReplyPanel key={inc.id} incidentId={inc.id} langs={langs} clock={s.clock} localAI={localAI} replies={s.replies} onReply={onReply} />

      <div className="block">
        <h3>Llamadas de esta emergencia</h3>
        <div className="callcards">
          {inc.callIds.map((id) => {
            const call = callMeta(s, id)!;
            const ex = s.calls[id]!.extraction;
            const translated = ex.language !== "es" && ex.translation_es;
            return (
              <article className="callcard" key={id}>
                <header>
                  <b>{id}</b>
                  <span>{mmss(call.t)}</span>
                  <span>{langName(ex.language)}</span>
                  <span className="phone">{call.phone}</span>
                  {inc.callIds.length > 1 && (
                    <button className="btn btn-sm" onClick={() => onSplit(id)} aria-label={`Separar llamada ${id}`} title="Si no pertenece a esta emergencia, sácala a un incidente propio">
                      <Icon name="split" size={15} />Separar
                    </button>
                  )}
                </header>
                {translated ? (
                  <div className="cols2">
                    <div>
                      <h4>Original · {langName(ex.language)}</h4>
                      <p lang={ex.language} dir={ex.language === "ar" ? "rtl" : "ltr"}>{call.transcript}</p>
                    </div>
                    <div>
                      <h4>Traducción al castellano</h4>
                      <p>{ex.translation_es}</p>
                    </div>
                  </div>
                ) : (
                  <p className="transcript">{call.transcript}</p>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
