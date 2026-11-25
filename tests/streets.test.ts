import { describe, expect, it } from "vitest";
import { resolveLocation } from "@/lib/geocode";
import { UNKNOWN_LOCATION_AML } from "@/lib/publicCall";
import { STREET_NAMES } from "@/lib/streetNames";
import { haversine } from "@/lib/cluster";
import { normalize } from "@/lib/gazetteer";
import { matchStreet } from "@/lib/streets";

const generic = new Set(("san santa santo padre madre fray sor doctor doctora maestro maestra profesor profesora " +
  "conde condesa duque duquesa marques marquesa general capitan coronel alcalde alcaldesa pintor poeta escritor " +
  "musico compositor ingeniero arquitecto obispo cardenal virgen nuestra senora don dona hermano hermanos " +
  "de del la las los el al a y e").split(" "));

// Oráculo del barrido: solo equivalencias enumeradas, no distancia aproximada.
const speechSound = (word: string) => word.replace(/v/g, "b").replace(/c(?=[ei])|z/g, "s")
  .replace(/g(?=[ei])/g, "j").replace(/ll/g, "y").replace(/(?<!c)h/g, "")
  .replace(/([a-z])\1+/g, "$1").replace(/sky$/, "ski");

const unknown = { place: null, known: false, aml: UNKNOWN_LOCATION_AML };

describe("callejero local de Málaga", () => {
  it.each([
    ["Calle Demóstenes", "Calle Demóstenes"],
    ["Calle de Móstenes número 29, Málaga", "Calle Demóstenes, 29"],
    ["Calle Vallesteros 3", "Calle Ballesteros, 3"],
    ["Calle Mendibil", "Calle Mendívil"],
    ["Calle Oyerías", "Calle Ollerías"],
    ["Calle Hollerías", "Calle Ollerías"],
    ["Calle Allala", "Calle Ayala"],
    ["Calle Puerta de Mar", "Calle Puerta del Mar"],
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
    "Calle Santa Marina 3",
    "Calle Maestro Alfonso 5",
    "Calle Padre Mariano 3",
    "Calle Conde de Moreno 3",
    "Avenida Manuela Rodríguez 10",
    "Calle Doctor Marcos 1",
    "Calle Santa Malta",
    "Calle San Hernando",
    "Estoy en Sevilla",
    "estamos en Toledo",
    "Demóstenes, Málaga",
  ])("no adivina una calle a partir de %s", async (input) => {
    expect(matchStreet(input)).toBeNull();
    expect(await resolveLocation(input)).toEqual(unknown);
  });

  it("no convierte palabras del callejero en otras por una errata libre (barrido S32)", () => {
    const start = performance.now();
    const names = STREET_NAMES.map(([name]) => ({ name, tokens: normalize(name).trim().split(" ") }));
    const vocabulary = new Set(names.flatMap(({ tokens }) => tokens));
    const deletions = (word: string) => [...word].map((_, i) => word.slice(0, i) + word.slice(i + 1));
    const signatures = new Map<string, Set<string>>();
    for (const word of vocabulary) {
      for (const signature of deletions(word)) {
        if (!signatures.has(signature)) signatures.set(signature, new Set());
        signatures.get(signature)!.add(word);
      }
    }
    let generated = 0;
    let resolved = 0;
    const exceptions: string[] = [];
    const violations: string[] = [];
    streets: for (const { name, tokens } of names) {
      for (let i = 1; i < tokens.length; i++) {
        const original = tokens[i];
        if (generic.has(original) || !/[a-z]/.test(original)) continue;
        const neighbors = new Set(signatures.get(original));
        for (const shorter of deletions(original)) {
          if (vocabulary.has(shorter)) neighbors.add(shorter);
          for (const neighbor of signatures.get(shorter) ?? []) neighbors.add(neighbor);
        }
        neighbors.delete(original);
        for (const replacement of [...neighbors].sort()) {
          const query = [...tokens];
          query[i] = replacement;
          const input = query.join(" ");
          const result = matchStreet(input);
          if (result?.location.known) {
            resolved++;
            if (result.location.place === name) {
              const detail = `${input} → ${name} (${replacement}/${original})`;
              if (speechSound(replacement) === speechSound(original)) exceptions.push(detail);
              else violations.push(detail);
            }
          }
          if (++generated === 3000) break streets;
        }
      }
    }
    console.info(`S32: ${generated} casos, ${resolved} conocidos, ${violations.length} erratas incorrectas, ${exceptions.length} excepciones fonéticas al original:\n${exceptions.join("\n")}`);
    expect(generated).toBe(3000);
    expect(violations.slice(0, 10), `${violations.length} erratas incorrectas`).toEqual([]);
    expect(performance.now() - start).toBeLessThan(5000);
  }, 60000);

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
