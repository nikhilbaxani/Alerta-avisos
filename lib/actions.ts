/**
 * Agente de acciones (MEMORIA §16.2): herramientas, política de aprobación, planificador
 * determinista, estados, conectores simulados y traza.
 *
 * Puro: sin red, sin reloj y sin estado de servidor. Los tiempos son segundos del escenario y los
 * conectores son simulados (registran el envío y devuelven un acuse determinista).
 *
 * Seguridad (MEMORIA §16.1): el planificador solo recibe `PlanInput`, que son datos estructurados
 * (tipo, riesgos, gravedad, personas, posición y, por llamada, id, idioma, teléfono enmascarado y
 * riesgos). Nunca la transcripción, el resumen, las palabras clave ni los lugares: por construcción,
 * ninguna herramienta se dispara por lo que diga el texto de una llamada.
 *
 * Añadir una herramienta es sumar entradas: su nombre en `ACTION_TOOLS`, sus argumentos en
 * `ToolArgs`, su política en `ACTION_POLICY` y su especificación en `TOOLS` (el compilador obliga a
 * las tres últimas).
 *
 * Acciones de zona (X07): el ES-Alert no es de un incidente sino de una zona con varios. Lo propone
 * `planZoneAlerts` sobre todos los incidentes; su `incidentId` es el id de la zona (`ZONA-…`) y sus
 * incidentes van en `args.incidentes` (`actionIncidents`).
 */
import { haversine } from "@/lib/cluster";
import type { Incident } from "@/lib/engine";
import { LANG_NAMES, RISK_LABELS, TYPE_LABELS } from "@/lib/labels";
import { PLACES } from "@/lib/map";
import { PHRASES } from "@/lib/phrases";
import { RISK_TAGS } from "@/lib/types";
import type { Aml, IncidentType, RiskTag } from "@/lib/types";

// ───────────────────────────── Herramientas y política ─────────────────────────────

export const ACTION_TOOLS = [
  "proponer_recursos",
  "sms_al_llamante",
  "avisar_distribuidora",
  "aviso_ayuntamiento",
  "devolver_llamada",
  "proponer_es_alert",
] as const;
export type ActionTool = (typeof ACTION_TOOLS)[number];

export type ApprovalPolicy = "automatica" | "operador" | "coordinador";

/**
 * Quién aprueba cada herramienta. Es código con tests: nunca lo decide el LLM. Automáticas solo los
 * avisos informativos a organismos que no ponen en riesgo a nadie (MEMORIA §16.2).
 */
export const ACTION_POLICY: Readonly<Record<ActionTool, ApprovalPolicy>> = {
  proponer_recursos: "operador",
  sms_al_llamante: "operador",
  avisar_distribuidora: "automatica",
  aviso_ayuntamiento: "automatica",
  devolver_llamada: "operador",
  // Avisa a toda la población de una zona: siempre una persona con rol de coordinador.
  proponer_es_alert: "coordinador",
};

/** Nombre de cada herramienta para el operador y el parte de situación. */
export const TOOL_LABELS: Readonly<Record<ActionTool, string>> = {
  proponer_recursos: "Recursos (CAD)",
  sms_al_llamante: "SMS al llamante",
  avisar_distribuidora: "Aviso a la distribuidora",
  aviso_ayuntamiento: "Aviso al ayuntamiento",
  devolver_llamada: "Devolver la llamada",
  proponer_es_alert: "ES-Alert",
};

/** Herramientas de zona: no son de un incidente, las propone `planZoneAlerts` sobre varios. */
export const ZONE_TOOLS: readonly ActionTool[] = ["proponer_es_alert"];

export type Role = "operador" | "coordinador";
const ROLE_RANK: Record<Role, number> = { operador: 1, coordinador: 2 };
const REQUIRED_RANK: Record<Exclude<ApprovalPolicy, "automatica">, number> = { operador: 1, coordinador: 2 };

/** Un coordinador puede aprobar lo de un operador, pero no al revés; una automática no la aprueba nadie. */
export function canApprove(policy: ApprovalPolicy, role: Role): boolean {
  return policy !== "automatica" && ROLE_RANK[role] >= REQUIRED_RANK[policy];
}

export const RESOURCE_SERVICES = ["bomberos", "samu_061", "policia_local", "policia_nacional"] as const;
export type ResourceService = (typeof RESOURCE_SERVICES)[number];
export const RESOURCE_LABELS: Record<ResourceService, string> = {
  bomberos: "Bomberos",
  samu_061: "SAMU 061",
  policia_local: "Policía local",
  policia_nacional: "Policía Nacional",
};

/** Frases de `lib/phrases.ts` que son instrucciones (las preguntas no tienen sentido en un SMS). */
export const SMS_PHRASE_IDS = ["garaje", "cables", "calma"] as const;
export type SmsPhraseId = (typeof SMS_PHRASE_IDS)[number];

export const UTILITY_CHANNELS = ["averias", "reposicion_prioritaria"] as const;
export type UtilityChannel = (typeof UTILITY_CHANNELS)[number];
export const UTILITY_LABELS: Record<UtilityChannel, string> = {
  averias: "averías",
  reposicion_prioritaria: "reposición prioritaria",
};

/** Motivos del aviso al ayuntamiento (movilidad y policía local). Uno por incidente y motivo. */
export const CITY_REASONS = ["semaforos", "arbol_caido", "via_bloqueada"] as const;
export type CityReason = (typeof CITY_REASONS)[number];
export const CITY_LABELS: Record<CityReason, string> = {
  semaforos: "semáforos apagados",
  arbol_caido: "árbol caído",
  via_bloqueada: "vía cortada",
};

/** Zona de un ES-Alert: centro y radio calculados de las posiciones, nombre de un lugar de confianza (`PLACES`). */
export interface EsAlertZone {
  /** `ZONA-` y el lugar de referencia: un ES-Alert por zona. */
  id: string;
  /** Lugar de referencia más cercano al centro, de los rótulos del mapa (nunca el texto de una llamada). */
  nombre: string;
  /** Distancia del centro de la zona a ese lugar, redondeada a 100 m. */
  referencia_m: number;
  centro: { lat: number; lng: number };
  /** Cubre cada punto con su precisión AML más un margen; múltiplo de 100 m. */
  radio_m: number;
}

/** Argumentos de cada herramienta: solo valores de vocabularios cerrados, números y frases pretraducidas. */
export interface ToolArgs {
  proponer_recursos: { servicio: ResourceService; personas: number; gravedad: number };
  sms_al_llamante: {
    llamada: string;
    telefono: string | null;
    idioma: string;
    frases: SmsPhraseId[];
    /** Frases pretraducidas en el idioma del llamante, tal cual están en `lib/phrases.ts`. */
    texto: string;
    /** Las mismas frases en castellano, para el operador. */
    texto_es: string;
  };
  avisar_distribuidora: { canal: UtilityChannel; posicion: { lat: number; lng: number } | null; personas: number };
  aviso_ayuntamiento: { motivo: CityReason; posicion: { lat: number; lng: number } | null; via_cortada: boolean };
  devolver_llamada: {
    /** Llamada a cuyo teléfono se devuelve (la primera de ese número). */
    llamada: string;
    telefono: string | null;
    idioma: string;
    /** Llamada que trajo la información nueva. */
    noticia: string;
    motivo: "sin_respuesta";
  };
  proponer_es_alert: {
    zona: EsAlertZone;
    incidentes: string[];
    /** Texto fijo de plantilla (`ES_ALERT_TEXT`): nada generado ni de la llamada. */
    texto_es: string;
    texto_en: string;
  };
}

