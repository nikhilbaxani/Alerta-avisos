import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { processCall } from "@/lib/process";
import type { ProcessInput } from "@/lib/process";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: ProcessInput;
  try {
    body = (await req.json()) as ProcessInput;
  } catch {
    return NextResponse.json({ error: "JSON no válido" }, { status: 400 });
  }
  if (!body?.aml || !Array.isArray(body.incidents)) {
    return NextResponse.json({ error: "Faltan aml e incidents" }, { status: 400 });
  }
  try {
    return NextResponse.json(await processCall(getConfig(), body));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 502 });
  }
}
