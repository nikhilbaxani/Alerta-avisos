import { describe, expect, it } from "vitest";
import { simulateWaiting } from "@/lib/waiting";
import type { WaitingCall } from "@/lib/waiting";
import type { RiskTag } from "@/lib/types";

const call = (id: string, t: number, overrides: Partial<WaitingCall> = {}): WaitingCall => ({
  id, t, lang: "es", type: "otro", severity: 2, risks: [], decision: "new", ...overrides,
});
const run = (...calls: WaitingCall[]) => simulateWaiting(calls, 1).calls;

describe("Simulación de espera", () => {
  it("no interviene con un operador libre, ni cuando se libera justo a la llegada", () => {
    const calls = [call("A1", 0), call("B1", 1), call("C1", 60)];
    expect(simulateWaiting(calls, 2).calls).toEqual(calls.map((c) => ({ callId: c.id, arrival: c.t, humanAt: c.t, waiting: null })));
  });

  it("solo las fusiones seguras sin riesgo pueden liberar una línea; una zona gris necesita operador", () => {
    const calls = run(call("A1", 0), call("A2", 5, { decision: "merge" }), call("B1", 8, { decision: "ask" }), call("C1", 124));
    expect(calls.map((c) => [c.callId, c.humanAt, c.waiting?.outcome ?? null])).toEqual([
      ["A1", 0, null], ["A2", null, "duplicate"], ["B1", 60, "queued"], ["C1", 124, null],
    ]);
  });

  it("un duplicado atendido por operador ocupa 15 segundos", () => {
    expect(run(call("A2", 0, { decision: "merge" }), call("B1", 14), call("C1", 75)).map((c) => c.humanAt)).toEqual([0, 15, 75]);
  });

  it.each<RiskTag>(["vida", "dolor_pecho", "inconsciente", "sin_respuesta"])("escala de inmediato por %s incluso si es duplicado", (risk) => {
    const calls = run(call("A1", 0), call("B1", 5), call("A2", 10, { decision: "merge", risks: [risk] }));
    expect(calls.map((c) => c.humanAt)).toEqual([0, 75, 60]);
    expect(calls[2]).toMatchObject({ arrival: 10, waiting: { outcome: "escalated", reasons: [risk] } });
  });

  it("escala por gravedad 5 sin etiqueta y desempata por orden de llegada", () => {
    const calls = run(call("A1", 0), call("B1", 5), call("C1", 10, { severity: 5 }), call("D1", 15, { severity: 5 }));
    expect(calls.map((c) => c.humanAt)).toEqual([0, 180, 60, 120]);
    expect(calls[2].waiting).toMatchObject({ outcome: "escalated", reasons: ["severity_5"] });
  });

  it("solo usa guion pretraducido en el idioma de la llamada y no promete que haya ayuda en camino", () => {
    const calls = run(call("A1", 0), call("A2", 1, { lang: "en", risks: ["cables_electricos"], decision: "merge" }), call("B1", 2, { lang: "zz" }));
    expect(calls[1].waiting?.script).toEqual([
      "I am the 112 automated assistant.", "What happened?", "Can you tell me the exact address?", "Keep away from the cables on the ground.",
    ]);
    expect(calls[2].waiting?.script).toBeNull();
  });
});
