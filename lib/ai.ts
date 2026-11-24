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

export interface ToolDefinition {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

/** Llamada a herramienta tal como la devuelve el modelo: nada está validado todavía. */
export interface RawToolCall {
  name: unknown;
  /** Texto JSON (OpenAI) u objeto ya parseado (algunas versiones de Ollama). */
  arguments: unknown;
}

/**
 * Function calling (API compatible con OpenAI; Ollama lo admite con qwen2.5). Devuelve las llamadas
 * a herramientas sin validar: quien llama decide qué se acepta. Sin reintento: si falla o tarda más
 * de `timeoutMs`, lanza y el planificador se queda con las reglas.
 */
export async function chatTools(cfg: AppConfig, messages: Msg[], tools: ToolDefinition[], timeoutMs = 30_000): Promise<RawToolCall[]> {
  const res = await fetchTimeout(
    `${cfg.llmBaseUrl}/chat/completions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.llmApiKey}` },
      body: JSON.stringify({ model: cfg.llmModel, messages, tools, tool_choice: "auto", temperature: 0 }),
    },
    timeoutMs,
  );
  if (!res.ok) throw new Error(`LLM ${res.status}`);
  const data = (await res.json()) as { choices?: { message?: { tool_calls?: unknown } }[] };
  const calls = data.choices?.[0]?.message?.tool_calls;
  if (!Array.isArray(calls)) return [];
  return calls.map((c) => {
    const fn = (c as { function?: { name?: unknown; arguments?: unknown } } | null)?.function;
    return { name: fn?.name, arguments: fn?.arguments };
  });
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
