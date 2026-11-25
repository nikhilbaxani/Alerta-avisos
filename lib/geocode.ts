import { locate } from "@/lib/gazetteer";
import { matchStreet } from "@/lib/streets";
import { haversine } from "@/lib/cluster";
import { UNKNOWN_LOCATION_AML, type PublicLocation } from "@/lib/publicCall";
import type { Aml } from "@/lib/types";

export interface GeocodeOptions {
  url?: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}

// Caja envolvente aproximada del municipio (no es su perímetro administrativo).
const MALAGA = { west: -4.63, north: 36.94, east: -4.29, south: 36.65 };
const CACHE_LIMIT = 256;
const MAX_STREET_REFINEMENT_METERS = 1500;
const MAX_RESPONSE_BYTES = 64 * 1024;
const cache = new Map<string, Aml>();
const QUEUE_LIMIT = 10;
const TOTAL_LIMIT_MS = 10_000;
let active = false;
let cooling = false;
const queue: (() => void)[] = [];

function drain() {
  if (!active && !cooling) queue.shift()?.();
}

function queuedSearch(search: (signal: AbortSignal) => Promise<Aml | undefined>, timeoutMs?: number) {
  if (queue.length >= QUEUE_LIMIT) return Promise.resolve(undefined);
  return new Promise<Aml | undefined>((resolve) => {
    const controller = new AbortController();
    const total = setTimeout(() => {
      const index = queue.indexOf(start);
      if (index >= 0) queue.splice(index, 1);
      controller.abort();
      resolve(undefined);
    }, Math.min(timeoutMs ?? TOTAL_LIMIT_MS, TOTAL_LIMIT_MS));
    function start() {
      active = true;
      cooling = true;
      setTimeout(() => { cooling = false; drain(); }, 1000);
      const onAbort = () => finish(undefined);
      const fetchTimer = setTimeout(() => controller.abort(), timeoutMs ?? 3000);
      function finish(value: Aml | undefined) {
        resolve(value);
        clearTimeout(total);
        clearTimeout(fetchTimer);
        controller.signal.removeEventListener("abort", onAbort);
        active = false;
        drain();
      }
      controller.signal.addEventListener("abort", onAbort, { once: true });
      void search(controller.signal).then(
        (value) => { if (!controller.signal.aborted) finish(value); },
        () => { if (!controller.signal.aborted) finish(undefined); },
      );
    }
    queue.push(start);
    drain();
  });
}

const unknown = (): PublicLocation => ({ place: null, known: false, aml: { ...UNKNOWN_LOCATION_AML } });

function searchUrl(base: string, place: string): string {
  const url = new URL(base);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new TypeError("Invalid geocoder protocol");
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/search`;
  url.hash = "";
  url.search = new URLSearchParams({
    format: "jsonv2",
    limit: "1",
    bounded: "1",
    viewbox: `${MALAGA.west},${MALAGA.north},${MALAGA.east},${MALAGA.south}`,
    countrycodes: "es",
    q: place,
  }).toString();
  return url.href;
}

function coordinate(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value.trim())) return Number(value);
  return NaN;
}

function readPoint(body: unknown): Aml | undefined {
  const result: unknown = Array.isArray(body) ? body[0] : undefined;
  if (!result || typeof result !== "object") return;
  const { lat, lon, type, category, class: legacyClass } = result as Record<string, unknown>;
  const latitude = coordinate(lat);
  const longitude = coordinate(lon);
  if (!(latitude >= MALAGA.south && latitude <= MALAGA.north && longitude >= MALAGA.west && longitude <= MALAGA.east)) return;
  const kind = category ?? legacyClass;
  const acc = type === "house" || type === "street" || kind === "highway" ? 100
    : type === "suburb" || type === "neighbourhood" || type === "quarter" ? 500
    : 1000;
  return { lat: latitude, lng: longitude, acc };
}

async function readResponse(response: Response, signal: AbortSignal): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) return;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    if (signal.aborted) { cancel(); return; }
    for (;;) {
      const { done, value } = await reader.read();
      if (signal.aborted) return;
      if (done) return JSON.parse(text + decoder.decode());
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) { cancel(); return; }
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}

/** Recibe solo el campo de dirección extraído; nunca pasar la transcripción. */
export async function resolveLocation(locationText: string, opts: GeocodeOptions = {}): Promise<PublicLocation> {
  const place = locationText.trim();
  if (!place || locationText.length > 200) return unknown();
  const local = locate(place);
  if (local) return { place: local.place, known: true, aml: local.aml };
  const street = matchStreet(place);
  const fallback = street?.location ?? unknown();
  const base = opts.url?.trim();
  if (!base) return fallback;

  const usable = (aml: Aml): boolean =>
    !street || haversine(street.location.aml, aml) <= MAX_STREET_REFINEMENT_METERS;
  const located = (aml: Aml): PublicLocation => ({ place: street ? street.location.place : place, known: true, aml: { ...aml } });
  try {
    const url = searchUrl(base, street?.address ?? place);
    const cached = cache.get(url);
    if (cached) return usable(cached) ? located(cached) : fallback;
    const aml = await queuedSearch(async (signal) => {
      const cached = cache.get(url);
      if (cached) return cached;
      const response = await (opts.fetch ?? globalThis.fetch)(url, {
        method: "GET",
        headers: { "User-Agent": "agente-112-demo" },
        signal,
        redirect: "error",
      });
      return response.ok ? readPoint(await readResponse(response, signal)) : undefined;
    }, opts.timeoutMs);
    if (!aml || !usable(aml)) return fallback;
    cache.set(url, { ...aml });
    if (cache.size > CACHE_LIMIT) {
      const oldest = cache.keys().next();
      if (!oldest.done) cache.delete(oldest.value);
    }
    return located(aml);
  } catch {
    return fallback;
  }
}
