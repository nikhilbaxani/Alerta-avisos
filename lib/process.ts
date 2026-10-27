import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { findCall } from "@/data/scenarios";
import { chatJSON, transcribe } from "@/lib/ai";
import { decide } from "@/lib/cluster";
import { llmEnabled, sttEnabled } from "@/lib/config";
import type { AppConfig } from "@/lib/config";
import { JUDGE_SYSTEM, EXTRACTION_SYSTEM, extractionUser, judgeUser } from "@/lib/prompts";
import { sanitizeExtraction } from "@/lib/sanitize";
import type { Aml, Decision, IncidentSnapshot, ProcessResult } from "@/lib/types";

export interface ProcessInput {
  callId?: string;
  transcript?: string;
  aml: Aml;
  incidents: IncidentSnapshot[];
}

export function engineLabel(cfg: AppConfig) {
  return {
    stt: sttEnabled(cfg) ? `Whisper: ${cfg.sttModel.split("/").pop()}` : "Transcripción del guion",
    llm: llmEnabled(cfg) ? `IA local: ${cfg.llmModel}` : "Modo simulado",
  };
}

async function judge(cfg: AppConfig, d: Decision, summary: string, incidents: IncidentSnapshot[]): Promise<Decision["judge"]> {
  const inc = incidents.find((i) => i.id === d.incidentId);
  if (!inc) return null;
  const dist = d.candidates.find((c) => c.incidentId === inc.id)?.distance ?? 0;
  try {
    const r = (await chatJSON(cfg, [
      { role: "system", content: JUDGE_SYSTEM },
      { role: "user", content: judgeUser(inc.summary, summary, dist) },
    ], 30_000)) as { same?: unknown; confidence?: unknown; reason?: unknown };
    return {
      same: r.same === true,
      confidence: Math.max(0, Math.min(1, Number(r.confidence) || 0)),
      reason: typeof r.reason === "string" ? r.reason : "",
    };
  } catch {
    return null;
  }
}

export async function processCall(cfg: AppConfig, input: ProcessInput): Promise<ProcessResult> {
  const t0 = Date.now();
  const known = input.callId ? findCall(input.callId) : undefined;
  let transcript = input.transcript ?? known?.transcript ?? "";
  let sttMs = 0;

  if (sttEnabled(cfg) && known) {
    const wav = path.join(process.cwd(), "public", "audio", `${known.id}.wav`);
    if (existsSync(wav)) {
      const s = Date.now();
      try {
        transcript = await transcribe(cfg, new Blob([new Uint8Array(await readFile(wav))]), `${known.id}.wav`, known.lang);
      } catch {
        /* se conserva el guion */
      }
      sttMs = Date.now() - s;
    }
  }
  if (!transcript) throw new Error("Falta la transcripción o un callId conocido");

  const l0 = Date.now();
  let extraction;
  if (llmEnabled(cfg)) {
    const raw = await chatJSON(cfg, [
      { role: "system", content: EXTRACTION_SYSTEM },
      { role: "user", content: extractionUser(transcript) },
    ]);
    extraction = sanitizeExtraction(raw, known?.lang);
  } else if (known) {
    extraction = known.mock;
  } else {
    throw new Error("Modo simulado: solo se pueden procesar llamadas del escenario");
  }
  const llmMs = Date.now() - l0;

  const decision = decide({ aml: input.aml, extraction }, input.incidents);
  // El juez solo opina; nunca convierte `ask` en `merge`.
  if (decision.action === "ask" && llmEnabled(cfg)) {
    decision.judge = await judge(cfg, decision, extraction.summary_es, input.incidents);
  }

  return {
    callId: input.callId ?? "LIVE",
    transcript,
    language: extraction.language,
    extraction,
    decision,
    engine: engineLabel(cfg),
    timings: { sttMs, llmMs, totalMs: Date.now() - t0 },
  };
}
