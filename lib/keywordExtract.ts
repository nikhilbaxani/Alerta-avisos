/**
 * Clasificación por palabras clave de una llamada escrita a mano, para el modo simulado (sin IA ni red).
 * Es deliberadamente sencilla y transparente: el tipo y los riesgos salen de listas de raíces en castellano,
 * y la gravedad pasa por el mismo suelo por riesgos que la extracción de la IA (`sanitizeExtraction`).
 * Con IA local la consola usa el modelo en su lugar (`/api/process`).
 */
import { sanitizeExtraction } from "@/lib/sanitize";
import type { Extraction, IncidentType, RiskTag } from "@/lib/types";

/** Minúsculas y sin tildes, para comparar raíces. */
export const fold = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** ¿Alguna raíz empieza una palabra del texto? («arma» no encaja en «alarma», ni «arde» en «tarde»). */
const any = (text: string, roots: readonly string[]) => roots.some((r) => new RegExp(`(?:^|[^a-z0-9])${r.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}`).test(text));

const WATER = ["agua", "inund", "riada", "crecida", "anega"];

/** En orden: gana el primero que encaje (lo más concreto antes que lo general). */
const TYPE_RULES: readonly { type: IncidentType; when: (t: string) => boolean }[] = [
  { type: "incendio", when: (t) => any(t, ["fuego", "incendi", "humo", "llamas", "arde", "ardiendo", "quemando"]) },
  { type: "delito", when: (t) => any(t, ["robo", "roba", "ladron", "atraco", "atrac", "hurto", "asalt", "allan", "pelea", "agred", "agresion", "pegando", "apunal", "navaja", "cuchillo", "pistola", "arma", "disparo", "amenaz"]) },
  { type: "ascensor", when: (t) => any(t, ["ascensor"]) },
  { type: "garaje_inundado", when: (t) => any(t, ["garaje", "aparcamiento subterraneo", "parking"]) && any(t, WATER) },
  { type: "inundacion_vehiculo", when: (t) => any(t, ["coche", "vehiculo", "furgoneta", "camion", "moto"]) && any(t, WATER) },
  { type: "inundacion_vivienda", when: (t) => any(t, ["casa", "piso", "vivienda", "bajo", "local", "sotano"]) && any(t, WATER) },
  { type: "accidente", when: (t) => any(t, ["accidente", "choque", "chocad", "colision", "atropell", "volcad", "salido de la via", "salida de via"]) },
  { type: "arbol_caido", when: (t) => any(t, ["arbol", "rama"]) },
  { type: "semaforos", when: (t) => any(t, ["semaforo"]) },
  { type: "medica", when: (t) => any(t, ["dolor", "desmay", "infarto", "respira", "inconsciente", "convulsi", "mareo", "ictus", "sangr", "herid", "no reacciona"]) },
];

const RISK_RULES: readonly { risk: RiskTag; roots: readonly string[] }[] = [
  { risk: "atrapados", roots: ["atrapad", "encerrad", "no puede salir", "no pueden salir", "no podemos salir"] },
  { risk: "menor", roots: ["nino", "nina", "bebe", "menor", "crio", "hijo pequeno", "hija pequena"] },
  { risk: "mayor", roots: ["mayor", "ancian", "abuel"] },
  { risk: "movilidad_reducida", roots: ["silla de ruedas", "no puede andar", "no puede caminar", "encamad"] },
  { risk: "agua_subiendo", roots: ["sube el agua", "subiendo", "entra agua", "entrando agua", "entra el agua"] },
  { risk: "sin_respuesta", roots: ["no responde", "no contesta", "no sabemos nada"] },
  { risk: "inconsciente", roots: ["inconsciente", "no reacciona", "desmayad", "sin conocimiento"] },
  { risk: "herido", roots: ["herid", "sangr", "lesion", "apunalad", "golpe en la cabeza"] },
  { risk: "dolor_pecho", roots: ["dolor en el pecho", "dolor de pecho", "dolor toracico", "le duele el pecho"] },
  { risk: "sin_luz", roots: ["sin luz", "apagon", "no hay luz", "ido la luz", "corte de luz"] },
  { risk: "trafico", roots: ["trafico", "atasco", "cruce", "en mitad de la calzada", "en la calzada"] },
  { risk: "via_bloqueada", roots: ["cortada", "bloquea", "no se puede pasar"] },
  { risk: "vehiculo_danado", roots: ["chocad", "destrozad", "volcad", "abollad"] },
  { risk: "cables_electricos", roots: ["cable"] },
  { risk: "violencia", roots: ["pelea", "agred", "agresion", "pegando", "pegan", "apunal", "navaja", "cuchillo", "pistola", "arma", "disparo", "amenaz"] },
  { risk: "vida", roots: ["no respira", "se muere", "muriendo", "riesgo vital", "muy grave"] },
];

