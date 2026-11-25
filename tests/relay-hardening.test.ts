import { afterEach, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { getConfig } from "@/lib/config";
import { createLlmExtractor, createRelay, type RelayOptions } from "@/server/relay";

const TOKEN = "token-local-de-prueba";
const ORIGIN = "https://consola.example.test";
const transcript = "Hay un incendio en la calle Larios";
const servers: http.Server[] = [];

async function listen(handler: http.RequestListener) {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

async function boot(options: Partial<RelayOptions> = {}) {
  const relay = createRelay({
    sttBaseUrl: "http://stt.test/v1", token: TOKEN, bootTag: "", allowedOrigins: [ORIGIN],
    fetch: async () => Response.json({ text: transcript, language: "es", duration: 12 }),
    pendingPerIp: 10, rateLimit: { max: 10, windowMs: 60_000 }, log: () => {},
    ...options,
  });
  return { base: await listen(relay.handler), idle: relay.idle };
}

function form(type = "audio/webm", consent = true, bytes = 32) {
  const body = new FormData();
  body.set("file", new Blob([new Uint8Array(bytes)], { type }), "prueba.webm");
  if (consent) body.set("consent", "1");
  return body;
}

const post = (base: string, body: BodyInit) => fetch(`${base}/llamar`, { method: "POST", body });
async function ready(relay: Awaited<ReturnType<typeof boot>>) {
  const response = await post(relay.base, form());
  expect(response.status).toBe(202);
  const { id } = await response.json();
  await relay.idle();
  return id as string;
}

async function status(base: string, id: string) {
  const response = await fetch(`${base}/llamar/${id}`);
  expect(response.status).toBe(200);
  return response.json();
}

async function send(base: string, id: string) {
  const response = await fetch(`${base}/llamar/${id}/enviar`, { method: "POST" });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: "publishing" });
}

async function stream(base: string) {
  const signal = AbortSignal.timeout(3500);
  const response = await fetch(`${base}/events?token=${TOKEN}`, { signal });
  expect(response.status).toBe(200);
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  return {
    close: () => reader.cancel(),
    async next() {
      for (;;) {
        const end = buffer.indexOf("\n\n");
        if (end >= 0) {
          const frame = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const match = /^event: (\w+)\ndata: (.+)$/.exec(frame);
          if (match) return { event: match[1], data: JSON.parse(match[2]) };
          if (frame === ": ping") return { event: "ping", data: null };
          continue;
        }
        const chunk = await reader.read();
        if (chunk.done) throw new Error("SSE cerrado");
        buffer += decoder.decode(chunk.value, { stream: true });
      }
    },
  };
}

it("con la cola llena, una subida rechazada no pierde ninguna transcripción; una válida retira solo la más antigua", async () => {
  const relay = await boot({ maxPending: 1, maxBytes: 1024, rateLimit: { max: 3, windowMs: 60_000 }, uploadLimit: 3 });
  const ids = [await ready(relay), await ready(relay)];
  for (const [body, code, error] of [
    ["texto", 400, "Se esperaba multipart/form-data"],
    [form("audio/webm", false), 400, "Falta el consentimiento para grabar y enviar tu voz"],
    [form("text/plain"), 415, "El archivo no es un audio admitido"],
    [form("audio/webm", true, 1024), 413, "El audio supera 0.0009765625 MB"],
  ] as const) {
    const response = await post(relay.base, body);
    expect(response.status).toBe(code);
    expect(await response.json()).toEqual({ error });
    for (const id of ids) expect(await status(relay.base, id)).toEqual({ status: "ready", transcript, language: "es" });
  }
  // Una grabación que se interrumpe antes de terminar tampoco debe retener cuota ni desalojar.
  await new Promise<void>((resolve, reject) => {
    const request = http.request(`${relay.base}/llamar`, {
      method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=prueba", "Content-Length": 512 },
    });
    request.on("error", (error: NodeJS.ErrnoException) => { if (error.code !== "ECONNRESET") reject(error); });
    request.on("close", resolve);
    request.write("--prueba\r\n", () => setImmediate(() => request.destroy()));
  });
  for (const id of ids) expect(await status(relay.base, id)).toEqual({ status: "ready", transcript, language: "es" });
  const next = await ready(relay);
  expect(await status(relay.base, ids[0])).toMatchObject({ status: "expired" });
  for (const id of [ids[1], next]) expect(await status(relay.base, id)).toEqual({ status: "ready", transcript, language: "es" });
});

it("una excepción inesperada devuelve 500 JSON y el relay sigue atendiendo peticiones", async () => {
  const logs: string[] = [];
  const relay = await boot({ log(message) { if (message.includes("recibida")) throw new Error("fallo simulado"); logs.push(message); } });
  const response = await post(relay.base, form());
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: "Error interno del relay" });
  expect(logs).toEqual(["[relay] error interno al atender una petición"]);
  const health = await fetch(`${relay.base}/health`);
  expect(health.status).toBe(200);
  expect(await health.json()).toEqual({ ok: true, queue: 0, maxCallSeconds: 120 });
});

