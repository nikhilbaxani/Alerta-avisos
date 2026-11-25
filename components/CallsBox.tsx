"use client";

import { useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import { getScenario } from "@/data/scenarios";
import type { AgentAction } from "@/lib/actions";
import type { LostReport } from "@/lib/lostCalls";
import type { CallMeta, ConsoleState } from "@/lib/useConsole";
import type { ProcessResult } from "@/lib/types";
import { DEFAULT_OPERATORS } from "@/lib/waiting";
import { consoleWaiting } from "@/lib/waitingConsole";
import CallQueue from "./CallQueue";
import LostCallsBox, { lostToApprove } from "./LostCallsBox";
import WaitingBox from "./WaitingBox";

export type CallsTab = "incoming" | "waiting" | "lost";
const TABS: CallsTab[] = ["incoming", "waiting", "lost"];

interface Props {
  s: ConsoleState;
  ranks: Map<string, number>;
  tab: CallsTab;
  onTab: (t: CallsTab) => void;
  playing?: string | null;
  sttUp: boolean;
  localAI: boolean;
  lost: LostReport;
  actions: AgentAction[];
  onSelect: (incidentId: string) => void;
  onSelectIncident: (incidentId: string) => void;
  onArchived: (incidentId: string) => void;
  onLive: (c: CallMeta, r: ProcessResult) => void;
  onMicrophone: (epoch: number, c: CallMeta, r: ProcessResult) => void;
  onApprove: (key: string) => void;
  onDiscard: (key: string) => void;
}

/**
 * Una sola caja para todo lo que entra por teléfono, con pestañas: las llamadas entrantes, las que atiende
 * el asistente de espera (X11) y las perdidas (X15). Las tres pestañas siguen montadas para no perder su estado.
 */
export default function CallsBox(p: Props) {
  const { s, onTab } = p;
  const isSim = s.mode === "sim";
  const tab = isSim ? p.tab : "incoming";
  const [operators, setOperators] = useState(DEFAULT_OPERATORS);
  const waiting = useMemo(
    () => isSim ? consoleWaiting(s, operators) : null,
    [isSim, s.clock, s.arrived, s.calls, s.engine, s.archived, s.heard, operators], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const total = isSim ? getScenario(s.scenarioId).calls.length : 0;
  const waitingCount = waiting?.rows.length ?? 0;
  const lostTotal = p.lost.unknown.length + p.lost.duplicates.length;
  const lostTodo = lostToApprove(p.lost, p.actions);
  const escalated = waiting?.escalatedWaiting.length ?? 0;

  const label: Record<CallsTab, React.ReactNode> = {
    incoming: <>Entrantes <span className="pill">{s.arrived.length}</span></>,
    waiting: <>En espera <span className={`pill ${escalated ? "red" : ""}`} title={escalated ? `${escalated} escalada${escalated > 1 ? "s" : ""}` : undefined}>{waitingCount}</span></>,
    lost: <>Perdidas <span className={`pill ${lostTodo ? "amber" : ""}`} title={lostTodo ? `${lostTodo} por aprobar` : undefined}>{lostTodo || lostTotal}</span></>,
  };
  const aria: Record<CallsTab, string> = {
    incoming: `Entrantes: ${s.arrived.length} de ${total}`,
    waiting: `En espera: ${waitingCount} atendidas por el asistente${escalated ? `, ${escalated} escalada${escalated > 1 ? "s" : ""}` : ""}`,
    lost: `Perdidas: ${lostTotal}${lostTodo ? `, ${lostTodo} por aprobar` : ""}`,
  };

  // Teclado de pestañas (WAI-ARIA): flechas para moverse, Inicio/Fin para ir a los extremos.
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = TABS.indexOf(tab);
    const next = e.key === "ArrowRight" ? TABS[(i + 1) % 3] : e.key === "ArrowLeft" ? TABS[(i + 2) % 3] : e.key === "Home" ? TABS[0] : e.key === "End" ? TABS[2] : null;
    if (!next) return;
    e.preventDefault();
    onTab(next);
    document.getElementById(`tab-${next}`)?.focus();
  };

  return (
    <section className="box calls-col" id="box-calls" tabIndex={-1} aria-labelledby="calls-h">
      <div className="panel-head">
        <h2 id="calls-h">Llamadas</h2>
        <span className="panel-count">{isSim ? `${s.arrived.length} de ${total}` : s.arrived.length}</span>
      </div>
      {isSim && <div className="calls-tabs" role="tablist" aria-label="Qué llamadas ver" onKeyDown={onKey}>
        {TABS.map((t) => (
          <button
            key={t}
            id={`tab-${t}`}
            role="tab"
            aria-selected={tab === t}
            aria-controls={`box-${t}`}
            aria-label={aria[t]}
            tabIndex={tab === t ? 0 : -1}
            className={t === "waiting" && escalated ? "is-red" : t === "lost" && lostTodo ? "is-amber" : ""}
            onClick={() => onTab(t)}
          >
            {label[t]}
          </button>
        ))}
      </div>}
      {waiting && escalated > 0 && tab !== "waiting" && (
        <button className="calls-escalated" onClick={() => onTab("waiting")}>
          <b>{waiting.escalatedWaiting.map((r) => r.callId).join(", ")} {escalated > 1 ? "escaladas" : "escalada"}</b> por el asistente: {escalated > 1 ? "pasan" : "pasa"} la primera de la cola humana · Ver
        </button>
      )}
      <div className="calls-pane" id="box-incoming" role={isSim ? "tabpanel" : undefined} aria-labelledby={isSim ? "tab-incoming" : undefined} hidden={tab !== "incoming"}>
        <CallQueue s={s} ranks={p.ranks} onArchived={p.onArchived} playing={p.playing} sttUp={p.sttUp} localAI={p.localAI} onSelect={p.onSelect} onLive={p.onLive} onMicrophone={p.onMicrophone} />
      </div>
      {waiting && <div className="calls-pane" id="box-waiting" role="tabpanel" aria-labelledby="tab-waiting" hidden={tab !== "waiting"}>
        <WaitingBox s={s} view={waiting} operators={operators} onOperators={setOperators} ranks={p.ranks} onSelect={p.onSelectIncident} />
      </div>}
      {isSim && <div className="calls-pane" id="box-lost" role="tabpanel" aria-labelledby="tab-lost" hidden={tab !== "lost"}>
        <LostCallsBox report={p.lost} actions={p.actions} incidents={s.engine.incidents} ranks={p.ranks} onApprove={p.onApprove} onDiscard={p.onDiscard} onIncident={p.onSelectIncident} />
      </div>}
    </section>
  );
}
