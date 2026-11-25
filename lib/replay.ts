/**
 * Reproduce un escenario en modo simulado de forma síncrona y determinista, con el mismo reductor, el
 * mismo algoritmo de agrupación y el mismo agente de acciones que la consola. La presentación
 * (/presentacion) lo usa para enseñar estados reales del escenario sin esperar al reloj.
 */
import { getScenario } from "@/data/scenarios";
import { snapshot } from "@/lib/engine";
import { consoleProposals, init, reducer, scenarioEnd, simulatedResult } from "@/lib/useConsole";
import type { ConsoleState } from "@/lib/useConsole";

/** Lo que hace la consola tras cada cambio: las reglas proponen y las acciones automáticas se envían. */
export function planActions(s: ConsoleState): ConsoleState {
  return reducer(s, { type: "plan", proposals: consoleProposals(s) });
}

/**
 * Estado de la consola en el segundo `until` del escenario. `decisions` responde a la zona gris como lo
 * haría el operador, por la llamada que la abrió (`true` = mismo incidente), en cuanto aparece.
 */
export function replayTo(scenarioId: string, until = Infinity, decisions: Record<string, boolean> = {}): ConsoleState {
  let s = init(0, scenarioId);
  const calls = [...getScenario(scenarioId).calls].sort((a, b) => a.t - b.t).filter((c) => c.t <= until);
  for (const c of calls) {
    if (c.t > s.clock || s.arrived.length === 0) s = reducer(s, { type: "tick", dt: c.t - s.clock });
    while (s.queue.length > 0) {
      const id = s.queue[0];
      s = reducer(s, { type: "begin", id });
      const result = simulatedResult(scenarioId, id, s.engine.incidents.map(snapshot));
      s = reducer(s, { type: "processed", epoch: s.epoch, id, result });
    }
    for (const inc of s.engine.incidents.filter((i) => i.provisional)) {
      const lead = inc.callIds[0];
      if (lead in decisions) s = reducer(s, { type: "decide", incidentId: inc.id, same: decisions[lead] });
    }
    s = planActions(s);
  }
  const end = Math.min(until, scenarioEnd(scenarioId) + 1);
  if (end > s.clock) s = reducer(s, { type: "tick", dt: end - s.clock });
  return s;
}
