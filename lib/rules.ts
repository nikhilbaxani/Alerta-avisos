import { locate, normalize } from "@/lib/gazetteer";
import { RISK_LABELS, TYPE_LABELS } from "@/lib/labels";
import { KNOWN_LOCATION_ACC, UNKNOWN_LOCATION_AML } from "@/lib/publicCall";
import type { PublicLocation } from "@/lib/publicCall";
import { severityFloor } from "@/lib/sanitize";
import type { Extraction, IncidentType, RiskTag } from "@/lib/types";

/**
 * Extractor de reglas determinista (S2): sustituye al LLM en el VPS. Trabaja sobre castellano o inglés,
 * sin red. El texto de la llamada es no confiable: solo se buscan patrones; ninguna orden del texto
 * («gravedad 1») puede bajar la gravedad, que solo sube con los riesgos detectados.
 * Los patrones se aplican sobre texto normalizado (sin tildes, minúsculas, signos → espacios).
 */

type Severity = Extraction["severity"];

const TYPE_RULES: { type: IncidentType; re: RegExp }[] = [
  { type: "ascensor", re: /\b(ascensor|elevador|elevator|lift)\b/ },
  { type: "incendio", re: /\b(incendi\w*|fuego|llamas|humo|quemand\w*|se quema|arde|ardiendo|fire|flames?|smoke|burning)\b/ },
  { type: "arbol_caido", re: /\b(arbol(es)?|tree|trees)\b/ },
  { type: "semaforos", re: /\b(semaforos?|traffic lights?|traffic signals?|stoplights?|ampeln?)\b/ },
  { type: "garaje_inundado", re: /\b(garajes?|garages?|parking subterraneo|underground parking|car park)\b/ },
  {
    type: "inundacion_vehiculo",
    re: /\b(coche|coches|vehiculo|furgoneta|camion|auto|car|cars|van|truck|vehicle|taxi|moto)\b.*\b(agua|inund\w*|water|flood\w*|paso inferior|tunel|tunnel|underpass|rio|riada|rambla)\b|\b(agua|inund\w*|water|flood\w*|paso inferior|tunel|tunnel|underpass|rio|riada|rambla)\b.*\b(coche|coches|vehiculo|furgoneta|camion|car|cars|van|truck|vehicle)\b/,
  },
  {
    type: "inundacion_vivienda",
    re: /\b(inund\w*|agua|water|flood\w*)\b.*\b(casa|casas|piso|vivienda|planta baja|bajo|sotano|house|home|flat|apartment|ground floor|basement)\b|\b(casa|casas|piso|vivienda|planta baja|bajo|sotano|house|home|flat|apartment|ground floor|basement)\b.*\b(inund\w*|agua|water|flood\w*)\b/,
  },
  { type: "accidente", re: /\b(accidente|choque|chocado|colision\w*|atropell\w*|crash\w*|collision|collided|accident)\b/ },
  {
    type: "medica",
    re: /\b(dolor (de|en el) (pecho|torax)|dolor toracico|chest pain|infarto|heart attack|ataque|convulsion\w*|ambulancia|sangr\w*|bleeding|respira|respirar|breath\w*|inconsciente|unconscious|desmay\w*|desvanec\w*|faint\w*|collaps\w*|azul|se ahoga|medic\w*|doctor|paramedic\w*)\b/,
  },
];

