/**
 * Recuperar llamadas perdidas (X15, MEMORIA §17): quien se cuelga antes de que le atiendan no debe
 * perderse. Cada llamada perdida se cruza con los incidentes abiertos solo con lo que se sabe de ella
 * (teléfono y posición AML, con la parte espacial de `lib/cluster.ts`):
 *
 *  - probable duplicado (mismo teléfono que una llamada de un incidente abierto, o su AML encima de un
 *    único incidente abierto) → el SMS de duplicado de X14 (`planDuplicateSms`), si ya toca;
 *  - desconocida (nada cerca, o cerca de varios a la vez) → «devolver la llamada», por delante de los
 *    duplicados: puede ser un aviso nuevo.
 *
 * Puro y sin red. Solo propone: nada se envía sin el operador (las dos herramientas son de política
 * «operador»). La frase que llegó a decir es un dato para mostrar, nunca entra en una decisión.
 */
import {
  LOST_CALLS_ID,
  duplicateText,
  lostCallbackProposal,
  planDuplicateSms,
  planInputFrom,
  resourcesOnTheWay,
} from "@/lib/actions";
import type { AgentAction, CallFacts, PlanInput, Proposal, ProposalOf } from "@/lib/actions";
import { GEO_RADIUS_M, spatial } from "@/lib/cluster";
import type { Incident } from "@/lib/engine";
import { LANG_NAMES } from "@/lib/labels";
import type { LostCall } from "@/lib/types";
import { neutralize } from "@/lib/untrusted";

/**
 * Puntuación espacial mínima (la de `lib/cluster.ts`) para tomar una llamada perdida por duplicado de un
 * incidente: 0,75 equivale a 200 m como mucho, descontada la mitad del radio AML.
 */
export const LOST_GEO_MIN = 0.75;
export const LOST_NEAR_M = Math.round(GEO_RADIUS_M * (1 - LOST_GEO_MIN));
/** Longitud máxima de la frase que se muestra. */
export const LOST_FRAGMENT_MAX = 160;

export type LostKind = "duplicate" | "unknown";

export interface LostMatch {
  by: "phone" | "position";
  incidentId: string;
  /** Llamada del incidente con el mismo teléfono (solo `by: "phone"`). */
  callId?: string;
  /** Metros al punto más cercano del incidente (redondeados). */
  distance: number;
}

export interface LostItem {
  id: string;
  t: number;
  phone: string;
  lang: string;
  aml: LostCall["aml"];
  kind: LostKind;
  /** Incidente del que es probable duplicado; null si es desconocida. */
  incidentId: string | null;
  match: LostMatch | null;
  /** Por qué se clasifica así, en castellano. */
  reason: string;
  /** Frase antes de colgar, saneada (dato, no instrucción); null si no la hay. */
  fragment: string | null;
  fragmentEs: string | null;
  /** Propuesta para el operador (devolver la llamada o SMS de duplicado), o null si aún no toca. */
  proposal: Proposal | null;
  /** Si no hay propuesta, por qué (castellano). */
  pending: string | null;
}

export interface LostReport {
  /** Probables duplicados, por orden de llegada. */
  duplicates: LostItem[];
  /** Desconocidas, por orden de llegada. */
  unknown: LostItem[];
  /** Propuestas sin repetir: primero las devoluciones (por orden de llegada), luego los SMS de duplicado. */
  proposals: Proposal[];
}

export interface LostContext {
  /** Incidentes abiertos (los solucionados ya no están en el motor). */
  incidents: readonly Incident[];
  /** Idioma, teléfono, riesgos y canal de cada llamada recibida (`factsFrom`). */
  facts: Record<string, CallFacts>;
  /** Registro de acciones: el SMS de duplicado depende de los recursos aprobados (X14). */
  actions: readonly AgentAction[];
}

