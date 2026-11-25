import { describe, expect, it } from "vitest";
import { resolveLocation } from "@/lib/geocode";
import { UNKNOWN_LOCATION_AML } from "@/lib/publicCall";

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
    ["calle Gustavo Adolfo Vecquer", "Calle Gustavo Adolfo Bécquer"],
    ["calle Gustavo Hadolfo Becquer", "Calle Gustavo Adolfo Bécquer"],
    ["avenida Miguel Zerbantes", "Avenida Miguel de Cervantes"],
    ["calle Alcalde Ronquiyo", "Calle Alcalde Ronquillo"],
    ["calle Gustao Adolf Becquer", "Calle Gustavo Adolfo Bécquer"],
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
    "Avenida Lope de Vega",
    "Calle Salir", // No corregir por semejanza si requiere más de una edición en un nombre corto.
    `Calle Demóstenes ${"x".repeat(201)}`,
  ])("no asigna coordenadas locales a %s", async (input) => {
    expect(await resolveLocation(input)).toEqual(unknown);
  });

  it("compara una dirección con todo el índice en menos de 200 ms", async () => {
    const start = performance.now();
    expect((await resolveLocation("Calle de Móstenes 29")).known).toBe(true);
    expect(performance.now() - start).toBeLessThan(200);
  });
});
