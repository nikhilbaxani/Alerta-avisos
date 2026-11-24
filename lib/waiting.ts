/**
 * Agente para quien está en espera (MEMORIA §16.3).
 *
 * Puro: sin red, sin reloj y sin estado. Los tiempos son segundos del escenario y la sala es una
 * simulación con los supuestos declarados de `lib/metrics.ts` (60 s por llamada nueva, 15 s por
 * repetida; la cola del copiloto atiende antes las emergencias nuevas más graves).
 *
 * - Atiende **solo** las llamadas que llegan con todos los operadores ocupados; nunca sustituye a un
 *   operador libre.
 * - Se presenta como asistente automático (transparencia de la Ley de IA), en el idioma del llamante y
 *   solo con frases fijas pretraducidas (`lib/phrases.ts`); nada de texto generado por un modelo.
 * - La llamada pasa por el flujo normal (motor real). Escala de inmediato a la cola humana toda
 *   llamada con riesgo vital o gravedad 5, incluso si es un duplicado. Un duplicado sin riesgo vital
 *   ni información nueva se cierra sin ocupar a un operador. El resto sigue en la cola humana.
 * - No cambia ninguna decisión del motor: una zona gris (`ask`) la decide siempre el operador.
 */
import { joinEs, safetyPhrases } from "@/lib/actions";
import type { SmsPhraseId } from "@/lib/actions";
import { RISK_LABELS } from "@/lib/labels";
import { DUPLICATE_SECONDS, NEW_CALL_SECONDS, criticalCall } from "@/lib/metrics";
import type { SimCall } from "@/lib/metrics";
import { PHRASES, WAITING_PHRASES } from "@/lib/phrases";
import type { WaitingPhraseId } from "@/lib/phrases";
import type { DecisionAction, IncidentType, RiskTag } from "@/lib/types";

/** Operadores por defecto: el valor inicial de la franja de sala de la consola (`components/SimStrip.tsx`). */
export const DEFAULT_OPERATORS = 2;
export const MAX_OPERATORS = 50;

/** Riesgo vital (MEMORIA §16.3), en el orden en que se explican. Además, gravedad 5. */
export const VITAL_RISKS: readonly RiskTag[] = ["dolor_pecho", "inconsciente", "sin_respuesta", "vida"];

/** Llamada tal como la ve la sala simulada: lo de `lib/metrics.ts` más lo que oye el asistente. */
export interface WaitingCall extends SimCall {
  /** Idioma del llamante (ISO 639-1). */
  lang: string;
  /** Decisión del motor al entrar la llamada. Nadie la cambia. */
  decision: DecisionAction;
  /** Riesgos que la llamada aporta como información nueva al fusionarse. */
  newInfo: RiskTag[];
  /** Se fusionó con un incidente provisional (pendiente de decisión del operador). */
  intoProvisional: boolean;
  /** Tipo y riesgos del incidente en el que entra (para elegir las instrucciones). */
  incidentType: IncidentType;
  incidentRisks: RiskTag[];
  /** Fusiones: riesgos y gravedad que el incidente ya tenía antes de esta llamada; null si abre incidente. */
  known: { risks: RiskTag[]; severity: number } | null;
}

export type WaitingOutcome = "agrupada" | "en_cola" | "escalada";

const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const riskText = (r: RiskTag) => lc(RISK_LABELS[r]);

// ───────────────────────────── Triaje ─────────────────────────────

export interface Triage {
  outcome: WaitingOutcome;
  /** Riesgos vitales de la llamada. */
  vital: RiskTag[];
  severity5: boolean;
  /** Motivo para el operador, en castellano. */
  reason: string;
}

const vitalText = (risks: readonly RiskTag[], severity5: boolean) => joinEs([...risks.map(riskText), ...(severity5 ? ["gravedad 5"] : [])]);

/**
 * Qué hace el asistente con una llamada que tendría que esperar. Escala todo riesgo vital o gravedad 5;
 * nunca convierte `ask` en fusión ni cierra una llamada con riesgo vital.
 */
