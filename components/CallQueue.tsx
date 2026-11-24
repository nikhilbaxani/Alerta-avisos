"use client";

import { useState } from "react";
import { getScenario } from "@/data/scenarios";
import { callMeta } from "@/lib/useConsole";
import type { CallMeta, ConsoleState } from "@/lib/useConsole";
import type { ProcessResult } from "@/lib/types";
import Icon from "./Icon";
import type { IconName } from "./Icon";
import LivePanel from "./LivePanel";
import { langName, mmss, toneOf } from "./format";

interface Props {
  s: ConsoleState;
  playing?: string | null;
  sttUp: boolean;
  onSelect: (incidentId: string) => void;
  onLive: (c: CallMeta, r: ProcessResult) => void;
}

type Filter = "all" | "ask" | "foreign";

export default function CallQueue({ s, playing, sttUp, onSelect, onLive }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const total = getScenario(s.scenarioId).calls.length;
  const rows = [...s.arrived].reverse().map((id) => {
    const call = callMeta(s, id)!;
    const rec = s.recs[id];
    const incId = s.engine.assignment[id];
    const inc = s.engine.incidents.find((i) => i.id === incId);
    const gray = !!inc?.provisional && inc.callIds[0] === id;
    const first = !!inc && inc.callIds[0] === id;
    const text = rec.result?.extraction.summary_es ?? call.transcript;
    const foreign = call.lang !== "es";
    let status: { cls: string; text: string; icon: IconName };
    if (rec.status === "queued") status = { cls: "wait", text: "En espera", icon: "clock" };
    else if (rec.status === "processing") status = { cls: "wait", text: "Analizando…", icon: "clock" };
    else if (rec.status === "error") status = { cls: "err", text: "No se pudo analizar", icon: "alert" };
    else if (gray) status = { cls: "ask", text: `¿Misma emergencia que ${inc!.linkedTo}?`, icon: "alert" };
    else if (first) status = { cls: inc && toneOf(inc) === "critical" ? "critical" : "new", text: `Emergencia nueva · ${incId}`, icon: "phone" };
    else status = { cls: "dup", text: `Repetida · agrupada en ${incId}`, icon: "merge" };
    return { id, call, incId, gray, text, foreign, status };
  });
  const asks = rows.filter((r) => r.gray).length;
  const foreigns = rows.filter((r) => r.foreign).length;
  const list = rows.filter((r) => filter === "all" || (filter === "ask" ? r.gray : r.foreign));

  return (
    <section className="panel calls-col" aria-labelledby="calls-h">
      <div className="panel-head">
        <h2 id="calls-h">Llamadas entrantes</h2>
        <span className="panel-count">{s.arrived.length} de {total}</span>
      </div>
      <div className="calls-tools">
        <div className="seg" role="group" aria-label="Filtrar llamadas">
          <button aria-pressed={filter === "all"} onClick={() => setFilter("all")}>Todas</button>
          <button aria-pressed={filter === "ask"} onClick={() => setFilter("ask")}>Por decidir{asks ? ` · ${asks}` : ""}</button>
          <button aria-pressed={filter === "foreign"} onClick={() => setFilter("foreign")}>Otros idiomas{foreigns ? ` · ${foreigns}` : ""}</button>
        </div>
      </div>
      <LivePanel s={s} sttUp={sttUp} onCall={onLive} />
      {list.length === 0 ? (
        <p className="empty">
          {rows.length === 0
            ? "Aquí aparecerán las llamadas según entren, de la más reciente a la más antigua."
            : filter === "ask" ? "No hay llamadas pendientes de tu decisión." : "No hay llamadas en otros idiomas."}
        </p>
      ) : (
        <ul className="calls">
          {list.map(({ id, call, incId, gray, text, foreign, status }) => {
            const onAir = playing === id;
            return (
              <li key={id} className={`call ${gray ? "is-ask" : ""} ${incId && incId === s.selected ? "is-sel" : ""}`}>
                <button disabled={!incId} onClick={() => incId && onSelect(incId)} aria-label={`Llamada ${id} de las ${mmss(call.t)} en ${langName(call.lang)}: ${text.replace(/\.$/, "")}. ${status.text}`}>
                  <span className={`call-ico ${onAir ? "live" : status.cls}`} aria-hidden="true"><Icon name={status.icon} size={19} /></span>
                  <span className="call-main">
                    <span className="call-phone">{call.phone}</span>
                    <span className="call-text">{text}</span>
                    <span className={`call-status ${status.cls === "critical" ? "new" : status.cls}`}>{status.text}</span>
                  </span>
                  <span className="call-side">
                    <span className="call-time">{mmss(call.t)}</span>
                    {onAir ? (
                      <span className="on-air" aria-label="Sonando"><i /><i /><i />En línea</span>
                    ) : (
                      <span className={`pill ${gray ? "amber" : ""}`}>{id}</span>
                    )}
                    {foreign && <span className="lang foreign call-meta"><Icon name="globe" size={13} />{langName(call.lang)}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