const RISK_RULES: { risk: RiskTag; re: RegExp }[] = [
  { risk: "vida", re: /\b(no respira|sin respirar|no la oigo respirar|no lo oigo respirar|se muere|morir|se esta muriendo|riesgo de muerte|peligro de muerte|dying|not breathing|isn t breathing|stopped breathing|no pulse|sin pulso|infarto|heart attack|life threatening)\b/ },
  { risk: "atrapados", re: /\b(atrapad\w*|encerrad\w*|no pueden? (abrir|salir)|no se abre|no abre|stuck|trapped|can t (get out|open)|cannot (get out|open))\b/ },
  { risk: "menor", re: /\b(bebes?|ninos?|ninas?|menores?|pequeno|pequenos|baby|babies|child|children|kids?|toddler|infant|newborn)\b/ },
  { risk: "mayor", re: /\b(mayor|mayores|ancian\w*|abuel\w*|elderly|old (lady|man|woman|person)|grandm\w*|grandf\w*|senior)\b/ },
  { risk: "movilidad_reducida", re: /\b(silla de ruedas|wheelchair|no puede (andar|caminar|moverse)|can t walk|cannot walk|bastones?|baston|cane|walker|encamad\w*|bedridden|paralit\w*)\b/ },
  {
    risk: "agua_subiendo",
    re: /\b(agua)\b[^.]{0,30}\b(sube|subiendo|entra|entrando|llega|llegando|cintura|rodillas?|puertas|ventanillas?|lleno|llena)\b|\b(sube|subiendo|entra|entrando)\b[^.]{0,20}\bagua\b|\b(lleno|llena) de agua\b|\binundando\b|\bwater\b[^.]{0,30}\b(ris\w*|coming|comes|up to|reach\w*|enter\w*|fill\w*|deep|knee\w*|waist|doors?|windows?)\b|\bflooding\b/,
  },
  { risk: "sin_respuesta", re: /\b(no (me )?(responde|contesta|coge|cogen|la oigo|lo oigo|reacciona)|ya no me contesta|not (responding|answering)|doesn t (answer|respond)|does not (answer|respond)|isn t (answering|responding)|unresponsive|no answer)\b/ },
  { risk: "inconsciente", re: /\b(inconsciente|desmay\w*|desvanec\w*|desplom\w*|unconscious|passed out|fainted|collapsed|knocked out)\b/ },
  { risk: "herido", re: /\b(herid[oa]s?|sangr\w*|sangre|lesion\w*|fractur\w*|injur\w*|bleeding|hurt|wounded)\b/ },
  { risk: "dolor_pecho", re: /\b(dolor (de|en el|en) (el )?(pecho|torax)|dolor toracico|opresion en el pecho|chest pain|pain in (my|his|her|the) chest|chest (tightness|pressure)|tightness in (my|his|her|the) chest)\b/ },
  { risk: "sin_luz", re: /\b(sin luz|apagon|se (ha )?ido la luz|se (ha )?cortado la luz|no hay luz|sin electricidad|corte de luz|sin suministro|sin energia|blackout|power (cut|outage|failure|is out|went out)|no (light|power|electricity))\b/ },
  { risk: "trafico", re: /\b(trafico|atasco\w*|caos|colapso|cruzando entre|casi chocan|atropell\w*|traffic|chaos|jam|crossing)\b/ },
  { risk: "via_bloqueada", re: /\b(corta (la|el) (carretera|calle|via|paso)\w*|carretera cortada|calle cortada|via cortada|cortad[ao]s?|bloquea\w*|bloquead[ao]s?|road (is )?(closed|blocked)|blocking|blocks|blocked)\b/ },
  { risk: "vehiculo_danado", re: /\b(aplast\w*|destroz\w*|danad\w*|crushed|damaged|smashed|wrecked)\b/ },
  { risk: "cables_electricos", re: /\b(cables?|cableado|tendido electrico|chispas|electrocut\w*|power ?lines?|live wires?|downed wires?|sparks?|wires)\b/ },
];

/** Gravedad de partida por tipo; solo los riesgos detectados (severityFloor) la suben. */
const BASE_SEVERITY: Record<IncidentType, Severity> = {
  inundacion_vehiculo: 3,
  inundacion_vivienda: 3,
  garaje_inundado: 3,
  arbol_caido: 3,
  semaforos: 2,
  medica: 3,
  incendio: 4,
  accidente: 3,
  ascensor: 3,
  delito: 3,
  otro: 1,
};

