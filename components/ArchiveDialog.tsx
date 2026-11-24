"use client";

import { useEffect, useRef } from "react";
import { actionIncidents } from "@/lib/actions";
import type { AgentAction } from "@/lib/actions";
import { TYPE_LABELS } from "@/lib/labels";
import { callMeta } from "@/lib/useConsole";
import type { ConsoleState } from "@/lib/useConsole";
import { ActionCard } from "./AgentActions";
import Icon from "./Icon";
import { langName, mmss, placeOf, plural } from "./format";

interface Props {
  open: boolean;
  s: ConsoleState;
  /** Incidente a desplegar al abrir (p. ej. desde una llamada solucionada). */
  focus: string | null;
  onClose: () => void;
  onReopen: (id: string) => void;
}

const noop = () => undefined;

/** Archivo: incidencias solucionadas, con sus llamadas y lo que hizo el agente. Panel lateral, oculto de normal. */
export default function ArchiveDialog({ open, s, focus, onClose, onReopen }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  useEffect(() => {
    if (open && focus) document.getElementById(`arch-${focus}`)?.scrollIntoView({ block: "start" });
  }, [open, focus]);

  const list = [...s.archived].reverse();
  const actionsOf = (id: string): AgentAction[] => s.actions.filter((a) => actionIncidents(a).includes(id));

  return (
    <dialog ref={ref} className="drawer" aria-labelledby="arch-h" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <div className="drawer-body">
        <header className="drawer-head">
          <h2 id="arch-h"><Icon name="archive" size={18} />Incidencias archivadas</h2>
          <span className="panel-count">{list.length}</span>
          <button className="btn btn-icon btn-ghost" onClick={onClose} aria-label="Cerrar el archivo"><Icon name="close" /></button>
        </header>
        {list.length === 0 ? (
          <p className="empty">Todavía no hay incidencias solucionadas. Usa «Solucionada» en la ficha de una emergencia para archivarla.</p>
        ) : (
          <ul className="arch-list">
            {list.map(({ incident: inc, at }) => {
              const acts = actionsOf(inc.id);
              const sent = acts.filter((a) => a.status === "enviada").length;
              return (
                <li key={inc.id} id={`arch-${inc.id}`}>
                  <details className="arch" open={focus === inc.id || list.length === 1}>
                    <summary>
                      <span className="inc-token tone-done"><i className="inc-n" aria-hidden="true"><Icon name="check" size={11} /></i><span>{inc.id}</span></span>
                      <span className="arch-title">{TYPE_LABELS[inc.type]}<small>{placeOf(inc)}</small></span>
                      <span className="arch-meta">Solucionada {mmss(at)}<small>{plural(inc.callIds.length, "llamada", "llamadas")} · {plural(sent, "acción enviada", "acciones enviadas")}</small></span>
                    </summary>
                    <div className="arch-body">
                      <p className="detail-summary">{inc.summary}</p>
                      <h3>Llamadas</h3>
                      <ul className="arch-calls">
                        {inc.callIds.map((id) => {
                          const c = callMeta(s, id);
                          const ex = s.calls[id]?.extraction;
                          return (
                            <li key={id}>
                              <b>{id}</b> <span className="note">{c ? mmss(c.t) : ""} · {langName(ex?.language ?? c?.lang ?? "es")}</span>
                              <p>{ex?.summary_es ?? c?.transcript}</p>
                            </li>
                          );
                        })}
                      </ul>
                      <h3>Acciones del agente</h3>
                      {acts.length === 0 ? <p className="note">El agente no preparó acciones para esta emergencia.</p> : <ul className="acts">{acts.map((a) => <ActionCard key={a.key} a={a} onApprove={noop} onDiscard={noop} />)}</ul>}
                      <button className="btn btn-sm" onClick={() => onReopen(inc.id)}><Icon name="restart" size={15} />Reabrir</button>
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </dialog>
  );
}
