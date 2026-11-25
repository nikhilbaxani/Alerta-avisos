/**
 * Puente entre la consola y el agente de acciones de X05 (`lib/actions.ts`): traduce el estado de la
 * consola a la única entrada que ve el planificador (`PlanInput`: datos estructurados, nunca texto libre)
 * y devuelve las propuestas de las reglas deterministas. Puro y sin red.
 */
import { planDuplicateSms, planInputFrom, planRules, planZoneAlerts } from "@/lib/actions";
import type { AgentAction, CallFacts, Proposal } from "@/lib/actions";
import type { EngineCall, Incident } from "@/lib/engine";
import type { CallChannel } from "@/lib/types";

export interface ProposalContext {
  /** Canal de cada llamada (las eCall no reciben SMS de duplicado, X14). */
  channels?: Record<string, CallChannel | undefined>;
  /** Registro de acciones: el aviso de duplicado (X14) solo sale con recursos aprobados o enviados. */
  actions?: readonly AgentAction[];
}

/** Idioma, teléfono enmascarado, riesgos y canal de cada llamada recibida. */
export function factsFrom(calls: Record<string, EngineCall>, phones: Record<string, string>, channels: Record<string, CallChannel | undefined> = {}): Record<string, CallFacts> {
  return Object.fromEntries(
    Object.entries(calls).map(([id, c]) => {
      const f: CallFacts = { lang: c.extraction.language, phone: phones[id] ?? null, risks: c.extraction.risks };
      if (channels[id]) f.channel = channels[id];
      return [id, f];
    }),
  );
}

/**
 * Propuestas de las reglas para todos los incidentes abiertos, más las de zona (ES-Alert, X07), que salen de
 * varios incidentes a la vez, y los avisos de duplicado (X14), que salen del registro de acciones. Los
 * provisionales (ámbar) no reciben ninguna.
 */
export function proposalsFor(incidents: Incident[], calls: Record<string, EngineCall>, phones: Record<string, string>, ctx: ProposalContext = {}): Proposal[] {
  const facts = factsFrom(calls, phones, ctx.channels);
  const inputs = incidents.map((i) => planInputFrom(i, facts));
  const actions = ctx.actions ?? [];
  return [...inputs.flatMap((input) => planRules(input)), ...planZoneAlerts(inputs), ...inputs.flatMap((input) => planDuplicateSms(input, actions))];
}
