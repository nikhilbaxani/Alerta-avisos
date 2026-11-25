import { afterEach, beforeEach, expect, it, vi } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { chmod, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRelay, type RelayOptions } from "@/server/relay";
import { PUBLIC_CALL_ID, UNKNOWN_LOCATION_AML } from "@/lib/publicCall";

const TOKEN = "fake-operator-token";
const AUDIO = "fake-audio-bytes";
const TEXT = "Hay un incendio en calle Jacaranda 7, necesito ayuda.";
const AUTH = { Authorization: `Bearer ${TOKEN}` };
const servers = new Set<http.Server>();
let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "agente112-store-")); });
afterEach(async () => {
  for (const server of servers) await close(server);
  await rm(dir, { recursive: true, force: true });
});
async function close(server: http.Server) {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  servers.delete(server);
}
async function boot(over: Partial<RelayOptions> = {}) {
  const { handler } = createRelay({ dataDir: dir, bootTag: "TEST", token: TOKEN, sttBaseUrl: "http://stt.invalid/v1",
    heartbeatMs: 25, fetch: async () => Response.json({ text: TEXT, language: "es", duration: 15 }), log: () => {}, ...over });
  const server = http.createServer(handler);
  servers.add(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, req: (path: string, init?: RequestInit) => fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}${path}`, init) };
}
type Relay = Awaited<ReturnType<typeof boot>>;
async function ready(r: Relay) {
  const body = new FormData();
  body.set("consent", "1");
  body.set("file", new Blob([AUDIO], { type: "audio/webm" }), "test.webm");
  const res = await r.req("/llamar", { method: "POST", body });
  expect(res.status).toBe(202);
  const { id } = await res.json();
  const path = `/llamar/${id}`;
  await vi.waitFor(async () => expect((await (await r.req(path)).json()).status).toBe("ready"));
  return path;
}
async function publish(r: Relay) {
  const path = await ready(r);
  expect((await r.req(`${path}/enviar`, { method: "POST" })).status).toBe(200);
  await vi.waitFor(async () => expect(await (await r.req(path)).json()).toEqual({ status: "sent" }));
}
async function frames(r: Relay) {
  const response = await r.req(`/events?token=${TOKEN}`);
  expect(response.status).toBe(200);
  const reader = response.body!.getReader();
  try {
    const decoder = new TextDecoder();
    let text = "";
    while (!text.includes(": ping\n\n")) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
    return [...text.matchAll(/event: (\w+)\ndata: (.+)\n\n/g)].map(([, type, json]) => ({ type, data: JSON.parse(json) }));
  } finally { await reader.cancel(); }
}
const ack = (r: Relay, id: string, outcome: string) => r.req("/events/ack", { method: "POST", headers: AUTH, body: JSON.stringify({ id, outcome }) });
const wipe = (r: Relay, headers?: HeadersInit) => r.req("/events/store", { method: "DELETE", headers });

it("conserva eventos y contador sin audio ni token, con modo 0600", async () => {
  const r = await boot();
  await publish(r);
  const [one] = await frames(r);
  expect(one).toMatchObject({ type: "call", data: { transcript: TEXT } });
  const [file] = await readdir(dir);
  const path = join(dir, file);
  const raw = await readFile(path, "utf8");
  expect(raw).not.toContain(AUDIO);
  expect(raw).not.toContain(TOKEN);
  expect((await stat(path)).mode & 0o777).toBe(0o600);
  await close(r.server);
  const restarted = await boot();
  expect(await frames(restarted)).toEqual([one]);
  await publish(restarted);
  const two = await frames(restarted);
  expect(two).toHaveLength(2);
  expect(two[1].data.id).not.toBe(one.data.id);
});

it("comparte el acuse en SSE y conserva su primer resultado tras reiniciar", async () => {
  const r = await boot();
  await publish(r);
  await publish(r);
  const [one, two] = await frames(r);
  const reader = (await r.req(`/events?token=${TOKEN}`)).body!.getReader();
  await reader.read();
  expect((await ack(r, one.data.id, "accepted")).status).toBe(200);
  let text = "";
  while (!text.includes(": ping") && (!text.includes("event: accepted") || !text.includes("event: handled"))) {
    text += new TextDecoder().decode((await reader.read()).value);
  }
  expect(text).toContain("event: handled");
  expect(text).toContain("event: accepted");
  await reader.cancel();
  expect((await ack(r, two.data.id, "discarded")).status).toBe(200);
  await close(r.server);
  const restarted = await boot();
  expect((await ack(restarted, one.data.id, "discarded")).status).toBe(200);
  expect(await frames(restarted)).toEqual([{ ...one, type: "accepted" }]);
});

it("reenvía aceptadas por fecha original y retira descartadas antes que aceptadas", async () => {
  const r = await boot({ storeCap: 3, rateLimit: { max: 8, windowMs: 60_000 } });
  await publish(r);
  await publish(r);
  await publish(r);
  const [one, two, three] = await frames(r);
  expect((await ack(r, two.data.id, "accepted")).status).toBe(200);
  expect((await ack(r, one.data.id, "accepted")).status).toBe(200);
  expect((await ack(r, three.data.id, "discarded")).status).toBe(200);
  await publish(r);
  expect((await ack(r, three.data.id, "discarded")).status).toBe(404);
  expect((await frames(r)).slice(0, 2)).toEqual([{ ...one, type: "accepted" }, { ...two, type: "accepted" }]);
  await publish(r);
  expect((await ack(r, one.data.id, "accepted")).status).toBe(404);
  expect((await frames(r))[0]).toEqual({ ...two, type: "accepted" });
});

it("requiere token y origen permitido para borrar; notifica y conserva solo el contador", async () => {
  const r = await boot();
  await publish(r);
  expect((await wipe(r)).status).toBe(401);
  expect((await wipe(r, { ...AUTH, Origin: "https://otro.invalid" })).status).toBe(403);
  const reader = (await r.req(`/events?token=${TOKEN}`)).body!.getReader();
  await reader.read();
  const res = await wipe(r, AUTH);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ removed: 1 });
  expect(new TextDecoder().decode((await reader.read()).value)).toContain("event: cleared\ndata: {\"removed\":1}");
  await reader.cancel();
  expect(await frames(r)).toEqual([]);
  expect(await readdir(dir)).toEqual(["calls.json"]);
  const file = join(dir, "calls.json");
  expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ version: 1, counter: 1, calls: [] });
  expect((await stat(file)).mode & 0o777).toBe(0o600);
});

it("S27: el contador no retrocede tras borrar y reiniciar", async () => {
  const r = await boot(); await publish(r); await publish(r);
  expect((await wipe(r, AUTH)).status).toBe(200);
  await close(r.server);
  const again = await boot(); await publish(again);
  expect((await frames(again))[0].data.id).toBe("PTEST3");
});

it("S27: recupera el contador de un archivo corrupto o usa una semilla de época", async () => {
  const file = join(dir, "calls.json");
  await writeFile(file, '{"version":1,"counter":8,"calls":[');
  const recovered = await boot();
  expect(await frames(recovered)).toEqual([]);
  await publish(recovered);
  expect((await frames(recovered)).map((f) => f.data.id)).toEqual(["PTEST9"]);
  await close(recovered.server);

  await writeFile(file, '{"version":1,"counter":-1,"calls":[');
  const now = Math.floor(Date.now() / 1000);
  const seeded = await boot({ bootTag: "TST" });
  expect(await frames(seeded)).toEqual([]);
  await publish(seeded);
  const [published] = await frames(seeded);
  expect(published.data.id).toMatch(PUBLIC_CALL_ID);
  const { counter } = JSON.parse(await readFile(file, "utf8"));
  expect(counter).toBeGreaterThanOrEqual(now + 1);
  expect(counter).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 1);
});

it("S27: archivo hostil no se reenvía ni rompe el relay", async () => {
  await writeFile(join(dir, "calls.json"), JSON.stringify({ version: 1, counter: 3, calls: [1, null, { call: { id: "bad" }, outcome: "pending" }] }));
  const r = await boot();
  expect(await frames(r)).toEqual([]);
  await publish(r);
  expect((await frames(r)).map((f) => f.data.id)).toEqual(["PTEST4"]);
});

const root = process.getuid?.() === 0;
it.skipIf(root)(`S27: publica y acusa con DATA_DIR de solo lectura${root ? " (omitida: root puede escribir pese a chmod 0500)" : ""}`, async () => {
  const log = vi.fn();
  const r = await boot({ log });
  const reader = (await r.req(`/events?token=${TOKEN}`)).body!.getReader();
  try {
    await reader.read();
    await chmod(dir, 0o500);
    await publish(r);
    const decoder = new TextDecoder();
    let text = "";
    while (!text.includes("event: call\n")) text += decoder.decode((await reader.read()).value);
    const [event] = await frames(r);
    expect(event).toMatchObject({ type: "call", data: { id: "PTEST1" } });
    const health = await r.req("/health");
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ store: "failing" });
    const response = await ack(r, event.data.id, "discarded");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(await frames(r)).toEqual([]);
    expect(await readdir(dir)).toEqual([]);
    expect(log.mock.calls.map(([line]) => line).filter((line) => line.includes("EACCES"))).toEqual(["EACCES", "EACCES"]);
    await chmod(dir, 0o700);
    await publish(r);
    expect(await (await r.req("/health")).json()).toMatchObject({ store: "ok" });
    await close(r.server);
    expect((await frames(await boot())).map((f) => f.data.id)).toEqual(["PTEST2"]);
  } finally {
    await chmod(dir, 0o700);
    await reader.cancel().catch(() => {});
  }
});

it("aparta un archivo corrupto y arranca vacío", async () => {
  const log = vi.fn();
  await writeFile(join(dir, "calls.json"), "private corrupt contents");
  const r = await boot({ log });
  expect(await frames(r)).toEqual([]);
  expect(await readdir(dir)).toEqual([expect.stringMatching(/^calls\.json\.corrupt-\d+$/)]);
  expect(log).toHaveBeenCalledTimes(1);
  expect(log.mock.calls[0][0]).not.toContain("private corrupt contents");
});

it("sin DATA_DIR funciona en memoria y no crea archivo", async () => {
  const r = await boot({ dataDir: undefined });
  await publish(r);
  expect(await frames(r)).toHaveLength(1);
  expect(await readdir(dir)).toEqual([]);
  await close(r.server);
  expect(await frames(await boot({ dataDir: undefined }))).toEqual([]);
});

it("con el almacén lleno de pendientes rechaza el envío sin perder llamadas y devuelve cuota", async () => {
  const r = await boot({ storeCap: 1, rateLimit: { max: 2, windowMs: 60_000 } });
  await publish(r);
  const original = await frames(r);
  const path = await ready(r);
  const response = await r.req(`${path}/enviar`, { method: "POST" });
  expect(response.status).toBe(503);
  const failure = { status: "failed", error: "La bandeja de la sala está llena. Vuelve a intentarlo más tarde." };
  expect(await response.json()).toEqual(failure);
  expect(await (await r.req(path)).json()).toEqual(failure);
  expect(await frames(r)).toEqual(original);
  await ready(r); // Sin devolución, esta subida recibiría 429.
});

it("una URL vacía no consulta; un geocodificador colgado no bloquea la publicación", async () => {
  const geocodeFetch = vi.fn<typeof fetch>(() => new Promise(() => {}));
  const disabled = await boot({ dataDir: undefined, geocoderUrl: "", geocodeFetch });
  await publish(disabled);
  expect(geocodeFetch).not.toHaveBeenCalled();
  const slow = await boot({ dataDir: undefined, geocoderUrl: "http://slow.invalid", geocodeFetch, geocoderTimeoutMs: 40 });
  const start = performance.now();
  await publish(slow);
  expect(performance.now() - start).toBeLessThan(600);
  expect(geocodeFetch).toHaveBeenCalledTimes(1);
  expect(geocodeFetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
  expect((await frames(slow))[0].data.location).toEqual({ place: null, known: false, aml: UNKNOWN_LOCATION_AML });
});

it.each(["rules", "llm"] as const)("envía solo la dirección extraída (%s)", async (mode) => {
  const geocodeFetch = vi.fn<typeof fetch>(async () => Response.json([{ lat: 36.72, lon: -4.42, type: "suburb" }]));
  const r = await boot({ geocoderUrl: `http://${mode}.invalid`, geocodeFetch,
    llmExtract: mode === "llm" ? async () => ({ location_text: "calle Jacaranda 7", language: "es", summary_es: "Incendio.",
      translation_es: null, incident_type: "incendio", keywords: ["incendio"], risks: [], people_at_risk: 0, severity: 4 }) : undefined });
  await publish(r);
  const [call] = await frames(r);
  expect(geocodeFetch).toHaveBeenCalledTimes(1);
  expect(new URL(String(geocodeFetch.mock.calls[0][0])).searchParams.get("q")).toBe("calle Jacaranda 7");
  expect(call.data.location).toEqual({ place: "calle Jacaranda 7", known: true, aml: { lat: 36.72, lng: -4.42, acc: 500 } });
});
