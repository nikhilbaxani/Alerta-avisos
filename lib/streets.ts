import { normalize } from "@/lib/gazetteer";
import { STREET_NAMES } from "@/lib/streetNames";
import type { PublicLocation } from "@/lib/publicCall";

const TYPES = new Map(Object.entries({
  calle: "calle", avenida: "avenida", avda: "avenida", av: "avenida",
  plaza: "plaza", pza: "plaza", pl: "plaza", paseo: "paseo", pso: "paseo",
  camino: "camino", cno: "camino", carretera: "carretera", ctra: "carretera",
  pasaje: "pasaje", psje: "pasaje", pje: "pasaje", travesia: "travesia", trav: "travesia",
  urbanizacion: "urbanizacion", urb: "urbanizacion", callejon: "callejon",
  glorieta: "glorieta", gta: "glorieta", ronda: "ronda", rda: "ronda",
  alameda: "alameda", rambla: "rambla", bulevar: "bulevar", boulevard: "bulevar",
  autovia: "autovia", autopista: "autopista", carril: "carril", cuesta: "cuesta",
  puente: "puente", via: "via", tramo: "tramo", sendero: "sendero",
}));
const PARTICLES = new Set(["de", "del", "la", "las", "los", "el"]);
const GENERIC = new Set([...PARTICLES, ...(
  "al a y e san santa santo padre madre fray sor doctor doctora maestro maestra profesor profesora " +
  "conde condesa duque duquesa marques marquesa general capitan coronel alcalde alcaldesa pintor poeta " +
  "escritor musico compositor ingeniero arquitecto obispo cardenal virgen nuestra senora don dona hermano hermanos"
).split(" ")]);
const isDistinctive = (word: string) => /[a-z]/.test(word) && !GENERIC.has(word);
const LOCATION_SUFFIX = /(?:(?:^| )(?:(?:provincia de )?malaga|andalucia|espana|spain))+$/;
const INTRO = /^(?:(?:estamos|estoy|estaba|ocurrio|ha sido) )?(?:en|desde|cerca de|junto a) (?:la |el )?/;
const END_OF_STREET = /\b(?:esquina con|cruce con|interseccion con|donde|(?:y )?(?:hay|ha ocurrido))\b/;

function words(text: string): string {
  return normalize(text.toLowerCase().replace(/\bc\s*\//g, "calle ")
    .replace(/\bp\s*\.?\s*[º°]/g, "paseo ").replace(/\bn\s*\.?\s*[º°]/g, "numero ")).trim();
}

function splitType(text: string) {
  const [first] = text.split(" ", 1);
  const type = TYPES.get(first);
  return { type, name: type ? text.slice(first.length).trimStart() : text };
}

function phonetic(name: string): string {
  return name.replace(/c(?=[ei])/g, "s").replace(/z/g, "s").replace(/v/g, "b")
    .replace(/g(?=[ei])/g, "j").replace(/ll/g, "y").replace(/(?<!c)h/g, "")
    .replace(/([a-z])\1+/g, "$1").replace(/sky$/, "ski"); // Apellidos como Stravinsky.
}

function keys(name: string) {
  const literal = name.replace(/ /g, "");
  const all = name.split(" ").filter(Boolean);
  const tokens = all.filter((word) => !PARTICLES.has(word));
  const core = tokens.join("");
  const distinctive = tokens.filter(isDistinctive);
  // El sonido se calcula palabra a palabra: la doble letra no cruza fronteras
  // (Manuela Alvar no suena como Manuel Alvar).
  const sounds = tokens.map(phonetic);
  return { literal, core, sound: all.map(phonetic).join(""), coreSound: sounds.join(""), tokens, sounds, distinctive };
}

const INDEX = STREET_NAMES.map(([name, lat, lng, acc, extent = acc]) => {
  const normalized = words(name);
  const parsed = splitType(normalized);
  return { name, lat, lng, acc, extent, type: parsed.type, keys: keys(parsed.name),
    // Nombre habitual; el resultado conserva la denominación de OpenStreetMap.
    alias: name === "Calle Marqués de Larios" ? "larios" : undefined };
});

function matchCost(query: ReturnType<typeof keys>, street: ReturnType<typeof keys>): number {
  if (query.literal === street.literal) return 0;
  if (query.core === street.core) return 0.125;
  if (query.sound.length >= 5 && query.sound === street.sound) return 0.25;
  if (query.coreSound.length >= 5 && query.coreSound === street.coreSound) return 0.375;
  // Solo se aceptan las equivalencias de transcripción de arriba (acentos,
  // palabras unidas o partidas, partículas y confusiones de oído). No hay
  // erratas libres: «Antonia» no es «Antonio» ni «Garcés» es «García», y con
  // la duda la llamada queda sin ubicación reconocida (S5, S32).
  return Infinity;
}

/** Coincide con una vía, no con el portal: nunca consulta la red. */
export function matchStreet(text: string): { location: PublicLocation; address: string; extent: number } | null {
  const spoken = words(text);
  const normalized = spoken.replace(INTRO, "").split(END_OF_STREET, 1)[0].trim();
  const { type, name } = splitType(normalized);
  // No se buscan palabras sueltas dentro de la frase ni se pasa a la segunda calle.
  // «Conejito de Málaga» es el nombre de una vía: si al quitar la ciudad queda una partícula colgando, la ciudad era parte del nombre.
  const withoutCity = name.replace(LOCATION_SUFFIX, "").trim();
  const fragment = /(?:^| )(?:de|del|la|las|los|el)$/.test(withoutCity) ? name.trim() : withoutCity;
  const number = /(?:^| )(?:(?:numero|num|n|no) )?(\d{1,4})$/.exec(fragment);
  const streetName = fragment.slice(0, number?.index ?? fragment.length).trim().replace(/\b(?:numero|num)$/, "").trim();
  // Una introducción locativa o la ciudad no bastan: sin tipo de vía hacen
  // falta dos palabras distintivas, además de una coincidencia literal.
  const query = keys(streetName);
  if (query.core.length < 4 || (!type && query.distinctive.length < 2)) return null;

  let best: (typeof INDEX)[number] | undefined;
  let bestCost = Infinity;
  let secondCost = Infinity;
  for (const street of INDEX) {
    if (type && type !== street.type) continue;
    // Sin tipo explícito se exige coincidencia literal del nombre (no corregimos frases).
    const cost = query.literal === street.keys.literal ? 0
      : !type ? Infinity : query.literal === street.alias ? 0.125 : matchCost(query, street.keys);
    if (cost < bestCost) {
      secondCost = bestCost;
      bestCost = cost;
      best = street;
    } else if (cost < secondCost) {
      secondCost = cost;
    }
  }
  // Dos homónimas también son ambiguas. Una coincidencia literal única tiene prioridad.
  if (!best || (bestCost === 0 ? secondCost === 0 : secondCost - bestCost < 0.5)) return null;
  return {
    location: { place: number ? `${best.name}, ${number[1]}` : best.name, known: true,
      aml: { lat: best.lat, lng: best.lng, acc: best.acc } },
    address: `${best.name}${number ? ` ${number[1]}` : ""}, Málaga`,
    extent: best.extent,
  };
}
