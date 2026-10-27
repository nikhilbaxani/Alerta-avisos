import type { AppConfig } from "@/lib/config";
import { parseJSON } from "@/lib/sanitize";

interface Msg {
  role: "system" | "user" | "assistant";
  content: string;
}

async function fetchTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function chatRaw(cfg: AppConfig, messages: Msg[], json: boolean, timeoutMs: number): Promise<string> {
  const res = await fetchTimeout(
    `${cfg.llmBaseUrl}/chat/completions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.llmApiKey}` },
      body: JSON.stringify({
        model: cfg.llmModel,
        messages,
        temperature: 0,
        ...(json ? { response_format: { type: "json_object" } } : {}),
      }),
    },
    timeoutMs,
  );
  if (!res.ok) throw new Error(`LLM ${res.status}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("LLM sin contenido");
  return text;
}

/** Pide JSON al modelo; un reintento si no se puede parsear o falla la red. */
export async function chatJSON(cfg: AppConfig, messages: Msg[], timeoutMs = 60_000): Promise<unknown> {
  let last: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return parseJSON(await chatRaw(cfg, messages, true, timeoutMs));
    } catch (e) {
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error("LLM no disponible");
}

export async function chatText(cfg: AppConfig, messages: Msg[], timeoutMs = 30_000): Promise<string> {
  return (await chatRaw(cfg, messages, false, timeoutMs)).trim();
}

export async function transcribe(cfg: AppConfig, audio: Blob, filename = "audio.wav", lang?: string): Promise<string> {
  const form = new FormData();
  form.append("file", audio, filename);
  form.append("model", cfg.sttModel);
  if (lang) form.append("language", lang);
  const res = await fetchTimeout(`${cfg.sttBaseUrl}/audio/transcriptions`, { method: "POST", body: form }, 120_000);
  if (!res.ok) throw new Error(`STT ${res.status}`);
  const data = (await res.json()) as { text?: string };
  return (data.text ?? "").trim();
}

export async function probe(baseUrl: string, timeoutMs = 1500): Promise<boolean> {
  try {
    const res = await fetchTimeout(`${baseUrl}/models`, {}, timeoutMs);
    return res.ok;
  } catch {
    return false;
  }
}
