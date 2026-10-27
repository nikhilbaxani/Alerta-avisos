import { describe, expect, it } from "vitest";
import { priorityBreakdown, priorityOf, rankIncidents } from "@/lib/priority";
import type { Incident } from "@/lib/engine";

const base: Incident = {
  id: "INC-01", type: "medica", points: [], keywords: [], locations: [], risks: [], summary: "",
  severity: 3, people: 0, callIds: ["X1"], createdAt: 0, lastCallAt: 0, lastNewInfoAt: null,
  alerts: [], provisional: false, attended: false,
};

describe("prioridad", () => {
  it("aplica la fórmula de MEMORIA §10", () => {
    const i = { ...base, severity: 5, people: 7, risks: ["vida", "sin_respuesta"] as Incident["risks"], callIds: ["a", "b"], lastNewInfoAt: 100 };
    // 100 + 20 + 10 + 10 + 8 + 2 + 2 min
    expect(priorityOf(i, 120)).toBeCloseTo(152, 5);
  });
  it("la información nueva solo cuenta 60 s", () => {
    const i = { ...base, lastNewInfoAt: 0 };
    expect(priorityOf(i, 61) - priorityOf({ ...i, lastNewInfoAt: null }, 61)).toBe(0);
  });
  it("el tiempo sin atender suma y se detiene al atender", () => {
    expect(priorityOf(base, 600)).toBeGreaterThan(priorityOf(base, 0));
    expect(priorityOf({ ...base, attended: true }, 600)).toBe(priorityOf(base, 0));
  });
  it("ordena y explica", () => {
    const hi = { ...base, id: "H", severity: 5 };
    expect(rankIncidents([base, hi], 0)[0].id).toBe("H");
    expect(priorityBreakdown(hi, 0).reasons[0]).toBe("Gravedad 5/5");
  });
});
