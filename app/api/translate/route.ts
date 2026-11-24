import { NextResponse } from "next/server";
import { chatText } from "@/lib/ai";
import { getConfig, llmEnabled } from "@/lib/config";
import { fail, readJson, upstreamError } from "@/lib/http";
import { LANG_NAMES } from "@/lib/labels";
import { translateSystem } from "@/lib/prompts";
import { LIMITS, validateTranslateInput } from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const cfg = getConfig();
  if (!llmEnabled(cfg)) return fail(501, "La traducción libre necesita el modelo local");
  const body = await readJson(req, LIMITS.translateBodyBytes);
  if (!body.ok) return body.res;
  const input = validateTranslateInput(body.value);
  if (!input.ok) return fail(input.status, input.error);
  const { text, lang } = input.value;
  try {
    const out = await chatText(cfg, [
      { role: "system", content: translateSystem(LANG_NAMES[lang]) },
      { role: "user", content: text },
    ]);
    return NextResponse.json({ text: out, lang });
  } catch (e) {
    return fail(502, upstreamError(e, "No se pudo traducir"));
  }
}
