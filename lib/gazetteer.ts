import type { Aml } from "@/lib/types";
import { KNOWN_LOCATION_ACC } from "@/lib/publicCall";

/**
 * Nomenclátor de Málaga para la ubicación dicha por voz (S5). Sin red ni teselas.
 * Las coordenadas salen de los escenarios simulados (puntos base de cada incidente) y de los rótulos de
 * `lib/map.ts`; son centros aproximados, por eso `acc` es de 150 m y no de metros.
 */
interface Entry {
  /** Nombre canónico del lugar (castellano). */
  place: string;
  /** Texto de ubicación que verá el operador y comparará el agrupador. */
  text: string;
  lat: number;
  lng: number;
  /** Alias ya sin tildes ni mayúsculas (se normalizan igualmente). */
  aliases: string[];
  /** Admite número de portal tras el alias («calle Victoria 12»). */
  numbered?: boolean;
}

const ENTRIES: Entry[] = [
  {
    place: "Campanillas", text: "Paso inferior A-357, Campanillas", lat: 36.716, lng: -4.548,
    aliases: ["paso inferior de la a 357", "paso inferior a 357", "paso inferior a357", "paso inferior de campanillas", "paso inferior campanillas", "tunel de campanillas", "campanillas tunnel", "campanillas underpass", "a 357 underpass", "a 357 tunnel", "a 357", "a357"],
  },
  { place: "Campanillas", text: "Camino del Prado, Campanillas", lat: 36.718, lng: -4.5435, aliases: ["camino del prado", "camino prado"] },
  { place: "Campanillas", text: "Campanillas", lat: 36.733, lng: -4.548, aliases: ["campanillas"] },
  { place: "El Perchel", text: "Calle Cuarteles", lat: 36.7155, lng: -4.429, numbered: true, aliases: ["calle cuarteles", "cuarteles street", "el perchel", "perchel"] },
  { place: "La Malagueta", text: "Paseo Marítimo, La Malagueta", lat: 36.7195, lng: -4.4, aliases: ["paseo maritimo pablo ruiz picasso", "paseo maritimo", "pablo ruiz picasso", "hospital noble", "playa de la malagueta", "la malagueta", "malagueta", "malagueta beach"] },
  { place: "Avenida de Andalucía", text: "Avenida de Andalucía", lat: 36.718, lng: -4.435, aliases: ["avenida de andalucia", "avenida andalucia", "avenue of andalusia", "andalucia avenue", "andalucia avenida", "el corte ingles", "corte ingles"] },
  { place: "Avenida de Andalucía", text: "Calle Hilera", lat: 36.718, lng: -4.435, numbered: true, aliases: ["calle hilera", "hilera street"] },
  { place: "Torremolinos", text: "Torremolinos", lat: 36.623, lng: -4.499, aliases: ["torremolinos", "torre molinos"] },
  { place: "Rincón de la Victoria", text: "Rincón de la Victoria", lat: 36.716, lng: -4.278, aliases: ["rincon de la victoria"] },
  { place: "Rincón de la Victoria", text: "Avenida del Mediterráneo, Rincón de la Victoria", lat: 36.716, lng: -4.278, aliases: ["avenida del mediterraneo", "mediterraneo avenue"] },
  { place: "Calle Larios", text: "Calle Larios", lat: 36.7197, lng: -4.4215, numbered: true, aliases: ["calle larios", "larios street", "larios"] },
  { place: "Alameda Principal", text: "Alameda Principal", lat: 36.7166, lng: -4.4235, aliases: ["alameda principal", "plaza de la marina", "marina square", "puerto de malaga", "malaga port", "port of malaga"] },
  { place: "Plaza de la Merced", text: "Plaza de la Merced", lat: 36.7222, lng: -4.416, aliases: ["plaza de la merced", "la merced", "merced square"] },
  { place: "Calle Victoria", text: "Calle Victoria", lat: 36.7235, lng: -4.415, numbered: true, aliases: ["calle victoria", "victoria street", "calle de la victoria"] },
  { place: "Cruz de Humilladero", text: "Calle Cruz de Humilladero", lat: 36.7143, lng: -4.44, numbered: true, aliases: ["cruz de humilladero", "cruz del humilladero"] },
  { place: "Teatinos", text: "Teatinos", lat: 36.7165, lng: -4.4745, aliases: ["teatinos", "tiatinos", "teatino"] },
  { place: "Aeropuerto de Málaga", text: "Aeropuerto de Málaga", lat: 36.676, lng: -4.492, aliases: ["aeropuerto de malaga", "malaga airport", "aeropuerto malaga", "aeroport de malaga"] },
  { place: "El Palo", text: "El Palo", lat: 36.727, lng: -4.362, aliases: ["el palo"] },
  { place: "Málaga centro", text: "Málaga centro", lat: 36.727, lng: -4.421, aliases: ["malaga centro", "centro de malaga", "centro historico", "downtown malaga", "malaga city centre", "malaga city center", "casco antiguo"] },
];

/** Minúsculas, sin tildes ni signos, con espacios simples y rodeado de espacios. */
export function normalize(text: string): string {
  return ` ${text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim()} `;
}

const INDEX = ENTRIES.flatMap((entry) => entry.aliases.map((a) => ({ entry, alias: normalize(a) })));
/** Palabras que, tras el alias, indican que el número no es un portal. */
const NOT_A_NUMBER_OF_HOUSE = /^(personas?|people|persons|coches?|cars?|metros?|meters?|minutos?|minutes?|horas?|hours?|ninos?|children|kids|vecinos|heridos|veces)\b/;

export function locate(text: string): { place: string; location_text: string; aml: Aml } | null {
  const norm = normalize(text);
  let best: { entry: Entry; end: number; len: number } | null = null;
  for (const { entry, alias } of INDEX) {
    const at = norm.indexOf(alias);
    if (at < 0) continue;
    if (!best || alias.length > best.len) best = { entry, end: at + alias.length, len: alias.length };
  }
  if (!best) return null;
  const { entry } = best;
  let location_text = entry.text;
  if (entry.numbered) {
    const rest = norm.slice(best.end - 1); // conserva el espacio inicial
    const m = /^ (?:numero |num |no |n |number )?(\d{1,3}) ?(.*)$/.exec(rest);
    if (m && !NOT_A_NUMBER_OF_HOUSE.test(m[2])) location_text = `${entry.text} ${m[1]}`;
  }
  return { place: entry.place, location_text, aml: { lat: entry.lat, lng: entry.lng, acc: KNOWN_LOCATION_ACC } };
}
