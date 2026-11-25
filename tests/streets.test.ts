import { describe, expect, it } from "vitest";
import { resolveLocation } from "@/lib/geocode";
import { UNKNOWN_LOCATION_AML } from "@/lib/publicCall";
import { STREET_NAMES } from "@/lib/streetNames";
import { haversine } from "@/lib/cluster";

const unknown = { place: null, known: false, aml: UNKNOWN_LOCATION_AML };

describe("callejero local de Málaga", () => {
  it.each([
    ["Calle Demóstenes", "Calle Demóstenes"],
    ["Demóstenes, Málaga", "Calle Demóstenes"],
    ["c/ de Móstenes nº 29, Málaga", "Calle Demóstenes, 29"],
    ["calle Marquez delarios num. 10, Málaga", "Calle Marqués de Larios, 10"],
    ["calle la rios", "Calle Marqués de Larios"],
    ["avda. de Zervantes, 4, Málaga, Andalucía, España", "Avenida de Cervantes, 4"],
    ["calle Sivelius", "Calle Sibelius"],
    ["calle Strabinski", "Calle Stravinsky"],
    ["calle Becquer", "Calle Bécquer"],
    ["en la calle Salittre esquina con calle Sibelius", "Calle Salitre"],
    ["calle Salitree número 5", "Calle Salitre, 5"],
    ["calle Brahmms", "Calle Brahms"],
    ["calle Antonio José Belasco", "Calle Antonio José Velasco"],
    ["Antonio José Velasco", "Calle Antonio José Velasco"],
    ["calle Padre Hidalhgo", "Calle Padre Hidalgo"],
    ["calle San Bizente Ferrer", "Calle San Vicente Ferrer"],
    ["calle Alcalde Ronquiyo", "Calle Alcalde Ronquillo"],
    ["calle Manuel Bnítez el Cordbés", "Calle Manuel Benítez El Cordobés"],
  ])("resuelve %s como %s", async (input, place) => {
    const location = await resolveLocation(input);
    expect(location).toEqual({ place, known: true, aml: { lat: expect.any(Number), lng: expect.any(Number), acc: expect.any(Number) } });
    expect(location.aml.acc).toBeGreaterThanOrEqual(250);
  });

  it.each([
    "Calle de la Piruleta Azul 7",
    "Ha ocurrido un accidente y hay dos coches",
    "Calle So",
    "Calle Clabel", // Calle Clavel y Calle del Clavel puntúan casi igual.
    "Calle",
    "Avda. número 7, Málaga",
    "Plaza Demóstenes",
    "Pacífico",
    "Calle Escuelas",
    "Calle Montera 4",
    "Calle de la Playa",
    "Avenida de la Libertad",
    "Calle Ramón y Cajal 3",
    "Calle Salir", // No corregir por semejanza si requiere más de una edición en un nombre corto.
    `Calle Demóstenes ${"x".repeat(201)}`,
  ])("no asigna coordenadas locales a %s", async (input) => {
    expect(await resolveLocation(input)).toEqual(unknown);
  });

  it.each(["calle Pacífico", "Calle Real"])("resuelve %s porque la vía es única dentro del municipio", async (input) => {
    const place = input === "calle Pacífico" ? "Calle Pacífico" : input;
    expect(await resolveLocation(input)).toMatchObject({ known: true, place });
  });

  it.each(["Calle Cañaveral", "Calle Zamorano", "Camino Antiguo de Cártama"])("no adivina entre homónimas distantes: %s", async (input) => {
    const points = STREET_NAMES.filter(([name]) => name === input).map(([, lat, lng]) => ({ lat, lng }));
    expect(points).toHaveLength(2);
    expect(haversine(points[0], points[1])).toBeGreaterThan(1500);
    expect(await resolveLocation(input)).toEqual(unknown);
  });

  it("S32: el índice solo tiene vías dentro de la caja de Málaga", () => {
    expect(STREET_NAMES.filter(([, la, ln]) => !(la >= 36.65 && la <= 36.94 && ln >= -4.63 && ln <= -4.29))).toEqual([]);
  });

  it.each([
    ["Avenida José Ortega y Gasset", "Avenida José Ortega y Gasset", 1500],
    ["Avenida Lope de Vega", "Avenida Lope de Vega", 835],
    ["Avenida Valle-Inclán", "Avenida de Valle-Inclán", 1500],
    ["Avenida Juan Sebastián Elcano", "Avenida Juan Sebastián Elcano", 914],
    ["Avenida de Europa", "Avenida Europa", 862],
  ] as const)("agrupa los tramos de %s y cubre su semiextensión hasta 1500 m", async (input, place, minAcc) => {
    const result = await resolveLocation(input);
    expect(result).toMatchObject({ known: true, place });
    expect(result.aml.acc).toBeGreaterThanOrEqual(minAcc);
    expect(result.aml.acc).toBeLessThanOrEqual(1500);
  });

  it("compara una dirección con todo el índice en menos de 200 ms", async () => {
    const start = performance.now();
    expect((await resolveLocation("Calle de Móstenes 29")).known).toBe(true);
    expect(performance.now() - start).toBeLessThan(200);
  });
});
