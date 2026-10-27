import { NextResponse } from "next/server";
import { chatText } from "@/lib/ai";
import { getConfig, llmEnabled } from "@/lib/config";
import { LANG_NAMES } from "@/lib/labels";
import { translateSystem } from "@/lib/prompts";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const cfg = getConfig();
  if (!llmEnabled(cfg)) {
    return NextResponse.json({ error: "La traducción libre necesita el modelo local" }, { status: 501 });
  }
  const { text, lang } = (await req.json().catch(() => ({}))) as { text?: string; lang?: string };
  if (!text?.trim() || !lang) return NextResponse.json({ error: "Faltan text y lang" }, { status: 400 });
  try {
    const out = await chatText(cfg, [
      { role: "system", content: translateSystem(LANG_NAMES[lang] ?? lang) },
      { role: "user", content: text.trim() },
    ]);
    return NextResponse.json({ text: out, lang });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 502 });
  }
}
