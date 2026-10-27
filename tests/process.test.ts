import { describe, expect, it, vi, afterEach } from "vitest";
import { scenario } from "@/data/scenario-dana-malaga";
import { getConfig } from "@/lib/config";
import { processCall } from "@/lib/process";
import { snapshot, initialState, processCall as engineProcess } from "@/lib/engine";

const sim = getConfig({});
const call = (id: string) => scenario.calls.find((c) => c.id === id)!;

afterEach(() => vi.unstubAllGlobals());

describe("processCall (modo simulado)", () => {
  it("F1 tras A1–A4 responde ask", async () => {
    let state = initialState();
    for (const id of ["A1", "A2", "A3", "A4"]) {
      state = engineProcess(state, { id, t: call(id).t, aml: call(id).aml, extraction: call(id).mock }).state;
    }
    const r = await processCall(sim, { callId: "F1", aml: call("F1").aml, incidents: state.incidents.map(snapshot) });
    expect(r.decision.action).toBe("ask");
    expect(r.engine.llm).toBe("Modo simulado");
    expect(r.decision.judge).toBeUndefined();
  });
  it("rechaza llamadas desconocidas sin LLM", async () => {
    await expect(processCall(sim, { transcript: "hola", aml: call("A1").aml, incidents: [] })).rejects.toThrow();
  });
});

describe("processCall (IA local simulada)", () => {
  it("el juez opina pero ask sigue siendo ask", async () => {
    const answers = [
      JSON.stringify(call("F1").mock),
      JSON.stringify({ same: true, confidence: 0.99, reason: "Parece el mismo coche." }),
    ];
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "```json\n" + answers.shift() + "\n```" } }] })),
    ));
    const cfg = getConfig({ LLM_BASE_URL: "http://x/v1" });
    let state = initialState();
    for (const id of ["A1", "A2"]) {
      state = engineProcess(state, { id, t: 0, aml: call(id).aml, extraction: call(id).mock }).state;
    }
    const r = await processCall(cfg, { callId: "F1", aml: call("F1").aml, incidents: state.incidents.map(snapshot) });
    expect(r.decision.action).toBe("ask");
    expect(r.decision.judge?.same).toBe(true);
  });
});
