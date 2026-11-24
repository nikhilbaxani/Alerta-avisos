import { mergePlans, planRules, proposalsFromModel, toolDefinitions } from "@/lib/actions";
import type { PlanInput, PlanIssue, Proposal } from "@/lib/actions";
import { chatTools } from "@/lib/ai";
import { llmEnabled } from "@/lib/config";
import type { AppConfig } from "@/lib/config";
import { PLANNER_SYSTEM, plannerUser } from "@/lib/prompts";

/** Timeout del planificador con IA local (MEMORIA: LLM 30 s). */
export const PLAN_TIMEOUT_MS = 30_000;

export interface PlanResponse {
  /** «Modo simulado» o «IA local: <modelo>». */
  engine: string;
  /** Reglas primero (siempre todas) y después lo que añade el modelo, validado. */
  proposals: Proposal[];
  /** Lo que el modelo propuso y se descartó o se corrigió, con el motivo en castellano. */
  issues: PlanIssue[];
  /** Aviso para el operador si no se ha podido usar el modelo. */
  warning?: string;
}

function why(e: unknown): string {
  if (e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError")) return `el modelo local tardó más de ${PLAN_TIMEOUT_MS / 1000} s`;
  if (e instanceof Error && e.message === "fetch failed") return "no se pudo conectar con el modelo local";
  return e instanceof Error && e.message ? e.message : "error del modelo local";
}

/**
 * Planifica las acciones de un incidente. Sin IA local, o si el modelo falla o tarda, devuelve el plan
 * determinista. Con IA local, el modelo solo puede añadir acciones (function calling) y el código las
 * valida; la política sale siempre de la tabla de `lib/actions.ts`.
 */
export async function planIncident(cfg: AppConfig, input: PlanInput): Promise<PlanResponse> {
  const engine = llmEnabled(cfg) ? `IA local: ${cfg.llmModel}` : "Modo simulado";
  if (input.provisional) {
    return { engine, proposals: [], issues: [], warning: "Incidente pendiente de la decisión del operador: todavía no se proponen acciones" };
  }
  const rules = planRules(input);
  if (!llmEnabled(cfg)) return { engine, proposals: rules, issues: [] };
  try {
    const calls = await chatTools(
      cfg,
      [
        { role: "system", content: PLANNER_SYSTEM },
        { role: "user", content: plannerUser(input, rules) },
      ],
      toolDefinitions(input),
      PLAN_TIMEOUT_MS,
    );
    const { proposals, issues } = proposalsFromModel(calls, input);
    return { engine, proposals: mergePlans(rules, proposals), issues };
  } catch (e) {
    return { engine, proposals: rules, issues: [], warning: `Plan de reglas: ${why(e)}` };
  }
}