// ───────────────────────────── Entrada del planificador ─────────────────────────────

export interface PlanCall {
  id: string;
  /** Idioma detectado (ISO 639-1). */
  lang: string;
  /** Teléfono enmascarado (como en el escenario) o null si no se conoce. */
  phone: string | null;
  risks: RiskTag[];
}

/** Lo único que ve el planificador: datos estructurados, sin texto de la llamada. */
export interface PlanInput {
  incidentId: string;
  type: IncidentType;
  risks: RiskTag[];
  severity: number;
  people: number;
  points: Aml[];
  /** En el orden en que llegaron. El nº de llamadas es `calls.length`. */
  calls: PlanCall[];
  provisional: boolean;
}

export interface CallFacts {
  lang: string;
  phone?: string | null;
  risks: RiskTag[];
}

/** Construye la entrada del planificador desde un incidente del motor. No copia ningún texto libre. */
export function planInputFrom(inc: Incident, facts: Record<string, CallFacts>): PlanInput {
  return {
    incidentId: inc.id,
    type: inc.type,
    risks: [...inc.risks],
    severity: inc.severity,
    people: inc.people,
    points: inc.points.map((p) => ({ lat: p.lat, lng: p.lng, acc: p.acc })),
    calls: inc.callIds.map((id) => {
      const f = facts[id];
      // Sin datos de la llamada se asume castellano: no recibe SMS (lo atiende el operador de viva voz).
      return { id, lang: f?.lang ?? "es", phone: f?.phone || null, risks: f ? [...f.risks] : [] };
    }),
    provisional: inc.provisional,
  };
}

// ───────────────────────────── Acciones ─────────────────────────────

export type ActionStatus = "propuesta" | "aprobada" | "enviada" | "descartada";
export type ActionOrigin = "reglas" | "ia_local";

export interface Evidence {
  type: IncidentType;
  /** Riesgos que la justifican. */
  risks: RiskTag[];
  /** Llamadas que la justifican. */
  callIds: string[];
}

export interface ProposalOf<K extends ActionTool> {
  /** Clave única: incidente + herramienta + destino. */
  key: string;
  incidentId: string;
  tool: K;
  destination: string;
  args: ToolArgs[K];
  /** Por qué, en castellano y concreto. */
  reason: string;
  evidence: Evidence;
  policy: ApprovalPolicy;
  origin: ActionOrigin;
}
export type Proposal = { [K in ActionTool]: ProposalOf<K> }[ActionTool];

export interface Receipt {
  service: string;
  /** Referencia determinista del conector simulado. */
  reference: string;
  at: number;
  detail: string;
  simulated: true;
}

export interface ActionLifecycle {
  status: ActionStatus;
  proposedAt: number;
  approval: { by: Role | "automatica"; at: number } | null;
  receipt: Receipt | null;
  discarded: { by: Role | "sistema"; at: number; reason: string } | null;
}
export type AgentAction = Proposal & ActionLifecycle;

export const actionKey = (incidentId: string, tool: ActionTool, destination: string) => `${incidentId}|${tool}|${destination}`;

// ───────────────────────────── Utilidades ─────────────────────────────

const FLOOD_TYPES: readonly IncidentType[] = ["inundacion_vehiculo", "inundacion_vivienda", "garaje_inundado"];
const uniq = <T,>(a: T[]) => [...new Set(a)];
const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const riskLabel = (r: RiskTag) => lc(RISK_LABELS[r]);
const langName = (lang: string) => (LANG_NAMES[lang] ? lc(LANG_NAMES[lang]) : lang);
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** «a», «a y b», «a, b y c». */
export function joinEs(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

/** FNV-1a de 32 bits en hexadecimal: referencias de acuse deterministas. */
function hash6(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).toUpperCase().padStart(8, "0").slice(0, 6);
}

function centroid(points: Aml[]): { lat: number; lng: number } | null {
  if (!points.length) return null;
  const r = (n: number) => Math.round(n * 1e5) / 1e5;
  return {
    lat: r(points.reduce((s, p) => s + p.lat, 0) / points.length),
    lng: r(points.reduce((s, p) => s + p.lng, 0) / points.length),
  };
}

interface Trigger {
  label: string;
  risks: RiskTag[];
}

/** Riesgos y llamadas que justifican una acción. Si solo la justifica el tipo, todas las llamadas. */
function evidenceOf(input: PlanInput, triggers: Trigger[]): Evidence {
  const risks = uniq(triggers.flatMap((t) => t.risks)).filter((r) => input.risks.includes(r));
  const withRisk = input.calls.filter((c) => c.risks.some((r) => risks.includes(r))).map((c) => c.id);
  return { type: input.type, risks, callIds: withRisk.length ? withRisk : input.calls.map((c) => c.id) };
}

function make<K extends ActionTool>(
  input: PlanInput,
  tool: K,
  destination: string,
  args: ToolArgs[K],
  reason: string,
  evidence: Evidence,
  origin: ActionOrigin,
): ProposalOf<K> {
  return { key: actionKey(input.incidentId, tool, destination), incidentId: input.incidentId, tool, destination, args, reason, evidence, policy: policyFor(tool, origin), origin };
}

/** La política sale de la tabla. Lo que propone el modelo nunca se envía solo: si la tabla dice «automática», pasa a operador. */
function policyFor(tool: ActionTool, origin: ActionOrigin): ApprovalPolicy {
  const table = ACTION_POLICY[tool];
  return origin === "ia_local" && table === "automatica" ? "operador" : table;
}

/** Texto de un valor que propuso el modelo, corto y sin saltos, para los motivos de descarte. */
function shown(v: unknown): string {
  const s = typeof v === "string" ? v : JSON.stringify(v) ?? String(v);
  return `«${s.replace(/\s+/g, " ").slice(0, 40)}»`;
}

/** Riesgos con los que el modelo justifica una acción: del vocabulario y presentes en el incidente. */
function modelRisks(v: unknown, input: PlanInput): RiskTag[] | string {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > RISK_TAGS.length) return "Los riesgos deben ser una lista corta del vocabulario";
  for (const r of v) {
    if (!RISK_TAGS.includes(r as RiskTag)) return `Riesgo fuera del vocabulario: ${shown(r)}`;
    if (!input.risks.includes(r as RiskTag)) return `Justifica con un riesgo que el incidente no tiene: ${riskLabel(r as RiskTag)}`;
  }
  return uniq(v as RiskTag[]);
}

// ───────────────────────────── Reglas: proponer_recursos ─────────────────────────────