const KEYWORD_RULES: { kw: string; re: RegExp }[] = [
  { kw: "coche", re: /\b(coche|coches|car|cars|auto|vehiculo|vehicle)\b/ },
  { kw: "furgoneta", re: /\b(furgoneta|van|truck|camion)\b/ },
  { kw: "paso inferior", re: /\b(paso inferior|underpass)\b/ },
  { kw: "túnel", re: /\b(tunel|tunnel)\b/ },
  { kw: "agua", re: /\b(agua|water|inund\w*|flood\w*)\b/ },
  { kw: "árbol", re: /\b(arbol|arboles|tree|trees)\b/ },
  { kw: "semáforos", re: /\b(semaforos?|traffic lights?|ampeln?)\b/ },
  { kw: "tráfico", re: /\b(trafico|atasco\w*|traffic|chaos|caos)\b/ },
  { kw: "garaje", re: /\b(garajes?|garages?|car park)\b/ },
  { kw: "planta baja", re: /\b(planta baja|ground floor|bajo)\b/ },
  { kw: "ascensor", re: /\b(ascensor|elevator|lift)\b/ },
  { kw: "incendio", re: /\b(incendi\w*|fuego|fire|flames?|llamas)\b/ },
  { kw: "humo", re: /\b(humo|smoke)\b/ },
  { kw: "familia", re: /\b(familia|family)\b/ },
  { kw: "bebé", re: /\b(bebes?|baby|babies|infant)\b/ },
  { kw: "niño", re: /\b(ninos?|ninas?|child|children|kids?)\b/ },
  { kw: "señora mayor", re: /\b(senora mayor|old lady|old woman|abuela|grandmother)\b/ },
  { kw: "silla de ruedas", re: /\b(silla de ruedas|wheelchair)\b/ },
  { kw: "dolor de pecho", re: /\b(dolor (de|en el) (pecho|torax)|chest pain)\b/ },
  { kw: "apagón", re: /\b(apagon|blackout|sin luz|power (cut|outage))\b/ },
  { kw: "carretera", re: /\b(carretera|road|calzada)\b/ },
  { kw: "cables", re: /\b(cables?|wires?)\b/ },
  { kw: "residencia", re: /\b(residencia|residentes|care home|nursing home)\b/ },
];

/** Palabra de relleno por tipo para llegar al mínimo de 3 keywords. */
const TYPE_KEYWORD: Record<IncidentType, string> = {
  inundacion_vehiculo: "inundación",
  inundacion_vivienda: "inundación",
  garaje_inundado: "inundación",
  arbol_caido: "árbol",
  semaforos: "semáforos",
  medica: "emergencia médica",
  incendio: "incendio",
  accidente: "accidente",
  ascensor: "ascensor",
  delito: "robo o agresión",
  otro: "emergencia",
};

const WORD_NUMBERS: Record<string, number> = {
  un: 1, uno: 1, una: 1, one: 1, dos: 2, two: 2, tres: 3, three: 3, cuatro: 4, four: 4, cinco: 5, five: 5,
  seis: 6, six: 6, siete: 7, seven: 7, ocho: 8, eight: 8, nueve: 9, nine: 9, diez: 10, ten: 10, once: 11,
  eleven: 11, doce: 12, twelve: 12, quince: 15, fifteen: 15, veinte: 20, twenty: 20, treinta: 30, thirty: 30,
  cuarenta: 40, forty: 40, cincuenta: 50, fifty: 50, sesenta: 60, sixty: 60,
};
const NUM = `(\\d{1,3}|${Object.keys(WORD_NUMBERS).join("|")})`;
const PEOPLE_NOUN = "(?:personas?|gente|people|persons?|ocupantes|residentes|residents|adultos|adults|ninos?|ninas?|children|kids|pasajeros|passengers|vecinos|neighbou?rs|trabajadores|inquilinos|ancianos)";
const COUNT_RE = new RegExp(`\\b${NUM}\\s+(?:(?:otras|otros|other|more|mas)\\s+)?${PEOPLE_NOUN}\\b`, "g");
const WE_ARE_RE = new RegExp(`\\b(?:somos|estamos|we are|there are|hay|are)\\s+${NUM}\\b`, "g");
const ONE_PERSON_RE = /\b(mi (madre|padre|abuela|abuelo|hijo|hija|marido|mujer|vecino|vecina|esposa|esposo)|my (mother|mum|mom|father|dad|grandmother|grandma|grandfather|son|daughter|husband|wife|neighbou?r)|una (mujer|senora|persona|chica)|un (hombre|senor|chico|vecino)|a (woman|man|lady|person|girl|boy)|old (lady|man)|estoy (sola|solo)|i m (alone|on my own)|bebe|baby)\b/;
const FAMILY_RE = /\b(familia|family)\b/;

function numberOf(token: string): number {
  return /^\d+$/.test(token) ? Number(token) : (WORD_NUMBERS[token] ?? 0);
}

