"use client";

import { useState } from "react";
import { DUPLICATE_SECONDS, NEW_CALL_SECONDS, compare } from "@/lib/metrics";
import type { SimCall } from "@/lib/metrics";
import type { ConsoleState } from "@/lib/useConsole";
import { mmss } from "./format";

export default function SimStrip({ s }: { s: ConsoleState }) {
  const [operators, setOperators] = useState(2);
  const calls: SimCall[] = s.arrived
    .filter((id) => s.calls[id] && s.engine.assignment[id])
    .map((id) => {
      const inc = s.engine.incidents.find((i) => i.id === s.engine.assignment[id])!;
      return { id, t: s.calls[id].t, extraction: s.calls[id].extraction, incidentId: inc.id, first: inc.callIds[0] === id };
    });
  const c = compare(calls, operators);
  return (
    <section className="sim" aria-label="Simulación de sala con y sin copiloto">
      <label className="sim-ops">
        Simulación con{" "}
        <select value={operators} onChange={(e) => setOperators(Number(e.target.value))} aria-label="Operadores en sala">
          {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>{" "}
        {operators === 1 ? "operador" : "operadores"}
      </label>
      {c.critical ? (
        <p className="sim-result">
          Llamada crítica <b>{c.critical.id}</b> atendida en{" "}
          <span className="sim-bad">{mmss(c.critical.sin)} sin copiloto</span>
          <span aria-hidden="true"> → </span>
          <span className="sim-good">{mmss(c.critical.con)} con copiloto</span>
        </p>
      ) : (
        <p className="sim-result note">Aparecerá cuando entre una llamada crítica.</p>
      )}
      <details className="sim-more">
        <summary>Supuestos</summary>
        <p>
          No son datos reales: {NEW_CALL_SECONDS} s por llamada nueva y {DUPLICATE_SECONDS} s por repetida; con copiloto se atienden antes las emergencias nuevas más graves.
          {c.meanNew && <> Espera media de las emergencias nuevas: {mmss(c.meanNew.sin)} sin copiloto y {mmss(c.meanNew.con)} con copiloto.</>}
        </p>
      </details>
    </section>
  );
}
