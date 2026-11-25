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
const PARTICLES = /\b(?:de|del|la|las|los|el)\b/g;
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
  const contentWords = name.replace(PARTICLES, "").trim();
  const core = contentWords.replace(/ +/g, "");
  return { literal, core, sound: phonetic(literal), coreSound: phonetic(core), compound: contentWords.includes(" ") };
}

const INDEX = STREET_NAMES.map(([name, lat, lng, acc, extent = acc]) => {
  const parsed = splitType(words(name));
  return { name, lat, lng, acc, extent, type: parsed.type, keys: keys(parsed.name),
    // Nombre habitual; el resultado conserva la denominación de OpenStreetMap.
    alias: name === "Calle Marqués de Larios" ? "larios" : undefined };
});

/** Distancia de edición con banda: solo importan los costes hasta el límite. */
function editDistance(a: string, b: string, limit: number): number {
  const outside = limit + 1;
  if (Math.abs(a.length - b.length) > limit) return outside;
  let prev = new Array<number>(b.length + 1).fill(outside);
  let next = prev.slice();
  for (let j = 0; j <= limit && j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    const start = Math.max(1, i - limit);
    const end = Math.min(b.length, i + limit);
    next[start - 1] = start === 1 ? i : outside;
    if (end < b.length) next[end + 1] = outside;
    for (let j = start; j <= end; j++) {
      next[j] = Math.min(prev[j] + 1, next[j - 1] + 1, prev[j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0));
    }
    [prev, next] = [next, prev];
  }
  return prev[b.length];
}

function matchCost(query: ReturnType<typeof keys>, street: ReturnType<typeof keys>): number {
  if (query.literal === street.literal) return 0;
  if (query.core === street.core) return 0.125;
  if (query.sound.length >= 5 && query.sound === street.sound) return 0.25;
  if (query.coreSound.length >= 5 && query.coreSound === street.coreSound) return 0.375;
  // Una errata libre puede convertir una palabra en otra (Escuelas/Espuelas).
  // Solo en nombres compuestos queda contexto suficiente: conservamos al menos
  // 9 caracteres sin editar para una errata y 12 para dos. No quitamos la -s.
  if (!street.compound) return Infinity;
  const length = Math.min(query.coreSound.length, street.coreSound.length);
  const limit = length >= 14 ? 2 : length >= 10 ? 1 : 0;
  if (!limit) return Infinity;
  const edits = editDistance(query.coreSound, street.coreSound, limit);
  return edits <= limit ? edits : Infinity;
}

/** Coincide con una vía, no con el portal: nunca consulta la red. */
export function matchStreet(text: string): { location: PublicLocation; address: string; extent: number } | null {
  const spoken = words(text);
  const normalized = spoken.replace(INTRO, "").split(END_OF_STREET, 1)[0].trim();
  const { type, name } = splitType(normalized);
  // No se buscan palabras sueltas dentro de la frase ni se pasa a la segunda calle.
  const fragment = name.replace(LOCATION_SUFFIX, "").trim();
  const number = /(?:^| )(?:(?:numero|num|n|no) )?(\d{1,4})$/.exec(fragment);
  const streetName = fragment.slice(0, number?.index ?? fragment.length).trim().replace(/\b(?:numero|num)$/, "").trim();
  // Una palabra aislada no basta. Conserva «Demóstenes, Málaga»: la localidad
  // explícita, igual que una introducción locativa, indica que es una dirección.
  if (!type && !streetName.includes(" ") && !INTRO.test(spoken) && !LOCATION_SUFFIX.test(name)) return null;
  const query = keys(streetName);
  if (query.core.length < 4) return null;

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
