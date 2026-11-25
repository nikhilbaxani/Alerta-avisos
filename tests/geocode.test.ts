import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UNKNOWN_LOCATION_AML } from "@/lib/publicCall";
import { haversine } from "@/lib/cluster";
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
  const demostenes = "Calle de Móstenes número 29, Málaga";
  const door = { lat: 36.71908, lon: -4.47193, type: "house" };
  const refinedDoor = { known: true, place: "Calle Demóstenes, 29", aml: { lat: door.lat, lng: door.lon, acc: 100 } };

  it.each([
    demostenes,
    "Estamos en calle de Móstenes número 29, Málaga, donde ha ocurrido un accidente.",
  ])("refina %s enviando solo la dirección corregida, y reutiliza la caché", async (input) => {
    const fetch = mockResponse([door]);
    expect(await resolveLocation(input, { url, fetch })).toEqual(refinedDoor);
    expect(await resolveLocation(input, { url, fetch })).toEqual(refinedDoor);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(expect.any(String), expect.objectContaining({ redirect: "error" }));
    expect(decodeURIComponent(new URL(fetch.mock.calls[0][0] as string).search.slice(1).replace(/\+/g, " ")))
      .toBe("format=jsonv2&limit=1&bounded=1&viewbox=-4.63,36.94,-4.29,36.65&countrycodes=es&q=Calle Demóstenes 29, Málaga");
  });

  it("también refina la calle sin portal y conserva el nombre canónico", async () => {
    const fetch = mockResponse([{ ...door, type: "street" }]);
    expect(await resolveLocation("Calle de Móstenes", { url, fetch })).toEqual({ ...refinedDoor, place: "Calle Demóstenes" });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(new URL(fetch.mock.calls[0][0] as string).searchParams.get("q")).toBe("Calle Demóstenes, Málaga");
  });

  it("refina un portal fuera de 1500 m cuando está dentro de una avenida extensa", async () => {
    const input = "Avenida José Ortega y Gasset 29";
    const local = await resolveLocation(input);
    expect(local).toMatchObject({ known: true, place: "Avenida José Ortega y Gasset, 29", aml: { acc: 1500 } });
    const house = { lat: local.aml.lat, lon: local.aml.lng + 0.02, type: "house" };
    expect(haversine(local.aml, { lat: house.lat, lng: house.lon })).toBeGreaterThan(1500);
    const fetch = mockResponse([house]);
    expect(await resolveLocation(input, { url, fetch })).toEqual({
      known: true, place: "Avenida José Ortega y Gasset, 29", aml: { lat: house.lat, lng: house.lon, acc: 100 },
    });
    expect(new URL(fetch.mock.calls[0][0] as string).searchParams.get("q")).toBe("Avenida José Ortega y Gasset 29, Málaga");
  });

  it("sitúa Demóstenes sin consultar el geocodificador si no tiene URL", async () => {
    const fetch = mockResponse();
    const location = await resolveLocation(demostenes, { fetch });
    expect(fetch).not.toHaveBeenCalled();
    expect(location).toMatchObject({ known: true, place: "Calle Demóstenes, 29" });
    expect(haversine(location.aml, { lat: 36.7184, lng: -4.4737 })).toBeLessThan(400);
    expect(location.aml.acc).toBeGreaterThanOrEqual(250);
  });

  it.each([
    ["punto lejano dentro de Málaga", () => Response.json([{ ...door, lon: -4.45 }])],
    ["punto fuera de la caja", () => Response.json([{ ...door, lat: 37 }])],
    ["sin resultados", () => Response.json([])],
    ["error HTTP", () => new Response(null, { status: 503 })],
    ["límite de peticiones", () => new Response(null, { status: 429 })],
    ["redirección", () => Response.redirect("https://otro.invalid", 302)],
    ["cuerpo demasiado grande", () => new Response(JSON.stringify([door]).padEnd(65_537))],
    ["error de red", () => { throw new Error("network error"); }],
  ] as const)("conserva el resultado local: %s", async (_label, makeResponse) => {
    const local = await resolveLocation(demostenes);
    const fetch = vi.fn<typeof globalThis.fetch>(async () => makeResponse());
    expect(await resolveLocation(demostenes, { url, fetch })).toEqual(local);
    expect(local.known).toBe(true);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(expect.any(String), expect.objectContaining({ redirect: "error" }));
  });

  it("conserva el resultado local al vencer el plazo de red", async () => {
    vi.useFakeTimers();
    const local = await resolveLocation(demostenes);
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(new ReadableStream<Uint8Array>()));
    const pending = resolveLocation(demostenes, { url, fetch });
    expect(fetch).toHaveBeenCalledTimes(1);
    const signal = fetch.mock.calls[0][1]?.signal;
    await vi.advanceTimersByTimeAsync(3000);
    expect(await pending).toEqual(local);
    expect(signal?.aborted).toBe(true);
  });

  it("conserva el resultado local con la cola llena", async () => {
    vi.useFakeTimers();
    const local = await resolveLocation(demostenes);
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(() => new Promise(() => {}));
    const opts = { url, fetch };
    const batch = Array.from({ length: 11 }, (_, i) => resolveLocation(`Calle Ajena ${i}`, opts));
    expect(await resolveLocation(demostenes, opts)).toEqual(local);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await Promise.all(batch)).toEqual(Array(11).fill(unknown));
  });
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
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(new ReadableStream<Uint8Array>()));
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

  it("rechaza una respuesta 302 y no permite seguir redirecciones", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.redirect("https://otro.invalid", 302));
    expect((await resolveLocation(address, { url, fetch })).known).toBe(false);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(expect.any(String), expect.objectContaining({ redirect: "error" }));
  });

  it.each([65_536, 65_537])("limita el cuerpo contado en bytes (%i)", async (size) => {
    const payload = JSON.stringify([{ ...point, display_name: "á".repeat(20_000) }]);
    const bytes = new TextEncoder().encode(payload);
    const cancel = vi.fn();
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.enqueue(new Uint8Array(size - bytes.length).fill(32));
        if (size === 65_536) controller.close();
      },
      // RED también termina: la implementación anterior lee hasta el cierre.
      pull(controller) { controller.close(); },
      cancel,
    }, { highWaterMark: 0 })));
    expect(await resolveLocation(address, { url, fetch })).toEqual(size === 65_536 ? success : unknown);
    expect(cancel).toHaveBeenCalledTimes(size === 65_536 ? 0 : 1);
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

  it("encola búsquedas nuevas hasta que pase un segundo", async () => {
    vi.useFakeTimers();
    const fetch = mockResponse([{ ...point, type: "suburb" }]);
    const opts = { url, fetch };
    const first = resolveLocation(address, opts);
    const second = resolveLocation("Otra calle", opts);
    expect(await first).toEqual({ ...success, aml: { ...success.aml, acc: 500 } });
    await vi.advanceTimersByTimeAsync(999);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect((await second).known).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("acota la cola y el plazo total aunque las consultas en vuelo no respondan", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(() => new Promise(() => {}));
    const opts = { url, fetch };
    const batch = Array.from({ length: 11 }, (_, i) => resolveLocation(`Calle Ajena ${i}`, opts));
    expect(await resolveLocation("Calle Fuera de Cola", opts)).toEqual(unknown);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2999);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(7001);
    expect(await Promise.all(batch)).toEqual(Array(11).fill(unknown));
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(fetch.mock.calls.every(([, init]) => init?.signal?.aborted)).toBe(true);
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
