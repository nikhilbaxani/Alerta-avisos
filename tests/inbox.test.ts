import { describe, expect, it } from "vitest";
import { consoleReducer, initialConsoleState } from "@/lib/consoleMode";
import { scenario } from "@/data/scenario-dana-malaga";
import { initialState, processCall, snapshot } from "@/lib/engine";
import type { EngineCall } from "@/lib/engine";
import { HANDLED_CAP, PENDING_CAP, acceptEvent, addEvent, discardEvent, emptyInbox, handledKey, loadHandled, markLoaded, publicEventToCall, saveHandled, handleAckEvent } from "@/lib/inbox";
import { readRelayEpoch, clearInbox, receiveAccepted, prepareAcceptedCall } from "@/lib/inbox";
import { MAX_TRANSCRIPT_CHARS, isPublicCallEvent } from "@/lib/publicCall";
import type { PublicCallEvent } from "@/lib/publicCall";

it("S31: lee épocas válidas e ignora anuncios mal formados", () => {
  expect(readRelayEpoch({ epoch: "Ab_9-" })).toBe("Ab_9-");
  expect(readRelayEpoch({ epoch: "x".repeat(64) })).toBe("x".repeat(64));
  for (const epoch of [null, 2, "", "a b", "a\n", "x".repeat(65)]) expect(readRelayEpoch({ epoch })).toBeUndefined();
});

const first = [...scenario.calls].sort((a, b) => a.t - b.t)[0];
const baseCall: EngineCall = { id: first.id, t: first.t, aml: first.aml, extraction: first.mock };

function event(over: Partial<PublicCallEvent> = {}): PublicCallEvent {
  return {
    id: "P1",
    receivedAt: "2026-11-24T10:00:00.000Z",
    durationS: 20,
    language: "es",
    transcript: first.transcript,
    translation_en: null,
    extraction: first.mock,
    location: { place: "Centro", known: true, aml: { ...first.aml, acc: 150 } },
    timings: { sttMs: 1200, totalMs: 1500 },
    ...over,
  };
}

const withIncident = () => processCall(initialState(), baseCall).state.incidents.map(snapshot);

describe("publicEventToCall", () => {
  it("convierte un evento válido en meta y resultado", () => {
    const { meta, result } = publicEventToCall(event(), [], 42);
    expect(meta).toMatchObject({ id: "P1", live: true, lang: "es", transcript: first.transcript, t: 42 });
    expect(meta.phone).toMatch(/Público/);
    expect(result.callId).toBe("P1");
    expect(result.decision.action).toBe("new");
    expect(result.engine).toEqual({ stt: "Whisper (VPS)", llm: "Reglas (sin LLM)" });
    expect(result.timings).toEqual({ sttMs: 1200, llmMs: 0, totalMs: 1500 });
  });

  it("mantiene la fusión si la ubicación es conocida", () => {
    const { result } = publicEventToCall(event({ location: { place: "x", known: true, aml: first.aml } }), withIncident(), 0);
    expect(result.decision.action).toBe("merge");
  });

  it("rebaja a consulta una fusión con ubicación desconocida", () => {
    const { result } = publicEventToCall(event({ location: { place: null, known: false, aml: first.aml } }), withIncident(), 0);
    expect(result.decision.action).toBe("ask");
    expect(result.decision.incidentId).toBeDefined();
    expect(result.decision.reason).toContain("Ubicación no reconocida en el audio: decide el operador.");
  });

  it("muestra 'LLM del equipo' cuando extractor es 'llm' y 'Reglas (sin LLM)' en otro caso", () => {
    expect(publicEventToCall(event({ extractor: "llm" }), [], 0).result.engine).toEqual({
      stt: "Whisper (VPS)",
      llm: "LLM del equipo",
    });
    expect(publicEventToCall(event({ extractor: "rules" }), [], 0).result.engine).toEqual({
      stt: "Whisper (VPS)",
      llm: "Reglas (sin LLM)",
    });
    expect(publicEventToCall(event(), [], 0).result.engine).toEqual({
      stt: "Whisper (VPS)",
      llm: "Reglas (sin LLM)",
    });
  });
});