const RESOURCE_RULES: Record<ResourceService, { purpose: string; triggers: (i: PlanInput, has: (r: RiskTag) => boolean) => Trigger[] }> = {
  bomberos: {
    purpose: "rescate y seguridad de la zona",
    triggers: (i, has) => {
      const t: Trigger[] = [];
      const inWater = (["atrapados", "agua_subiendo"] as const).filter(has);
      if ((i.type === "inundacion_vehiculo" || i.type === "inundacion_vivienda") && inWater.length) {
        t.push({ label: `${lc(TYPE_LABELS[i.type])} con ${joinEs(inWater.map(riskLabel))}`, risks: [...inWater] });
      }
      if (i.type === "garaje_inundado" && (i.people > 0 || has("atrapados") || has("sin_respuesta"))) {
        t.push({ label: "garaje inundado con personas dentro", risks: (["atrapados", "sin_respuesta"] as RiskTag[]).filter(has) });
      }
      if (i.type === "arbol_caido") t.push({ label: "árbol caído", risks: [] });
      if (i.type === "incendio") t.push({ label: "incendio", risks: [] });
      if (i.type === "ascensor") t.push({ label: "personas atrapadas en un ascensor", risks: has("atrapados") ? ["atrapados"] : [] });
      if (has("cables_electricos")) t.push({ label: riskLabel("cables_electricos"), risks: ["cables_electricos"] });
      if (has("atrapados") && !t.some((x) => x.risks.includes("atrapados"))) t.push({ label: riskLabel("atrapados"), risks: ["atrapados"] });
      return t;
    },
  },
  samu_061: {
    purpose: "asistencia sanitaria",
    triggers: (i, has) => {
      const t: Trigger[] = [];
      if (i.type === "medica") t.push({ label: "emergencia médica", risks: [] });
      for (const r of ["dolor_pecho", "inconsciente", "sin_respuesta", "herido"] as const) if (has(r)) t.push({ label: riskLabel(r), risks: [r] });
      if (has("menor") && (has("vida") || has("atrapados"))) t.push({ label: "menor implicado en peligro", risks: ["menor"] });
      return t;
    },
  },
  policia_local: {
    purpose: "control del tráfico y de la zona",
    triggers: (i, has) => {
      const t: Trigger[] = [];
      if (i.type === "accidente") t.push({ label: "accidente de tráfico", risks: [] });
      if (has("trafico")) t.push({ label: riskLabel("trafico"), risks: ["trafico"] });
      return t;
    },
  },
  policia_nacional: {
    purpose: "seguridad ciudadana y protección de las personas",
    triggers: (i, has) => {
      const t: Trigger[] = [];
      if (i.type === "delito") t.push({ label: "robo o agresión", risks: [] });
      if (has("violencia")) t.push({ label: riskLabel("violencia"), risks: ["violencia"] });
      return t;
    },
  },
};

function resourceRules(input: PlanInput): ProposalOf<"proponer_recursos">[] {
  const has = (r: RiskTag) => input.risks.includes(r);
  return RESOURCE_SERVICES.flatMap((servicio) => {
    const rule = RESOURCE_RULES[servicio];
    const triggers = rule.triggers(input, has);
    if (!triggers.length) return [];
    const evidence = evidenceOf(input, triggers);
    const reason = `${cap(joinEs(triggers.map((t) => t.label)))} (${evidence.callIds.join(", ")}): ${rule.purpose}.`;
    return [make(input, "proponer_recursos", servicio, { servicio, personas: input.people, gravedad: input.severity }, reason, evidence, "reglas")];
  });
}

// ───────────────────────────── Reglas: sms_al_llamante ─────────────────────────────

const CALM_RISKS: RiskTag[] = ["vida", "atrapados", "menor", "dolor_pecho", "inconsciente", "sin_respuesta", "herido"];

/** Qué frase pretraducida corresponde a cada situación (en este orden en el SMS). */
const SMS_PHRASE_RULES: readonly { phrase: SmsPhraseId; risks: RiskTag[]; when: (type: IncidentType, has: (r: RiskTag) => boolean) => boolean }[] = [
  { phrase: "garaje", risks: ["agua_subiendo"], when: (type, has) => has("agua_subiendo") || FLOOD_TYPES.includes(type) },
  { phrase: "cables", risks: ["cables_electricos"], when: (_type, has) => has("cables_electricos") },
  { phrase: "calma", risks: CALM_RISKS, when: (type, has) => type === "medica" || type === "ascensor" || CALM_RISKS.some(has) },
];

/**
 * Instrucciones de seguridad pretraducidas que corresponden a un tipo y unos riesgos, en orden. Es la
 * misma elección del SMS (X05) y la reutiliza el asistente de espera (X06, `lib/waiting.ts`).
 */
export function safetyPhrases(type: IncidentType, risks: readonly RiskTag[]): SmsPhraseId[] {
  const has = (r: RiskTag) => risks.includes(r);
  return SMS_PHRASE_RULES.filter((r) => r.when(type, has)).map((r) => r.phrase);
}

/** Frases que corresponden al incidente por su tipo y sus riesgos, en el orden del SMS. */
function phrasesFor(input: PlanInput): SmsPhraseId[] {
  return safetyPhrases(input.type, input.risks);
}

/** Riesgos del incidente que justifican estas frases. */
function phraseRisks(input: PlanInput, phrases: readonly SmsPhraseId[]): RiskTag[] {
  return uniq(SMS_PHRASE_RULES.filter((r) => phrases.includes(r.phrase)).flatMap((r) => r.risks)).filter((r) => input.risks.includes(r));
}

/** Texto del SMS con las frases tal cual están en `lib/phrases.ts`; null si falta alguna traducción. */
export function smsText(phrases: readonly SmsPhraseId[], lang: string): string | null {
  const parts = phrases.map((id) => {
    const p = PHRASES.find((x) => x.id === id);
    return p ? (lang === "es" ? p.es : p.tr[lang]) : undefined;
  });
  return parts.every((x): x is string => typeof x === "string") ? parts.join(" ") : null;
}

/** La primera llamada del mismo teléfono: así el mismo llamante no recibe dos SMS. */
function canonicalCall(input: PlanInput, callId: string): PlanCall | undefined {
  const c = input.calls.find((x) => x.id === callId);
  if (!c || !c.phone) return c;
  return input.calls.find((x) => x.phone === c.phone);
}

function smsProposal(input: PlanInput, c: PlanCall, phrases: SmsPhraseId[], origin: ActionOrigin): ProposalOf<"sms_al_llamante"> | null {
  const texto = smsText(phrases, c.lang);
  const textoEs = smsText(phrases, "es");
  if (!texto || !textoEs) return null;
  const who = c.lang === "es" ? c.id : `${c.id}, que no habla castellano`;
  const reason =
    origin === "reglas"
      ? `Instrucciones de seguridad en ${langName(c.lang)} para ${who}: «${textoEs}»`
      : `Propuesta de la IA local: instrucciones de seguridad en ${langName(c.lang)} para ${c.id}: «${textoEs}»`;
  return make(
    input,
    "sms_al_llamante",
    c.id,
    { llamada: c.id, telefono: c.phone, idioma: c.lang, frases: phrases, texto, texto_es: textoEs },
    reason,
    // Percepción: las llamadas que aportaron los riesgos (C3 vio los cables; el SMS va también a C2).
    evidenceOf(input, [{ label: "", risks: phraseRisks(input, phrases) }]),
    origin,
  );
}

/**
 * Un SMS por llamante que no habla castellano (una vez por teléfono), con las frases que tocan por
 * tipo y riesgos. A quien habla castellano se lo dice el operador de viva voz (DECISIONES X05).
 */
function smsRules(input: PlanInput): ProposalOf<"sms_al_llamante">[] {
  const phrases = phrasesFor(input);
  if (!phrases.length) return [];
  const seen = new Set<string>();
  const out: ProposalOf<"sms_al_llamante">[] = [];
  for (const c of input.calls) {
    const who = c.phone ?? c.id;
    if (seen.has(who)) continue;
    seen.add(who);
    if (c.lang === "es") continue;
    const p = smsProposal(input, c, phrases, "reglas");
    if (p) out.push(p);
  }
  return out;
}