it("el plazo del LLM cancela un cuerpo bloqueado antes de ceder el hueco y permite publicar con reglas", async () => {
  let active = 0, peak = 0, started = 0;
  const gateway = await listen((req, res) => {
    req.resume();
    const n = ++started;
    peak = Math.max(peak, ++active);
    res.once("close", () => { active--; });
    res.writeHead(200, { "Content-Type": "application/json" });
    if (n < 3) res.write('{"choices":');
    else res.end(JSON.stringify({ choices: [{ message: { content: '{"language":"es"}' } }] }));
  });
  const relay = await boot({ llmExtract: createLlmExtractor(getConfig({ LLM_BASE_URL: gateway }), 200), llmTimeoutMs: 200, llmConcurrency: 1 });
  const sse = await stream(relay.base);
  try {
    const ids = [await ready(relay), await ready(relay)];
    for (const id of ids) await send(relay.base, id);
    for (let i = 0; i < 2; i++) expect(await sse.next()).toMatchObject({ event: "call", data: { extractor: "rules" } });
    expect(peak).toBe(1);
    expect(started).toBe(2);
    await send(relay.base, await ready(relay));
    expect(await sse.next()).toMatchObject({ event: "call", data: { extractor: "llm" } });
    expect(started).toBe(3);
    expect(peak).toBe(1);
  } finally { await sse.close(); }
});

function ack(base: string, body: string, token: string | null = TOKEN, origin = ORIGIN) {
  return fetch(`${base}/events/ack`, { method: "POST", body, headers: {
    Origin: origin, "Content-Type": "application/json", ...(token === null ? {} : { Authorization: `Bearer ${token}` }),
  } });
}

it("el acuse exige autorización, un origen permitido y un cuerpo JSON acotado y válido", async () => {
  const { base } = await boot();
  const body = JSON.stringify({ id: "P1", outcome: "accepted" });
  for (const [request, code, error] of [
    [() => ack(base, body, null), 401, "Token no válido"],
    [() => ack(base, body, "incorrecto"), 401, "Token no válido"],
    [() => ack(base, body, TOKEN, "https://otro.example.test"), 403, "Origen no permitido"],
    [() => ack(base, "{"), 400, "Acuse no válido"],
    [() => ack(base, '{"id":"no","outcome":"accepted"}'), 400, "Acuse no válido"],
    [() => ack(base, '{"id":"P1","outcome":"otro"}'), 400, "Acuse no válido"],
    [() => ack(base, " ".repeat(1025)), 413, "El acuse supera 1024 bytes"],
    [() => ack(base, body), 404, "No encontramos esa llamada."],
  ] as const) {
    const response = await request();
    expect(response.status).toBe(code);
    expect(await response.json()).toEqual({ error });
  }
  for (const origin of [ORIGIN, "https://otro.example.test"]) {
    const response = await fetch(`${base}/events/ack`, { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type" } });
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin === ORIGIN ? ORIGIN : null);
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe(origin === ORIGIN ? "Content-Type, Authorization" : null);
  }
});

it("el acuse retira la llamada del historial, avisa a otra consola y es idempotente", async () => {
  const relay = await boot({ heartbeatMs: 100 });
  const { base } = relay;
  const other = await stream(base);
  const nextEvent = async (sse: Awaited<ReturnType<typeof stream>>) => {
    let event = await sse.next();
    while (event.event === "ping") event = await sse.next();
    return event;
  };
  try {
    for (const expected of ["P1", "P2"]) {
      await send(base, await ready(relay));
      expect(await nextEvent(other)).toMatchObject({ event: "call", data: { id: expected } });
    }
    const body = '{"id":"P1","outcome":"discarded"}';
    const response = await ack(base, body);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(await nextEvent(other)).toEqual({ event: "handled", data: { id: "P1", outcome: "discarded" } });
    const duplicate = await ack(base, '{"id":"P1","outcome":"accepted"}');
    expect(duplicate.status).toBe(200);
    expect(await duplicate.json()).toEqual({ ok: true });
    expect(await other.next()).toEqual({ event: "ping", data: null });
    const fresh = await stream(base);
    try {
      expect(await fresh.next()).toMatchObject({ event: "call", data: { id: "P2" } });
      expect(await fresh.next()).toEqual({ event: "ping", data: null });
    } finally { await fresh.close(); }
  } finally { await other.close(); }
});

// S22: una petición anónima con un destino ilegible no puede tumbar el relay.
async function raw(base: string, requestLine: string) {
  const net = await import("node:net");
  const { port, hostname } = new URL(base);
  return new Promise<string>((resolve, reject) => {
    const socket = net.connect(Number(port), hostname, () => socket.write(`${requestLine}\r\nHost: relay\r\nConnection: close\r\n\r\n`));
    let data = "";
    socket.setTimeout(5000, () => { socket.destroy(); resolve(data); });
    socket.on("data", (chunk) => { data += chunk; });
    socket.on("end", () => resolve(data));
    socket.on("error", reject);
  });
}

it("un destino de petición ilegible responde 400 y el relay sigue atendiendo", async () => {
  const relay = await boot();
  for (const target of ["//a:b", "//[", "//a:99999"]) {
    const answer = await raw(relay.base, `GET ${target} HTTP/1.1`);
    expect(answer.split("\r\n")[0], target).toMatch(/^HTTP\/1\.1 400 /);
  }
  await raw(relay.base, `GET /${"a".repeat(9000)} HTTP/1.1`);
  await raw(relay.base, "GET /a\u0000b HTTP/1.1").catch(() => "");
  const health = await fetch(`${relay.base}/health`);
  expect(health.status).toBe(200);
});
