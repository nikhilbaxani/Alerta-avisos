import { scenario as dana } from "@/data/scenario-dana-malaga";
import { scenarioApagon } from "@/data/scenario-apagon-malaga";
import type { Scenario } from "@/lib/types";

export const SCENARIOS: Scenario[] = [dana, scenarioApagon];
export const DEFAULT_SCENARIO_ID = dana.id;
export const getScenario = (id: string): Scenario => SCENARIOS.find((s) => s.id === id) ?? dana;
export const findCall = (callId: string) => SCENARIOS.flatMap((s) => s.calls).find((c) => c.id === callId);
