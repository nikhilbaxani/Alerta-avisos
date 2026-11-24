import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as processPOST } from "@/app/api/process/route";
import { POST as transcribePOST } from "@/app/api/transcribe/route";
import { POST as translatePOST } from "@/app/api/translate/route";
import { scenario } from "@/data/scenario-dana-malaga";
import { LIMITS } from "@/lib/validate";

const A1 = scenario.calls.find((c) => c.id === "A1")!;
const url = "http://localhost/api";
const json = (body: unknown) =>
  new Request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });
const form = (file?: Blob) => {
  const f = new FormData();
  if (file) f.append("file", file, "live.webm");
  return new Request(url, { method: "POST", body: f });
};
const llmOk = (content: string) =>
  vi.fn(async (_u: unknown, _i?: RequestInit) => new Response(JSON.stringify({ choices: [{ message: { content } }] })));
/** El error es para el operador: castellano, sin trazas. */
const expectSpanish = async (res: Response, status: number) => {
  expect(res.status).toBe(status);
  const body = (await res.json()) as { error: string };
  expect(body.error).toMatch(/^[A-ZÁÉÍÓÚÑ¿]/);
  expect(body.error).not.toMatch(/at \w+ \(|Error:/);
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("POST /api/process", () => {
  it("200 con una llamada del escenario en modo simulado", async () => {
    vi.stubEnv("LLM_BASE_URL", "");
    vi.stubEnv("STT_BASE_URL", "");
    const res = await processPOST(json({ callId: "A1", aml: A1.aml, incidents: [] }));
    expect(res.status).toBe(200);
    const r = (await res.json()) as { decision: { action: string }; engine: { llm: string } };
    expect(r.decision.action).toBe("new");
    expect(r.engine.llm).toBe("Modo simulado");
  });

  it("400 con JSON roto", async () => {
    await expectSpanish(await processPOST(json("{no es json")), 400);
  });

  it("400 con números no finitos (1e999 se parsea como Infinity)", async () => {
    const raw = `{"callId":"A1","aml":{"lat":1e999,"lng":-4.4,"acc":20},"incidents":[]}`;
    await expectSpanish(await processPOST(json(raw)), 400);
  });

  it("400 con aml fuera de rango o incidents mal formado", async () => {
    await expectSpanish(await processPOST(json({ callId: "A1", aml: { ...A1.aml, acc: 50_000 }, incidents: [] })), 400);
    await expectSpanish(await processPOST(json({ callId: "A1", aml: A1.aml, incidents: [{ id: "INC-01" }] })), 400);
    await expectSpanish(await processPOST(json({ callId: "A1/../../x", aml: A1.aml, incidents: [] })), 400);
  });

  it("413 con una transcripción o una lista demasiado grandes", async () => {
    await expectSpanish(await processPOST(json({ transcript: "x".repeat(LIMITS.transcriptChars + 1), aml: A1.aml, incidents: [] })), 413);
    const many = Array.from({ length: LIMITS.incidents + 1 }, (_, n) => ({
      id: `INC-${n}`, type: "otro", points: [A1.aml], keywords: [], risks: [], summary: "",
    }));
    await expectSpanish(await processPOST(json({ callId: "A1", aml: A1.aml, incidents: many })), 413);
  });

  it("413 si el cuerpo supera el máximo, sin llegar a parsearlo", async () => {
    const big = JSON.stringify({ callId: "A1", aml: A1.aml, incidents: [], relleno: "x".repeat(LIMITS.processBodyBytes) });
    await expectSpanish(await processPOST(json(big)), 413);
  });
});

describe("POST /api/translate", () => {
  it("501 sin modelo local (como antes)", async () => {
    vi.stubEnv("LLM_BASE_URL", "");
    await expectSpanish(await translatePOST(json({ text: "Hola", lang: "en" })), 501);
  });

  it("200 con texto e idioma válidos", async () => {
    vi.stubEnv("LLM_BASE_URL", "http://llm.test/v1");
    const fetchMock = llmOk("Hello");
    vi.stubGlobal("fetch", fetchMock);
    const res = await translatePOST(json({ text: "Hola", lang: "en" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: "Hello", lang: "en" });
    const sent = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as { messages: { content: string }[] };
    expect(sent.messages[0].content).toContain('"Inglés"');
  });

  it("400 con idioma desconocido o sin texto, sin llamar al modelo", async () => {
    vi.stubEnv("LLM_BASE_URL", "http://llm.test/v1");
    const fetchMock = llmOk("x");
    vi.stubGlobal("fetch", fetchMock);
    await expectSpanish(await translatePOST(json({ text: "Hola", lang: "klingon" })), 400);
    await expectSpanish(await translatePOST(json({ lang: "en" })), 400);
    await expectSpanish(await translatePOST(json("{roto")), 400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("413 con un texto demasiado largo", async () => {
    vi.stubEnv("LLM_BASE_URL", "http://llm.test/v1");
    vi.stubGlobal("fetch", llmOk("x"));
    await expectSpanish(await translatePOST(json({ text: "a".repeat(LIMITS.translateChars + 1), lang: "en" })), 413);
    await expectSpanish(await translatePOST(json({ text: "a", lang: "en", relleno: "x".repeat(LIMITS.translateBodyBytes) })), 413);
  });
});

describe("POST /api/transcribe", () => {
  it("501 sin Whisper local (como antes)", async () => {
    vi.stubEnv("STT_BASE_URL", "");
    await expectSpanish(await transcribePOST(form(new Blob([new Uint8Array(10)], { type: "audio/webm" }))), 501);
  });

  it("200 con un audio pequeño", async () => {
    vi.stubEnv("STT_BASE_URL", "http://stt.test/v1");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ text: " Hay un árbol caído. " }))));
    const res = await transcribePOST(form(new Blob([new Uint8Array(1000)], { type: "audio/webm;codecs=opus" })));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: "Hay un árbol caído." });
  });

  it("400 sin archivo, vacío o que no es audio", async () => {
    vi.stubEnv("STT_BASE_URL", "http://stt.test/v1");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expectSpanish(await transcribePOST(form()), 400);
    await expectSpanish(await transcribePOST(form(new Blob([], { type: "audio/webm" }))), 400);
    await expectSpanish(await transcribePOST(form(new Blob(["<html>"], { type: "text/html" }))), 400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("413 con un audio demasiado grande", async () => {
    vi.stubEnv("STT_BASE_URL", "http://stt.test/v1");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expectSpanish(await transcribePOST(form(new Blob([new Uint8Array(LIMITS.audioBytes + 1)], { type: "audio/webm" }))), 413);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
