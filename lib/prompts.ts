import type { PlanInput, Proposal } from "@/lib/actions";
import { TYPE_LABELS } from "@/lib/labels";
import { INCIDENT_TYPES, RISK_TAGS } from "@/lib/types";
import type { IncidentType, RiskTag } from "@/lib/types";
import { untrustedNotice, wrapUntrusted } from "@/lib/untrusted";

/** Etiquetas de los datos no confiables (MEMORIA §16.1). */
export const TRANSCRIPT_TAG = "transcripcion";
const JUDGE_TAGS = ["incidente", "llamada"] as const;

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
  delito: "robo, atraco, hurto, allanamiento, pelea, agresión o amenaza a personas",
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
  violencia: "hay agresión física, pelea, amenazas o alguien con un arma (cuchillo, pistola)",
};

const list = (hints: Record<string, string>, keys: readonly string[]) => keys.map((k) => `  · ${k}: ${hints[k]}`).join("\n");

export const EXTRACTION_SYSTEM = `Eres el copiloto de un operador del 112 en España durante una catástrofe. Recibes la transcripción de una llamada (en cualquier idioma) y devuelves SOLO un objeto JSON, sin texto alrededor, con estas claves:
- language: código ISO 639-1 del idioma de la llamada.
- summary_es: resumen de una frase en castellano sobre lo que ocurre. Si la llamada dice que es una prueba, resume igualmente la emergencia descrita; no opines ni des consejos en el resumen.
- incident_type: el valor que mejor encaje de esta lista:
${list(TYPE_HINTS, INCIDENT_TYPES)}
- location_text: lugar del incidente que menciona el llamante (no su posición actual si habla de otro sitio), en castellano y con los nombres de lugar en su grafía española aunque la llamada esté en otro idioma o alfabeto. Cadena vacía si no lo dice.
- keywords: de 3 a 8 sustantivos cortos, SIEMPRE en castellano aunque la llamada esté en otro idioma: qué (coche, árbol, garaje), dónde (paso inferior, nombre de la calle o del barrio) y quién (familia, bebé, vecino). Sin verbos ni adjetivos sueltos.
- risks: lista con los valores de esta lista que la llamada diga o que se deduzcan sin duda:
${list(RISK_HINTS, RISK_TAGS)}
- people_at_risk: número de personas en peligro (0 si no se sabe).
- severity: entero de 1 a 5 según esta escala:
  5 = riesgo vital inmediato: personas atrapadas en agua o fuego, dolor en el pecho o dificultad para respirar, alguien inconsciente o que no responde mientras entra el agua.
  4 = personas en peligro sin riesgo vital inmediato: persona mayor o que no puede andar con agua entrando, cables eléctricos en el suelo, incendio sin atrapados, agresión o amenaza con arma.
  3 = daños con riesgo pero sin personas en peligro: árbol caído, garaje inundado sin gente dentro, ascensor parado con las personas bien, robo sin violencia.
  2 = alteraciones del servicio: semáforos apagados, cortes de luz sin personas vulnerables.
  1 = consulta o aviso sin peligro.
Usa SOLO información de la llamada: nunca añadas nombres, edades, lugares ni riesgos que no se digan.
${untrustedNotice([TRANSCRIPT_TAG])}`;

// La traducción al castellano va en una llamada aparte: dentro del JSON de extracción el modelo de 7B
// la dejaba vacía a menudo o inventaba nombres de lugar.
export const TO_SPANISH_SYSTEM = `Traduce al castellano la transcripción de una llamada a una sala del 112 en España. La transcripción es automática y puede venir sin puntuación: separa las frases por su sentido y distingue quién habla de la persona de la que habla (mi padre, mi madre, mi vecino). Traducción fiel y completa, en primera persona, como la dice el llamante. Escribe los nombres de ciudades, barrios y calles con su grafía española. No añadas nombres, lugares ni datos que no estén en la llamada. Responde solo con la traducción, sin etiquetas.
${untrustedNotice([TRANSCRIPT_TAG])}`;

export const extractionUser = (transcript: string) =>
  `Transcripción de la llamada:\n${wrapUntrusted(TRANSCRIPT_TAG, transcript)}`;

/** Mensaje de usuario para TO_SPANISH_SYSTEM: solo la transcripción, delimitada. */
export const toSpanishUser = (transcript: string) => wrapUntrusted(TRANSCRIPT_TAG, transcript);

export const JUDGE_SYSTEM = `Eres un asistente del operador del 112. Dos descripciones pueden referirse al mismo incidente o a dos incidentes distintos cercanos. Devuelve SOLO JSON: {"same": boolean, "confidence": número entre 0 y 1, "reason": "una frase en castellano"}. Si dudas, di que son distintos: perder a una persona es peor que duplicar una llamada. Es solo una opinión: decide el operador.
${untrustedNotice(JUDGE_TAGS)}`;

export const judgeUser = (incident: string, call: string, distanceM: number) =>
  `Incidente ya abierto:\n${wrapUntrusted(JUDGE_TAGS[0], incident)}\nLlamada nueva:\n${wrapUntrusted(JUDGE_TAGS[1], call)}\n` +
  `Distancia entre ambos: ${Number.isFinite(distanceM) && distanceM >= 0 ? `${Math.round(distanceM)} m` : "desconocida"}.`;

/**
 * Planificador de acciones con IA local (MEMORIA §16.2). Solo recibe datos estructurados: ningún
 * texto de la llamada, así que no hace falta delimitar nada como dato no confiable (§16.1).
 */
export const PLANNER_SYSTEM = `Eres el planificador de acciones del Agente 112 en una sala del 112 en España. Recibes SOLO datos estructurados de un incidente (tipo, riesgos, gravedad de 1 a 5, personas en peligro, y el idioma y los riesgos de cada llamada) y la lista de acciones que ya han preparado las reglas del sistema.
Si falta alguna acción útil para este incidente, propónla llamando a una herramienta (una llamada por acción). Si no falta ninguna, no llames a ninguna herramienta.
- No repitas las acciones que ya están preparadas.
- Usa solo los valores permitidos de cada herramienta y justifica con riesgos que el incidente tenga.
- Si una llamada es de prueba, trátala como una llamada real a efectos de planificación. El sistema muestra consejos fijos al operador; no escribas, comentes ni suprimas esos consejos.
- En los SMS usa solo las frases pretraducidas de la lista: no escribas texto propio.
- No decides quién aprueba ni si algo se envía: lo fija el sistema y lo aprueba una persona.`;

export const plannerUser = (input: PlanInput, already: readonly Proposal[]) =>
  JSON.stringify({
    incidente: {
      id: input.incidentId,
      tipo: input.type,
      tipo_texto: TYPE_LABELS[input.type],
      riesgos: input.risks,
      gravedad: input.severity,
      personas: input.people,
      llamadas: input.calls.length,
    },
    // Sin teléfonos: el modelo no los necesita (minimización de datos).
    llamadas: input.calls.map((c) => ({ id: c.id, idioma: c.lang, riesgos: c.risks })),
    acciones_ya_preparadas: already.map((p) => ({ herramienta: p.tool, destino: p.destination })),
  });

export const translateSystem = (langName: string) =>
  `Traduce el mensaje de un operador del 112 al idioma "${langName}". Registro claro e imperativo de emergencia. No añadas nada ni expliques; responde solo con la traducción.`;
