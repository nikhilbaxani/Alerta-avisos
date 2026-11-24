import { decide } from "@/lib/cluster";
import { isPublicCallEvent } from "@/lib/publicCall";
import type { PublicCallEvent } from "@/lib/publicCall";
import type { IncidentSnapshot, ProcessResult } from "@/lib/types";
import type { CallMeta } from "@/lib/useConsole";

export const PENDING_CAP = 50;
export const UNKNOWN_LOCATION_NOTE = "Ubicación no reconocida en el audio: decide el operador.";

/**
 * Convierte una llamada del público en lo que espera el motor. Se decide en el navegador con los
 * incidentes actuales; si el lugar no se reconoció, nunca se fusiona automáticamente (S5).
 */
export function publicEventToCall(
  ev: PublicCallEvent,
  incidents: IncidentSnapshot[],
  clock: number,
): { meta: CallMeta; result: ProcessResult } {
  let decision = decide({ aml: ev.location.aml, extraction: ev.extraction }, incidents);
  if (!ev.location.known && decision.action === "merge") {
    decision = { ...decision, action: "ask", reason: `${decision.reason} ${UNKNOWN_LOCATION_NOTE}` };
  }
  const meta: CallMeta = {
    id: ev.id,
    t: Math.round(clock),
    lang: ev.language,
    phone: "Público (QR)",
    aml: ev.location.aml,
    transcript: ev.transcript,
    live: true,
  };
  const result: ProcessResult = {
    callId: ev.id,
    transcript: ev.transcript,
    language: ev.language,
    extraction: ev.extraction,
    decision,
    engine: {
      stt: "Whisper (VPS)",
      llm: ev.extractor === "llm" ? "LLM del equipo" : "Reglas (sin LLM)",
    },
    timings: { sttMs: ev.timings.sttMs, llmMs: 0, totalMs: ev.timings.totalMs },
  };
  return { meta, result };
}

export interface InboxState {
  pending: PublicCallEvent[];
  /** Ids ya vistos (aceptados o descartados): el relay reenvía los últimos 50 al reconectar. */
  seen: string[];
}

export const emptyInbox: InboxState = { pending: [], seen: [] };

/** Añade un evento recibido por SSE: ignora lo inválido y los ids repetidos. */
export function addEvent(s: InboxState, raw: unknown): InboxState {
  if (!isPublicCallEvent(raw)) return s;
  if (s.seen.includes(raw.id) || s.pending.some((e) => e.id === raw.id)) return s;
  return { ...s, pending: [...s.pending, raw].slice(-PENDING_CAP) };
}

const drop = (s: InboxState, id: string): InboxState => ({
  pending: s.pending.filter((e) => e.id !== id),
  seen: s.seen.includes(id) ? s.seen : [...s.seen, id],
});

export function discardEvent(s: InboxState, id: string): InboxState {
  return drop(s, id);
}

export function acceptEvent(s: InboxState, id: string): { state: InboxState; accepted: PublicCallEvent | null } {
  const accepted = s.pending.find((e) => e.id === id) ?? null;
  return { state: accepted ? drop(s, id) : s, accepted };
}
