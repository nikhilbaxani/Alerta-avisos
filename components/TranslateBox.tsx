import { TYPE_LABELS } from "@/lib/labels";
import type { ConsoleState, Reply } from "@/lib/useConsole";
import IncToken, { ranksOf } from "./IncToken";
import ReplyPanel, { type Ask } from "./ReplyPanel";
import { hasIdentifiedLanguage, langName, placeOf } from "./format";

interface Props {
  s: ConsoleState;
  ask?: Ask | null;
  localAI: boolean;
  onSelect: (id: string) => void;
  onReply: (r: Reply) => void;
}

/** Caja de traducción: responder en su idioma al llamante de la emergencia seleccionada. */
export default function TranslateBox({ s, ask, localAI, onSelect, onReply }: Props) {
  const langsOf = (callIds: string[]) => [...new Set(callIds.map((id) => s.calls[id]?.extraction.language ?? "es"))];
  const list = s.engine.incidents
    .map((i) => ({ inc: i, foreign: langsOf(i.callIds).filter((l) => l !== "es" && hasIdentifiedLanguage(l)) }))
    .filter((x) => x.foreign.length > 0)
    .sort((a, b) => Number(b.inc.id === s.selected) - Number(a.inc.id === s.selected)); // la abierta, primero
  const cur = list.find((x) => x.inc.id === s.selected);
  const sel = s.engine.incidents.find((i) => i.id === s.selected);
  const unidentified = sel ? langsOf(sel.callIds).find((l) => !hasIdentifiedLanguage(l)) : undefined;
  const ranks = ranksOf(s);

  return (
    <section className="box" id="box-translate" tabIndex={-1} aria-labelledby="tr-h">
      <div className="panel-head">
        <h2 id="tr-h">Traducción</h2>
        <span className="panel-count">{list.length ? `${list.length} con otro idioma` : ""}</span>
      </div>
      {list.length > 0 && (
          <div className="filter-row" role="group" aria-label="Emergencias con llamantes en otro idioma">
            {list.map(({ inc, foreign }) => (
              <button
                key={inc.id}
                className="chip"
                aria-pressed={inc.id === cur?.inc.id}
                onClick={() => onSelect(inc.id)}
                title={`${TYPE_LABELS[inc.type]} · ${placeOf(inc)}`}
              >
                <IncToken inc={inc} rank={ranks.get(inc.id) ?? 0} />{foreign.map(langName).join(", ")}
              </button>
            ))}
          </div>
      )}
      <div className="box-body tr-body">
        {cur ? (
          <ReplyPanel key={cur.inc.id} incidentId={cur.inc.id} langs={cur.foreign} clock={s.clock} ask={ask?.incidentId === cur.inc.id ? ask : null} localAI={localAI} replies={s.replies} onReply={onReply} />
        ) : (
          <p className="note">
            {unidentified !== undefined
              ? `${langName(unidentified)}.${list.length ? " Elige arriba una emergencia con llamante extranjero para responderle." : ""}`
              : list.length === 0
                ? "Cuando llame alguien en otro idioma, aquí podrás responderle con frases leídas en voz alta en su idioma."
                : `${sel ? `${sel.id} es en castellano. ` : ""}Elige arriba una emergencia con llamante extranjero para responderle.`}
          </p>
        )}
      </div>
    </section>
  );
}
