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
      <div className="sim-row">
        <b>Simulación de sala</b>
        <label>
          Operadores{" "}
          <select value={operators} onChange={(e) => setOperators(Number(e.target.value))}>
            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>
      {c.critical ? (
        <p>
          Espera hasta atender la llamada crítica {c.critical.id}: <b>{mmss(c.critical.sin)}</b> sin copiloto · <b className="good">{mmss(c.critical.con)}</b> con copiloto.
          {c.meanNew && <> Espera media de los incidentes nuevos: {mmss(c.meanNew.sin)} frente a {mmss(c.meanNew.con)}.</>}
        </p>
      ) : (
        <p className="note">Aparecerá cuando entre una llamada crítica.</p>
      )}
      <p className="note">
        Supuestos de la simulación, no datos reales: {NEW_CALL_SECONDS} s por llamada nueva, {DUPLICATE_SECONDS} s por duplicado, y con copiloto se atienden primero los incidentes nuevos por gravedad.
      </p>
    </section>
  );
}
