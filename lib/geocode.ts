import { locate } from "@/lib/gazetteer";
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
const cache = new Map<string, Aml>();
let nextRequestAt = -Infinity;

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

/** Recibe solo el campo de dirección extraído; nunca pasar la transcripción. */
export async function resolveLocation(locationText: string, opts: GeocodeOptions = {}): Promise<PublicLocation> {
  const place = locationText.trim();
  if (!place || locationText.length > 200) return unknown();
  const local = locate(place);
  if (local) return { place: local.place, known: true, aml: local.aml };
  const base = opts.url?.trim();
  if (!base) return unknown();

  try {
    const url = searchUrl(base, place);
    const cached = cache.get(url);
    if (cached) return { place, known: true, aml: { ...cached } };
    // Sin cola: las consultas no cacheadas que lleguen antes de un segundo se omiten.
    const now = performance.now();
    if (now < nextRequestAt) return unknown();
    nextRequestAt = now + 1000;

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const deadline = new Promise<undefined>((resolve) => {
        timer = setTimeout(() => {
          controller.abort();
          resolve(undefined);
        }, opts.timeoutMs ?? 3000);
      });
      const fetchLocation = opts.fetch ?? globalThis.fetch;
      const search = async () => {
        const response = await fetchLocation(url, {
          method: "GET",
          headers: { "User-Agent": "agente-112-demo" },
          signal: controller.signal,
          redirect: "error",
        });
        return response.ok ? readPoint(await response.json()) : undefined;
      };
      const aml = await Promise.race([deadline, search()]);
      if (!aml) return unknown();
      cache.set(url, { ...aml });
      if (cache.size > CACHE_LIMIT) {
        const oldest = cache.keys().next();
        if (!oldest.done) cache.delete(oldest.value);
      }
      return { place, known: true, aml };
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return unknown();
  }
}
