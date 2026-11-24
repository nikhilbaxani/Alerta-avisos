export interface AppConfig {
  llmBaseUrl: string;
  llmModel: string;
  llmApiKey: string;
  sttBaseUrl: string;
  sttModel: string;
}

export function getConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  return {
    llmBaseUrl: (env.LLM_BASE_URL ?? "").trim().replace(/\/$/, ""),
    llmModel: env.LLM_MODEL?.trim() || "qwen2.5:14b-instruct",
    llmApiKey: env.LLM_API_KEY?.trim() || "local",
    sttBaseUrl: (env.STT_BASE_URL ?? "").trim().replace(/\/$/, ""),
    sttModel: env.STT_MODEL?.trim() || "Systran/faster-whisper-large-v3",
  };
}

/** Versión estática (GitHub Pages): sin servidor, la consola calcula todo en el navegador en modo simulado. */
export const STATIC_EXPORT = process.env.NEXT_PUBLIC_STATIC_EXPORT === "1";

export const llmEnabled = (c: AppConfig) => c.llmBaseUrl !== "";
export const sttEnabled = (c: AppConfig) => c.sttBaseUrl !== "";
