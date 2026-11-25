"use client";

import { useEffect, useRef, useState } from "react";
import { LOST_CALLS_ID, toolTarget } from "@/lib/actions";
import type { AgentAction } from "@/lib/actions";
import Icon from "./Icon";
import { TOOL_ICON, actionTitle } from "./AgentActions";

const SHOW_MS = 4500;

/** Avisos breves sobre el mapa cada vez que el agente envía algo (automático o aprobado por el operador). */
export default function AgentFeed({ actions, epoch }: { actions: AgentAction[]; epoch: number }) {
  const [items, setItems] = useState<AgentAction[]>([]);
  const seen = useRef(new Set<string>());

  useEffect(() => {
    seen.current = new Set();
    setItems([]);
  }, [epoch]);

  useEffect(() => {
    const fresh = actions.filter((a) => a.status === "enviada" && !seen.current.has(a.key));
    if (!fresh.length) return;
    for (const a of fresh) seen.current.add(a.key);
    setItems((xs) => [...xs, ...fresh].slice(-2));
  }, [actions]);

  useEffect(() => {
    if (!items.length) return;
    const t = setTimeout(() => setItems((xs) => xs.slice(1)), SHOW_MS);
    return () => clearTimeout(t);
  }, [items]);

  return (
    <div className="agent-feed" aria-live="polite">
      {items.map((a) => (
        <div key={a.key} className="feed-item">
          <span className="feed-icon" aria-hidden="true"><Icon name={TOOL_ICON[a.tool]} size={16} /></span>
          <div>
            <span className="feed-head">{a.approval?.by === "automatica" ? "El agente ha enviado" : "Enviado con tu aprobación"} · {a.tool === "proponer_es_alert" ? "zona" : a.incidentId === LOST_CALLS_ID ? `llamada perdida ${a.destination}` : a.incidentId}</span>
            <span className="feed-title">{actionTitle(a)}</span>
            <span className="feed-ack">{toolTarget(a)} · acuse {a.receipt?.reference}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
