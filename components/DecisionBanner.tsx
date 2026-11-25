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

  // Barra compacta: la pregunta, qué se compara en una línea y los dos botones. El porqué, al desplegar.
  return (
    <section className="decision" aria-labelledby="dec-title" aria-describedby="dec-line">
      <div className="decision-main">
        <span className="decision-icon" aria-hidden="true"><Icon name="alert" size={18} /></span>
        <div className="decision-q">
          <h2 id="dec-title">¿La llamada {lead} es el mismo incidente que {prov.linkedTo}?</h2>
          <p id="dec-line" className="decision-line">
            <span><b>{lead}</b>{t !== undefined ? ` (${mmss(t)})` : ""} · {placeOf(prov) || TYPE_LABELS[prov.type]}</span>
            <span className="decision-vs" aria-label="frente a">↔</span>
            {target ? (
              <span><b>{target.id}</b> · {placeOf(target) || TYPE_LABELS[target.type]} · {plural(target.callIds.length, "llamada", "llamadas")}</span>
            ) : (
              <span><b>{prov.linkedTo}</b></span>
            )}
          </p>
        </div>
        <div className="decision-actions">
          <button className="btn btn-dark btn-sm" onClick={() => onDecide(prov.id, true)}>Mismo incidente <kbd>M</kbd></button>
          <button className="btn btn-sm" onClick={() => onDecide(prov.id, false)}>Incidente distinto <kbd>D</kbd></button>
        </div>
      </div>
      <details className="decision-more">
        <summary>Por qué duda la IA{total > 1 ? ` · ${total} pendientes` : ""} <span>· siguen separadas hasta que decidas</span></summary>
        <p className="decision-why">{decision?.reason ?? prov.summary}</p>
        {judge && (
          <p className="judge">
            Opinión del modelo (no decide): {judge.same ? "parece el mismo" : "parece distinto"}, confianza {Math.round(judge.confidence * 100)} %. {judge.reason}
          </p>
        )}
        <div className="compare">
          <div className="compare-item">
            <span className="compare-label">Llamada nueva · {lead}</span>
            <span className="compare-title">{TYPE_LABELS[prov.type]}</span>
            <span className="compare-text">{prov.summary}</span>
          </div>
          {target && (
            <div className="compare-item">
              <span className="compare-label">Ya abierto · {target.id}</span>
              <span className="compare-title">{TYPE_LABELS[target.type]}</span>
              <span className="compare-text">{target.summary}</span>
            </div>
          )}
        </div>
      </details>
    </section>
  );
}