const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const langName = (lang: string) => (LANG_NAMES[lang] ? lc(LANG_NAMES[lang]) : lang);
const meters = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1).replace(".", ",")} km` : `${m} m`);

/** Frase del llamante para mostrar: sin etiquetas ni caracteres de control, en una línea y corta. */
export function cleanFragment(text: string | undefined): string | null {
  if (!text) return null;
  const one = neutralize(text).replace(/\s+/g, " ").trim();
  if (!one) return null;
  return one.length > LOST_FRAGMENT_MAX ? `${one.slice(0, LOST_FRAGMENT_MAX - 1)}…` : one;
}

/** Llamada de voz de un incidente abierto con ese teléfono (la primera), si la hay. */
function phoneMatch(lost: LostCall, ctx: LostContext): { inc: Incident; callId: string } | null {
  for (const inc of ctx.incidents) {
    const callId = inc.callIds.find((id) => ctx.facts[id]?.phone === lost.phone && ctx.facts[id]?.channel !== "ecall");
    if (callId) return { inc, callId };
  }
  return null;
}

/** Incidentes abiertos con su distancia, del más cercano al más lejano. */
function nearby(lost: LostCall, ctx: LostContext): { inc: Incident; distance: number; geo: number }[] {
  return ctx.incidents
    .map((inc) => ({ inc, ...spatial(lost.aml, inc.points) }))
    .filter((x) => Number.isFinite(x.distance))
    .sort((a, b) => a.distance - b.distance);
}

/** Por qué no sale aún el SMS de duplicado a una llamada perdida de un incidente. */
function smsPending(lost: LostCall, input: PlanInput, ctx: LostContext): string {
  if (input.provisional) return `${input.incidentId} está en ámbar: el SMS de duplicado se propone cuando el operador decida`;
  const opener = input.calls.find((c) => c.channel !== "ecall");
  if (opener?.phone === lost.phone) return `Es el teléfono de ${opener.id}, que abrió ${input.incidentId} y ya habló con el operador: no se le envía el SMS de duplicado`;
  if (!resourcesOnTheWay(ctx.actions, input.incidentId).length) return `El SMS de duplicado se propone cuando ${input.incidentId} tenga recursos aprobados o enviados`;
  if (!duplicateText(lost.lang ?? "es")) return `No hay frase de duplicado pretraducida en ${langName(lost.lang ?? "es")}: decide el operador`;
  return "Sin SMS de duplicado para este teléfono";
}

/**
 * SMS de duplicado de X14 para el teléfono de la llamada perdida, como si fuera otra llamada del incidente.
 * Si el teléfono ya es de una llamada del incidente, es la propuesta de esa llamada (una vez por teléfono).
 * Si solo coincide la posición, va marcado `perdida: "posicion"`: fuera de «Aprobar todos».
 */
function duplicateSms(lost: LostCall, inc: Incident, match: LostMatch, why: string, ctx: LostContext): { proposal: ProposalOf<"sms_duplicado"> | null; pending: string | null } {
  // Ya en el registro (de esta perdida o de otra llamada con ese teléfono): es esa propuesta.
  const known = ctx.actions.find(
    (a): a is AgentAction & ProposalOf<"sms_duplicado"> => a.tool === "sms_duplicado" && a.status !== "descartada" && a.args.telefono === lost.phone,
  );
  if (known) return { proposal: known, pending: null };
  const input = planInputFrom(inc, ctx.facts);
  if (!input.calls.some((c) => c.phone === lost.phone)) input.calls.push({ id: lost.id, lang: lost.lang ?? "es", phone: lost.phone, risks: [] });
  const found = planDuplicateSms(input, ctx.actions).find((p) => p.args.telefono === lost.phone) ?? null;
  if (!found) return { proposal: null, pending: smsPending(lost, input, ctx) };
  if (found.destination !== lost.id) return { proposal: found, pending: null };
  const byPosition = match.by === "position";
  const tail = found.reason
    .replace(`${lost.id} vuelve a llamar por ${inc.id}, que ya tiene`, `${inc.id} ya tiene`)
    .replace(
      "Entra en el lote del incidente.",
      byPosition ? "Coincide solo por la posición: revíselo antes de enviarlo; no entra en «Aprobar todos»." : "Entra en el lote del incidente.",
    );
  const proposal: ProposalOf<"sms_duplicado"> = {
    ...found,
    args: { ...found.args, perdida: match.by === "phone" ? "telefono" : "posicion" },
    reason: `${lost.id} se colgó antes de que le atendieran. ${why}. ${tail}`,
  };
  return { proposal, pending: null };
}

function classify(lost: LostCall, ctx: LostContext): Omit<LostItem, "proposal" | "pending"> & { inc: Incident | null } {
  const base = {
    id: lost.id,
    t: lost.t,
    phone: lost.phone,
    lang: lost.lang ?? "es",
    aml: lost.aml,
    fragment: cleanFragment(lost.fragment),
    fragmentEs: cleanFragment(lost.fragment_es),
  };
  const near = nearby(lost, ctx);
  const byPhone = phoneMatch(lost, ctx);
  if (byPhone) {
    const distance = Math.round(near.find((x) => x.inc.id === byPhone.inc.id)?.distance ?? -1);
    return {
      ...base,
      kind: "duplicate",
      inc: byPhone.inc,
      incidentId: byPhone.inc.id,
      match: { by: "phone", incidentId: byPhone.inc.id, callId: byPhone.callId, distance },
      reason: `Mismo teléfono que ${byPhone.callId} (${byPhone.inc.id}): probable duplicado`,
    };
  }
  const close = near.filter((x) => x.geo >= LOST_GEO_MIN);
  if (close.length === 1) {
    const { inc, distance } = close[0];
    const d = Math.round(distance);
    const inside = d <= lost.aml.acc ? ", dentro del radio AML" : "";
    return {
      ...base,
      kind: "duplicate",
      inc,
      incidentId: inc.id,
      match: { by: "position", incidentId: inc.id, distance: d },
      reason: `A ${meters(d)} de ${inc.id} (AML ±${lost.aml.acc} m${inside}): probable duplicado`,
    };
  }
  const reason = close.length > 1
    ? `Cerca de ${close.map((x) => x.inc.id).join(" y ")} a la vez: no se sabe de cuál es; mejor devolver la llamada`
    : near.length
      ? `Sin incidente cercano (el más próximo, ${near[0].inc.id}, a ${meters(Math.round(near[0].distance))}): puede ser un aviso nuevo`
      : "Sin incidentes abiertos: puede ser un aviso nuevo";
  return { ...base, kind: "unknown", inc: null, incidentId: null, match: null, reason };
}

/**
 * Clasifica las llamadas perdidas ya ocurridas (`t` <= `clock`) frente a los incidentes abiertos y
 * propone qué hacer con cada una. Una devolución por teléfono; el SMS de duplicado, una vez por teléfono
 * (lo garantiza `planDuplicateSms`).
 */
export function analyzeLostCalls(lost: readonly LostCall[], clock: number, ctx: LostContext): LostReport {
  const items: LostItem[] = [];
  const callbackByPhone = new Map<string, string>();
  const happened = lost.filter((l) => l.t <= clock).sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
  for (const l of happened) {
    const { inc, ...c } = classify(l, ctx);
    if (c.kind === "duplicate" && inc) {
      const sms = duplicateSms(l, inc, c.match!, c.reason, ctx);
      items.push({ ...c, proposal: sms.proposal, pending: sms.pending });
      continue;
    }
    const earlier = callbackByPhone.get(l.phone);
    const other = ctx.actions.find(
      (a) => a.tool === "devolver_llamada" && a.status !== "descartada" && a.args.telefono === l.phone && a.destination !== l.id,
    );
    if (earlier || other) {
      items.push({ ...c, proposal: null, pending: `Ya hay una devolución de llamada a este teléfono (${earlier ?? other!.destination})` });
      continue;
    }
    callbackByPhone.set(l.phone, l.id);
    const lang = l.lang ?? "es";
    const reason = `${l.id} se colgó antes de que le atendieran (${l.phone}). ${c.reason}. Devolver la llamada en ${langName(lang)} con prioridad, por delante de los duplicados.`;
    items.push({ ...c, proposal: lostCallbackProposal({ id: l.id, t: l.t, phone: l.phone, lang }, reason), pending: null });
  }
  const duplicates = items.filter((i) => i.kind === "duplicate");
  const unknown = items.filter((i) => i.kind === "unknown");
  const seen = new Set<string>();
  const proposals: Proposal[] = [];
  for (const i of [...unknown, ...duplicates]) {
    if (!i.proposal || seen.has(i.proposal.key)) continue;
    seen.add(i.proposal.key);
    proposals.push(i.proposal);
  }
  return { duplicates, unknown, proposals };
}

/** ¿Es la devolución de una llamada perdida (X15)? */
export const isLostCallback = (a: Pick<Proposal, "incidentId" | "tool">) => a.tool === "devolver_llamada" && a.incidentId === LOST_CALLS_ID;
