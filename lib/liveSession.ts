import { consoleReducer, initialConsoleState, type AuditEntry, type ConsoleState, type Reply } from "@/lib/consoleMode";
import type { Aml, Decision, ProcessResult } from "@/lib/types";
import { INCIDENT_TYPES, RISK_TAGS } from "@/lib/types";
import { isPublicCallEvent } from "@/lib/publicCall";
import type { Incident } from "@/lib/engine";

const VERSION = 1;
const CALL_CAP = 300;
const HISTORY_CAP = 4 * CALL_CAP;
export const liveSessionKey = (relayUrl: string) => `copiloto112.liveSession.v${VERSION}:${relayUrl}`;

// El motor asigna IDs secuenciales y las decisiones apuntan a esos IDs. Reproducir solo las
// entradas retenidas cambiaría IDs, enlaces ámbar y agregados. Guardamos un checkpoint acotado,
// sin estado de simulación, efectos, propuestas ni copias redundantes del resultado por llamada.
export function serializeLiveSession(state: ConsoleState): string {
  const s = state.mode === "live" ? state : state.saved.live;
  const empty = { version: VERSION, mode: state.mode };
  if (!s?.arrived.length) return JSON.stringify(empty);
  const solved = new Set(s.archived.flatMap(({ incident }) => incident.callIds));
  const excess = Math.max(0, s.arrived.length - CALL_CAP);
  const dropped = new Set([...s.arrived.filter((id) => solved.has(id)), ...s.arrived.filter((id) => !solved.has(id))].slice(0, excess));
  const calls = s.arrived.filter((id) => !dropped.has(id)).map((id) => {
    const { t, aml } = s.live[id];
    const result = s.recs[id].result!;
    const decision = { ...result.decision, candidates: result.decision.candidates.slice(0, CALL_CAP) };
    return { id, t, aml, result: { ...result, decision } };
  });
  const trim = (inc: Incident): Incident => ({
    ...inc,
    callIds: inc.callIds.filter((id) => !dropped.has(id)),
    points: inc.points.filter((_, n) => !dropped.has(inc.callIds[n])),
    alerts: inc.alerts.filter((a) => !dropped.has(a.callId)),
  });
  const open = s.engine.incidents.map(trim);
  const active = new Set(open.filter((i) => i.callIds.length).map((i) => i.id));
  // If all calls of an open incident were evicted, retain its stub only while a pending question needs it.
  const linked = new Set(open.filter((i) => active.has(i.id) && i.provisional).map((i) => i.linkedTo));
  const incidents = open.filter((i) => active.has(i.id) || linked.has(i.id))
    .map((i) => i.callIds.length ? i : { ...i, provisional: false, linkedTo: undefined });
  const archived = s.archived.map(({ incident, at }) => ({ incident: trim(incident), at })).filter((a) => a.incident.callIds.length);
  const incidentIds = new Set([...incidents, ...archived.map((a) => a.incident)].map((i) => i.id));
  return JSON.stringify({
    ...empty, calls, incidents, archived, clock: s.clock, nextId: s.engine.nextId,
    selected: s.selected && active.has(s.selected) ? s.selected : null,
    audit: s.audit.filter((a) => !a.callId || !dropped.has(a.callId)).slice(-HISTORY_CAP),
    replies: s.replies.filter((r) => incidentIds.has(r.incidentId)).slice(-HISTORY_CAP),
  });
}

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === "string";
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const bool = (v: unknown): v is boolean => typeof v === "boolean";
const incId = (v: unknown): v is string => str(v) && /^INC-\d+$/.test(v);
const risk = (v: unknown): boolean => (RISK_TAGS as readonly unknown[]).includes(v);
const list = (v: unknown, item: (x: unknown) => boolean, max = HISTORY_CAP): v is unknown[] =>
  Array.isArray(v) && v.length <= max && v.every(item);
const point = (v: unknown): boolean => object(v) && num(v.lat) && num(v.lng) && num(v.acc) && v.acc >= 0;
const decision = (v: unknown): v is Decision => object(v) &&
  (v.action === "new" ? v.incidentId === undefined || incId(v.incidentId) : (v.action === "ask" || v.action === "merge") && incId(v.incidentId)) &&
  num(v.score) && str(v.reason) && list(v.candidates, (c) => object(c) && incId(c.incidentId) &&
    num(c.score) && num(c.distance) && object(c.parts) && num(c.parts.spatial) && num(c.parts.type) && num(c.parts.text));

interface StoredCall { id: string; t: number; aml: Aml; result: ProcessResult }
function storedCall(v: unknown): v is StoredCall {
  if (!object(v) || !num(v.t) || !object(v.result)) return false;
  const r = v.result;
  // Comparte los límites y vocabularios que se aplican al recibir la llamada por SSE.
  return v.id === r.callId && isPublicCallEvent({
    id: v.id, receivedAt: "1970-01-01", durationS: 0, language: r.language,
    transcript: r.transcript, translation_en: null, extraction: r.extraction,
    location: { place: null, known: false, aml: v.aml }, timings: r.timings,
  }) && object(r.timings) && num(r.timings.llmMs) && object(r.engine) && str(r.engine.stt) && str(r.engine.llm) && decision(r.decision);
}

