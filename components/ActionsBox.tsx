"use client";

import { useState } from "react";
import { DUPLICATE_PHRASES } from "@/lib/phrases";
import { actionIncidents, canApprove, duplicateBatch } from "@/lib/actions";
import type { AgentAction } from "@/lib/actions";
import type { Incident } from "@/lib/engine";
import type { ArchivedIncident } from "@/lib/useConsole";
import Icon from "./Icon";
import { ActionCard, TOOL_ICON } from "./AgentActions";
import { langName } from "./format";
import IncToken from "./IncToken";

interface Props {
  actions: AgentAction[];
  archived: ArchivedIncident[];
  onArchived: (id: string) => void;
  /** Emergencia abierta: sus acciones salen primero. */
  selected: string | null;
  incidents: Incident[];
  ranks: Map<string, number>;
  /** Emergencia por la que se filtra, o null para ver todas. */
  filter: string | null;
  onFilter: (id: string | null) => void;
  provisional: number;
  onApprove: (key: string) => void;
  onDiscard: (key: string) => void;
  /** «Aprobar todos» los avisos de duplicado de un incidente (X14). */
  onApproveBatch: (incidentId: string) => void;
  onIncident: (id: string) => void;
}

/** Caja de acciones del agente: lo que espera tu confirmación y lo ya enviado, filtrable por emergencia. */
export default function ActionsBox({ actions, archived, onArchived, selected, incidents, ranks, filter, onFilter, provisional, onApprove, onDiscard, onApproveBatch, onIncident }: Props) {
  const [show, setShow] = useState<"todo" | "done">("todo");
  const byId = new Map(incidents.map((i) => [i.id, i]));
  const inFilter = (a: AgentAction) => !filter || actionIncidents(a).includes(filter);
  const pending = actions.filter((a) => a.status === "propuesta");
  const mineAll = pending.filter((a) => canApprove(a.policy, "operador"));
  const first = (a: AgentAction) => Number(!!selected && actionIncidents(a).includes(selected));
  const mine = mineAll.filter(inFilter).sort((a, b) => first(b) - first(a));
  const coord = pending.filter((a) => !canApprove(a.policy, "operador")).filter(inFilter);
  const doneAll = actions.filter((a) => a.status !== "propuesta");
  const done = doneAll.filter(inFilter).sort((a, b) => (b.receipt?.at ?? b.discarded?.at ?? 0) - (a.receipt?.at ?? a.discarded?.at ?? 0));

  // Filtros: las emergencias que tienen alguna acción, por prioridad, con cuántas esperan tu aprobación
  const todo: Record<string, number> = {};
  const any = new Set<string>();
  for (const a of actions) for (const id of actionIncidents(a)) {
    any.add(id);
    if (a.status === "propuesta" && canApprove(a.policy, "operador")) todo[id] = (todo[id] ?? 0) + 1;
  }
  const chips = [...any].map((id) => byId.get(id)).filter((i): i is Incident => !!i).sort((a, b) => (ranks.get(a.id) ?? 0) - (ranks.get(b.id) ?? 0));
  const solved = new Set(archived.map((x) => x.incident.id));
  const tokens = (a: AgentAction) => actionIncidents(a).map((id) => {
    const inc = byId.get(id);
    if (inc) return <IncToken key={id} inc={inc} rank={ranks.get(id) ?? 0} onClick={() => onIncident(id)} />;
    if (solved.has(id)) {
      return (
        <button key={id} className="inc-token tone-done" onClick={() => onArchived(id)} aria-label={`Ver ${id} en el archivo`}>
          <i className="inc-n" aria-hidden="true"><Icon name="check" size={11} /></i><span>{id}</span>
        </button>
      );
    }
    return null;
  });
  const card = (a: AgentAction) => <ActionCard key={a.key} a={a} tokens={tokens(a)} onApprove={onApprove} onDiscard={onDiscard} />;

  // Lote de avisos de duplicado (X14): los que no traen información nueva van juntos con «Aprobar todos».
  // Con uno solo no hay lote: se aprueba con su tarjeta.
  const batches = new Map<string, AgentAction[]>();
  for (const a of mine) {
    if (a.tool !== "sms_duplicado" || batches.has(a.incidentId)) continue;
    const b = duplicateBatch(mine, a.incidentId);
    if (b.length > 1) batches.set(a.incidentId, b);
  }
  const inBatch = new Set([...batches.values()].flat().map((a) => a.key));
  const batchCard = (incidentId: string, items: AgentAction[]) => {
    const title = `Avisar a ${items.length} llamantes repetidos de ${incidentId}`;
    return (
      <li key={`lote-${incidentId}`} className="act st-pending" data-batch={incidentId} data-tool="sms_duplicado">
        <span className="act-icon" aria-hidden="true"><Icon name={TOOL_ICON.sms_duplicado} size={18} /></span>
        <div className="act-body">
          <span className="act-incs">{tokens(items[0])}</span>
          <span className="act-title">{title}</span>
          <span className="act-target">Ya tienen recursos en camino. Ninguno trajo información nueva; si alguno la trae, sale aparte para que lo veas.</span>
          <p className="act-sms"><span>{DUPLICATE_PHRASES[0].es}</span></p>
          <ul className="act-batch">
            {items.map((a) => a.tool === "sms_duplicado" && (
              <li key={a.key}>{a.args.llamada} · {a.args.telefono} · {langName(a.args.idioma).toLowerCase()}</li>
            ))}
          </ul>
          <div className="act-buttons">
            <button className="btn btn-dark btn-sm" onClick={() => onApproveBatch(incidentId)} aria-label={`Aprobar todos: ${title}`}>
              <Icon name="check" size={15} />Aprobar todos ({items.length})
            </button>
            <span className="act-who">Necesita tu aprobación · Pasarela SMS (simulada)</span>
          </div>
        </div>
      </li>
    );
  };
  const mineList = () => {
    const out: React.ReactNode[] = [];
    const done = new Set<string>();
    for (const a of mine) {
      if (!inBatch.has(a.key)) out.push(card(a));
      else if (!done.has(a.incidentId)) {
        done.add(a.incidentId);
        out.push(batchCard(a.incidentId, batches.get(a.incidentId)!));
      }
    }
    return out;
  };

  return (
    <section className="box" id="box-actions" tabIndex={-1} aria-labelledby="act-h">
      <div className="panel-head">
        <h2 id="act-h">Acciones</h2>
        <div className="seg" role="group" aria-label="Qué acciones ver">
          <button aria-pressed={show === "todo"} onClick={() => setShow("todo")}>Por aprobar <span className={`pill ${mineAll.length ? "amber" : ""}`}>{mine.length}</span></button>
          <button aria-pressed={show === "done"} onClick={() => setShow("done")}>Enviadas <span className="pill">{done.length}</span></button>
        </div>
      </div>
      {chips.length > 0 && (
        <div className="filter-row" role="group" aria-label="Filtrar acciones por emergencia">
          <button className="chip" aria-pressed={!filter} onClick={() => onFilter(null)}>Todas</button>
          {chips.map((inc) => (
            <IncToken key={inc.id} inc={inc} rank={ranks.get(inc.id) ?? 0} count={todo[inc.id]} pressed={filter === inc.id} onClick={() => onFilter(filter === inc.id ? null : inc.id)} />
          ))}
        </div>
      )}
      <div className="box-body acts-col">
        {show === "todo" ? (
          <>
            {provisional > 0 && <p className="note">Hasta que decidas la duda ámbar, el agente no prepara acciones para esa emergencia.</p>}
            {mine.length === 0 ? <p className="note">{filter ? `Nada que confirmar en ${filter}.` : "Nada que confirmar ahora."}</p> : <ul className="acts">{mineList()}</ul>}
            {coord.length > 0 && (
              <>
                <h3>Las aprueba un coordinador</h3>
                <ul className="acts">{coord.map(card)}</ul>
              </>
            )}
            <p className="note">Servicios simulados. Solo los avisos informativos a organismos salen sin aprobación.</p>
          </>
        ) : done.length === 0 ? (
          <p className="note">{filter ? `Nada enviado todavía en ${filter}.` : "Todavía no se ha enviado nada."}</p>
        ) : (
          <ul className="acts">{done.map(card)}</ul>
        )}
      </div>
    </section>
  );
}