export function triage(c: WaitingCall): Triage {
  const vital = VITAL_RISKS.filter((r) => c.extraction.risks.includes(r));
  const severity5 = c.extraction.severity >= 5;
  if (vital.length || severity5) {
    const pureDuplicate = c.decision === "merge" && !c.intoProvisional && c.newInfo.length === 0;
    // Lo vital que el incidente no tenía antes de esta llamada (`vida` no cuenta como información nueva en el motor).
    const unknownRisks = c.known ? vital.filter((r) => !c.known!.risks.includes(r)) : vital;
    const unknownSev5 = severity5 && (!c.known || c.known.severity < 5);
    const all = vitalText(vital, severity5);
    const unknown = vitalText(unknownRisks, unknownSev5);
    // Si trae riesgo vital nuevo, dice qué parte no conocía la sala.
    const head = pureDuplicate && unknown
      ? `Escala de inmediato a un operador humano: ${all}${unknown === all ? `, nuevo para ${c.incidentId}` : `; nuevo para ${c.incidentId}: ${unknown}`}.`
      : `Escala de inmediato a un operador humano: ${all}.`;
    const also = [
      ...(c.decision === "ask" ? ["Zona gris: el operador decide si es el mismo incidente."] : []),
      ...(c.decision === "merge" && c.intoProvisional ? [`Se agrupa con ${c.incidentId}, pendiente de decisión del operador.`] : []),
      ...(c.newInfo.length ? [`Aporta información nueva a ${c.incidentId} (${joinEs(c.newInfo.map(riskText))}).`] : []),
    ];
    return { outcome: "escalada", vital, severity5, reason: [head, ...also].join(" ") };
  }
  if (c.decision === "merge" && !c.intoProvisional && c.newInfo.length === 0) {
    return {
      outcome: "agrupada",
      vital,
      severity5,
      reason: `Duplicado de ${c.incidentId} que el motor agrupa solo, sin información nueva: el asistente da las instrucciones y la cierra sin ocupar a un operador.`,
    };
  }
  let why: string;
  if (c.decision === "ask") why = "Zona gris (el operador decide si es el mismo incidente; nunca se fusiona sola)";
  else if (c.decision === "new") why = "Emergencia nueva";
  else if (c.newInfo.length) why = `Aporta información nueva a ${c.incidentId} (${joinEs(c.newInfo.map(riskText))})`;
  else why = `Se agrupa con ${c.incidentId}, que está pendiente de decisión del operador`;
  return { outcome: "en_cola", vital, severity5, reason: `${why}: el asistente toma nota y da instrucciones, y la llamada sigue en la cola humana.` };
}

// ───────────────────────────── Guion ─────────────────────────────

export type ScriptPhraseId = WaitingPhraseId | SmsPhraseId;

export interface ScriptLine {
  id: ScriptPhraseId;
  /** Frase fija en el idioma del guion. */
  text: string;
  /** La misma frase en castellano, para el operador. */
  es: string;
}

export interface WaitingScript {
  /** Idioma del llamante. */
  lang: string;
  /** false si falta alguna traducción: entonces el guion va en castellano. */
  translated: boolean;
  lines: ScriptLine[];
  text: string;
  textEs: string;
}

export interface ScriptInput {
  lang: string;
  outcome: WaitingOutcome;
  /** Un operador ya ha cogido alguna llamada de esta emergencia (si no, no se dice que la ayuda esté en camino). */
  operatorOnIt: boolean;
  type: IncidentType;
  risks: readonly RiskTag[];
}

const FIXED = [...PHRASES, ...WAITING_PHRASES];

function fixedLine(id: ScriptPhraseId, lang: string): ScriptLine | null {
  const p = FIXED.find((x) => x.id === id);
  if (!p) return null;
  const text = lang === "es" ? p.es : p.tr[lang];
  return text ? { id, text, es: p.es } : null;
}

/**
 * Frases del guion, en orden: presentación como asistente automático, «dígame qué ocurre y dónde» y,
 * según el resultado, el aviso de escalado seguido de las instrucciones, o las instrucciones seguidas
 * del cierre («ya teníamos el aviso») o de «un operador le atenderá». Las instrucciones son las del
 * SMS de X05 (`safetyPhrases`); si ningún operador ha cogido aún la emergencia, «calma» (que dice
 * que la ayuda está en camino) se cambia por «calma_espera».
 */
export function scriptIds(input: ScriptInput): ScriptPhraseId[] {
  const safety: ScriptPhraseId[] = safetyPhrases(input.type, input.risks).map((id) => (id === "calma" && !input.operatorOnIt ? "calma_espera" : id));
  const head: ScriptPhraseId[] = ["asistente", "que_ocurre"];
  if (input.outcome === "escalada") return [...head, "escalado", ...safety];
  if (input.outcome === "agrupada") return [...head, ...safety, "ya_avisado"];
  return [...head, ...safety, "en_cola"];
}

/** Guion del asistente compuesto solo con frases fijas pretraducidas. */
export function waitingScript(input: ScriptInput): WaitingScript {
  const ids = scriptIds(input);
  const translated = ids.every((id) => fixedLine(id, input.lang) !== null);
  const lines = ids.map((id) => fixedLine(id, translated ? input.lang : "es")!);
  return {
    lang: input.lang,
    translated,
    lines,
    text: lines.map((l) => l.text).join(" "),
    textEs: lines.map((l) => l.es).join(" "),
  };
}

// ───────────────────────────── Sala simulada ─────────────────────────────