/** Gravedad de partida por tipo; luego `sanitizeExtraction` la sube si los riesgos lo exigen. */
const BASE_SEVERITY: Record<IncidentType, 1 | 2 | 3 | 4 | 5> = {
  inundacion_vehiculo: 3,
  inundacion_vivienda: 3,
  garaje_inundado: 3,
  arbol_caido: 3,
  semaforos: 2,
  medica: 4,
  incendio: 4,
  accidente: 3,
  ascensor: 3,
  delito: 3,
  otro: 2,
};

const NUMBERS: Record<string, number> = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };
const PEOPLE = "(?:personas?|heridos?|vecinos?|ninos?|nin[ao]s|adultos?|chicos?|hombres?|mujer(?:es)?|ocupantes)";

function peopleIn(t: string, risks: RiskTag[]): number {
  const m = t.match(new RegExp(`\\b(\\d{1,2}|${Object.keys(NUMBERS).join("|")})\\s+${PEOPLE}`));
  if (m) return Number(m[1]) || NUMBERS[m[1]] || 0;
  const personal: RiskTag[] = ["atrapados", "herido", "inconsciente", "sin_respuesta", "dolor_pecho", "vida", "menor", "mayor", "movilidad_reducida", "violencia"];
  return risks.some((r) => personal.includes(r)) ? 1 : 0;
}

/** Lugar que dice el llamante («en la calle Larios, 5»); si no lo dice, el que elige el operador. */
function placeIn(text: string, fallback: string): string {
  const m = text.match(/\b(?:en|junto a|cerca de|frente a)\s+(?:la |el |los |las )?((?:calle|c\/|avenida|avda\.?|av\.|plaza|paseo|carretera|camino|barrio|urbanizaci[oó]n)\s[^,.;\n]{2,60})/i);
  return m ? m[1].trim() : fallback;
}

const STOP = new Set(["que", "hay", "una", "uno", "los", "las", "del", "con", "por", "para", "esta", "estan", "muy", "pero", "mas", "como", "donde", "tiene", "ayuda", "favor", "rapido", "calle"]);

/** Extracción de una llamada escrita, con la misma forma que la de la IA. */
export function extractByKeywords(text: string, fallbackPlace: string): Extraction {
  const t = fold(text);
  const type = TYPE_RULES.find((r) => r.when(t))?.type ?? "otro";
  const risks = RISK_RULES.filter((r) => any(t, r.roots)).map((r) => r.risk);
  const location = placeIn(text, fallbackPlace);
  const keywords = [...new Set(fold(`${location} ${text}`).match(/[a-zñ]{4,}/g) ?? [])].filter((w) => !STOP.has(w)).slice(0, 8);
  const summary = text.trim().replace(/\s+/g, " ");
  return sanitizeExtraction({
    language: "es",
    summary_es: summary.length > 160 ? `${summary.slice(0, 157)}…` : summary,
    incident_type: type,
    location_text: location,
    keywords,
    risks,
    people_at_risk: peopleIn(t, risks),
    severity: BASE_SEVERITY[type],
  });
}