function countPeople(t: string, risks: RiskTag[]): number {
  let count = 0;
  for (const m of t.matchAll(COUNT_RE)) count = Math.max(count, numberOf(m[1]));
  // «hay una familia» no es 1 persona: aquí solo cuentan cifras de 2 en adelante.
  for (const m of t.matchAll(WE_ARE_RE)) if (numberOf(m[1]) >= 2) count = Math.max(count, numberOf(m[1]));
  if (count === 0 && FAMILY_RE.test(t)) count = 3;
  if (count === 0 && ONE_PERSON_RE.test(t)) count = 1;
  if (count === 0 && risks.some((r) => ["menor", "mayor", "movilidad_reducida", "inconsciente", "dolor_pecho"].includes(r))) count = 1;
  return Math.max(0, Math.min(50, count));
}

/** Quita negaciones habituales que, como palabras sueltas, parecerían un riesgo. */
function stripNegations(t: string): string {
  return t
    .replace(/\b(sin|no hay|ningun|ninguna|no hubo)\s+(herid\w+|lesionad\w+|danos)\b/g, " ")
    .replace(/\bno (one|body) (is |was )?(hurt|injured)\b/g, " ")
    .replace(/\bno (injuries|injured|one hurt)\b/g, " ");
}

/** Solo un tramo con tipo de vía explícito; el resto de la llamada no sale al geocodificador. */
export function extractAddressFragment(text: string): string {
  const match = /\b(?:calle|avenida|avda|plaza|paseo|camino|carretera|barrio|urbanizaci[oó]n|pol[ií]gono|street|avenue|square|road|neighbou?rhood)((?:[ \t]+[\p{L}\p{M}\p{N}]+){1,6})/iu.exec(text);
  return match?.[0].replace(/[ \t]+/g, " ").slice(0, 80).trimEnd() ?? "";
}

export function extractByRules(input: { transcript: string; language: string; translation_en: string | null }): {
  extraction: Extraction;
  location: PublicLocation;
} {
  const language = (input.language || "es").toLowerCase().slice(0, 2) || "es";
  const source = language === "es" ? input.transcript : (input.translation_en?.trim() ? input.translation_en : input.transcript);
  const t = stripNegations(normalize(source)).replace(/\s+/g, " ");

  const incident_type = TYPE_RULES.find((r) => r.re.test(t))?.type ?? "otro";

  const found = new Set<RiskTag>(RISK_RULES.filter((r) => r.re.test(t)).map((r) => r.risk));
  if (incident_type === "semaforos") found.add("trafico");
  if ((incident_type === "arbol_caido" || incident_type === "accidente") && /\b(coche|coches|car|cars|vehiculo|vehicle)\b/.test(t)) found.add("vehiculo_danado");
  const age = /\b(\d{2,3}) (anos|years old|year old)\b/.exec(t);
  if (age && Number(age[1]) >= 65) found.add("mayor");
  const risks = [...found];

  const severity = Math.max(BASE_SEVERITY[incident_type], severityFloor(risks, incident_type)) as Severity;
  const people_at_risk = countPeople(t, risks);

  // Ubicación: sobre el texto elegido y, si no, sobre la transcripción original (los topónimos no se traducen siempre).
  const hit = locate(source) ?? (source === input.transcript ? null : locate(input.transcript));
  const location: PublicLocation = hit
    ? { place: hit.place, known: true, aml: { ...hit.aml, acc: KNOWN_LOCATION_ACC } }
    : { place: null, known: false, aml: { ...UNKNOWN_LOCATION_AML } };

  const keywords: string[] = [];
  const push = (k: string) => {
    if (k && !keywords.includes(k)) keywords.push(k);
  };
  if (hit) push(hit.place);
  for (const k of KEYWORD_RULES) if (k.re.test(t)) push(k.kw);
  const capped = keywords.slice(0, 8);
  for (const filler of [TYPE_KEYWORD[incident_type], "aviso", "llamada"]) {
    if (capped.length >= 3) break;
    if (!capped.includes(filler)) capped.push(filler);
  }

  const place = hit ? ` en ${hit.location_text}` : "";
  const riskText = risks.length ? `. ${risks.slice(0, 3).map((r) => RISK_LABELS[r]).join(", ")}` : "";
  const people = people_at_risk > 0 ? `. ${people_at_risk} ${people_at_risk === 1 ? "persona" : "personas"} en riesgo` : "";
  const summary_es = `${TYPE_LABELS[incident_type]}${place}${riskText}${people}.`;

  return {
    extraction: {
      language,
      translation_es: null,
      summary_es,
      incident_type,
      location_text: hit?.location_text ?? "",
      keywords: capped,
      risks,
      people_at_risk,
      severity,
    },
    location,
  };
}