export interface Attention {
  callId: string;
  t: number;
  lang: string;
  incidentId: string;
  decision: DecisionAction;
  /** Cuándo queda libre el primer operador: hasta entonces están todos ocupados. */
  freeAt: number;
  outcome: WaitingOutcome;
  reason: string;
  escalation: { risks: RiskTag[]; severity5: boolean } | null;
  /** Puesto en la cola humana al pasar a ella (1 = la primera); null si se cierra sin operador. */
  queuePosition: number | null;
  /** Cuándo la coge un operador; null si se cierra sin operador. */
  operatorAt: number | null;
  script: WaitingScript;
}

export interface RoomRun {
  operators: number;
  withAgent: boolean;
  /** Segundos hasta que la coge un operador; null si la cerró el asistente sin operador. */
  wait: Record<string, number | null>;
  /** Llamadas que llegan con todos los operadores ocupados, en orden de llegada. */
  waited: string[];
  /** Llamadas que atiende el asistente (vacío sin agente de espera). */
  attentions: Attention[];
  /** Tiempo total de operador ocupado. */
  operatorSeconds: number;
}

const cost = (c: SimCall) => (c.first ? NEW_CALL_SECONDS : DUPLICATE_SECONDS);
const rank = (c: SimCall) => (c.first ? 0 : 1);

/**
 * Sala con `operators` operadores, con o sin agente de espera. Sin agente es exactamente la simulación
 * «con copiloto» de `lib/metrics.ts` (test). Con agente, cada llamada que llega con todos ocupados la
 * atiende el asistente desde que llega: las escaladas pasan por delante en la cola humana (entre ellas,
 * el orden del copiloto), los duplicados cerrados no ocupan a nadie y el resto sigue en la cola igual.
 */
export function simulateRoom(calls: readonly WaitingCall[], operators: number, withAgent: boolean): RoomRun {
  const n = Math.max(1, Math.floor(operators));
  const sorted = [...calls].sort((a, b) => a.t - b.t).map((c, ord) => ({ c, ord, escalated: false }));
  type Entry = (typeof sorted)[number];
  const before = (a: Entry, b: Entry) =>
    Number(b.escalated) - Number(a.escalated) ||
    rank(a.c) - rank(b.c) ||
    b.c.extraction.severity - a.c.extraction.severity ||
    a.c.t - b.c.t ||
    a.ord - b.ord;

  const free = Array<number>(n).fill(0);
  const minFree = () => Math.min(...free);
  const queue: Entry[] = [];
  const wait: Record<string, number | null> = {};
  const waited: string[] = [];
  const attentions: Attention[] = [];
  const byId = new Map<string, Attention>();
  /** Emergencias de las que un operador ya ha cogido alguna llamada. */
  const handled = new Set<string>();
  let operatorSeconds = 0;

  /** El operador que antes queda libre coge la primera de la cola en `now`. */
  const take = (now: number) => {
    queue.sort(before);
    const e = queue.shift()!;
    const k = free.indexOf(minFree());
    wait[e.c.id] = now - e.c.t;
    free[k] = now + cost(e.c);
    operatorSeconds += cost(e.c);
    handled.add(e.c.incidentId);
    const att = byId.get(e.c.id);
    if (att) att.operatorAt = now;
  };

  let i = 0;
  while (i < sorted.length) {
    const t = sorted[i].c.t;
    // Los operadores que quedan libres antes de t cogen lo que hay en cola.
    while (queue.length && minFree() < t) take(minFree());
    const arrivals: Entry[] = [];
    while (i < sorted.length && sorted[i].c.t === t) arrivals.push(sorted[i++]);
    queue.push(...arrivals);
    // Los libres en t cogen la mejor de la cola (lo que llega en t compite con lo que esperaba).
    while (queue.length && minFree() <= t) take(t);
    // Lo que acaba de llegar y no ha cogido nadie tendría que esperar: ahí entra el asistente.
    for (const e of arrivals) {
      if (!queue.includes(e)) continue;
      waited.push(e.c.id);
      if (!withAgent) continue;
      const tri = triage(e.c);
      if (tri.outcome === "agrupada") {
        queue.splice(queue.indexOf(e), 1);
        wait[e.c.id] = null;
      } else if (tri.outcome === "escalada") e.escalated = true;
      queue.sort(before);
      const att: Attention = {
        callId: e.c.id,
        t: e.c.t,
        lang: e.c.lang,
        incidentId: e.c.incidentId,
        decision: e.c.decision,
        freeAt: minFree(),
        outcome: tri.outcome,
        reason: tri.reason,
        escalation: tri.outcome === "escalada" ? { risks: tri.vital, severity5: tri.severity5 } : null,
        queuePosition: tri.outcome === "agrupada" ? null : queue.indexOf(e) + 1,
        operatorAt: null,
        script: waitingScript({
          lang: e.c.lang,
          outcome: tri.outcome,
          // Una zona gris abre su propio incidente provisional: nadie lo ha cogido todavía.
          operatorOnIt: e.c.decision === "merge" && handled.has(e.c.incidentId),
          type: e.c.incidentType,
          risks: e.c.incidentRisks,
        }),
      };
      attentions.push(att);
      byId.set(att.callId, att);
    }
  }
  while (queue.length) take(minFree());
  return { operators: n, withAgent, wait, waited, attentions, operatorSeconds };
}

