import { describe, expect, it } from "vitest";
import { getScenario } from "@/data/scenarios";
import { runAgent } from "@/lib/agent";
import { snapshot } from "@/lib/engine";
import { init, reducer, simulatedResult } from "@/lib/useConsole";
import type { ConsoleState } from "@/lib/useConsole";
import { DEFAULT_OPERATORS, MAX_OPERATORS } from "@/lib/waiting";
import { consoleRoomCalls, consoleWaiting } from "@/lib/waitingConsole";

/**
 * Reproduce un escenario en el reductor de la consola (modo simulado, sin servidor) hasta `until` segundos,
 * con un operador que decide la zona gris al momento según `gold` (como `npm run agente` y el eval).
 */
function play(scenarioId: string, until = Infinity): ConsoleState {
  const scn = getScenario(scenarioId);
  const gold = Object.fromEntries(scn.calls.map((c) => [c.id, c.gold]));
  let s = { ...init(0, scenarioId), running: true };
  for (const c of [...scn.calls].sort((a, b) => a.t - b.t)) {
    if (c.t > until) break;
    s = reducer(s, { type: "tick", dt: c.t - s.clock });
    while (s.queue.length) {
      const id = s.queue[0];
      s = reducer(s, { type: "begin", id });
      s = reducer(s, { type: "processed", epoch: s.epoch, id, result: simulatedResult(scenarioId, id, s.engine.incidents.map(snapshot)) });
      const prov = s.engine.incidents.find((i) => i.id === s.engine.assignment[id] && i.provisional);
      if (prov) {
        const linked = s.engine.incidents.find((i) => i.id === prov.linkedTo)!;
        s = reducer(s, { type: "decide", incidentId: prov.id, same: gold[linked.callIds[0]] === gold[id] });
      }
    }
  }
  return s;
}

const outcomes = (xs: { callId: string; outcome: string }[]) => xs.map((x) => `${x.callId}:${x.outcome}`).sort();

describe("agente de espera en la consola (X11)", () => {
  for (const id of ["dana-malaga", "apagon-malaga"]) {
    for (const ops of [1, DEFAULT_OPERATORS, 3]) {
      it(`${id}, ${ops} operadores: lo mismo que \`npm run agente\` al final del escenario`, async () => {
        const s = play(id);
        const view = consoleWaiting(s, ops);
        const run = await runAgent(getScenario(id), { operators: ops });
        expect(consoleRoomCalls(s).map((c) => c.id).sort()).toEqual(run.roomCalls.map((c) => c.id).sort());
        expect(outcomes(view.rows)).toEqual(outcomes(run.waiting.attentions));
        expect(view.report.con).toEqual(run.waiting.con);
        expect(view.report.sin).toEqual(run.waiting.sin);
      });
    }
  }

  it("por defecto, los operadores de la franja de sala", () => {
    expect(consoleWaiting(play("dana-malaga")).operators).toBe(DEFAULT_OPERATORS);
  });

  it("DANA: el asistente atiende llamadas, agrupa duplicados sin operador y nadie espera solo", () => {
    const v = consoleWaiting(play("dana-malaga"));
    expect(v.rows.length).toBeGreaterThan(0);
    expect(v.report.con.resolvedWithoutOperator).toBeGreaterThan(0);
    expect(v.report.con.waitedAlone).toBe(0);
    expect(v.report.sin.waitedAlone).toBeGreaterThan(0);
    // La más reciente primero.
    expect(v.rows.map((r) => r.t)).toEqual([...v.rows.map((r) => r.t)].sort((a, b) => b - a));
  });

  it("E1 (dolor torácico, árabe) sale escalada con 1 y 2 operadores, y con aviso mientras espera", () => {
    const e1 = getScenario("dana-malaga").calls.find((c) => c.id === "E1")!;
    for (const ops of [1, DEFAULT_OPERATORS]) {
      const end = consoleWaiting(play("dana-malaga"), ops).rows.find((r) => r.callId === "E1")!;
      expect(end.outcome).toBe("escalada");
      expect(end.lang).toBe("ar");
      expect(end.script.translated).toBe(true);
      expect(end.escalation?.risks).toContain("dolor_pecho");
      // Justo al llegar todavía no la ha cogido nadie: aparece en el aviso de escaladas.
      const now = consoleWaiting(play("dana-malaga", e1.t), ops);
      const row = now.rows.find((r) => r.callId === "E1")!;
      expect(row.withOperator).toBe(false);
      expect(now.escalatedWaiting.map((r) => r.callId)).toContain("E1");
    }
  });

  it("nunca atiende una llamada que un operador libre podría coger", () => {
    const s = play("dana-malaga");
    expect(consoleWaiting(s, MAX_OPERATORS).rows).toEqual([]);
    const v = consoleWaiting(s, 2);
    for (const r of v.rows) expect(r.freeAt).toBeGreaterThan(r.t);
  });

  it("solo cuenta lo que ya ha llegado según el reloj", () => {
    const s = play("dana-malaga", 60);
    const ids = consoleRoomCalls(s).map((c) => c.id);
    expect(ids.length).toBe(getScenario("dana-malaga").calls.filter((c) => c.t <= 60).length);
    expect(consoleWaiting(init()).rows).toEqual([]);
  });
});
