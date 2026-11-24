import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { fail, readJson } from "@/lib/http";
import { planIncident } from "@/lib/plan";
import { LIMITS, validatePlanInput } from "@/lib/validate";

export const dynamic = "force-dynamic";

/**
 * Plan de acciones de un incidente (MEMORIA §16.2). Recibe solo datos estructurados (`PlanInput`) y
 * devuelve propuestas; el servidor no guarda estado ni envía nada: quien llama las registra con
 * `addProposals` (las automáticas se envían ahí, por el conector simulado).
 */
export async function POST(req: Request) {
  const body = await readJson(req, LIMITS.planBodyBytes);
  if (!body.ok) return body.res;
  const input = validatePlanInput(body.value);
  if (!input.ok) return fail(input.status, input.error);
  // planIncident no lanza: si el modelo falla, devuelve el plan de reglas con un aviso.
  return NextResponse.json(await planIncident(getConfig(), input.value));
}
