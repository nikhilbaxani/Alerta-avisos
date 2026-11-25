import { expect, it } from "vitest";
import { isPublicCallEvent, UNKNOWN_LOCATION_AML } from "@/lib/publicCall";
import { extractByRules } from "@/lib/rules";

it("acepta und como única excepción a los dos caracteres del idioma público", () => {
  const transcript = "Hola";
  const { extraction } = extractByRules({ transcript, language: "es", translation_en: null });
  const event = {
    id: "P1", receivedAt: "2026-01-01T00:00:00Z", durationS: 1, transcript,
    translation_en: null, extraction,
    location: { place: null, known: false, aml: UNKNOWN_LOCATION_AML },
    timings: { sttMs: 1, totalMs: 1 },
  };
  expect(isPublicCallEvent({ ...event, language: "es" })).toBe(true);
  expect(isPublicCallEvent({ ...event, language: "und", extraction: { ...extraction, language: "und" } })).toBe(true);
  for (const language of ["", "UND", "eng", "undx"]) {
    expect(isPublicCallEvent({ ...event, language })).toBe(false);
  }
});
