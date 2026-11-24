/**
 * Puente entre la consola y el agente de acciones de X05 (`lib/actions.ts`): traduce el estado de la
 * consola a la única entrada que ve el planificador (`PlanInput`: datos estructurados, nunca texto libre)
 * y devuelve las propuestas de las reglas deterministas. Puro y sin red.
 */
import { planInputFrom, planRules, planZoneAlerts } from "@/lib/actions";
import type { CallFacts, Proposal } from "@/lib/actions";
import type { EngineCall, Incident } from "@/lib/engine";

/** Idioma, teléfono enmascarado y riesgos de cada llamada recibida. */
export function factsFrom(calls: Record<string, EngineCall>, phones: Record<string, string>): Record<string, CallFacts> {
  return Object.fromEntries(
    Object.entries(calls).map(([id, c]) => [id, { lang: c.extraction.language, phone: phones[id] ?? null, risks: c.extraction.risks }]),
  );
}

/**
 * Propuestas de las reglas para todos los incidentes abiertos, más las de zona (ES-Alert, X07), que salen de
 * varios incidentes a la vez. Los provisionales (ámbar) no reciben ninguna.
 */
export function proposalsFor(incidents: Incident[], calls: Record<string, EngineCall>, phones: Record<string, string>): Proposal[] {
  const facts = factsFrom(calls, phones);
  const inputs = incidents.map((i) => planInputFrom(i, facts));
  return [...inputs.flatMap((input) => planRules(input)), ...planZoneAlerts(inputs)];
}
