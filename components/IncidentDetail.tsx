import { RISK_LABELS, SEVERITY_LABELS, TYPE_LABELS } from "@/lib/labels";
import { rankIncidents } from "@/lib/priority";
import { callMeta } from "@/lib/useConsole";
import { resolveBlocker } from "@/lib/engine";
import { incidentMissing } from "@/lib/missingInfo";
import { ecallFields, isEcall } from "@/lib/ecall";
import type { ConsoleState } from "@/lib/useConsole";
import type { RiskTag } from "@/lib/types";
import Icon from "./Icon";
import IncToken from "./IncToken";
import ResolveButton from "./ResolveButton";
import type { Ask } from "./ReplyPanel";
import type { CallAudio } from "./useCallAudio";
import { hasIdentifiedLanguage, langName, mmss, placeOf, plural } from "./format";

interface Props {
  s: ConsoleState;
  onSplit: (callId: string) => void;
  audio?: CallAudio;
  onResolve: (id: string) => void;
  ask?: Ask | null;
  /** Prepara la pregunta en la caja de traducción (si hay llamante extranjero) o la muestra para leerla. */
  onAsk?: (incidentId: string, phraseId: string, foreign: boolean) => void;
}

const URGENT: RiskTag[] = ["vida", "inconsciente", "sin_respuesta", "dolor_pecho", "atrapados", "menor", "cables_electricos"];

export default function IncidentDetail({ s, onSplit, audio, onResolve, ask, onAsk }: Props) {
  const inc = s.engine.incidents.find((i) => i.id === s.selected);
  if (!inc) {
    return (
      <section className="detail detail-empty" aria-label="Detalle del incidente">
        <p>Elige una emergencia en el mapa o en la lista para ver qué se sabe de ella y escuchar sus llamadas.</p>
      </section>
    );
  }
  const rank = rankIncidents(s.engine.incidents, s.clock).findIndex((i) => i.id === inc.id) + 1;
  const langs = [...new Set(inc.callIds.map((id) => s.calls[id]?.extraction.language ?? "es"))];
  const foreign = langs.filter((l) => l !== "es" && hasIdentifiedLanguage(l));
  const missing = incidentMissing(inc, s.calls);
  const asked = ask?.incidentId === inc.id ? missing.find((m) => m.phraseId === ask.phraseId) : undefined;
  const inLang = foreign.length > 0 ? `en ${langName(foreign[0]).toLowerCase()}` : "en castellano";
  return (
    <section className="detail" aria-labelledby="detail-h">
      <header className="detail-head">
        <div className="detail-top">
          <p className="detail-kicker"><IncToken inc={inc} rank={rank} /> prioridad {rank}{inc.provisional ? ` · pendiente de decidir si es ${inc.linkedTo}` : ""}</p>
          <ResolveButton incidentId={inc.id} blocker={resolveBlocker(s.engine, inc.id)} onResolve={onResolve} small />
        </div>
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

      {missing.length > 0 && (
        <section className="block missing" aria-labelledby="missing-h">
          <h3 id="missing-h"><Icon name="help" size={15} />Falta saber</h3>
          <p className="note">Guía para preguntar: la IA no decide. {foreign.length > 0 ? `Pulsa una para prepararla ${inLang}; tú decides cuándo reproducirla.` : "Pulsa una para ver la pregunta y leerla al llamante."}</p>
          <ul className="missing-list">
            {missing.map((m) => (
              <li key={m.id}>
                <button
                  className="phrase missing-item"
                  data-missing={m.id}
                  aria-pressed={asked?.id === m.id}
                  aria-label={`Preparar la pregunta ${inLang}: ${m.label}`}
                  onClick={() => onAsk?.(inc.id, m.phraseId, foreign.length > 0)}
                >
                  <b>{m.label}</b>
                  <span>{m.phrase.es}</span>
                </button>
              </li>
            ))}
          </ul>
          {asked && foreign.length === 0 && (
            <p className="said-box said missing-said" role="status">{asked.phrase.es}</p>
          )}
          {asked && foreign.length > 0 && (
            <p className="note" role="status">Preparada {inLang} en la caja de traducción. Pulsa «Reproducir al llamante» cuando quieras.</p>
          )}
        </section>
      )}

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

      <div className="block">
        <h3>Llamadas de esta emergencia</h3>
        <div className="callcards">
          {inc.callIds.map((id) => {
            const call = callMeta(s, id)!;
            const ex = s.calls[id]!.extraction;
            const translated = ex.language !== "es" && ex.translation_es;
            const ecall = isEcall(call) && call.ecall ? call.ecall : null;
            return (
              <article className={`callcard ${ecall ? "is-ecall" : ""}`} key={id} data-callcard={id} data-channel={ecall ? "ecall" : "voice"}>
                <header>
                  <b>{id}</b>
                  <span>{mmss(call.t)}</span>
                  {ecall ? <span className="chan-ecall"><Icon name="car" size={13} />eCall</span> : <span>{langName(ex.language)}</span>}
                  <span className="phone">{call.phone}</span>
                  {ecall && <span className="no-voice">Mensaje de datos (sin voz)</span>}
                  {audio?.hasAudio(id) && (
                    audio.playing === id ? (
                      <button className="btn btn-sm btn-listen is-on" onClick={audio.stop} aria-label={`Detener la llamada ${id}`}><Icon name="stop" size={14} />Detener</button>
                    ) : (
                      <button className="btn btn-sm btn-listen" onClick={() => audio.play(id)} aria-label={`Escuchar la llamada ${id}`}><Icon name="speaker" size={15} />Escuchar</button>
                    )
                  )}
                  {inc.callIds.length > 1 && (
                    <button className="btn btn-sm" onClick={() => onSplit(id)} aria-label={`Separar llamada ${id}`} title="Si no pertenece a esta emergencia, sácala a un incidente propio">
                      <Icon name="split" size={15} />Separar
                    </button>
                  )}
                </header>
                {ecall ? (
                  <dl className="ecall-data" aria-label={`Datos de la eCall ${id}`}>
                    {ecallFields(ecall, call.aml).map((f) => (
                      <div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>
                    ))}
                  </dl>
                ) : translated ? (
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
