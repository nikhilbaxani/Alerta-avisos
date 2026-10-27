"use client";

import { useEffect } from "react";
import type { ConsoleState } from "@/lib/useConsole";

interface Props {
  s: ConsoleState;
  onDecide: (incidentId: string, same: boolean) => void;
}

export default function DecisionBanner({ s, onDecide }: Props) {
  const prov = s.engine.incidents.find((i) => i.provisional);
  useEffect(() => {
    if (!prov) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "m") onDecide(prov.id, true);
      if (k === "d") onDecide(prov.id, false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prov, onDecide]);

  if (!prov) {
    return <p className="no-decision">Sin decisiones pendientes. Si la IA duda, te preguntará aquí.</p>;
  }
  const lead = prov.callIds[0];
  const rec = s.recs[lead];
  const decision = rec?.result?.decision;
  const judge = decision?.judge;
  const total = s.engine.incidents.filter((i) => i.provisional).length;
  return (
    <section className="decision" role="alertdialog" aria-labelledby="dec-title" aria-describedby="dec-why">
      <h2 id="dec-title">
        ¿La llamada {lead} es el mismo incidente que {prov.linkedTo}?{total > 1 ? ` (${total} pendientes)` : ""}
      </h2>
      <p id="dec-why">{decision?.reason ?? prov.summary}</p>
      {judge && (
        <p className="judge">
          Opinión de la IA (no decide): {judge.same ? "parece el mismo" : "parece distinto"} · confianza {Math.round(judge.confidence * 100)} %. {judge.reason}
        </p>
      )}
      <div className="decision-actions">
        <button className="btn" onClick={() => onDecide(prov.id, true)}>Mismo incidente <kbd>M</kbd></button>
        <button className="btn alt" onClick={() => onDecide(prov.id, false)}>Incidente distinto <kbd>D</kbd></button>
      </div>
    </section>
  );
}
