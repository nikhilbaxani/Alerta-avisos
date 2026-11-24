import { NextResponse } from "next/server";
import { transcribe } from "@/lib/ai";
import { getConfig, sttEnabled } from "@/lib/config";
import { fail, readForm, upstreamError } from "@/lib/http";
import { LIMITS, validateAudio } from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const cfg = getConfig();
  if (!sttEnabled(cfg)) return fail(501, "La llamada en directo necesita Whisper local");
  const form = await readForm(req, LIMITS.audioBytes + LIMITS.formOverheadBytes);
  if (!form.ok) return form.res;
  const audio = validateAudio(form.value.get("file"));
  if (!audio.ok) return fail(audio.status, audio.error);
  try {
    return NextResponse.json({ text: await transcribe(cfg, audio.value, "live.webm") });
  } catch (e) {
    return fail(502, upstreamError(e, "No se pudo transcribir el audio"));
  }
}
