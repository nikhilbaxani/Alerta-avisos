import { NextResponse } from "next/server";
import { probe } from "@/lib/ai";
import { getConfig, llmEnabled, sttEnabled } from "@/lib/config";
import { engineLabel } from "@/lib/process";

export const dynamic = "force-dynamic";

export async function GET() {
  const cfg = getConfig();
  const [llmUp, sttUp] = await Promise.all([
    llmEnabled(cfg) ? probe(cfg.llmBaseUrl) : false,
    sttEnabled(cfg) ? probe(cfg.sttBaseUrl) : false,
  ]);
  return NextResponse.json({
    mode: llmEnabled(cfg) && llmUp ? "local" : "simulated",
    llm: { configured: llmEnabled(cfg), up: llmUp, model: cfg.llmModel },
    stt: { configured: sttEnabled(cfg), up: sttUp, model: cfg.sttModel },
    label: llmEnabled(cfg) && llmUp ? engineLabel(cfg).llm : "Modo simulado",
  });
}