describe("bandeja", () => {
  it("retira la aceptada sin perder el evento por un handled previo y valida payloads", () => {
    const s = addEvent(addEvent(emptyInbox, event()), event({ id: "P2" }));
    expect(receiveAccepted(s, null)).toEqual({ state: s, accepted: null });
    const handled = handleAckEvent(s, { id: "P1", outcome: "accepted" });
    expect(receiveAccepted(handled, event())).toEqual({ state: handled, accepted: event() });
    expect(receiveAccepted(s, event()).state).toEqual(handled);
    expect(clearInbox(handled)).toEqual({ pending: [], seen: ["P1"] });
  });

  it("la sesión deduplica por id y conserva la pregunta para ubicación desconocida", () => {
    const ev = event({ location: { place: null, known: false, aml: first.aml } });
    expect(prepareAcceptedCall(ev, { P1: true }, withIncident(), 5)).toBeNull();
    expect(prepareAcceptedCall(ev, {}, withIncident(), 5)?.result.decision.action).toBe("ask");
  });
  it("aplica aceptadas en directo aunque Simulación esté activa y limpiar no borra la sesión", () => {
    const sim = initialConsoleState();
    const inbox = addEvent(emptyInbox, event());
    const incoming = receiveAccepted(inbox, event());
    const prepared = prepareAcceptedCall(incoming.accepted!, {}, [], 0)!;
    const next = consoleReducer(sim, { type: "live", call: prepared.meta, result: prepared.result });
    expect(next.mode).toBe("sim");
    expect(next.engine).toBe(sim.engine);
    expect(next.arrived).toBe(sim.arrived);
    expect(clearInbox(inbox).pending).toEqual([]);
    expect(consoleReducer(next, { type: "mode", mode: "live" }).arrived).toEqual(["P1"]);
  });

  it("añade, deduplica por id e ignora eventos inválidos", () => {
    let s = addEvent(emptyInbox, event());
    s = addEvent(s, event());
    expect(s.pending).toHaveLength(1);
    const bad = addEvent(s, { id: "x" });
    expect(bad).toBe(s);
  });

  it("un acuse de otra consola quita solo esa llamada y evita que se vuelva a ofrecer", () => {
    const s = addEvent(addEvent(emptyInbox, event()), event({ id: "P2" }));
    expect(handleAckEvent(s, { id: "P2", outcome: "inválido" })).toBe(s);
    const next = handleAckEvent(s, { id: "P1", outcome: "accepted" });
    expect(next.pending.map((e) => e.id)).toEqual(["P2"]);
    expect(addEvent(next, event())).toBe(next);
  });

  it("descartar quita la llamada y no la deja volver", () => {
    let s = addEvent(emptyInbox, event());
    s = discardEvent(s, "P1");
    expect(s.pending).toHaveLength(0);
    expect(addEvent(s, event()).pending).toHaveLength(0);
  });

  it("aceptar quita la llamada y devuelve el evento", () => {
    const s = addEvent(emptyInbox, event());
    const { state, accepted } = acceptEvent(s, "P1");
    expect(accepted?.id).toBe("P1");
    expect(state.pending).toHaveLength(0);
    expect(acceptEvent(state, "P1").accepted).toBeNull();
  });

  it("descartar no toca el estado del motor", () => {
    const engine = initialState();
    discardEvent(addEvent(emptyInbox, event()), "P1");
    expect(engine).toEqual(initialState());
  });

  it("limita las pendientes", () => {
    let s = emptyInbox;
    for (let i = 1; i <= PENDING_CAP + 5; i++) s = addEvent(s, event({ id: `P${i}` }));
    expect(s.pending).toHaveLength(PENDING_CAP);
    expect(s.pending[0].id).toBe("P6");
  });
});

function fakeStorage(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
}