function incident(v: unknown): v is Incident {
  return object(v) && incId(v.id) && (INCIDENT_TYPES as readonly unknown[]).includes(v.type) &&
    list(v.points, point, CALL_CAP) && list(v.callIds, str, CALL_CAP) && v.callIds.length === v.points.length &&
    list(v.keywords, str) && list(v.locations, str) && list(v.risks, risk) && str(v.summary) &&
    num(v.severity) && num(v.people) && num(v.createdAt) && num(v.lastCallAt) && (v.lastNewInfoAt === null || num(v.lastNewInfoAt)) &&
    bool(v.provisional) && (v.provisional ? incId(v.linkedTo) : v.linkedTo === undefined) && bool(v.attended) &&
    list(v.alerts, (a) => object(a) && str(a.callId) && num(a.t) && list(a.risks, risk), CALL_CAP);
}

const auditKinds: AuditEntry["kind"][] = ["fusion_auto", "incidente_nuevo", "consulta", "operador_mismo", "operador_distinto", "separar", "respuesta", "solucionada", "reabierta"];
const audit = (v: unknown): v is AuditEntry => object(v) && num(v.t) && str(v.detail) &&
  (v.callId === undefined || str(v.callId)) && (v.incidentId === undefined || incId(v.incidentId)) && auditKinds.includes(v.kind as AuditEntry["kind"]);
const reply = (v: unknown): v is Reply => object(v) && incId(v.incidentId) && num(v.t) && str(v.lang) && str(v.es) && str(v.tr);

export function restoreLiveSession(raw: string | null): ConsoleState {
  const sim = initialConsoleState();
  try {
    const v: unknown = JSON.parse(raw ?? "null");
    if (!object(v) || v.version !== VERSION || (v.mode !== "sim" && v.mode !== "live")) return sim;
    const live = consoleReducer(sim, { type: "mode", mode: "live" });
    if (Object.keys(v).length === 2) return v.mode === "sim" ? sim : live;
    if (!num(v.clock) || v.clock < 0 || !num(v.nextId) || !Number.isSafeInteger(v.nextId) || v.nextId < 1 ||
      !list(v.calls, storedCall, CALL_CAP) || !list(v.incidents, incident, CALL_CAP * 2) ||
      !list(v.archived, (a) => object(a) && incident(a.incident) && num(a.at), CALL_CAP) ||
      !list(v.audit, audit) || !list(v.replies, reply) || !(v.selected === null || incId(v.selected))) return sim;
    const calls = v.calls as StoredCall[];
    const incidents = v.incidents as Incident[];
    const archived = v.archived as ConsoleState["archived"];
    const all = [...incidents, ...archived.map((a) => a.incident)];
    const ids = new Set(calls.map((c) => c.id));
    const incidentIds = new Set(all.map((i) => i.id));
    const open = new Set(incidents.map((i) => i.id));
    const assignment = all.flatMap((i) => i.callIds.map((id) => [id, i.id] as const));
    if (!ids.size || ids.size !== calls.length || incidentIds.size !== all.length || assignment.length !== ids.size ||
      new Set(assignment.map(([id]) => id)).size !== ids.size || assignment.some(([id]) => !ids.has(id)) ||
      all.some((i) => Number(i.id.slice(4)) >= (v.nextId as number) || (i.provisional && (!open.has(i.linkedTo!) || i.id === i.linkedTo))) ||
      (v.selected !== null && !open.has(v.selected))) return sim;
    const restored: ConsoleState = {
      ...live, clock: v.clock, selected: v.selected, arrived: calls.map((c) => c.id),
      archived, audit: v.audit as AuditEntry[], replies: v.replies as Reply[],
      engine: { incidents, nextId: v.nextId, assignment: Object.fromEntries(assignment), decisions: Object.fromEntries(calls.map((c) => [c.id, c.result.decision])) },
      calls: Object.fromEntries(calls.map(({ id, t, aml, result }) => [id, { id, t, aml, extraction: result.extraction }])),
      live: Object.fromEntries(calls.map(({ id, t, aml, result }) => [id, { id, t, aml, lang: result.language, transcript: result.transcript, phone: "Público (QR)", live: true }])),
      recs: Object.fromEntries(calls.map(({ id, t, result }) => [id, { id, t, status: "done", result }])),
    };
    if (v.mode === "live") return restored;
    const liveSnapshot = consoleReducer(restored, { type: "mode", mode: "sim" }).saved.live;
    return { ...sim, saved: { live: liveSnapshot } };
  } catch {
    return sim;
  }
}

export function loadLiveSession(store: Pick<Storage, "getItem">, relayUrl: string): ConsoleState {
  try { return restoreLiveSession(store.getItem(liveSessionKey(relayUrl))); }
  catch { return initialConsoleState(); }
}

export function saveLiveSession(store: Pick<Storage, "setItem">, relayUrl: string, s: ConsoleState, report: { warned: boolean; warn: (message: string) => void }): string | undefined {
  try {
    const serialized = serializeLiveSession(s);
    store.setItem(liveSessionKey(relayUrl), serialized);
    return serialized;
  }
  catch {
    if (!report.warned) {
      report.warned = true;
      report.warn("No se pudo guardar la sesión en directo en este navegador.");
    }
  }
}
