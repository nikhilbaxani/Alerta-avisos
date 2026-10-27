import { NextResponse } from "next/server";
import { transcribe } from "@/lib/ai";
import { getConfig, sttEnabled } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const cfg = getConfig();
  if (!sttEnabled(cfg)) {
    return NextResponse.json({ error: "La llamada en directo necesita Whisper local" }, { status: 501 });
  }
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof Blob)) return NextResponse.json({ error: "Falta el archivo de audio" }, { status: 400 });
  try {
    return NextResponse.json({ text: await transcribe(cfg, file, "live.webm") });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 502 });
  }
}