describe("llamadas ya tratadas tras recargar la consola", () => {
  const URL_A = "https://a.example/relay";
  const URL_B = "https://b.example/relay";

  it("las ids aceptadas o descartadas se guardan y, tras recargar, el reenvío del relay no las ofrece", () => {
    const st = fakeStorage();
    let s = addEvent(addEvent(addEvent(emptyInbox, event({ id: "P1" })), event({ id: "P2" })), event({ id: "P3" }));
    s = acceptEvent(s, "P1").state;
    s = discardEvent(s, "P2");
    saveHandled(st, URL_A, s.seen);
    let after = markLoaded(emptyInbox, loadHandled(st, URL_A));
    for (const id of ["P1", "P2", "P3"]) after = addEvent(after, event({ id }));
    expect(after.pending.map((e) => e.id)).toEqual(["P3"]);
  });

  it("está acotado a las últimas 500 y conserva las más recientes", () => {
    const st = fakeStorage();
    const ids = Array.from({ length: HANDLED_CAP + 20 }, (_, i) => `P${i + 1}`);
    saveHandled(st, URL_A, ids);
    const back = loadHandled(st, URL_A);
    expect(HANDLED_CAP).toBe(500);
    expect(back).toHaveLength(500);
    expect(back[0]).toBe("P21");
    expect(back.at(-1)).toBe(`P${HANDLED_CAP + 20}`);
    let s = emptyInbox;
    for (let i = 1; i <= HANDLED_CAP + 5; i++) s = discardEvent(addEvent(s, event({ id: `Q${i}` })), `Q${i}`);
    expect(s.seen).toHaveLength(HANDLED_CAP);
    expect(s.seen[0]).toBe("Q6");
  });

  it("S31: no mezcla ids tratadas de épocas diferentes", () => {
    const st = fakeStorage();
    saveHandled(st, URL_A, ["P1"]);
    expect(loadHandled(st, URL_A, "old")).toEqual([]);
    saveHandled(st, URL_A, ["P1"], "old");
    expect(loadHandled(st, URL_A, "old")).toEqual(["P1"]);
    expect(loadHandled(st, URL_A, "new")).toEqual([]);
    saveHandled(st, URL_A, [], "new");
    saveHandled(st, URL_A, ["P2"], "new");
    expect(loadHandled(st, URL_A, "new")).toEqual(["P2"]);
    expect(loadHandled(st, URL_A, "old")).toEqual([]);
  });

  it("cada relay tiene su propia lista", () => {
    const st = fakeStorage();
    saveHandled(st, URL_A, ["P1"]);
    expect(loadHandled(st, URL_A)).toEqual(["P1"]);
    expect(loadHandled(st, URL_B)).toEqual([]);
    expect(handledKey(URL_A)).not.toBe(handledKey(URL_B));
  });

  it("un valor corrupto o no-array se ignora y un almacenamiento que falla no rompe", () => {
    expect(loadHandled(fakeStorage({ [handledKey(URL_A)]: "{no json" }), URL_A)).toEqual([]);
    expect(loadHandled(fakeStorage({ [handledKey(URL_A)]: '{"a":1}' }), URL_A)).toEqual([]);
    expect(loadHandled(fakeStorage({ [handledKey(URL_A)]: '[1,"P2",null]' }), URL_A)).toEqual(["P2"]);
    const broken = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); } };
    expect(loadHandled(broken, URL_A)).toEqual([]);
    expect(() => saveHandled(broken, URL_A, ["P1"])).not.toThrow();
  });

  it("guardar mezcla con lo ya guardado (otra pestaña) sin duplicar", () => {
    const st = fakeStorage();
    saveHandled(st, URL_A, ["P1", "P2"]);
    saveHandled(st, URL_A, ["P2", "P3"]);
    expect(loadHandled(st, URL_A)).toEqual(["P1", "P2", "P3"]);
  });

  it("al cargar se retiran de las pendientes las ya tratadas y se conserva lo ya visto", () => {
    const s = markLoaded(addEvent(emptyInbox, event({ id: "P9" })), ["P9", "P8"]);
    expect(s.pending).toHaveLength(0);
    expect(s.seen).toEqual(expect.arrayContaining(["P9", "P8"]));
  });
});

describe("límite de texto del evento", () => {
  it("acepta exactamente MAX_TRANSCRIPT_CHARS y rechaza más", () => {
    expect(MAX_TRANSCRIPT_CHARS).toBe(4000);
    expect(isPublicCallEvent(event({ transcript: "a".repeat(4000) }))).toBe(true);
    expect(isPublicCallEvent(event({ transcript: "a".repeat(4001) }))).toBe(false);
    expect(isPublicCallEvent(event({ translation_en: "a".repeat(4000) }))).toBe(true);
    expect(isPublicCallEvent(event({ translation_en: "a".repeat(4001) }))).toBe(false);
  });

  it("la bandeja ignora un evento con transcripción desmesurada", () => {
    expect(addEvent(emptyInbox, event({ transcript: "a".repeat(4001) }))).toBe(emptyInbox);
  });

  it("acepta extractor ausente, 'llm' o 'rules' y rechaza otros valores", () => {
    expect(isPublicCallEvent(event())).toBe(true);
    expect(isPublicCallEvent(event({ extractor: "llm" }))).toBe(true);
    expect(isPublicCallEvent(event({ extractor: "rules" }))).toBe(true);
    expect(isPublicCallEvent({ ...event(), extractor: "gpt" })).toBe(false);
    expect(isPublicCallEvent({ ...event(), extractor: "" })).toBe(false);
    expect(isPublicCallEvent({ ...event(), extractor: null })).toBe(false);
    expect(isPublicCallEvent({ ...event(), extractor: 123 })).toBe(false);
  });

  it("rechaza translation_es mayor que MAX_TRANSCRIPT_CHARS", () => {
    expect(isPublicCallEvent(event({ extraction: { ...first.mock, translation_es: "a".repeat(4000) } }))).toBe(true);
    expect(isPublicCallEvent(event({ extraction: { ...first.mock, translation_es: "a".repeat(4001) } }))).toBe(false);
  });
});