// ───────────────────────────── Reglas: avisar_distribuidora ─────────────────────────────

const VULNERABLE: RiskTag[] = ["vida", "mayor", "movilidad_reducida", "atrapados", "menor", "dolor_pecho", "inconsciente"];

function utilityRules(input: PlanInput): ProposalOf<"avisar_distribuidora">[] {
  const has = (r: RiskTag) => input.risks.includes(r);
  const out: ProposalOf<"avisar_distribuidora">[] = [];
  const args = (canal: UtilityChannel) => ({ canal, posicion: centroid(input.points), personas: input.people });
  if (has("cables_electricos")) {
    const ev = evidenceOf(input, [{ label: "", risks: ["cables_electricos"] }]);
    out.push(
      make(input, "avisar_distribuidora", "averias", args("averias"), `Cables eléctricos en el suelo (${ev.callIds.join(", ")}): aviso a averías para cortar el tramo y asegurar la zona.`, ev, "reglas"),
    );
  }
  const vulnerable = VULNERABLE.filter(has);
  if (has("sin_luz") && vulnerable.length) {
    const ev = evidenceOf(input, [{ label: "", risks: ["sin_luz", ...vulnerable] }]);
    out.push(
      make(
        input,
        "avisar_distribuidora",
        "reposicion_prioritaria",
        args("reposicion_prioritaria"),
        `Sin suministro eléctrico con ${joinEs(vulnerable.map(riskLabel))} (${ev.callIds.join(", ")}): reposición prioritaria del suministro.`,
        ev,
        "reglas",
      ),
    );
  }
  return out;
}

// ───────────────────────────── Reglas: aviso_ayuntamiento ─────────────────────────────

const CITY_PURPOSE: Record<CityReason, string> = {
  semaforos: "aviso a Movilidad del ayuntamiento para regular el tráfico y reponer los semáforos",
  arbol_caido: "aviso al ayuntamiento para retirar el árbol y ordenar el tráfico de la zona",
  via_bloqueada: "aviso al ayuntamiento (movilidad y policía local) para cortar y desviar el tráfico",
};

/**
 * Motivos del aviso al ayuntamiento: semáforos (tipo), árbol caído (tipo; el aviso incluye la vía
 * cortada si la hay) y vía cortada en cualquier otro tipo. Un aviso por incidente y motivo.
 */
function cityMotives(input: PlanInput): { motivo: CityReason; trigger: Trigger }[] {
  const via = input.risks.includes("via_bloqueada");
  const out: { motivo: CityReason; trigger: Trigger }[] = [];
  if (input.type === "semaforos") out.push({ motivo: "semaforos", trigger: { label: lc(TYPE_LABELS.semaforos), risks: [] } });
  if (input.type === "arbol_caido") {
    out.push({ motivo: "arbol_caido", trigger: { label: via ? `árbol caído con ${riskLabel("via_bloqueada")}` : "árbol caído", risks: via ? ["via_bloqueada"] : [] } });
  } else if (via) out.push({ motivo: "via_bloqueada", trigger: { label: riskLabel("via_bloqueada"), risks: ["via_bloqueada"] } });
  return out;
}

function cityProposal(input: PlanInput, motivo: CityReason, trigger: Trigger, origin: ActionOrigin): ProposalOf<"aviso_ayuntamiento"> {
  const evidence = evidenceOf(input, [trigger]);
  const reason =
    origin === "reglas"
      ? `${cap(trigger.label)} (${evidence.callIds.join(", ")}): ${CITY_PURPOSE[motivo]}.`
      : `Propuesta de la IA local: aviso al ayuntamiento por ${CITY_LABELS[motivo]}.`;
  const args = { motivo, posicion: centroid(input.points), via_cortada: input.risks.includes("via_bloqueada") };
  return make(input, "aviso_ayuntamiento", motivo, args, reason, evidence, origin);
}

function cityRules(input: PlanInput): ProposalOf<"aviso_ayuntamiento">[] {
  return cityMotives(input).map((m) => cityProposal(input, m.motivo, m.trigger, "reglas"));
}

// ───────────────────────────── Reglas: devolver_llamada ─────────────────────────────

/**
 * La llamada que trae «no responde» como información nueva: la primera, después de la que abrió el
 * incidente, con `sin_respuesta` en sus riesgos (si la primera ya lo traía, no es nuevo). Solo datos
 * estructurados: riesgos de cada llamada y su orden de llegada.
 */
function noResponseNews(input: PlanInput): PlanCall | undefined {
  const [first, ...rest] = input.calls;
  if (!first || first.risks.includes("sin_respuesta") || !input.risks.includes("sin_respuesta")) return undefined;
  return rest.find((c) => c.risks.includes("sin_respuesta"));
}

function callbackProposal(input: PlanInput, target: PlanCall, news: PlanCall, origin: ActionOrigin): ProposalOf<"devolver_llamada"> {
  const phone = target.phone ? ` (${target.phone})` : "";
  const same = target.id === news.id ? "" : `, el mismo teléfono que ${news.id}`;
  const reason =
    origin === "reglas"
      ? `${news.id} avisa de que la persona en peligro no responde (información nueva en ${input.incidentId}): rellamada prioritaria a ${target.id}${phone}${same} para confirmar la situación y mantener el contacto hasta que lleguen los recursos.`
      : `Propuesta de la IA local: devolver la llamada a ${target.id}${phone} porque la persona en peligro no responde (${news.id}).`;
  return make(
    input,
    "devolver_llamada",
    target.id,
    { llamada: target.id, telefono: target.phone, idioma: target.lang, noticia: news.id, motivo: "sin_respuesta" },
    reason,
    { type: input.type, risks: ["sin_respuesta"], callIds: [news.id] },
    origin,
  );
}

/**
 * Rellamada prioritaria a quien da la noticia de que la persona en peligro no responde (B3, la vecina
 * que la llama por la ventana), una vez por teléfono. Es quien está viendo lo que pasa ahora.
 */
function callbackRules(input: PlanInput): ProposalOf<"devolver_llamada">[] {
  const news = noResponseNews(input);
  if (!news) return [];
  return [callbackProposal(input, canonicalCall(input, news.id) ?? news, news, "reglas")];
}

// ───────────────────────────── Zona: proponer_es_alert ─────────────────────────────

/** Incidentes a menos de esta distancia entre sí (centro a centro) forman una zona. */
export const ES_ALERT_LINK_M = 1000;
/** Incidentes que hacen falta en una zona para proponer un ES-Alert. */
export const ES_ALERT_MIN_INCIDENTS = 2;
/** Margen sobre los puntos (con su precisión AML) para el radio de la zona. */
export const ES_ALERT_MARGIN_M = 500;
const ES_ALERT_DESTINATION = "poblacion";

/**
 * Texto fijo de plantilla, en castellano y en inglés. No lleva nada de las llamadas ni lo escribe
 * ningún modelo; la zona de difusión va aparte (`args.zona`).
 */
