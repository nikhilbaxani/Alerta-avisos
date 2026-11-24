import { describe, expect, it } from "vitest";
import { scenario } from "@/data/scenario-dana-malaga";
import { initialState, processCall, snapshot } from "@/lib/engine";
import type { EngineCall } from "@/lib/engine";
import { PENDING_CAP, acceptEvent, addEvent, discardEvent, emptyInbox, publicEventToCall } from "@/lib/inbox";
import { MAX_TRANSCRIPT_CHARS, isPublicCallEvent } from "@/lib/publicCall";
import type { PublicCallEvent } from "@/lib/publicCall";

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
  it("añade, deduplica por id e ignora eventos inválidos", () => {
    let s = addEvent(emptyInbox, event());
    s = addEvent(s, event());
    expect(s.pending).toHaveLength(1);
    const bad = addEvent(s, { id: "x" });
    expect(bad).toBe(s);
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
