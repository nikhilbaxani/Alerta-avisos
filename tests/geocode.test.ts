import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UNKNOWN_LOCATION_AML } from "@/lib/publicCall";
import type { resolveLocation as ResolveLocation } from "@/lib/geocode";

const url = "https://geocoder.invalid/nominatim/";
const address = "Calle Única 7, Málaga";
const point = { lat: "36.721", lon: "-4.422", type: "house", display_name: "<b>do not use</b>" };
const unknown = { place: null, known: false, aml: UNKNOWN_LOCATION_AML };
const success = { place: address, known: true, aml: { lat: 36.721, lng: -4.422, acc: 100 } };
const mockResponse = (payload: unknown = [point]) => vi.fn<typeof fetch>().mockImplementation(async () => Response.json(payload));

let resolveLocation: typeof ResolveLocation;
beforeEach(async () => {
  vi.resetModules();
  ({ resolveLocation } = await import("@/lib/geocode"));
});
afterEach(() => vi.useRealTimers());

describe("resolveLocation", () => {
  it("prefiere el nomenclátor y solo usa la red cuando no hay coincidencia", async () => {
    const fetch = mockResponse();
    expect(await resolveLocation("Calle Larios 10", { url, fetch })).toEqual({ place: "Calle Larios", known: true, aml: { lat: 36.7197, lng: -4.4215, acc: 150 } });
    expect(fetch).not.toHaveBeenCalled();
    expect(await resolveLocation(address, { url, fetch })).toEqual(success);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("envía solo la dirección a la búsqueda acotada, no incorpora la etiqueta remota", async () => {
    const fetch = mockResponse();
    expect(await resolveLocation(` ${address} `, { url, fetch })).toEqual(success);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      "https://geocoder.invalid/nominatim/search?format=jsonv2&limit=1&bounded=1&viewbox=-4.63%2C36.94%2C-4.29%2C36.65&countrycodes=es&q=Calle+%C3%9Anica+7%2C+M%C3%A1laga",
      expect.objectContaining({ method: "GET", headers: { "User-Agent": "agente-112-demo" }, signal: expect.any(AbortSignal) }),
    );
  });

  it("devuelve ubicación desconocida y aborta a los 3000 ms incluso esperando el cuerpo", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue({ ok: true, json: () => new Promise(() => {}) } as Response);
    const pending = resolveLocation(address, { url, fetch });
    expect(fetch).toHaveBeenCalledTimes(1);
    const signal = fetch.mock.calls[0][1]?.signal;
    await vi.advanceTimersByTimeAsync(2999);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual(unknown);
    expect(signal?.aborted).toBe(true);
  });

  it("devuelve ubicación desconocida ante un error HTTP", async () => {
    const json = vi.fn();
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue({ ok: false, status: 503, json } as unknown as Response);
    expect(await resolveLocation(address, { url, fetch })).toEqual(unknown);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(json).not.toHaveBeenCalled();
  });

  it.each([
    { result: [] }, { result: [{ ...point, lat: "37.4" }] }, { result: [{ ...point, lon: "-5" }] },
    { result: [{ ...point, lat: "36.721N" }] }, { result: [{ ...point, lon: true }] },
  ])("rechaza resultados vacíos o inválidos: $result", async ({ result }) => {
    const fetch = mockResponse(result);
    expect(await resolveLocation(address, { url, fetch })).toEqual(unknown);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("reutiliza el resultado sin emitir otra petición", async () => {
    const fetch = mockResponse();
    expect(await resolveLocation(address, { url, fetch })).toEqual(success);
    expect(await resolveLocation(address, { url, fetch })).toEqual(success);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("omite búsquedas nuevas hasta que pase un segundo", async () => {
    vi.useFakeTimers();
    const fetch = mockResponse([{ ...point, type: "suburb" }]);
    const opts = { url, fetch };
    const first = resolveLocation(address, opts);
    expect(await resolveLocation("Otra calle", opts)).toEqual(unknown);
    expect(await first).toEqual({ ...success, aml: { ...success.aml, acc: 500 } });
    await vi.advanceTimersByTimeAsync(999);
    expect(await resolveLocation("Otra calle", opts)).toEqual(unknown);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect((await resolveLocation("Otra calle", opts)).known).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("limita la caché a 256 resultados", async () => {
    vi.useFakeTimers();
    const fetch = mockResponse();
    const opts = { url, fetch };
    for (let i = 0; i <= 256; i++) {
      expect((await resolveLocation(`${address} ${i}`, opts)).known).toBe(true);
      await vi.advanceTimersByTimeAsync(1000);
    }
    expect((await resolveLocation(`${address} 256`, opts)).known).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(257);
    expect((await resolveLocation(`${address} 0`, opts)).known).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(258);
  });

  it("no consulta si la URL está vacía", async () => {
    const fetch = mockResponse();
    expect(await resolveLocation(address, { url: "", fetch })).toEqual(unknown);
    expect((await resolveLocation("Calle Larios", { url: "", fetch })).known).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rechaza entradas vacías y de más de 200 caracteres incluso si mencionan un lugar conocido", async () => {
    const fetch = mockResponse();
    expect(await resolveLocation("  ", { url, fetch })).toEqual(unknown);
    expect(await resolveLocation(`Calle Larios ${"z".repeat(189)}`, { url, fetch })).toEqual(unknown);
    expect(fetch).not.toHaveBeenCalled();
  });
});
