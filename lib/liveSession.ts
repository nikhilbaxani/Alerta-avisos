import { consoleReducer, initialConsoleState, type AuditEntry, type ConsoleState, type Reply } from "@/lib/consoleMode";
import type { Aml, Decision, ProcessResult } from "@/lib/types";
import { INCIDENT_TYPES, RISK_TAGS } from "@/lib/types";
import { isPublicCallEvent, isRelayEpoch } from "@/lib/publicCall";
import type { Incident } from "@/lib/engine";
import { ACTION_POLICY, ACTION_TOOLS, CITY_REASONS, RESOURCE_SERVICES, SMS_PHRASE_IDS, UTILITY_CHANNELS, actionIncidents, actionKey, canApprove, type ActionTool, type AgentAction } from "@/lib/actions";
import { DUPLICATE_PHRASE_IDS } from "@/lib/phrases";

const VERSION = 1;
const CALL_CAP = 300;
const HISTORY_CAP = 4 * CALL_CAP;
const ACTION_CAP = 12 * CALL_CAP;
export const liveSessionKey = (relayUrl: string) => `copiloto112.liveSession.v${VERSION}:${relayUrl}`;

// El motor asigna IDs secuenciales y las decisiones apuntan a esos IDs. Reproducir solo las
// entradas retenidas cambiaría IDs, enlaces ámbar y agregados. Guardamos un checkpoint acotado,
// sin estado de simulación, efectos ni copias redundantes del resultado por llamada.
export function serializeLiveSession(state: ConsoleState): string {
  const s = state.mode === "live" ? state : state.saved.live;
  const empty = { version: VERSION, mode: state.mode, relayEpoch: s?.relayEpoch };
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
    actions: s.actions.filter((a) => actionIncidents(a).every((id) => incidentIds.has(id))).slice(-ACTION_CAP)
      .map((a) => ({ ...a, evidence: { ...a.evidence, callIds: a.evidence.callIds.filter((id) => !dropped.has(id)) } })),
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

const auditKinds: AuditEntry["kind"][] = ["fusion_auto", "incidente_nuevo", "consulta", "operador_mismo", "operador_distinto", "separar", "respuesta", "solucionada", "reabierta", "accion_auto", "accion_aprobada", "accion_descartada"];
const audit = (v: unknown): v is AuditEntry => object(v) && num(v.t) && str(v.detail) &&
  (v.callId === undefined || str(v.callId)) && (v.incidentId === undefined || incId(v.incidentId)) && auditKinds.includes(v.kind as AuditEntry["kind"]);
const reply = (v: unknown): v is Reply => object(v) && incId(v.incidentId) && num(v.t) && str(v.lang) && str(v.es) && str(v.tr);

const oneOf = (values: readonly string[], v: unknown): boolean => str(v) && values.includes(v);
const nonnegative = (v: unknown): v is number => num(v) && v >= 0;
const role = (v: unknown): v is "operador" | "coordinador" => v === "operador" || v === "coordinador";
const position = (v: unknown): boolean => object(v) && num(v.lat) && num(v.lng);
const callTarget = (v: Record<string, unknown>): boolean => str(v.llamada) && str(v.idioma) && (v.telefono === null || str(v.telefono));

function actionArgs(tool: ActionTool, v: unknown, incidentId: string, destination: string): boolean {
  if (!object(v)) return false;
  switch (tool) {
    case "proponer_recursos":
      return oneOf(RESOURCE_SERVICES, v.servicio) && destination === v.servicio && nonnegative(v.personas) && num(v.gravedad) && v.gravedad >= 1 && v.gravedad <= 5;
    case "sms_al_llamante":
      return callTarget(v) && list(v.frases, (f) => oneOf(SMS_PHRASE_IDS, f), SMS_PHRASE_IDS.length) && v.frases.length > 0 && str(v.texto) && str(v.texto_es);
    case "avisar_distribuidora":
      return oneOf(UTILITY_CHANNELS, v.canal) && destination === v.canal && (v.posicion === null || position(v.posicion)) && nonnegative(v.personas);
    case "aviso_ayuntamiento":
      return oneOf(CITY_REASONS, v.motivo) && destination === v.motivo && (v.posicion === null || position(v.posicion)) && bool(v.via_cortada);
    case "devolver_llamada":
      return callTarget(v) && str(v.noticia) && v.motivo === "sin_respuesta";
    case "sms_duplicado":
      return callTarget(v) && str(v.telefono) && oneOf(DUPLICATE_PHRASE_IDS, v.frase) && str(v.texto) && str(v.texto_es) &&
        list(v.revisar, risk, RISK_TAGS.length) && v.perdida === undefined;
    case "proponer_es_alert":
      return object(v.zona) && v.zona.id === incidentId && str(v.zona.nombre) && position(v.zona.centro) &&
        nonnegative(v.zona.referencia_m) && nonnegative(v.zona.radio_m) && list(v.incidentes, incId, CALL_CAP) &&
        v.incidentes.length >= 2 && str(v.texto_es) && str(v.texto_en);
  }
}

function storedAction(v: unknown): v is AgentAction {
  if (!object(v) || !oneOf(ACTION_TOOLS, v.tool) || v.origin !== "reglas" || !str(v.incidentId) || !str(v.destination) ||
    !str(v.reason) || !nonnegative(v.proposedAt) || !object(v.evidence) || !oneOf(INCIDENT_TYPES, v.evidence.type) ||
    !list(v.evidence.risks, risk, RISK_TAGS.length) || !list(v.evidence.callIds, str, CALL_CAP)) return false;
  const tool = v.tool as ActionTool;
  const policy = ACTION_POLICY[tool];
  if (v.policy !== policy || v.key !== actionKey(v.incidentId, tool, v.destination) ||
    !(tool === "proponer_es_alert" ? /^ZONA-[A-Z0-9-]+$/.test(v.incidentId) : incId(v.incidentId)) ||
    !actionArgs(tool, v.args, v.incidentId, v.destination)) return false;

  if (v.status === "propuesta") return policy !== "automatica" && v.approval === null && v.receipt === null && v.discarded === null;
  if (v.status === "descartada") {
    return policy !== "automatica" && v.approval === null && v.receipt === null && object(v.discarded) &&
      (v.discarded.by === "sistema" || (role(v.discarded.by) && canApprove(policy, v.discarded.by))) &&
      nonnegative(v.discarded.at) && v.discarded.at >= v.proposedAt && str(v.discarded.reason);
  }
  // En la consola, aprobación y despacho se registran en la misma transición.
  if (v.status !== "enviada" || v.discarded !== null || !object(v.approval) || !nonnegative(v.approval.at) || v.approval.at < v.proposedAt ||
    !(policy === "automatica" ? v.approval.by === "automatica" && v.approval.at === v.proposedAt : role(v.approval.by) && canApprove(policy, v.approval.by)) ||
    !(v.approval.batch === undefined || (tool === "sms_duplicado" && v.approval.batch === true))) return false;
  return object(v.receipt) && v.receipt.simulated === true && v.receipt.at === v.approval.at &&
    str(v.receipt.service) && str(v.receipt.reference) && /^[A-Z]+-[A-F0-9]{6}$/.test(v.receipt.reference) && str(v.receipt.detail);
}

export function restoreLiveSession(raw: string | null): ConsoleState {
  const sim = initialConsoleState();
  try {
    const v: unknown = JSON.parse(raw ?? "null");
    if (!object(v) || v.version !== VERSION || (v.mode !== "sim" && v.mode !== "live")) return sim;
    const base = isRelayEpoch(v.relayEpoch) ? consoleReducer(sim, { type: "relayEpoch", epoch: v.relayEpoch }) : sim;
    const live = consoleReducer(base, { type: "mode", mode: "live" });
    if (Object.keys(v).every((key) => key === "version" || key === "mode" || key === "relayEpoch")) return v.mode === "sim" ? base : live;
    if (!num(v.clock) || v.clock < 0 || !num(v.nextId) || !Number.isSafeInteger(v.nextId) || v.nextId < 1 ||
      !list(v.calls, storedCall, CALL_CAP) || !list(v.incidents, incident, CALL_CAP * 2) ||
      !list(v.archived, (a) => object(a) && incident(a.incident) && num(a.at), CALL_CAP) ||
      !list(v.audit, audit) || !list(v.replies, reply) || !(v.selected === null || incId(v.selected)) ||
      (v.actions !== undefined && !list(v.actions, storedAction, ACTION_CAP))) return sim;
    // Los snapshots v1 anteriores a S33 no guardaban acciones.
    const actions = (v.actions ?? []) as AgentAction[];
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
      (v.selected !== null && !open.has(v.selected)) || new Set(actions.map((a) => a.key)).size !== actions.length ||
      actions.some((a) => actionIncidents(a).some((id) => !incidentIds.has(id) ||
        (a.status === "propuesta" && (!open.has(id) || incidents.some((i) => i.id === id && i.provisional)))))) return sim;
    const restored: ConsoleState = {
      ...live, clock: v.clock, selected: v.selected, arrived: calls.map((c) => c.id),
      archived, actions, audit: v.audit as AuditEntry[], replies: v.replies as Reply[],
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
