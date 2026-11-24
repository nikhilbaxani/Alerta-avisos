import { afterEach, describe, expect, it, vi } from "vitest";
import { chatJSON } from "@/lib/ai";
import { getConfig } from "@/lib/config";

describe("LLM_EXTRA_BODY", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sin la variable no añade nada (consola y relay igual que antes)", () => {
    expect(getConfig({}).llmExtraBody).toEqual({});
  });

  it("acepta un objeto JSON y lo ignora si no es válido o no es un objeto", () => {
    expect(getConfig({ LLM_EXTRA_BODY: '{"chat_template_kwargs":{"enable_thinking":false}}' }).llmExtraBody).toEqual({
      chat_template_kwargs: { enable_thinking: false },
    });
    expect(getConfig({ LLM_EXTRA_BODY: "{roto" }).llmExtraBody).toEqual({});
    expect(getConfig({ LLM_EXTRA_BODY: "[1,2]" }).llmExtraBody).toEqual({});
    expect(getConfig({ LLM_EXTRA_BODY: '"texto"' }).llmExtraBody).toEqual({});
  });

  it("se envía en la petición sin poder pisar model, messages ni temperature", async () => {
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", async (_u: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200 });
    });
    const cfg = getConfig({
      LLM_BASE_URL: "http://llm.test/v1",
      LLM_MODEL: "m",
      LLM_EXTRA_BODY: '{"chat_template_kwargs":{"enable_thinking":false},"model":"otro","temperature":1}',
    });
    expect(await chatJSON(cfg, [{ role: "user", content: "hola" }])).toEqual({ ok: true });
    expect(bodies[0]).toMatchObject({ model: "m", temperature: 0, chat_template_kwargs: { enable_thinking: false } });
    expect(bodies[0].messages).toEqual([{ role: "user", content: "hola" }]);
  });
});
