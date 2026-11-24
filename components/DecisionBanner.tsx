"use client";

import { useEffect } from "react";
import { TYPE_LABELS } from "@/lib/labels";
import type { ConsoleState } from "@/lib/useConsole";
import Icon from "./Icon";
import { mmss, placeOf, plural } from "./format";

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
      if (el?.closest("dialog")) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "m") onDecide(prov.id, true);
      if (k === "d") onDecide(prov.id, false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prov, onDecide]);

  if (!prov) return null;
  const lead = prov.callIds[0];
  const target = s.engine.incidents.find((i) => i.id === prov.linkedTo);
  const decision = s.recs[lead]?.result?.decision;
  const judge = decision?.judge;
  const total = s.engine.incidents.filter((i) => i.provisional).length;
  const t = s.calls[lead]?.t;

  return (
    <section className="decision" aria-labelledby="dec-title" aria-describedby="dec-why">
      <div className="decision-top">
        <h2 id="dec-title"><Icon name="alert" size={18} />¿La llamada {lead} es el mismo incidente que {prov.linkedTo}?</h2>
        <span className="decision-kicker">La IA duda y te pregunta{total > 1 ? ` · ${total} pendientes` : ""}</span>
      </div>

      <div className="compare">
        <div className="compare-item">
          <span className="compare-label">Llamada nueva · {lead}{t !== undefined ? ` · ${mmss(t)}` : ""}</span>
          <span className="compare-title">{TYPE_LABELS[prov.type]} · {placeOf(prov)}</span>
          <span className="compare-text">{prov.summary}</span>
        </div>
        {target && (
          <div className="compare-item">
            <span className="compare-label">Ya abierto · {target.id} · {plural(target.callIds.length, "llamada", "llamadas")}</span>
            <span className="compare-title">{TYPE_LABELS[target.type]} · {placeOf(target)}</span>
            <span className="compare-text">{target.summary}</span>
          </div>
        )}
      </div>

      <p id="dec-why" className="decision-why"><b>Por qué duda:</b> {decision?.reason ?? prov.summary}</p>
      {judge && (
        <p className="judge">
          Opinión del modelo (no decide): {judge.same ? "parece el mismo" : "parece distinto"}, confianza {Math.round(judge.confidence * 100)} %. {judge.reason}
        </p>
      )}
      <div className="decision-actions">
        <button className="btn btn-dark" onClick={() => onDecide(prov.id, true)}>Mismo incidente <kbd>M</kbd></button>
        <button className="btn" onClick={() => onDecide(prov.id, false)}>Incidente distinto <kbd>D</kbd></button>
        <span className="decision-note">Mientras no decidas, se mantienen separados.</span>
      </div>
    </section>
  );
}