export const ES_ALERT_TEXT = {
  es: "ALERTA 112. Inundaciones con vehículos atrapados en esta zona. No circule y no cruce pasos inferiores, vados ni calles inundadas. Aléjese del agua y suba a una planta alta. Llame al 112 solo si es una emergencia.",
  en: "112 ALERT. Flooding with trapped vehicles in this area. Do not drive and do not cross underpasses, fords or flooded streets. Stay away from the water and go to a higher floor. Call 112 only if it is an emergency.",
} as const;

/** Lugar de referencia de `PLACES` (rótulos del mapa) más cercano a una posición. */
export function nearestPlace(pos: { lat: number; lng: number }): { name: string; distance: number } {
  let best = { name: PLACES[0].name, distance: Infinity };
  for (const p of PLACES) {
    const d = haversine(pos, { lat: p.at[1], lng: p.at[0] });
    if (d < best.distance) best = { name: p.name, distance: d };
  }
  return best;
}

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const round5 = (n: number) => Math.round(n * 1e5) / 1e5;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const meters = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1).replace(".", ",")} km` : `${Math.round(m)} m`);

/** Vehículo atrapado por agua con personas atrapadas, ya decidido por el operador (no provisional). */
const trappedCar = (i: PlanInput) => !i.provisional && i.type === "inundacion_vehiculo" && i.risks.includes("atrapados") && i.points.length > 0;
const centerOf = (i: PlanInput) => ({ lat: mean(i.points.map((p) => p.lat)), lng: mean(i.points.map((p) => p.lng)) });

function zoneOf(incs: PlanInput[]): EsAlertZone {
  const centers = incs.map(centerOf);
  const centro = { lat: round5(mean(centers.map((c) => c.lat))), lng: round5(mean(centers.map((c) => c.lng))) };
  const reach = Math.max(...incs.flatMap((i) => i.points.map((p) => haversine(centro, p) + p.acc)));
  const place = nearestPlace(centro);
  return {
    id: `ZONA-${slug(place.name)}`,
    nombre: place.name,
    referencia_m: Math.round(place.distance / 100) * 100,
    centro,
    radio_m: Math.ceil((reach + ES_ALERT_MARGIN_M) / 100) * 100,
  };
}

function zoneProposal(incs: PlanInput[], origin: ActionOrigin): ProposalOf<"proponer_es_alert"> {
  const zona = zoneOf(incs);
  const incidentes = incs.map((i) => i.incidentId);
  const callIds = incs.flatMap((i) => i.calls.filter((c) => c.risks.includes("atrapados")).map((c) => c.id));
  // Distancia de cada incidente al más cercano de la zona (centro a centro).
  const centers = incs.map(centerOf);
  const gap = Math.max(...centers.map((c, k) => Math.min(...centers.filter((_, j) => j !== k).map((o) => haversine(c, o)))));
  const near = incs.length === 2 ? `a ${Math.round(gap / 10) * 10} m entre sí` : `cada uno a ${Math.round(gap / 10) * 10} m o menos de otro`;
  const where = `la zona de ${zona.nombre} (radio ${meters(zona.radio_m)})`;
  const reason =
    origin === "reglas"
      ? `${incs.length} vehículos atrapados por agua con personas atrapadas ${near} (${joinEs(incidentes)}; llamadas ${callIds.join(", ")}): ES-Alert a la población de ${where} con el texto fijo de plantilla. La aprueba un coordinador.`
      : `Propuesta de la IA local: ES-Alert a la población de ${where} por un vehículo atrapado por agua con personas atrapadas (${incidentes.join(", ")}). Texto fijo de plantilla; la aprueba un coordinador.`;
  const tool = "proponer_es_alert" as const;
  return {
    key: actionKey(zona.id, tool, ES_ALERT_DESTINATION),
    incidentId: zona.id,
    tool,
    destination: ES_ALERT_DESTINATION,
    args: { zona, incidentes, texto_es: ES_ALERT_TEXT.es, texto_en: ES_ALERT_TEXT.en },
    reason,
    evidence: { type: "inundacion_vehiculo", risks: ["atrapados"], callIds: callIds.length ? callIds : incs.flatMap((i) => i.calls.map((c) => c.id)) },
    policy: policyFor(tool, origin),
    origin,
  };
}

/**
 * Planificador de zona (ES-Alert): agrupa los vehículos atrapados por agua con personas atrapadas, no
 * provisionales, cuyos centros estén a `ES_ALERT_LINK_M` o menos (enlace simple), y propone un ES-Alert
 * por cada grupo de al menos `ES_ALERT_MIN_INCIDENTS`. Puro, determinista y solo con datos
 * estructurados; la clave es la zona (lugar de referencia), así que volver a planificar no duplica.
 */
export function planZoneAlerts(inputs: readonly PlanInput[]): Proposal[] {
  const cars = inputs.filter(trappedCar);
  const group = cars.map((_, k) => k);
  const root = (k: number): number => (group[k] === k ? k : (group[k] = root(group[k])));
  const centers = cars.map(centerOf);
  for (let a = 0; a < cars.length; a++) {
    for (let b = a + 1; b < cars.length; b++) if (haversine(centers[a], centers[b]) <= ES_ALERT_LINK_M) group[root(b)] = root(a);
  }
  const out: Proposal[] = [];
  const seen = new Set<string>();
  for (const r of [...new Set(cars.map((_, k) => root(k)))]) {
    const members = cars.filter((_, k) => root(k) === r);
    if (members.length < ES_ALERT_MIN_INCIDENTS) continue;
    const p = zoneProposal(members, "reglas");
    if (seen.has(p.key)) continue;
    seen.add(p.key);
    out.push(p);
  }
  return out;
}

/** Incidentes de una acción: los de la zona para un ES-Alert; si no, el suyo. */
export function actionIncidents(p: Proposal): string[] {
  return p.tool === "proponer_es_alert" ? [...p.args.incidentes] : [p.incidentId];
}

// ───────────────────────────── Especificación de cada herramienta ─────────────────────────────

type JsonSchema = Record<string, unknown>;

interface ToolSpec<K extends ActionTool> {
  /** Servicio simulado al que llega. */
  service: string;
  /** Descripción para el LLM (function calling). */
  description: string;
  parameters: (input: PlanInput) => JsonSchema;
  /** Nombres de argumentos que acepta del modelo (el resto se ignora y se anota). */
  modelArgs: readonly string[];
  /** Reglas deterministas. */
  rules: (input: PlanInput) => ProposalOf<K>[];
  /** Valida lo que propone el modelo: devuelve la propuesta o el motivo del descarte. */
  fromModel: (args: Record<string, unknown>, input: PlanInput) => ProposalOf<K> | string;
  /** Destino legible. */
  target: (p: ProposalOf<K>) => string;
  /** Argumentos legibles. */
  describe: (p: ProposalOf<K>) => string;
  /** Conector simulado: registra el envío y devuelve el acuse. Sin red. */
  send: (p: ProposalOf<K>, at: number) => Receipt;
}

const receipt = (prefix: string, service: string, p: Proposal, at: number, detail: string): Receipt => ({
  service,
  reference: `${prefix}-${hash6(p.key)}`,
  at,
  detail,
  simulated: true,
});

const TOOLS: { [K in ActionTool]: ToolSpec<K> } = {
  proponer_recursos: {
    service: "CAD (simulado)",
    description:
      "Propone al operador movilizar un servicio para este incidente. Usa solo un servicio que haga falta y que no esté ya propuesto, justificado con riesgos que tenga el incidente.",
    parameters: () => ({
      type: "object",
      properties: {
        servicio: { type: "string", enum: [...RESOURCE_SERVICES], description: "bomberos, samu_061 (sanitario), policia_local (tráfico) o policia_nacional (delitos y violencia)" },
        riesgos: { type: "array", items: { type: "string", enum: [...RISK_TAGS] }, description: "Riesgos del incidente que lo justifican" },
      },
      required: ["servicio"],
    }),
    modelArgs: ["servicio", "riesgos"],
    rules: resourceRules,
    fromModel: (a, input) => {
      if (!RESOURCE_SERVICES.includes(a.servicio as ResourceService)) return `Servicio fuera del vocabulario: ${shown(a.servicio)}`;
      const servicio = a.servicio as ResourceService;
      const risks = modelRisks(a.riesgos, input);
      if (typeof risks === "string") return risks;
      const why = risks.length ? joinEs(risks.map(riskLabel)) : lc(TYPE_LABELS[input.type]);
      const evidence = evidenceOf(input, [{ label: "", risks }]);
      return make(input, "proponer_recursos", servicio, { servicio, personas: input.people, gravedad: input.severity }, `Propuesta de la IA local: ${RESOURCE_LABELS[servicio]} por ${why}.`, evidence, "ia_local");
    },
    target: (p) => RESOURCE_LABELS[p.args.servicio],
    describe: (p) => `${p.args.personas} ${p.args.personas === 1 ? "persona" : "personas"}, gravedad ${p.args.gravedad}`,
    send: (p, at) => receipt("CAD", "CAD (simulado)", p, at, `Propuesta de ${RESOURCE_LABELS[p.args.servicio]} registrada para ${p.incidentId}`),
  },
  sms_al_llamante: {
    service: "Pasarela SMS (simulada)",
    description:
      "Propone enviar a un llamante instrucciones de seguridad por SMS en su idioma, solo con frases pretraducidas: garaje = «No baje al garaje ni entre en el agua. Suba a una planta alta.»; cables = «Aléjese de los cables del suelo.»; calma = «Mantenga la calma, la ayuda está en camino.»",
    parameters: (input) => ({
      type: "object",
      properties: {
        llamada: { type: "string", enum: input.calls.map((c) => c.id), description: "Id de la llamada a cuyo teléfono se envía" },
        frases: { type: "array", items: { type: "string", enum: [...SMS_PHRASE_IDS] }, description: "Frases pretraducidas, en orden" },
      },
      required: ["llamada", "frases"],
    }),
    modelArgs: ["llamada", "frases"],
    rules: smsRules,
    fromModel: (a, input) => {
      const c = typeof a.llamada === "string" ? canonicalCall(input, a.llamada) : undefined;
      if (!c) return `La llamada no es de este incidente: ${shown(a.llamada)}`;
      if (!Array.isArray(a.frases) || !a.frases.length || a.frases.length > SMS_PHRASE_IDS.length) return "Las frases deben ser una lista de 1 a 3 frases pretraducidas";
      for (const f of a.frases) if (!SMS_PHRASE_IDS.includes(f as SmsPhraseId)) return `Frase fuera de la lista pretraducida: ${shown(f)}`;
      const phrases = uniq(a.frases as SmsPhraseId[]);
      // «calma» vale siempre; las demás solo si corresponden a los datos (nada de «cables» en un garaje inundado).
      const fits = new Set<SmsPhraseId>(["calma", ...phrasesFor(input)]);
      const off = phrases.find((f) => !fits.has(f));
      if (off) return `La frase «${off}» no corresponde al tipo ni a los riesgos del incidente`;
      return smsProposal(input, c, phrases, "ia_local") ?? `No hay frases pretraducidas en ${langName(c.lang)}`;
    },
    target: (p) => (p.args.telefono ? `${p.args.llamada} (${p.args.telefono})` : p.args.llamada),
    describe: (p) => `${langName(p.args.idioma)}: «${p.args.texto}»`,
    send: (p, at) =>
      receipt("SMS", "Pasarela SMS (simulada)", p, at, `SMS en ${langName(p.args.idioma)} a ${p.args.telefono ?? p.args.llamada} (${p.args.frases.length} ${p.args.frases.length === 1 ? "frase" : "frases"})`),
  },
  avisar_distribuidora: {
    service: "Distribuidora eléctrica (simulada)",
    description:
      "Avisa a la distribuidora eléctrica: canal averias si hay cables eléctricos en el suelo; reposicion_prioritaria si no hay luz y hay personas vulnerables.",
    parameters: () => ({
      type: "object",
      properties: { canal: { type: "string", enum: [...UTILITY_CHANNELS] } },
      required: ["canal"],
    }),
    modelArgs: ["canal"],
    rules: utilityRules,
    fromModel: (a, input) => {
      if (!UTILITY_CHANNELS.includes(a.canal as UtilityChannel)) return `Canal fuera del vocabulario: ${shown(a.canal)}`;
      const canal = a.canal as UtilityChannel;
      const need: RiskTag = canal === "averias" ? "cables_electricos" : "sin_luz";
      if (!input.risks.includes(need)) return `Aviso a ${UTILITY_LABELS[canal]} sin ${riskLabel(need)} en los datos del incidente`;
      const evidence = evidenceOf(input, [{ label: "", risks: [need] }]);
      return make(
        input,
        "avisar_distribuidora",
        canal,
        { canal, posicion: centroid(input.points), personas: input.people },
        `Propuesta de la IA local: aviso a la distribuidora (${UTILITY_LABELS[canal]}) por ${riskLabel(need)}.`,
        evidence,
        "ia_local",
      );
    },
    target: (p) => `distribuidora · ${UTILITY_LABELS[p.args.canal]}`,
    describe: (p) => {
      const where = p.args.posicion ? `posición ${p.args.posicion.lat.toFixed(4)}, ${p.args.posicion.lng.toFixed(4)}` : "sin posición";
      return `${where} · ${p.args.personas} ${p.args.personas === 1 ? "persona" : "personas"}`;
    },
    send: (p, at) => receipt("DIS", "Distribuidora eléctrica (simulada)", p, at, `Aviso de ${UTILITY_LABELS[p.args.canal]} registrado para ${p.incidentId}`),
  },
  aviso_ayuntamiento: {
    service: "Ayuntamiento: movilidad y policía local (simulado)",
    description:
      "Avisa al ayuntamiento (movilidad y policía local): motivo semaforos si el incidente es de semáforos apagados; arbol_caido si es un árbol caído; via_bloqueada si hay una vía cortada en otro tipo de incidente.",
    parameters: () => ({
      type: "object",
      properties: { motivo: { type: "string", enum: [...CITY_REASONS] } },
      required: ["motivo"],
    }),
    modelArgs: ["motivo"],
    rules: cityRules,
    fromModel: (a, input) => {
      if (!CITY_REASONS.includes(a.motivo as CityReason)) return `Motivo fuera del vocabulario: ${shown(a.motivo)}`;
      const m = cityMotives(input).find((x) => x.motivo === a.motivo);
      if (!m) return `Aviso al ayuntamiento por ${CITY_LABELS[a.motivo as CityReason]} sin ese tipo o ese riesgo en los datos del incidente`;
      return cityProposal(input, m.motivo, m.trigger, "ia_local");
    },
    target: (p) => `ayuntamiento · ${CITY_LABELS[p.args.motivo]}`,
    describe: (p) => {
      const where = p.args.posicion ? `posición ${p.args.posicion.lat.toFixed(4)}, ${p.args.posicion.lng.toFixed(4)}` : "sin posición";
      return `${where}${p.args.via_cortada ? " · vía cortada" : ""}`;
    },
    send: (p, at) => receipt("AYT", "Ayuntamiento (simulado)", p, at, `Aviso de ${CITY_LABELS[p.args.motivo]} registrado para ${p.incidentId}`),
  },
  devolver_llamada: {
    service: "Telefonía de sala (simulada)",
    description:
      "Propone al operador devolver la llamada con prioridad a un llamante de este incidente cuando la persona en peligro no responde, para confirmar la situación y mantener el contacto.",
    parameters: (input) => ({
      type: "object",
      properties: { llamada: { type: "string", enum: input.calls.map((c) => c.id), description: "Id de la llamada a cuyo teléfono se devuelve" } },
      required: ["llamada"],
    }),
    modelArgs: ["llamada"],
    rules: callbackRules,
    fromModel: (a, input) => {
      const c = typeof a.llamada === "string" ? canonicalCall(input, a.llamada) : undefined;
      if (!c) return `La llamada no es de este incidente: ${shown(a.llamada)}`;
      if (!input.risks.includes("sin_respuesta")) return `Devolver la llamada sin «${riskLabel("sin_respuesta")}» en los datos del incidente`;
      const news = input.calls.find((x) => x.risks.includes("sin_respuesta")) ?? c;
      return callbackProposal(input, c, news, "ia_local");
    },
    target: (p) => (p.args.telefono ? `${p.args.llamada} (${p.args.telefono})` : p.args.llamada),
    describe: (p) => `rellamada prioritaria en ${langName(p.args.idioma)} · información nueva de ${p.args.noticia}: ${riskLabel("sin_respuesta")}`,
    send: (p, at) => receipt("TEL", "Telefonía de sala (simulada)", p, at, `Rellamada prioritaria en cola para ${p.args.telefono ?? p.args.llamada} (${p.args.llamada})`),
  },
  proponer_es_alert: {
    service: "ES-Alert (simulado)",
    description:
      "Propone al coordinador un aviso ES-Alert a la población de la zona por vehículos atrapados por agua con personas atrapadas. La zona y el texto (plantilla fija) los pone el sistema; lo aprueba siempre un coordinador.",
    parameters: () => ({
      type: "object",
      properties: { riesgos: { type: "array", items: { type: "string", enum: [...RISK_TAGS] }, description: "Riesgos del incidente que lo justifican" } },
    }),
    modelArgs: ["riesgos"],
    // Es de zona: no sale de un incidente solo, sino de `planZoneAlerts` sobre todos.
    rules: () => [],
    fromModel: (a, input) => {
      if (!trappedCar(input)) return "ES-Alert sin vehículo atrapado por agua con personas atrapadas en los datos del incidente";
      const risks = modelRisks(a.riesgos, input);
      if (typeof risks === "string") return risks;
      return zoneProposal([input], "ia_local");
    },
    target: (p) => `población de la zona de ${p.args.zona.nombre} (radio ${meters(p.args.zona.radio_m)})`,
    describe: (p) => {
      const z = p.args.zona;
      return `centro ${z.centro.lat.toFixed(4)}, ${z.centro.lng.toFixed(4)}, radio ${z.radio_m} m (referencia: ${z.nombre}, a ${meters(z.referencia_m)}) · ${p.args.incidentes.join(", ")} · es: «${p.args.texto_es}» · en: «${p.args.texto_en}»`;
    },
    send: (p, at) => receipt("ESA", "ES-Alert (simulado)", p, at, `Difusión simulada en la zona de ${p.args.zona.nombre} (radio ${p.args.zona.radio_m} m), en castellano e inglés`),
  },
};

/** Acceso a la especificación con el tipo de la propuesta (TypeScript no correlaciona uniones solo). */
function spec(p: Proposal): ToolSpec<ActionTool> {
  return TOOLS[p.tool] as unknown as ToolSpec<ActionTool>;
}

export const toolService = (p: Proposal) => spec(p).service;
export const toolTarget = (p: Proposal) => spec(p).target(p as ProposalOf<ActionTool>);
export const toolArgsText = (p: Proposal) => spec(p).describe(p as ProposalOf<ActionTool>);

// ───────────────────────────── Planificador ─────────────────────────────

/** Plan determinista: solo datos estructurados. Un incidente provisional (ámbar) no recibe acciones. */
export function planRules(input: PlanInput): Proposal[] {
  if (input.provisional) return [];
  const out: Proposal[] = [];
  const seen = new Set<string>();
  for (const tool of ACTION_TOOLS) {
    for (const p of (TOOLS[tool].rules as (i: PlanInput) => Proposal[])(input)) {
      if (!seen.has(p.key)) {
        seen.add(p.key);
        out.push(p);
      }
    }
  }
  return out;
}

/** Definiciones de herramientas para el LLM (API compatible con OpenAI). */
export function toolDefinitions(input: PlanInput) {
  return ACTION_TOOLS.map((name) => ({
    type: "function" as const,
    function: { name, description: TOOLS[name].description, parameters: TOOLS[name].parameters(input) },
  }));
}

export interface ModelToolCall {
  name: unknown;
  arguments: unknown;
}

export interface PlanIssue {
  tool: string;
  outcome: "descartada" | "corregida";
  /** En castellano, para la traza. */
  reason: string;
}

/** Máximo de llamadas a herramientas del modelo que se miran por incidente. */
export const MAX_MODEL_CALLS = 12;

/**
 * Valida lo que propone el modelo: herramienta de la lista blanca, argumentos de sus vocabularios y
 * coherentes con los datos. La política sale de la tabla (y lo del modelo nunca es automático).
 */
export function proposalsFromModel(calls: ModelToolCall[], input: PlanInput): { proposals: Proposal[]; issues: PlanIssue[] } {
  const proposals: Proposal[] = [];
  const issues: PlanIssue[] = [];
  if (input.provisional) return { proposals, issues };
  if (calls.length > MAX_MODEL_CALLS) {
    issues.push({ tool: "-", outcome: "descartada", reason: `El modelo propuso ${calls.length} acciones; se miran como máximo ${MAX_MODEL_CALLS}` });
  }
  const seen = new Set<string>();
  for (const call of calls.slice(0, MAX_MODEL_CALLS)) {
    const name = typeof call.name === "string" && /^[a-z_]{1,40}$/.test(call.name) ? call.name : null;
    if (!name || !ACTION_TOOLS.includes(name as ActionTool)) {
      issues.push({ tool: name ?? "-", outcome: "descartada", reason: `Herramienta desconocida: ${shown(call.name)}` });
      continue;
    }
    const tool = name as ActionTool;
    let args = call.arguments;
    if (typeof args === "string") {
      try {
        args = JSON.parse(args);
      } catch {
        issues.push({ tool, outcome: "descartada", reason: "Argumentos que no son JSON válido" });
        continue;
      }
    }
    if (args === undefined || args === null) args = {};
    if (!isObject(args)) {
      issues.push({ tool, outcome: "descartada", reason: "Los argumentos deben ser un objeto" });
      continue;
    }
    const ts = TOOLS[tool] as unknown as ToolSpec<ActionTool>;
    const p = ts.fromModel(args, input);
    if (typeof p === "string") {
      issues.push({ tool, outcome: "descartada", reason: p });
      continue;
    }
    const extra = Object.keys(args).filter((k) => !ts.modelArgs.includes(k));
    if (extra.length) {
      issues.push({
        tool,
        outcome: "corregida",
        reason: `Se ignoran argumentos no previstos (${extra.slice(0, 5).map((k) => shown(k)).join(", ")}): quién aprueba lo fija la tabla de política (${p.policy})`,
      });
    }
    if (seen.has(p.key)) continue;
    seen.add(p.key);
    proposals.push(p as Proposal);
  }
  return { proposals, issues };
}

/** Las reglas siempre se quedan; lo del modelo solo se añade si no estaba (misma clave). */
export function mergePlans(rules: Proposal[], model: Proposal[]): Proposal[] {
  const out = [...rules];
  const keys = new Set(rules.map((p) => p.key));
  for (const p of model) {
    if (keys.has(p.key)) continue;
    keys.add(p.key);
    out.push(p);
  }
  return out;
}

// ───────────────────────────── Estados ─────────────────────────────

export type ActionResult = { ok: true; actions: AgentAction[]; action: AgentAction } | { ok: false; error: string };

const STATUS_TEXT: Record<ActionStatus, string> = {
  propuesta: "propuesta",
  aprobada: "aprobada",
  enviada: "enviada",
  descartada: "descartada",
};

function send(p: Proposal, at: number): Receipt {
  return spec(p).send(p as ProposalOf<ActionTool>, at);
}

/**
 * Añade al registro las propuestas que no estén ya (misma clave, en cualquier estado): volver a
 * planificar solo añade lo que falta. Las automáticas se envían en el momento con registro.
 */
export function addProposals(actions: AgentAction[], proposals: Proposal[], at: number): { actions: AgentAction[]; added: AgentAction[] } {
  const keys = new Set(actions.map((a) => a.key));
  const added: AgentAction[] = [];
  for (const p of proposals) {
    if (keys.has(p.key)) continue;
    keys.add(p.key);
    const auto = p.policy === "automatica";
    added.push({
      ...p,
      status: auto ? "enviada" : "propuesta",
      proposedAt: at,
      approval: auto ? { by: "automatica", at } : null,
      receipt: auto ? send(p, at) : null,
      discarded: null,
    } as AgentAction);
  }
  return { actions: [...actions, ...added], added };
}

function update(actions: AgentAction[], key: string, fn: (a: AgentAction) => AgentAction | string): ActionResult {
  const a = actions.find((x) => x.key === key);
  if (!a) return { ok: false, error: `No hay ninguna acción ${key}` };
  const next = fn(a);
  if (typeof next === "string") return { ok: false, error: next };
  return { ok: true, actions: actions.map((x) => (x.key === key ? next : x)), action: next };
}

/** El rol aprueba una propuesta. Las automáticas no esperan aprobación. */
export function approve(actions: AgentAction[], key: string, role: Role, at: number): ActionResult {
  return update(actions, key, (a) => {
    if (a.policy === "automatica") return "Las acciones automáticas no esperan aprobación: se envían en el momento y quedan registradas";
    if (a.status !== "propuesta") return `La acción ya está ${STATUS_TEXT[a.status]}`;
    if (!canApprove(a.policy, role)) return `Esta acción la aprueba un ${a.policy}`;
    return { ...a, status: "aprobada", approval: { by: role, at } };
  });
}

/** Envía por el conector simulado una acción aprobada y guarda el acuse. */
export function dispatch(actions: AgentAction[], key: string, at: number): ActionResult {
  return update(actions, key, (a) => {
    if (a.status !== "aprobada") return `Solo se envían acciones aprobadas; esta está ${STATUS_TEXT[a.status]}`;
    return { ...a, status: "enviada", receipt: send(a, at) };
  });
}

/** El rol descarta una acción que aún no se ha enviado. */
export function discard(actions: AgentAction[], key: string, role: Role, at: number, reason = "Descartada por el operador"): ActionResult {
  return update(actions, key, (a) => {
    if (a.status === "enviada" || a.status === "descartada") return `La acción ya está ${STATUS_TEXT[a.status]}`;
    if (a.policy !== "automatica" && !canApprove(a.policy, role)) return `Esta acción la decide un ${a.policy}`;
    return { ...a, status: "descartada", discarded: { by: role, at, reason } };
  });
}

/**
 * Las acciones sin enviar de un incidente que ya no existe se descartan («sistema»). Lo enviado no se
 * deshace. Con el motor actual no ocurre (los provisionales no reciben acciones y «Separar» conserva el
 * incidente), pero deja el registro coherente si cambia.
 */
export function discardOrphans(actions: AgentAction[], liveIncidentIds: Iterable<string>, at: number): AgentAction[] {
  const live = new Set(liveIncidentIds);
  return actions.map((a): AgentAction => {
    if (a.status !== "propuesta" && a.status !== "aprobada") return a;
    // Una acción de zona necesita todos sus incidentes.
    const gone = actionIncidents(a).find((id) => !live.has(id));
    if (!gone) return a;
    const reason = gone === a.incidentId ? `El incidente ${gone} ya no existe` : `El incidente ${gone} de la ${a.incidentId} ya no existe`;
    return { ...a, status: "descartada", discarded: { by: "sistema", at, reason } };
  });
}

// ───────────────────────────── Traza ─────────────────────────────

/** Una entrada por acción, exportable a JSON (claves en castellano, como el registro de auditoría). */
export interface TraceEntry {
  clave: string;
  /** Id del incidente, o de la zona (`ZONA-…`) en una acción de zona. */
  incidente: string;
  ambito: "incidente" | "zona";
  incidentes: string[];
  origen: ActionOrigin;
  propuestaEn: number;
  percepcion: { tipo: IncidentType; llamadas: string[]; riesgos: RiskTag[] };
  razonamiento: string;
  herramienta: { nombre: ActionTool; servicio: string; destino: string; destinoTexto: string; detalle: string; argumentos: ToolArgs[ActionTool] };
  politica: ApprovalPolicy;
  aprobacion: { por: Role | "automatica"; en: number } | null;
  resultado: { estado: ActionStatus; acuse: Receipt | null; descarte: { por: Role | "sistema"; en: number; motivo: string } | null };
}

export function traceOf(a: AgentAction): TraceEntry {
  return {
    clave: a.key,
    incidente: a.incidentId,
    ambito: ZONE_TOOLS.includes(a.tool) ? "zona" : "incidente",
    incidentes: actionIncidents(a),
    origen: a.origin,
    propuestaEn: a.proposedAt,
    percepcion: { tipo: a.evidence.type, llamadas: [...a.evidence.callIds], riesgos: [...a.evidence.risks] },
    razonamiento: a.reason,
    herramienta: {
      nombre: a.tool,
      servicio: toolService(a),
      destino: a.destination,
      destinoTexto: toolTarget(a),
      detalle: toolArgsText(a),
      argumentos: a.args,
    },
    politica: a.policy,
    aprobacion: a.approval ? { por: a.approval.by, en: a.approval.at } : null,
    resultado: {
      estado: a.status,
      acuse: a.receipt,
      descarte: a.discarded ? { por: a.discarded.by, en: a.discarded.at, motivo: a.discarded.reason } : null,
    },
  };
}
