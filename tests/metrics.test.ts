import { describe, expect, it } from "vitest";
import { scenario } from "@/data/scenario-dana-malaga";
import { compare, criticalCall, simulate } from "@/lib/metrics";
import type { SimCall } from "@/lib/metrics";
import { initialState, processCall } from "@/lib/engine";

const calls = [...scenario.calls].sort((a, b) => a.t - b.t);
function simCalls(): SimCall[] {
  let state = initialState();
  const out: SimCall[] = [];
  for (const c of calls) {
    const r = processCall(state, { id: c.id, t: c.t, aml: c.aml, extraction: c.mock });
    state = r.state;
    const inc = state.assignment[c.id];
    out.push({ id: c.id, t: c.t, extraction: c.mock, incidentId: inc, first: state.incidents.find((i) => i.id === inc)!.callIds[0] === c.id });
  }
  return out;
}

describe("simulación de sala", () => {
  it("con un operador y llamadas simultáneas, sin copiloto atiende en orden de llegada", () => {
    const mk = (id: string, t: number, first = true): SimCall => ({ id, t, extraction: { severity: 3, risks: [] }, incidentId: id, first });
    const w = simulate([mk("a", 0), mk("b", 0), mk("c", 0)], 1, "sin_copiloto").wait;
    expect([w.a, w.b, w.c]).toEqual([0, 60, 120]);
  });
  it("con copiloto los duplicados esperan detrás y cuestan menos", () => {
    const mk = (id: string, t: number, first: boolean, severity: 3 | 5): SimCall => ({ id, t, extraction: { severity, risks: [] }, incidentId: "x", first });
    const w = simulate([mk("dup", 0, false, 3), mk("nuevo", 0, true, 5)], 1, "con_copiloto").wait;
    expect(w.nuevo).toBe(0);
    expect(w.dup).toBe(60);
  });
  it("la llamada crítica de la DANA es E1 y el copiloto no la hace esperar más", () => {
    const sc = simCalls();
    expect(criticalCall(sc)?.id).toBe("E1");
    const c = compare(sc, 2);
    expect(c.critical!.con).toBeLessThanOrEqual(c.critical!.sin);
    expect(c.meanNew!.con).toBeLessThan(c.meanNew!.sin);
  });
});
