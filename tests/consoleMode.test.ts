import { describe, expect, it } from "vitest";
import { scenario } from "@/data/scenario-dana-malaga";
import { decide } from "@/lib/cluster";
import { actionUnit, consoleHazards, consoleProposals, consoleUnits } from "@/lib/useConsole";
import { consoleReducer, initialConsoleState } from "@/lib/consoleMode";
import type { CallMeta, ConsoleState } from "@/lib/consoleMode";
import type { ProcessResult } from "@/lib/types";

const sampleCall = [...scenario.calls].sort((a, b) => a.t - b.t)[0];

function makeLiveCall(id = "P1", t = 0): { call: CallMeta; result: ProcessResult } {
  const aml = { lat: 36.716, lng: -4.548, acc: 150 };
  const extraction = {
    ...sampleCall.mock,
    summary_es: "Coche atrapado en agua en Campanillas",
    location_text: "Campanillas",
  };
  const call: CallMeta = {
    id,
    t,
    lang: "es",
    phone: "Público (QR)",
    aml,
    transcript: "Hay un coche atrapado en el agua en Campanillas",
    live: true,
  };
  const result: ProcessResult = {
    callId: id,
    transcript: call.transcript,
    language: "es",
    extraction,
    decision: decide({ aml, extraction }, []),
    engine: { stt: "Whisper (VPS)", llm: "Reglas (sin LLM)" },
    timings: { sttMs: 1200, llmMs: 0, totalMs: 1400 },
  };
  return { call, result };
}

function beginFirstSimCall(s: ConsoleState) {
  let next = consoleReducer(s, { type: "play" });
  next = consoleReducer(next, { type: "tick", dt: sampleCall.t + 1 });
  const id = next.queue[0];
  next = consoleReducer(next, { type: "begin", id });
  const result: ProcessResult = {
    callId: id,
    transcript: sampleCall.transcript,
    language: sampleCall.lang,
    extraction: sampleCall.mock,
    decision: decide({ aml: sampleCall.aml, extraction: sampleCall.mock }, []),
    engine: { stt: "Transcripción del guion", llm: "Modo simulado" },
    timings: { sttMs: 0, llmMs: 0, totalMs: 0 },
  };
  return { state: next, processed: { type: "processed", epoch: next.epoch, id, result } as const };
}

function advanceSimWithFirstCall(s: ConsoleState): ConsoleState {
  const { state, processed } = beginFirstSimCall(s);
  return consoleReducer(state, processed);
}

