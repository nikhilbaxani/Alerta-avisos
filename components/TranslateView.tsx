import { TYPE_LABELS } from "@/lib/labels";
import { callMeta } from "@/lib/useConsole";
import type { ConsoleState, Reply } from "@/lib/useConsole";
import Icon from "./Icon";
import ReplyPanel from "./ReplyPanel";
import type { CallAudio } from "./useCallAudio";
import { langName, mmss, placeOf } from "./format";

interface Props {
  s: ConsoleState;
  localAI: boolean;
  audio?: CallAudio;
  onSelect: (id: string) => void;
  onReply: (r: Reply) => void;
}

/** Zona de traducción: emergencias con llamantes en otros idiomas, lo que dijeron y la respuesta en su idioma. */
export default function TranslateView({ s, localAI, audio, onSelect, onReply }: Props) {
  const langsOf = (callIds: string[]) => [...new Set(callIds.map((id) => s.calls[id]?.extraction.language ?? "es"))];
  const list = s.engine.incidents
    .map((i) => ({ inc: i, foreign: langsOf(i.callIds).filter((l) => l !== "es") }))
    .filter((x) => x.foreign.length > 0);
  const cur = list.find((x) => x.inc.id === s.selected) ?? list[0];

  return (
    <div className="view view-translate">
      <section className="panel" aria-labelledby="trl-h">
        <div className="panel-head">
          <h2 id="trl-h">Llamantes en otros idiomas</h2>
          <span className="panel-count">{list.length}</span>
        </div>
        {list.length === 0 ? (
          <p className="empty">Cuando llame alguien en otro idioma, su emergencia aparecerá aquí con la traducción y las frases para responderle.</p>
        ) : (
          <ul className="tr-list">
            {list.map(({ inc, foreign }) => (
              <li key={inc.id} className={inc.id === cur?.inc.id ? "is-sel" : ""}>
                <button onClick={() => onSelect(inc.id)} aria-current={inc.id === cur?.inc.id} aria-label={`${foreign.map(langName).join(", ")}: ${inc.id} · ${TYPE_LABELS[inc.type]}, ${placeOf(inc)}`}>
                  <span className="call-ico" aria-hidden="true"><Icon name="globe" size={19} /></span>
                  <span className="call-main">
                    <span className="tr-langs">{foreign.map(langName).join(", ")}</span>
                    <span className="call-text">{TYPE_LABELS[inc.type]} · {placeOf(inc)}</span>
                    <span className="tr-sub">{inc.id}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel" aria-label="Traducción y respuesta">
        {!cur ? (
          <div className="detail detail-empty"><p>Sin llamantes en otros idiomas por ahora. Las llamadas en castellano no necesitan traducción.</p></div>
        ) : (
          <>
            <div className="panel-head">
              <h2>{TYPE_LABELS[cur.inc.type]} · {placeOf(cur.inc)}</h2>
              <span className="panel-count">{cur.inc.id}</span>
            </div>
            <div className="tr-body">
              <ReplyPanel key={cur.inc.id} incidentId={cur.inc.id} langs={langsOf(cur.inc.callIds)} clock={s.clock} localAI={localAI} replies={s.replies} onReply={onReply} />
              <div className="block">
                <h3>Lo que dijo el llamante</h3>
                <div className="callcards">
                  {cur.inc.callIds.filter((id) => (s.calls[id]?.extraction.language ?? "es") !== "es").map((id) => {
                    const call = callMeta(s, id)!;
                    const ex = s.calls[id]!.extraction;
                    return (
                      <article className="callcard" key={id}>
                        <header>
                          <b>{id}</b>
                          <span>{mmss(call.t)}</span>
                          <span>{langName(ex.language)}</span>
                          <span className="phone">{call.phone}</span>
                          {audio?.hasAudio(id) && (
                            audio.playing === id ? (
                              <button className="btn btn-sm btn-listen is-on" onClick={audio.stop} aria-label={`Detener la llamada ${id}`}><Icon name="stop" size={14} />Detener</button>
                            ) : (
                              <button className="btn btn-sm btn-listen" onClick={() => audio.play(id)} aria-label={`Escuchar la llamada ${id}`}><Icon name="speaker" size={15} />Escuchar</button>
                            )
                          )}
                        </header>
                        <div className="cols2">
                          <div>
                            <h4>Original · {langName(ex.language)}</h4>
                            <p lang={ex.language} dir={ex.language === "ar" ? "rtl" : "ltr"}>{call.transcript}</p>
                          </div>
                          <div>
                            <h4>Traducción al castellano</h4>
                            <p>{ex.translation_es ?? ex.summary_es}</p>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
