"use client";

import { useState } from "react";
import { getScenario } from "@/data/scenarios";
import { TYPE_LABELS } from "@/lib/labels";
import { callMeta } from "@/lib/useConsole";
import type { CallMeta, ConsoleState } from "@/lib/useConsole";
import type { ProcessResult } from "@/lib/types";
import Icon from "./Icon";
import type { IconName } from "./Icon";
import IncToken from "./IncToken";
import LivePanel from "./LivePanel";
import ManualCall from "./ManualCall";
import { langName, mmss, placeOf, plural, toneOf } from "./format";

interface Props {
  s: ConsoleState;
  ranks: Map<string, number>;
  playing?: string | null;
  sttUp: boolean;
  localAI: boolean;
  onSelect: (incidentId: string) => void;
  /** Abre el archivo en una incidencia ya solucionada. */
  onArchived: (incidentId: string) => void;
  onLive: (c: CallMeta, r: ProcessResult) => void;
}

type Mode = "recent" | "group" | "ask";

export default function CallQueue({ s, ranks, playing, sttUp, localAI, onSelect, onArchived, onLive }: Props) {
  const [mode, setMode] = useState<Mode>("recent");
  const total = getScenario(s.scenarioId).calls.length;
  const byInc = new Map(s.engine.incidents.map((i) => [i.id, i]));
  const archivedIds = new Set(s.archived.map((x) => x.incident.id));
  const rows = [...s.arrived].reverse().map((id) => {
    const call = callMeta(s, id)!;
    const rec = s.recs[id];
    const incId = s.engine.assignment[id];
    const inc = incId ? byInc.get(incId) : undefined;
    const solved = !inc && !!incId && archivedIds.has(incId) ? incId : null;
    const gray = !!inc?.provisional && inc.callIds[0] === id;
    const first = !!inc && inc.callIds[0] === id;
    const text = rec.result?.extraction.summary_es ?? call.transcript;
    const foreign = call.lang !== "es";
    let status: { cls: string; text: string; icon: IconName };
    if (rec.status === "queued") status = { cls: "wait", text: "En espera", icon: "clock" };
    else if (rec.status === "processing") status = { cls: "wait", text: "Analizando…", icon: "clock" };
    else if (rec.status === "error") status = { cls: "err", text: "No se pudo analizar", icon: "alert" };
    else if (solved) status = { cls: "done", text: `Solucionada · ${solved}`, icon: "solved" };
    else if (gray) status = { cls: "ask", text: `¿Misma emergencia que ${inc!.linkedTo}?`, icon: "alert" };
    else if (first) status = { cls: inc && toneOf(inc) === "critical" ? "critical" : "new", text: "Emergencia nueva", icon: "phone" };
    else status = { cls: "dup", text: "Repetida", icon: "merge" };
    return { id, call, inc, solved, gray, text, foreign, status };
  });
  const asks = rows.filter((r) => r.gray).length;

  const row = ({ id, call, inc, solved, gray, text, foreign, status }: (typeof rows)[number], inGroup = false) => {
    const onAir = playing === id;
    const rank = inc ? ranks.get(inc.id) ?? 0 : 0;
    return (
      <li key={id} className={`call ${gray ? "is-ask" : ""} ${solved ? "is-done" : ""} ${inc && inc.id === s.selected ? "is-sel" : ""}`}>
        <button
          disabled={!inc && !solved}
          onClick={() => (inc ? onSelect(inc.id) : solved && onArchived(solved))}
          aria-label={`Llamada ${id} de las ${mmss(call.t)} en ${langName(call.lang)}: ${text.replace(/\.$/, "")}. ${status.text}${inc ? ` · ${inc.id}` : ""}`}
        >
          <span className={`call-ico ${onAir ? "live" : status.cls}`} aria-hidden="true"><Icon name={status.icon} size={19} /></span>
          <span className="call-main">
            <span className="call-phone">{call.phone || (id.startsWith("T") ? "Escrita a mano" : "En directo")}</span>
            <span className="call-text">{text}</span>
            <span className="call-meta">
              {inc && !inGroup && <IncToken inc={inc} rank={rank} />}
              <span className={`call-status ${status.cls === "critical" ? "new" : status.cls}`}>{status.text}</span>
              {foreign && <span className="lang foreign"><Icon name="globe" size={13} />{langName(call.lang)}</span>}
            </span>
          </span>
          <span className="call-side">
            <span className="call-time">{mmss(call.t)}</span>
            {onAir ? <span className="on-air" aria-label="Sonando"><i /><i /><i />En línea</span> : <span className="call-id">{id}</span>}
          </span>
        </button>
      </li>
    );
  };

  let body: React.ReactNode;
  if (rows.length === 0) {
    body = <p className="empty">Aquí aparecerán las llamadas según entren, de la más reciente a la más antigua.</p>;
  } else if (mode === "group") {
    // Cada emergencia con sus llamadas debajo, en orden de prioridad
    const groups = [...s.engine.incidents].sort((a, b) => (ranks.get(a.id) ?? 0) - (ranks.get(b.id) ?? 0));
    const loose = rows.filter((r) => !r.inc && !r.solved);
    const done = rows.filter((r) => r.solved);
    body = (
      <div className="calls">
        {groups.map((inc) => (
          <section key={inc.id} className={`call-group ${inc.id === s.selected ? "is-sel" : ""}`} aria-label={`${inc.id}: ${TYPE_LABELS[inc.type]}`}>
            <button className="call-group-head" onClick={() => onSelect(inc.id)}>
              <IncToken inc={inc} rank={ranks.get(inc.id) ?? 0} />
              <span className="call-group-title">{TYPE_LABELS[inc.type]}<small>{placeOf(inc)}</small></span>
              <span className="call-group-n" title={plural(inc.callIds.length, "llamada", "llamadas")}><Icon name="phone" size={13} />{inc.callIds.length}</span>
            </button>
            <ul>{rows.filter((r) => r.inc?.id === inc.id).reverse().map((r) => row(r, true))}</ul>
          </section>
        ))}
        {done.length > 0 && (
          <section className="call-group is-done">
            <button className="call-group-head" onClick={() => onArchived(done[0].solved!)}>
              <Icon name="archive" size={16} />
              <span className="call-group-title">Solucionadas<small>En el archivo</small></span>
              <span className="call-group-n"><Icon name="phone" size={13} />{done.length}</span>
            </button>
            <ul>{done.map((r) => row(r, true))}</ul>
          </section>
        )}
        {loose.length > 0 && (
          <section className="call-group">
            <div className="call-group-head"><span className="call-group-title">Analizando</span></div>
            <ul>{loose.map((r) => row(r, true))}</ul>
          </section>
        )}
      </div>
    );
  } else {
    const list = mode === "ask" ? rows.filter((r) => r.gray) : rows;
    body = list.length === 0
      ? <p className="empty">No hay llamadas pendientes de tu decisión.</p>
      : <ul className="calls">{list.map((r) => row(r))}</ul>;
  }

  return (
    <section className="box calls-col" id="box-calls" aria-labelledby="calls-h">
      <div className="panel-head">
        <h2 id="calls-h">Llamadas entrantes</h2>
        <span className="panel-count">{s.arrived.length} de {total}</span>
      </div>
      <div className="calls-tools">
        <div className="seg" role="group" aria-label="Cómo ver las llamadas">
          <button aria-pressed={mode === "recent"} onClick={() => setMode("recent")}>Recientes</button>
          <button aria-pressed={mode === "group"} onClick={() => setMode("group")}>Por emergencia</button>
          <button aria-pressed={mode === "ask"} onClick={() => setMode("ask")}>Por decidir{asks ? ` · ${asks}` : ""}</button>
        </div>
      </div>
      <ManualCall s={s} localAI={localAI} onCall={onLive} />
      <LivePanel s={s} sttUp={sttUp} onCall={onLive} />
      {body}
    </section>
  );
}
