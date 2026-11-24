import { getScenario } from "@/data/scenarios";
import { callMeta } from "@/lib/useConsole";
import type { CallMeta, ConsoleState } from "@/lib/useConsole";
import type { ProcessResult } from "@/lib/types";
import Icon from "./Icon";
import Inbox from "./Inbox";
import LivePanel from "./LivePanel";
import { langName, mmss } from "./format";

interface Props {
  s: ConsoleState;
  sttUp: boolean;
  onSelect: (incidentId: string) => void;
  onLive: (c: CallMeta, r: ProcessResult) => void;
  onMicrophone: (epoch: number, c: CallMeta, r: ProcessResult) => void;
}

export default function CallQueue({ s, sttUp, onSelect, onLive, onMicrophone }: Props) {
  const isLive = s.mode === "live";
  const list = [...s.arrived].reverse();
  const total = getScenario(s.scenarioId).calls.length;
  return (
    <section className="panel calls-col" aria-labelledby="calls-h">
      <div className="panel-head">
        <h2 id="calls-h">Llamadas entrantes</h2>
        <span className="panel-count">{isLive ? s.arrived.length : `${s.arrived.length} de ${total}`}</span>
      </div>
      <Inbox s={s} visible={isLive} onLive={onLive} />
      <LivePanel s={s} sttUp={sttUp} onCall={onMicrophone} />
      {list.length === 0 ? (
        <p className="empty">
          {isLive
            ? "Las llamadas del público que aceptes en la bandeja aparecerán aquí."
            : "Aquí aparecerán las llamadas según entren, de la más reciente a la más antigua."}
        </p>
      ) : (
        <ul className="calls">
          {list.map((id) => {
            const call = callMeta(s, id)!;
            const rec = s.recs[id];
            const incId = s.engine.assignment[id];
            const inc = s.engine.incidents.find((i) => i.id === incId);
            const gray = !!inc?.provisional && inc.callIds[0] === id;
            const first = !!inc && inc.callIds[0] === id;
            const text = rec.result?.extraction.summary_es ?? call.transcript;
            const foreign = call.lang !== "es";
            let status: { cls: string; text: string };
            if (rec.status === "queued") status = { cls: "wait", text: "En espera" };
            else if (rec.status === "processing") status = { cls: "wait", text: "Analizando…" };
            else if (rec.status === "error") status = { cls: "err", text: "No se pudo analizar" };
            else if (gray) status = { cls: "ask", text: `¿Misma emergencia que ${inc!.linkedTo}?` };
            else if (first) status = { cls: "new", text: `Emergencia nueva · ${incId}` };
            else status = { cls: "dup", text: `Repetida · agrupada en ${incId}` };
            return (
              <li key={id} className={`call ${gray ? "is-ask" : ""} ${incId && incId === s.selected ? "is-sel" : ""}`}>
                <button disabled={!incId} onClick={() => incId && onSelect(incId)} aria-label={`Llamada ${id} de las ${mmss(call.t)} en ${langName(call.lang)}: ${text.replace(/\.$/, "")}. ${status.text}`}>
                  <span className="call-top">
                    <span className="call-time">{mmss(call.t)}</span>
                    <span className={`lang ${foreign ? "foreign" : ""}`}>{foreign && <Icon name="globe" size={13} />}{langName(call.lang)}</span>
                    <span className="call-id">{id}</span>
                  </span>
                  <span className="call-text">{text}</span>
                  <span className={`call-status ${status.cls}`}>{status.text}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
