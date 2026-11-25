import type { Aml } from "@/lib/types";
import { KNOWN_LOCATION_ACC } from "@/lib/publicCall";
import { PLACES } from "@/lib/map";

/**
 * Nomenclátor de Málaga para la ubicación dicha por voz (S5). Sin red ni teselas.
 * Centros aproximados de escenarios, rótulos de `lib/map.ts` y lugares de referencia de la ciudad.
 * Los barrios y distritos se señalan con un radio mayor que los puntos concretos.
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
  acc?: number;
  /** Formas comunes que solo valen solas o en contexto de dirección. */
  contextualAliases?: string[];
}

const mapPoints = Object.fromEntries(PLACES.map(({ name, at: [lng, lat] }) => [name, { lng, lat }]));

function landmark(place: string, lat: number, lng: number, aliases: string[], options: Pick<Entry, "acc" | "numbered"> = {}): Entry {
  return { place, text: place, lat, lng, aliases: [place, ...aliases], ...options };
}

const ENTRIES: Entry[] = [
  {
    place: "Campanillas", text: "Paso inferior A-357, Campanillas", lat: 36.716, lng: -4.548,
    aliases: ["paso inferior de la a 357", "paso inferior a 357", "paso inferior a357", "paso inferior de campanillas", "paso inferior campanillas", "tunel de campanillas", "campanillas tunnel", "campanillas underpass", "a 357 underpass", "a 357 tunnel", "a 357", "a357"],
  },
  { place: "Campanillas", text: "Camino del Prado, Campanillas", lat: 36.718, lng: -4.5435, aliases: ["camino del prado", "camino prado"] },
  { place: "Campanillas", text: "Campanillas", ...mapPoints.Campanillas, acc: 750, aliases: ["campanillas"] },
  { place: "El Perchel", text: "Calle Cuarteles", lat: 36.7155, lng: -4.429, numbered: true, aliases: ["calle cuarteles", "cuarteles street"], contextualAliases: ["cuarteles"] },
  landmark("El Perchel", 36.7176, -4.427, ["perchel"], { acc: 450 }),
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
  landmark("Teatinos", 36.7165, -4.4745, ["tiatinos", "teatino", "teatinos universidad"], { acc: 700 }),
  { place: "Aeropuerto de Málaga", text: "Aeropuerto de Málaga", ...mapPoints.Aeropuerto, aliases: ["aeropuerto de malaga", "malaga airport", "aeropuerto malaga", "aeroport de malaga", "aeropuerto costa del sol", "aeropuerto pablo ruiz picasso"], contextualAliases: ["aeropuerto"] },
  { place: "El Palo", text: "El Palo", ...mapPoints["El Palo"], acc: 550, aliases: ["el palo"] },
  { place: "Málaga centro", text: "Málaga centro", ...mapPoints["Málaga centro"], acc: 650, aliases: ["malaga centro", "distrito centro", "centro de malaga", "centro historico", "downtown malaga", "malaga city centre", "malaga city center", "casco antiguo"] },

  // Barrios: entre otros, centros de los rótulos OSM de assets/map/streets.json, desproyectados.
  landmark("Churriana", 36.669, -4.506, [], { acc: 750 }),
  landmark("Puerto de la Torre", 36.741, -4.481, ["distrito puerto de la torre"], { acc: 750 }),
  landmark("Ciudad Jardín", 36.749, -4.421, ["distrito ciudad jardin"], { acc: 750 }),
  landmark("Bailén-Miraflores", 36.731, -4.437, ["bailen miraflores"], { acc: 750 }),
  landmark("Palma-Palmilla", 36.744, -4.434, ["palma palmilla", "la palmilla"], { acc: 750 }),
  landmark("Carretera de Cádiz", 36.693, -4.445, ["distrito carretera de cadiz"], { acc: 800 }),
  landmark("Cruz de Humilladero", 36.713, -4.444, ["distrito cruz de humilladero"], { acc: 750 }),
  landmark("Málaga Este", 36.729, -4.374, ["distrito este"], { acc: 800 }),
  landmark("Pedregalejo", 36.724, -4.3734, [], { acc: 550 }),
  landmark("El Limonar", 36.7263, -4.3987, [], { acc: 550 }),
  landmark("La Trinidad", 36.7247, -4.4313, ["barrio de la trinidad"], { acc: 500 }),
  landmark("Soho", 36.7158, -4.4236, ["soho de malaga", "barrio de las artes"], { acc: 400 }),
  landmark("Guadalmar", 36.662, -4.448, [], { acc: 550 }),
  landmark("Huelin", 36.702, -4.437, [], { acc: 550 }),
  landmark("El Ejido", 36.730, -4.418, ["barrio de el ejido"], { acc: 450 }),
  landmark("Sacaba Beach", 36.675, -4.444, ["playa de sacaba", "playa sacaba"], { acc: 450 }),
  landmark("La Araña", 36.7126, -4.3269, ["barrio de la arana"], { acc: 450 }),

  // Vías principales; el portal se conserva como texto, no se interpola.
  landmark("Calle Mármoles", 36.7205, -4.4326, ["calle de marmoles"], { numbered: true }),
  landmark("Calle Carretería", 36.7228, -4.4234, ["calle de carreteria"], { numbered: true }),
  landmark("Calle Granada", 36.7217, -4.4196, ["calle de granada"], { numbered: true }),
  landmark("Calle Compañía", 36.7212, -4.4229, ["calle de la compania"], { numbered: true }),
  landmark("Calle Alcazabilla", 36.7215, -4.4170, [], { numbered: true }),
  landmark("Paseo del Parque", 36.7186, -4.4154, ["paseo parque"], { numbered: true }),
  landmark("Paseo de los Tilos", 36.7157, -4.4369, ["paseo los tilos"], { numbered: true }),
  landmark("Avenida de Velázquez", 36.6885, -4.4523, ["avenida velazquez"], { numbered: true }),
  landmark("Avenida de la Aurora", 36.718, -4.4349, ["avenida aurora"], { numbered: true }),
  landmark("Avenida de las Américas", 36.7139, -4.4339, ["avenida las americas"], { numbered: true }),
  landmark("Avenida de José Ortega y Gasset", 36.710, -4.452, ["avenida ortega y gasset"], { numbered: true }),

  landmark("Hospital Regional de Málaga", 36.726, -4.443, ["hospital regional universitario", "hospital regional", "hospital carlos haya", "carlos haya"]),
  landmark("Hospital Clínico Universitario", 36.7197, -4.4791, ["hospital clinico", "hospital virgen de la victoria", "clinico universitario"]),
  landmark("Hospital Materno Infantil", 36.7313, -4.4327, ["materno infantil"]),
  landmark("Hospital Civil", 36.7279, -4.4328, ["hospital civil de malaga"]),
  landmark("Hospital Quirónsalud Málaga", 36.6872, -4.4487, ["hospital quiron", "quiron malaga"]),

  landmark("Estación María Zambrano", 36.7115, -4.4328, ["maria zambrano", "estacion del ave", "malaga train station"]),
  landmark("Estación de Autobuses de Málaga", 36.7141, -4.4347, ["estacion de autobuses", "malaga bus station"]),
  landmark("Estación Málaga Centro-Alameda", 36.7144, -4.4274, ["estacion centro alameda", "cercanias centro alameda"]),
  landmark("Estación El Perchel", 36.7119, -4.4333, ["metro el perchel"]),
  landmark("Muelle Uno", 36.7157, -4.4131, ["muelle 1", "muelle uno del puerto de malaga"]),
  landmark("Terminal de Cruceros de Málaga", 36.7087, -4.4076, ["terminal de cruceros", "terminal de cruceros del puerto de malaga"]),
  landmark("Campus de Teatinos", 36.7168, -4.4781, ["campus teatinos", "universidad de malaga en teatinos"]),
  landmark("Campus de El Ejido", 36.7297, -4.4179, ["campus del ejido", "campus el ejido"]),

  landmark("Playa de Pedregalejo", 36.7197, -4.3739, ["playa pedregalejo"]),
  landmark("Playa de El Palo", 36.7177, -4.3589, ["playa del palo", "playa el palo"]),
  landmark("Playa de la Misericordia", 36.6912, -4.4384, ["playa misericordia"]),
  landmark("Playa de la Caleta", 36.7201, -4.3955, ["playa caleta"]),
  landmark("Baños del Carmen", 36.7216, -4.3816, ["playa de los banos del carmen"]),

  landmark("Centro Comercial Larios Centro", 36.7166, -4.4339, ["larios centro", "centro comercial larios"]),
  landmark("Centro Comercial Vialia", 36.7125, -4.4328, ["vialia", "vialia maria zambrano"]),
  landmark("Centro Comercial Plaza Mayor", 36.6556, -4.4792, ["plaza mayor malaga", "plaza mayor de malaga"]),
  landmark("Centro Comercial Málaga Nostrum", 36.6884, -4.464, ["malaga nostrum"]),
  landmark("Centro Comercial Rosaleda", 36.742, -4.431, ["centro comercial la rosaleda"]),

  landmark("Estadio La Rosaleda", 36.734, -4.4264, ["estadio de la rosaleda"]),
  landmark("Alcazaba de Málaga", 36.721, -4.4158, ["la alcazaba", "alcazaba"]),
  landmark("Castillo de Gibralfaro", 36.7236, -4.4105, ["gibralfaro", "castillo del gibralfaro"]),
  landmark("Catedral de Málaga", 36.7201, -4.4201, ["la manquita"]),
  landmark("Mercado de Atarazanas", 36.7175, -4.4246, ["mercado central de atarazanas", "atarazanas"]),
  landmark("Museo Picasso Málaga", 36.7217, -4.4185, ["museo picasso", "picasso museum"]),
  landmark("Teatro Cervantes", 36.7245, -4.4186, ["teatro cervantes de malaga"]),
  landmark("Palacio de Ferias y Congresos", 36.7055, -4.4595, ["palacio de ferias", "fycma"]),
];

