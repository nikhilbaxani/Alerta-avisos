import { scenario as danaBase } from "@/data/scenario-dana-malaga";
import { danaExtra } from "@/data/scenario-dana-extra";
import { scenarioApagon } from "@/data/scenario-apagon-malaga";
import type { Scenario } from "@/lib/types";

/** DANA con las llamadas de la Fase 7 (`data/scenario-dana-extra.ts`): el archivo base está protegido. */
export const dana: Scenario = { ...danaBase, calls: [...danaBase.calls, ...danaExtra].sort((a, b) => a.t - b.t) };

export const SCENARIOS: Scenario[] = [dana, scenarioApagon];
export const DEFAULT_SCENARIO_ID = dana.id;
export const getScenario = (id: string): Scenario => SCENARIOS.find((s) => s.id === id) ?? dana;
export const findCall = (callId: string) => SCENARIOS.flatMap((s) => s.calls).find((c) => c.id === callId);
