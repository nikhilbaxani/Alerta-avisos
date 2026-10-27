import { describe, expect, it } from "vitest";
import { scenarioApagon } from "@/data/scenario-apagon-malaga";
import { scenario as dana } from "@/data/scenario-dana-malaga";
import { confirmDifferent, confirmSame, initialState, processCall } from "@/lib/engine";
import type { EngineCall, EngineState } from "@/lib/engine";

const calls = [...scenarioApagon.calls].sort((a, b) => a.t - b.t);
const byId: Record<string, EngineCall> = Object.fromEntries(calls.map((c) => [c.id, { id: c.id, t: c.t, aml: c.aml, extraction: c.mock }]));

describe("escenario del apagón", () => {
  it("los ids no chocan con la DANA", () => {
    const ids = new Set(dana.calls.map((c) => c.id));
    for (const c of calls) expect(ids.has(c.id)).toBe(false);
  });
  it("6 incidentes, sin fusiones incorrectas y M1 pregunta al operador", () => {
    let state: EngineState = initialState();
    const asked: string[] = [];
    for (const c of calls) {
      const r = processCall(state, byId[c.id]);
      state = r.state;
      if (r.decision.action === "ask") {
        asked.push(c.id);
        const prov = state.assignment[c.id];
        state = confirmDifferent(state, prov);
      }
    }
    expect(asked).toEqual(["M1"]);
    expect(state.incidents).toHaveLength(6);
    for (const inc of state.incidents) {
      expect(new Set(inc.callIds.map((id) => calls.find((c) => c.id === id)!.gold)).size).toBe(1);
    }
  });
  it("si el operador dice 'mismo', M1 se une a H", () => {
    let state: EngineState = initialState();
    for (const id of ["H1", "M1"]) {
      state = processCall(state, byId[id]).state;
    }
    state = confirmSame(state, state.assignment.M1, byId);
    expect(state.incidents).toHaveLength(1);
  });
});