/** Minúsculas, sin tildes ni signos, con espacios simples y rodeado de espacios. */
export function normalize(text: string): string {
  return ` ${text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim()} `;
}

const INDEX = ENTRIES.flatMap((entry) => [
  ...entry.aliases.map((a) => ({ entry, alias: normalize(a), contextual: false })),
  ...(entry.contextualAliases ?? []).map((a) => ({ entry, alias: normalize(a), contextual: true })),
]);

/** Alias comunes: inicio de una dirección (solos o con portal) o tras una preposición de lugar.
 * No interpretar un complemento genérico («aeropuerto de juguete») como dirección. */
function inLocationContext(norm: string, at: number, end: number): boolean {
  const rest = norm.slice(end);
  return (at === 0 && (rest === "" || /^\d{1,3}(?: |$)/.test(rest))) ||
    (/\b(?:en|desde|hacia|cerca de|junto a|frente a|del|al)(?: (?:el|la|los|las))?$/.test(norm.slice(0, at)) && !/^de /.test(rest));
}
/** Palabras que, tras el alias, indican que el número no es un portal. */
const NOT_A_NUMBER_OF_HOUSE = /^(personas?|people|persons|coches?|cars?|metros?|meters?|minutos?|minutes?|horas?|hours?|ninos?|children|kids|vecinos|heridos|veces)\b/;

export function locate(text: string): { place: string; location_text: string; aml: Aml } | null {
  const norm = normalize(text);
  let best: { entry: Entry; end: number; len: number } | null = null;
  // Coincidencias de palabras completas; la más larga gana. En empate, manda el orden del índice.
  for (const { entry, alias, contextual } of INDEX) {
    if (best && alias.length <= best.len) continue;
    let at = norm.indexOf(alias);
    while (at >= 0 && contextual && !inLocationContext(norm, at, at + alias.length)) {
      at = norm.indexOf(alias, at + 1);
    }
    if (at >= 0) best = { entry, end: at + alias.length, len: alias.length };
  }
  if (!best) return null;
  const { entry } = best;
  let location_text = entry.text;
  if (entry.numbered) {
    const rest = norm.slice(best.end - 1); // conserva el espacio inicial
    const m = /^ (?:numero |num |no |n |number )?(\d{1,3}) ?(.*)$/.exec(rest);
    if (m && !NOT_A_NUMBER_OF_HOUSE.test(m[2])) location_text = `${entry.text} ${m[1]}`;
  }
  return { place: entry.place, location_text, aml: { lat: entry.lat, lng: entry.lng, acc: entry.acc ?? KNOWN_LOCATION_ACC } };
}
