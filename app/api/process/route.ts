import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { fail, readJson, upstreamError } from "@/lib/http";
import { processCall } from "@/lib/process";
import { LIMITS, validateProcessInput } from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await readJson(req, LIMITS.processBodyBytes);
  if (!body.ok) return body.res;
  const input = validateProcessInput(body.value);
  if (!input.ok) return fail(input.status, input.error);
  try {
    return NextResponse.json(await processCall(getConfig(), input.value));
  } catch (e) {
    return fail(502, upstreamError(e, "Error al procesar la llamada"));
  }
}
