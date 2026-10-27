import { describe, expect, it } from "vitest";
import { scenario } from "@/data/scenario-dana-malaga";
import { ASK_THRESHOLD, MERGE_THRESHOLD, haversine, newInfo, overlap, tokens } from "@/lib/cluster";
import { confirmDifferent, confirmSame, initialState, processCall, splitCall } from "@/lib/engine";
import type { EngineCall, EngineState } from "@/lib/engine";

const calls = [...scenario.calls].sort((a, b) => a.t - b.t);
const byId: Record<string, EngineCall> = Object.fromEntries(
  calls.map((c) => [c.id, { id: c.id, t: c.t, aml: c.aml, extraction: c.mock }]),
);

function run(ids: string[], operator: Record<string, "same" | "different"> = {}) {
  let state: EngineState = initialState();
  const out: Record<string, ReturnType<typeof processCall>["decision"]> = {};
  for (const id of ids) {
    const r = processCall(state, byId[id]);
    state = r.state;
    out[id] = r.decision;
    if (r.decision.action === "ask") {
      const prov = state.assignment[id];
      state = operator[id] === "same" ? confirmSame(state, prov, byId) : confirmDifferent(state, prov);
    }
  }
  return { state, out };
}

describe("utilidades", () => {
  it("haversine: 1° de latitud ≈ 111 km", () => {
    expect(haversine({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeGreaterThan(111_000);
    expect(haversine({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeLessThan(111_400);
  });
  it("tokens: sin tildes, vacías ni signos, raíz de 6", () => {
    expect([...tokens("Calle de la Hilera, Avenida")]).toEqual(["hilera"]);
    expect(tokens("Campanillas").has("campan")).toBe(true);
  });
  it("overlap usa el mínimo", () => {
    expect(overlap(new Set(["a", "b"]), new Set(["a", "b", "c", "d"]))).toBe(1);
    expect(overlap(new Set(), new Set(["a"]))).toBe(0);
  });
  it("newInfo solo avisa de riesgos vigilados y nuevos", () => {
    expect(newInfo(["menor", "agua_subiendo", "vida"], ["vida"])).toEqual(["menor"]);
    expect(newInfo(["menor"], ["menor"])).toEqual([]);
  });
});

describe("agrupación del escenario", () => {
  it("A2–A6 se fusionan con A", () => {
    const { out, state } = run(["A1", "A2", "A3", "A4", "A5", "A6"]);
    for (const id of ["A2", "A3", "A4", "A5", "A6"]) expect(out[id].action).toBe("merge");
    expect(state.incidents).toHaveLength(1);
  });
  it("F1 es zona gris frente a A y nunca se fusiona sola", () => {
    const { out } = run(["A1", "A2", "A3", "A4", "F1"]);
    expect(out.F1.action).toBe("ask");
    expect(out.F1.incidentId).toBe("INC-01");
    expect(out.F1.score).toBeGreaterThanOrEqual(ASK_THRESHOLD);
    expect(out.F1.score).toBeLessThan(MERGE_THRESHOLD);
    expect(out.F1.reason).toMatch(/Decide el operador/);
  });
  it("F1 'distinto' y F2 se fusiona con F", () => {
    const { out, state } = run(["A1", "A2", "F1", "F2"], { F1: "different" });
    expect(out.F2.action).toBe("merge");
    expect(state.assignment.F1).toBe(state.assignment.F2);
    expect(state.assignment.F1).not.toBe(state.assignment.A1);
  });
  it("F1 'mismo' lo une a A", () => {
    const { state } = run(["A1", "F1"], { F1: "same" });
    expect(state.incidents).toHaveLength(1);
    expect(state.assignment.F1).toBe(state.assignment.A1);
  });
  it("B2 llama de lejos pero se agrupa por dirección (zona gris)", () => {
    const { out } = run(["B1", "B2"]);
    expect(out.B2.action).toBe("ask");
    expect(out.B2.incidentId).toBe("INC-01");
  });
  it("D no se fusiona con B (tipo distinto)", () => {
    const { out, state } = run(["B1", "D1"]);
    expect(out.D1.action).toBe("new");
    expect(state.incidents).toHaveLength(2);
  });
  it("A4 genera aviso de menor; C3 de cables; B3 de no responde; G3 de atrapados", () => {
    const check = (ids: string[], inc: string, risk: string) => {
      const { state } = run(ids);
      const i = state.incidents.find((x) => x.id === inc)!;
      expect(i.alerts.flatMap((a) => a.risks)).toContain(risk);
    };
    check(["A1", "A2", "A4"], "INC-01", "menor");
    check(["C1", "C2", "C3"], "INC-01", "cables_electricos");
    check(["B1", "B3"], "INC-01", "sin_respuesta");
    check(["G1", "G2", "G3"], "INC-01", "atrapados");
  });
  it("E1 es incidente nuevo", () => {
    const { out } = run(["A1", "D1", "E1"]);
    expect(out.E1.action).toBe("new");
  });
  it("Separar saca la llamada y la deja como incidente propio", () => {
    const { state } = run(["A1", "A2", "A3"]);
    const after = splitCall(state, "A3", byId);
    expect(after.incidents).toHaveLength(2);
    expect(after.assignment.A3).not.toBe(after.assignment.A1);
    expect(after.incidents[0].callIds).toEqual(["A1", "A2"]);
  });
  it("el escenario completo da 7 incidentes sin fusiones erróneas", () => {
    const ops: Record<string, "same" | "different"> = { F1: "different", B2: "same" };
    const { state } = run(calls.map((c) => c.id), ops);
    expect(state.incidents).toHaveLength(7);
    for (const inc of state.incidents) {
      expect(new Set(inc.callIds.map((id) => calls.find((c) => c.id === id)!.gold)).size).toBe(1);
    }
  });
});