describe("consoleMode", () => {
  it("S33: aprueba y descarta en directo sin alterar el registro ni la flota de Simulación", () => {
    const sim = advanceSimWithFirstCall(initialConsoleState());
    const proposals = consoleProposals(sim);
    expect(proposals.length).toBeGreaterThan(0);
    const plan = { type: "plan", proposals } as const;
    const planned = consoleReducer(sim, plan);
    const pending = planned.actions?.find((a) => a.status === "propuesta");
    expect(pending).toBeDefined();
    const approval = { type: "actionApprove", key: pending!.key } as const;
    const sent = consoleReducer(planned, approval);
    expect(sent.actions.find((a) => a.key === pending!.key)?.status).toBe("enviada");
    expect(sent.audit.at(-1)?.kind).toBe("accion_aprobada");

    const live = consoleReducer(sent, { type: "mode", mode: "live" });
    const accepted = consoleReducer(live, { type: "live", ...makeLiveCall() });
    expect(accepted.arrived).toEqual(["P1"]);
    const twoIncidents = consoleReducer(accepted, { type: "live", ...makeLiveCall("P2") });
    const livePlanned = consoleReducer(twoIncidents, { type: "plan", proposals: consoleProposals(twoIncidents) });
    const [first, second] = livePlanned.actions.filter((a) => a.tool === "proponer_recursos");
    expect(first).toMatchObject({ status: "propuesta", evidence: { callIds: ["P1"] } });
    expect(second).toBeDefined();
    expect(actionUnit(livePlanned, first)).toBeNull();
    const approved = consoleReducer(livePlanned, { type: "actionApprove", key: first.key });
    const discarded = consoleReducer(approved, { type: "actionDiscard", key: second.key });
    expect(discarded.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: first.key, status: "enviada", receipt: expect.objectContaining({ simulated: true }) }),
      expect.objectContaining({ key: second.key, status: "descartada", receipt: null }),
    ]));
    expect(discarded.audit.slice(-2).map((a) => a.kind)).toEqual(["accion_aprobada", "accion_descartada"]);
    expect(consoleUnits(discarded)).toEqual([]);
    expect(consoleHazards(discarded)).toEqual([]);
    expect(discarded.unitAssignments).toEqual({});
    expect(discarded.audit.at(-2)?.detail).not.toContain("unidad libre");
    const restored = consoleReducer(discarded, { type: "mode", mode: "sim" });
    expect(consoleReducer(restored, { type: "mode", mode: "live" }).actions).toEqual(discarded.actions);
    const wiped = consoleReducer(restored, { type: "relayEpoch", epoch: "new" });
    expect(wiped.actions).toEqual(sent.actions);
    expect(consoleReducer(wiped, { type: "mode", mode: "live" }).actions).toEqual([]);
    expect(restored.actions).toEqual(sent.actions);
    expect(restored.audit).toEqual(sent.audit);
    expect(consoleReducer(restored, { type: "reset" }).actions).toEqual([]);
  });

  it("S33: no planifica sobre una pregunta ámbar; los avisos informativos siguen siendo automáticos", () => {
    const live = consoleReducer(initialConsoleState(), { type: "mode", mode: "live" });
    const first = makeLiveCall();
    first.result.extraction.risks = [...first.result.extraction.risks, "cables_electricos"];
    const accepted = consoleReducer(live, { type: "live", ...first });
    const second = makeLiveCall("P2");
    second.result.decision = { ...second.result.decision, action: "ask", incidentId: "INC-01" };
    const withQuestion = consoleReducer(accepted, { type: "live", ...second });
    expect(withQuestion.engine.incidents[1]?.provisional).toBe(true);
    const proposals = consoleProposals(withQuestion);
    expect(proposals).not.toEqual([]);
    expect(proposals.flatMap((p) => p.evidence.callIds)).not.toContain("P2");
    const planned = consoleReducer(withQuestion, { type: "plan", proposals });
    expect(planned.actions.find((a) => a.tool === "avisar_distribuidora")).toMatchObject({ status: "enviada", approval: { by: "automatica" }, receipt: { simulated: true } });
    expect(planned.audit.at(-1)?.kind).toBe("accion_auto");
    expect(consoleReducer(planned, { type: "relayEpoch", epoch: "new" }).actions).toEqual([]);
  });

  it("S33: aprueba en lote los duplicados elegibles cuando existen teléfonos de prueba", () => {
    let s = consoleReducer(initialConsoleState(), { type: "mode", mode: "live" });
    s = consoleReducer(s, { type: "live", ...makeLiveCall() });
    s = consoleReducer(s, { type: "plan", proposals: consoleProposals(s) });
    const resources = s.actions.find((a) => a.tool === "proponer_recursos")!;
    expect(resources).toBeDefined();
    s = consoleReducer(s, { type: "actionApprove", key: resources.key });
    const second = makeLiveCall("P2");
    second.result.decision = { ...second.result.decision, action: "merge", incidentId: "INC-01" };
    const withoutPhone = consoleReducer(s, { type: "live", ...second });
    expect(consoleProposals(withoutPhone).some((a) => a.tool === "sms_duplicado")).toBe(false);
    second.call.phone = "600***002";
    s = consoleReducer(s, { type: "live", ...second });
    s = consoleReducer(s, { type: "plan", proposals: consoleProposals(s) });
    expect(s.actions.find((a) => a.tool === "sms_duplicado")).toMatchObject({ status: "propuesta", args: { revisar: [] } });
    const batched = consoleReducer(s, { type: "actionApproveBatch", incidentId: "INC-01" });
    expect(batched.actions.find((a) => a.tool === "sms_duplicado")).toMatchObject({ status: "enviada", approval: { by: "operador", batch: true }, receipt: { simulated: true } });
    expect(batched.audit.at(-1)?.kind).toBe("accion_aprobada");
  });

  it("arranca en modo sim vacío y al cambiar a live muestra estado vacío", () => {
    const s0 = initialConsoleState();
    expect(s0.mode).toBe("sim");
    expect(s0.engine.incidents).toHaveLength(0);
    expect(Object.keys(s0.recs)).toHaveLength(0);

    const sLive = consoleReducer(s0, { type: "mode", mode: "live" });
    expect(sLive.mode).toBe("live");
    expect(sLive.engine.incidents).toHaveLength(0);
    expect(Object.keys(sLive.recs)).toHaveLength(0);
    expect(sLive.arrived).toHaveLength(0);
    expect(sLive.clock).toBe(0);
  });

  it("acepta una llamada pública en live y conserva ambos modos al alternar", () => {
    // Progresa sim primero
    const sSimProgressed = advanceSimWithFirstCall(initialConsoleState());
    expect(sSimProgressed.engine.incidents).toHaveLength(1);
    const simIncidentId = sSimProgressed.engine.incidents[0].id;
    const simClock = sSimProgressed.clock;

    // Cambia a live → vacío
    let s = consoleReducer(sSimProgressed, { type: "mode", mode: "live" });
    expect(s.mode).toBe("live");
    expect(s.engine.incidents).toHaveLength(0);
    expect(s.arrived).toHaveLength(0);

    // Acepta llamada pública en live → 1 incidente en live
    const { call, result } = makeLiveCall("P1");
    s = consoleReducer(s, { type: "live", call, result });
    expect(s.engine.incidents).toHaveLength(1);
    expect(s.arrived).toEqual(["P1"]);
    expect(s.recs["P1"]?.status).toBe("done");

    // Vuelve a sim → estado de sim intacto
    s = consoleReducer(s, { type: "mode", mode: "sim" });
    expect(s.mode).toBe("sim");
    expect(s.engine.incidents).toHaveLength(1);
    expect(s.engine.incidents[0].id).toBe(simIncidentId);
    expect(s.clock).toBe(simClock);
    expect(s.running).toBe(true);
    expect(s.arrived).not.toContain("P1");

    // Vuelve a live → incidente de live sigue ahí
    s = consoleReducer(s, { type: "mode", mode: "live" });
    expect(s.mode).toBe("live");
    expect(s.engine.incidents).toHaveLength(1);
    expect(s.arrived).toEqual(["P1"]);
  });

  it("S12: un resultado de sim en curso llega a sim aunque esté abierta la pestaña QR", () => {
    const { state, processed } = beginFirstSimCall(initialConsoleState());
    const live = consoleReducer(state, { type: "mode", mode: "live" });
    expect(live.saved.sim?.inflight).toBe(sampleCall.id);

    const completed = consoleReducer(live, processed);
    expect(completed.mode).toBe("live");
    expect(completed.engine.incidents).toHaveLength(0);
    expect(completed.saved.sim?.inflight).toBeNull();
    expect(completed.saved.sim?.engine.incidents).toHaveLength(1);
  });

  it("S12: aceptar una llamada QR deja la sesión de sim idéntica", () => {
    const sim = advanceSimWithFirstCall(initialConsoleState());
    const live = consoleReducer(sim, { type: "mode", mode: "live" });
    const before = JSON.stringify(live.saved.sim);
    const { call, result } = makeLiveCall();
    const accepted = consoleReducer(live, { type: "live", call, result });
    expect(accepted.arrived).toContain(call.id);
    expect(JSON.stringify(accepted.saved.sim)).toBe(before);

    const restored = consoleReducer(accepted, { type: "mode", mode: "sim" });
    expect(restored.arrived).not.toContain(call.id);
    expect(restored.recs[call.id]).toBeUndefined();
  });

  it("cambiar de escenario en sim no toca el estado de live", () => {
    let s = consoleReducer(initialConsoleState(), { type: "mode", mode: "live" });
    const { call, result } = makeLiveCall("P1");
    s = consoleReducer(s, { type: "live", call, result });
    expect(s.engine.incidents).toHaveLength(1);

    // Cambia a sim y cambia de escenario a apagón
    s = consoleReducer(s, { type: "mode", mode: "sim" });
    s = advanceSimWithFirstCall(s);
    s = consoleReducer(s, { type: "scenario", id: "apagon-malaga" });
    expect(s.scenarioId).toBe("apagon-malaga");
    expect(s.engine.incidents).toHaveLength(0);
    expect(s.clock).toBe(0);

    // Vuelve a live → la llamada pública sigue ahí
    s = consoleReducer(s, { type: "mode", mode: "live" });
    expect(s.engine.incidents).toHaveLength(1);
    expect(s.arrived).toEqual(["P1"]);
  });

  it("el micrófono local sigue en sim aunque el resultado llegue con la pestaña QR abierta", () => {
    const sim = advanceSimWithFirstCall(initialConsoleState());
    const { call, result } = makeLiveCall("L1");
    let s = consoleReducer(sim, { type: "mode", mode: "live" });
    s = consoleReducer(s, { type: "microphone", epoch: sim.epoch, call, result });
    expect(s.arrived).toEqual([]);
    expect(s.engine.incidents).toEqual([]);

    s = consoleReducer(s, { type: "mode", mode: "sim" });
    expect(s.arrived).toEqual([...sim.arrived, "L1"]);
    expect(s.recs.L1.status).toBe("done");
    expect(s.engine.incidents).toHaveLength(2);

    s = consoleReducer(s, { type: "reset" });
    expect(consoleReducer(s, { type: "microphone", epoch: sim.epoch, call, result })).toBe(s);
  });

  it("reset en live limpia solo live y conserva sim", () => {
    let s = advanceSimWithFirstCall(initialConsoleState());
    const simArrived = [...s.arrived];

    s = consoleReducer(s, { type: "mode", mode: "live" });
    const { call, result } = makeLiveCall("P1");
    s = consoleReducer(s, { type: "live", call, result });
    expect(s.engine.incidents).toHaveLength(1);

    // Reset en live
    s = consoleReducer(s, { type: "reset" });
    expect(s.mode).toBe("live");
    expect(s.engine.incidents).toHaveLength(0);
    expect(s.arrived).toHaveLength(0);
    expect(s.clock).toBe(0);

    // Sim sigue intacto
    s = consoleReducer(s, { type: "mode", mode: "sim" });
    expect(s.engine.incidents).toHaveLength(1);
    expect(s.arrived).toEqual(simArrived);
  });

  it("reset en sim limpia solo sim y conserva live", () => {
    let s = consoleReducer(initialConsoleState(), { type: "mode", mode: "live" });
    const { call, result } = makeLiveCall("P1");
    s = consoleReducer(s, { type: "live", call, result });

    s = consoleReducer(s, { type: "mode", mode: "sim" });
    s = advanceSimWithFirstCall(s);
    s = consoleReducer(s, { type: "reset" });
    expect(s.engine.incidents).toHaveLength(0);

    s = consoleReducer(s, { type: "mode", mode: "live" });
    expect(s.engine.incidents).toHaveLength(1);
    expect(s.arrived).toEqual(["P1"]);
  });

  it("en live no avanzan los controles de reproducción ni entran llamadas del escenario", () => {
    let s = consoleReducer(initialConsoleState(), { type: "mode", mode: "live" });
    s = consoleReducer(s, { type: "play" });
    expect(s.running).toBe(false);
    s = consoleReducer(s, { type: "tick", dt: 60 });
    expect(s.clock).toBe(0);
    expect(s.arrived).toHaveLength(0);
    expect(s.queue).toHaveLength(0);
  });

  it("el reloj en vivo (liveTick) avanza solo tras la primera llamada aceptada", () => {
    let s = consoleReducer(initialConsoleState(), { type: "mode", mode: "live" });
    // Sin llamadas aún, liveTick no avanza el reloj
    s = consoleReducer(s, { type: "liveTick", dt: 5 });
    expect(s.clock).toBe(0);

    const { call, result } = makeLiveCall("P1");
    s = consoleReducer(s, { type: "live", call, result });
    s = consoleReducer(s, { type: "liveTick", dt: 12 });
    expect(s.clock).toBe(12);
    expect(s.arrived).toEqual(["P1"]);
  });

  it("una acción live despachada mientras el operador está en sim se aplica al estado live", () => {
    let s = advanceSimWithFirstCall(initialConsoleState());
    const { call, result } = makeLiveCall("P1");
    s = consoleReducer(s, { type: "live", call, result });
    expect(s.mode).toBe("sim");
    expect(s.arrived).not.toContain("P1");

    const sLive = consoleReducer(s, { type: "mode", mode: "live" });
    expect(sLive.arrived).toEqual(["P1"]);
    expect(sLive.engine.incidents).toHaveLength(1);
  });
});
