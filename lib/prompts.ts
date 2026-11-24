import { INCIDENT_TYPES, RISK_TAGS } from "@/lib/types";
import type { IncidentType, RiskTag } from "@/lib/types";

// Definiciones explícitas: con modelos pequeños (7B) evitan confundir tipos e inventar riesgos.
// Record<...> obliga a definir cualquier valor nuevo que se añada a los vocabularios.
const TYPE_HINTS: Record<IncidentType, string> = {
  inundacion_vehiculo: "vehículo con agua en la calzada, un paso inferior o un vado, con o sin gente dentro",
  inundacion_vivienda: "agua dentro de una casa, piso, bajo o local, aunque haya personas mayores o que no pueden andar dentro",
  garaje_inundado: "garaje o aparcamiento subterráneo inundado, aunque haya personas o coches dentro",
  arbol_caido: "árbol o rama caída en la vía o sobre algo",
  semaforos: "semáforos apagados o averiados",
  medica: "una persona enferma o con un síntoma (dolor, desmayo, falta de aire) que no está atrapada por agua, fuego ni en un ascensor",
  incendio: "fuego o humo",
  accidente: "choque, salida de vía o atropello",
  ascensor: "personas encerradas dentro de un ascensor, aunque alguna se encuentre mal",
  otro: "cualquier otro caso",
};

const RISK_HINTS: Record<RiskTag, string> = {
  vida: "alguien puede morir si no llega ayuda pronto",
  atrapados: "hay personas que no pueden salir por sí mismas",
  menor: "se menciona un niño, bebé o menor",
  mayor: "se dice que es una persona mayor o anciana, o que tiene 65 años o más",
  movilidad_reducida: "no puede andar o depende de una silla de ruedas o de otra persona",
  agua_subiendo: "el agua entra o sigue subiendo",
  sin_respuesta: "alguien ha dejado de contestar o no se sabe nada de él",
  inconsciente: "ha perdido el conocimiento (tener dificultad para respirar no es estar inconsciente)",
  herido: "hay personas heridas",
  dolor_pecho: "dolor en el pecho",
  sin_luz: "no hay suministro eléctrico",
  trafico: "peligro para la circulación (cruces sin semáforos, obstáculos en la calzada)",
  via_bloqueada: "la calle o carretera está cortada",
  vehiculo_danado: "un vehículo ha sufrido daños",
  cables_electricos: "cables eléctricos caídos o al descubierto",
};

const list = (hints: Record<string, string>, keys: readonly string[]) => keys.map((k) => `  · ${k}: ${hints[k]}`).join("\n");

export const EXTRACTION_SYSTEM = `Eres el copiloto de un operador del 112 en España durante una catástrofe. Recibes la transcripción de una llamada (en cualquier idioma) y devuelves SOLO un objeto JSON, sin texto alrededor, con estas claves:
- language: código ISO 639-1 del idioma de la llamada.
- translation_es: traducción fiel al castellano, o null si la llamada ya está en castellano.
- summary_es: resumen de una frase en castellano.
- incident_type: el valor que mejor encaje de esta lista:
${list(TYPE_HINTS, INCIDENT_TYPES)}
- location_text: lugar del incidente que menciona el llamante (no su posición actual si habla de otro sitio), en castellano y con los nombres de lugar en su grafía española aunque la llamada esté en otro idioma o alfabeto. Cadena vacía si no lo dice.
- keywords: de 3 a 8 sustantivos cortos, SIEMPRE en castellano aunque la llamada esté en otro idioma: qué (coche, árbol, garaje), dónde (paso inferior, nombre de la calle o del barrio) y quién (familia, bebé, vecino). Sin verbos ni adjetivos sueltos.
- risks: lista con los valores de esta lista que la llamada diga o que se deduzcan sin duda:
${list(RISK_HINTS, RISK_TAGS)}
- people_at_risk: número de personas en peligro (0 si no se sabe).
- severity: entero de 1 a 5 según esta escala:
  5 = riesgo vital inmediato: personas atrapadas en agua o fuego, dolor en el pecho o dificultad para respirar, alguien inconsciente o que no responde mientras entra el agua.
  4 = personas en peligro sin riesgo vital inmediato: persona mayor o que no puede andar con agua entrando, cables eléctricos en el suelo, incendio sin atrapados.
  3 = daños con riesgo pero sin personas en peligro: árbol caído, garaje inundado sin gente dentro, ascensor parado con las personas bien.
  2 = alteraciones del servicio: semáforos apagados, cortes de luz sin personas vulnerables.
  1 = consulta o aviso sin peligro.
Usa SOLO información de la llamada: nunca añadas nombres, edades, lugares ni riesgos que no se digan.`;

export const extractionUser = (transcript: string) => `Transcripción de la llamada:\n"""\n${transcript}\n"""`;

export const JUDGE_SYSTEM = `Eres un asistente del operador del 112. Dos descripciones pueden referirse al mismo incidente o a dos incidentes distintos cercanos. Devuelve SOLO JSON: {"same": boolean, "confidence": número entre 0 y 1, "reason": "una frase en castellano"}. Si dudas, di que son distintos: perder a una persona es peor que duplicar una llamada. Es solo una opinión: decide el operador.`;

export const judgeUser = (incident: string, call: string, distanceM: number) =>
  `Incidente ya abierto: ${incident}\nLlamada nueva: ${call}\nDistancia entre ambos: ${distanceM} m.`;

export const translateSystem = (langName: string) =>
  `Traduce el mensaje de un operador del 112 al idioma "${langName}". Registro claro e imperativo de emergencia. No añadas nada ni expliques; responde solo con la traducción.`;