// ───────────────────────────── Indicadores ─────────────────────────────

export interface RoomIndicators {
  /** Llamadas que llegan con todos los operadores ocupados. */
  waited: number;
  /** De ellas, las que esperan sin que nadie les atienda (sin agente, todas; con agente, ninguna). */
  waitedAlone: number;
  attendedByAgent: number;
  resolvedWithoutOperator: number;
  escalated: number;
  /** Atendidas por el asistente que siguen en la cola humana sin escalar. */
  queued: number;
  operatorSeconds: number;
  /** Llamada crítica (`criticalCall` de `lib/metrics.ts`) y su espera hasta un operador. */
  critical: { id: string; wait: number | null } | null;
  /** Espera media hasta un operador de las emergencias nuevas. */
  meanNewWait: number | null;
}

export interface WaitingReport {
  simulation: true;
  assumptions: string[];
  operators: number;
  /** Id de la llamada crítica o null. */
  critical: string | null;
  sin: RoomIndicators;
  con: RoomIndicators;
  /** Llamadas que atiende el asistente, en orden de llegada. */
  attentions: Attention[];
}

export const WAITING_ASSUMPTIONS: readonly string[] = [
  `Simulación con supuestos declarados, no datos reales: ${NEW_CALL_SECONDS} s de operador por llamada nueva y ${DUPLICATE_SECONDS} s por repetida, los mismos de la franja de sala de la consola (lib/metrics.ts).`,
  "Sin agente de espera la cola es la del copiloto: primero las emergencias nuevas, por gravedad.",
  "El asistente solo atiende llamadas que llegan con todos los operadores ocupados, y puede atender varias a la vez.",
  "Con agente de espera escalan con prioridad en la cola humana todas las llamadas con riesgo vital o gravedad 5, incluidos los duplicados; los duplicados que cierra no ocupan a ningún operador y el resto cuesta lo mismo que sin asistente.",
];

function indicators(room: RoomRun, calls: readonly WaitingCall[], critical: SimCall | undefined): RoomIndicators {
  const count = (o: WaitingOutcome) => room.attentions.filter((a) => a.outcome === o).length;
  const firstWaits = calls.filter((c) => c.first).map((c) => room.wait[c.id]).filter((w): w is number => typeof w === "number");
  return {
    waited: room.waited.length,
    waitedAlone: room.waited.length - room.attentions.length,
    attendedByAgent: room.attentions.length,
    resolvedWithoutOperator: count("agrupada"),
    escalated: count("escalada"),
    queued: count("en_cola"),
    operatorSeconds: room.operatorSeconds,
    critical: critical ? { id: critical.id, wait: room.wait[critical.id] ?? null } : null,
    meanNewWait: firstWaits.length ? firstWaits.reduce((a, w) => a + w, 0) / firstWaits.length : null,
  };
}

/** Los mismos indicadores con y sin agente de espera, con `operators` operadores. */
export function compareWaiting(calls: readonly WaitingCall[], operators: number): WaitingReport {
  const sin = simulateRoom(calls, operators, false);
  const con = simulateRoom(calls, operators, true);
  const crit = criticalCall([...calls]);
  return {
    simulation: true,
    assumptions: [...WAITING_ASSUMPTIONS],
    operators: con.operators,
    critical: crit?.id ?? null,
    sin: indicators(sin, calls, crit),
    con: indicators(con, calls, crit),
    attentions: con.attentions,
  };
}

/** `--operadores N`: entero de 1 a `MAX_OPERATORS`; sin la opción, el de la consola. */
export function parseOperators(value: string | undefined): { ok: true; value: number } | { ok: false; error: string } {
  if (value === undefined) return { ok: true, value: DEFAULT_OPERATORS };
  const n = /^\d+$/.test(value.trim()) ? Number(value.trim()) : NaN;
  if (!Number.isInteger(n) || n < 1 || n > MAX_OPERATORS) {
    return { ok: false, error: `Número de operadores no válido: «${value}». Usa un entero de 1 a ${MAX_OPERATORS} (p. ej. --operadores ${DEFAULT_OPERATORS}).` };
  }
  return { ok: true, value: n };
}
