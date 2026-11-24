/**
 * Reproduce un escenario con el motor real, el agente de acciones (`npm run agente`, MEMORIA §16.2) y
 * el agente para quien está en espera (MEMORIA §16.3, `lib/waiting.ts`).
 *
 * Todo es simulación: extracciones `mock`, conectores simulados, un operador simulado que acierta en
 * la zona gris (según `gold`, como `npm run eval`) y aprueba las acciones de operador unos segundos
 * de escenario después, y una sala simulada con N operadores (supuestos de `lib/metrics.ts`).
 * Determinista con el planificador de reglas.
 */
import { ACTION_TOOLS, addProposals, approve, discardOrphans, dispatch, planInputFrom, planRules, toolArgsText, toolService, toolTarget, traceOf } from "@/lib/actions";
import type { ActionTool, AgentAction, CallFacts, PlanInput, PlanIssue, Proposal } from "@/lib/actions";
import { confirmDifferent, confirmSame, initialState, processCall } from "@/lib/engine";
import type { EngineCall, Incident } from "@/lib/engine";
import { LANG_NAMES, RISK_LABELS, TYPE_LABELS } from "@/lib/labels";
import { DUPLICATE_SECONDS, NEW_CALL_SECONDS } from "@/lib/metrics";
import type { SimCall } from "@/lib/metrics";
import type { DecisionAction, IncidentType, RiskTag, Scenario } from "@/lib/types";
import { DEFAULT_OPERATORS, compareWaiting } from "@/lib/waiting";
import type { Attention, RoomIndicators, WaitingCall, WaitingReport } from "@/lib/waiting";

/** Segundos de escenario que tarda el operador simulado en aprobar una acción. */
export const APPROVAL_DELAY_S = 5;

export interface PlanOutcome {
  proposals: Proposal[];
  issues: PlanIssue[];
  warning?: string;
}
export type Planner = (input: PlanInput) => Promise<PlanOutcome>;

/** Planificador por defecto: reglas deterministas, sin red. */
export const rulesPlanner: Planner = async (input) => ({ proposals: planRules(input), issues: [] });

export interface AgentStep {
  t: number;
  callId: string;
  lang: string;
  decision: DecisionAction;
  score: number;
  /** Incidente con el que se comparó en la zona gris. */
  linkedTo: string | null;
  /** Lo que decidió el operador simulado en la zona gris. */
  operator: "mismo" | "distinto" | null;
  incidentId: string;
  incidentType: IncidentType;
  newInfo: RiskTag[];
  /** Claves de las acciones nuevas tras esta llamada. */
  added: string[];
  issues: PlanIssue[];
  warning: string | null;
}

export interface AgentRun {
  scenarioId: string;
  scenarioName: string;
  approvalDelayS: number;
  steps: AgentStep[];
  actions: AgentAction[];
  incidents: Incident[];
  /** Llamadas para la sala simulada (lo de `lib/metrics.ts` más lo que oye el asistente de espera). */
  roomCalls: WaitingCall[];
  /** Agente de espera: sala con y sin él, con `operators` operadores (simulación). */
  waiting: WaitingReport;
}

export interface AgentOptions {
  planner?: Planner;
  approvalDelayS?: number;
  /** Operadores de la sala simulada para el agente de espera (por defecto, los de la consola). */
  operators?: number;
}

export async function runAgent(scenario: Scenario, opts: AgentOptions = {}): Promise<AgentRun> {
  const planner = opts.planner ?? rulesPlanner;
  const delay = opts.approvalDelayS ?? APPROVAL_DELAY_S;
  const operators = opts.operators ?? DEFAULT_OPERATORS;
  const calls = [...scenario.calls].sort((a, b) => a.t - b.t);
  const byId: Record<string, EngineCall> = {};
  const gold: Record<string, string> = {};
  const facts: Record<string, CallFacts> = {};
  for (const c of calls) {
    byId[c.id] = { id: c.id, t: c.t, aml: c.aml, extraction: c.mock };
    gold[c.id] = c.gold;
    facts[c.id] = { lang: c.mock.language, phone: c.phone, risks: c.mock.risks };
  }

  let state = initialState();
  let actions: AgentAction[] = [];
  const queue: { key: string; due: number }[] = [];
  const steps: AgentStep[] = [];
  /** Lo que sabe el sistema de cada llamada al entrar, antes de que decida nadie (para el asistente de espera). */
  const heard: Record<string, Omit<WaitingCall, keyof SimCall | "lang">> = {};

  /** El operador simulado aprueba (y el conector envía) lo que toca hasta `until`. */
  const approveUntil = (until: number) => {
    while (queue.length && queue[0].due <= until) {
      const { key, due } = queue.shift()!;
      const ok = approve(actions, key, "operador", due);
      if (!ok.ok) continue;
      const sent = dispatch(ok.actions, key, due);
      actions = sent.ok ? sent.actions : ok.actions;
    }
  };

  for (const c of calls) {
    approveUntil(c.t);
    const before = state;
    const r = processCall(state, byId[c.id]);
    state = r.state;
    const entered = state.incidents.find((i) => i.id === state.assignment[c.id])!;
    const target = r.decision.action === "merge" ? before.incidents.find((i) => i.id === r.decision.incidentId) : undefined;
    heard[c.id] = {
      decision: r.decision.action,
      newInfo: entered.alerts.find((a) => a.callId === c.id)?.risks ?? [],
      intoProvisional: r.decision.action === "merge" && entered.provisional,
      incidentType: entered.type,
      incidentRisks: [...entered.risks],
      known: target ? { risks: [...target.risks], severity: target.severity } : null,
    };
    let operator: AgentStep["operator"] = null;
    if (r.decision.action === "ask" && r.decision.incidentId) {
      // Operador ideal (como el eval): compara con el gold del incidente enlazado. Nunca es una fusión automática.
      const linked = state.incidents.find((i) => i.id === r.decision.incidentId)!;
      const prov = state.assignment[c.id];
      if (gold[linked.callIds[0]] === c.gold) {
        state = confirmSame(state, prov, byId);
        operator = "mismo";
      } else {
        state = confirmDifferent(state, prov);
        operator = "distinto";
      }
    }
    actions = discardOrphans(actions, state.incidents.map((i) => i.id), c.t);

    const inc = state.incidents.find((i) => i.id === state.assignment[c.id])!;
    const plan = await planner(planInputFrom(inc, facts));
    const res = addProposals(actions, plan.proposals, c.t);
    actions = res.actions;
    // Las de coordinador (X07) no las aprueba el operador simulado: se quedan pendientes.
    for (const a of res.added) if (a.status === "propuesta" && a.policy === "operador") queue.push({ key: a.key, due: c.t + delay });

    steps.push({
      t: c.t,
      callId: c.id,
      lang: facts[c.id].lang,
      decision: r.decision.action,
      score: r.decision.score,
      linkedTo: r.decision.action === "ask" ? (r.decision.incidentId ?? null) : null,
      operator,
      incidentId: inc.id,
      incidentType: inc.type,
      newInfo: inc.alerts.find((a) => a.callId === c.id)?.risks ?? [],
      added: res.added.map((a) => a.key),
      issues: plan.issues,
      warning: plan.warning ?? null,
    });
  }
  approveUntil(Infinity);

  // Sala simulada: «primera de su incidente» con el estado final, como la franja de sala de la consola.
  const roomCalls: WaitingCall[] = calls.map((c) => {
    const inc = state.incidents.find((i) => i.id === state.assignment[c.id])!;
    return {
      id: c.id,
      t: c.t,
      extraction: { severity: c.mock.severity, risks: [...c.mock.risks] },
      incidentId: inc.id,
      first: inc.callIds[0] === c.id,
      lang: facts[c.id].lang,
      ...heard[c.id],
    };
  });

  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    approvalDelayS: delay,
    steps,
    actions,
    incidents: state.incidents,
    roomCalls,
    waiting: compareWaiting(roomCalls, operators),
  };
}

// ───────────────────────────── Resumen ─────────────────────────────

export interface AgentSummary {
  calls: number;
  incidents: number;
  operatorDecisions: number;
  prepared: number;
  byTool: Record<ActionTool, number>;
  byOrigin: { reglas: number; ia_local: number };
  /** Enviadas al momento con registro, sin esperar aprobación. */
  automatic: number;
  /** Aprobadas por una persona (enviadas o a punto de enviarse). */
  approved: number;
  discarded: number;
  pending: number;
}

export function summarize(run: AgentRun): AgentSummary {
  const a = run.actions;
  const byTool = Object.fromEntries(ACTION_TOOLS.map((t) => [t, a.filter((x) => x.tool === t).length])) as Record<ActionTool, number>;
  return {
    calls: run.steps.length,
    incidents: run.incidents.length,
    operatorDecisions: run.steps.filter((s) => s.operator !== null).length,
    prepared: a.length,
    byTool,
    byOrigin: { reglas: a.filter((x) => x.origin === "reglas").length, ia_local: a.filter((x) => x.origin === "ia_local").length },
    automatic: a.filter((x) => x.status === "enviada" && x.approval?.by === "automatica").length,
    approved: a.filter((x) => (x.status === "aprobada" || x.status === "enviada") && x.approval !== null && x.approval.by !== "automatica").length,
    discarded: a.filter((x) => x.status === "descartada").length,
    pending: a.filter((x) => x.status === "propuesta").length,
  };
}

// ───────────────────────────── Texto y JSON ─────────────────────────────

export const SIMULATION_NOTICE = "SIMULACIÓN: extracciones del guion, conectores y acuses simulados y operador simulado; ningún servicio real recibe nada.";

/** T+mm:ss */
export const clock = (t: number) => `T+${String(Math.floor(t / 60)).padStart(2, "0")}:${String(Math.round(t % 60)).padStart(2, "0")}`;
const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const risksText = (rs: RiskTag[]) => rs.map((r) => lc(RISK_LABELS[r])).join(", ");
const langText = (l: string) => (LANG_NAMES[l] ? lc(LANG_NAMES[l]) : l);
const score = (n: number) => n.toFixed(2).replace(".", ",");

function stepLine(s: AgentStep): string {
  const head = `${clock(s.t)}  ${s.callId} (${langText(s.lang)}) → ${s.incidentId}`;
  let what: string;
  if (s.decision === "new") what = `nuevo · ${TYPE_LABELS[s.incidentType]}`;
  else if (s.decision === "merge") what = `fusión (${score(s.score)})`;
  else what = `zona gris con ${s.linkedTo} (${score(s.score)}) → operador (simulado): ${s.operator === "mismo" ? "mismo incidente" : "incidente distinto"}`;
  const info = s.newInfo.length ? ` · información nueva: ${risksText(s.newInfo)}` : "";
  return `${head} · ${what}${info}`;
}

function approvalText(a: AgentAction): string {
  if (!a.approval) return a.status === "descartada" ? "no aprobada" : `pendiente (la aprueba un ${a.policy})`;
  if (a.approval.by === "automatica") return `automática, sin espera y con registro, a ${clock(a.approval.at)}`;
  return `${a.approval.by} (simulado) a ${clock(a.approval.at)}`;
}

function resultText(a: AgentAction): string {
  if (a.status === "enviada" && a.receipt) return `enviada · acuse ${a.receipt.reference} a ${clock(a.receipt.at)} · ${a.receipt.detail}`;
  if (a.status === "descartada" && a.discarded) return `descartada por ${a.discarded.by} a ${clock(a.discarded.at)} · ${a.discarded.reason}`;
  return a.status;
}

function actionBlock(a: AgentAction, n: number): string[] {
  const num = `#${String(n).padStart(2, "0")}`;
  const pad = " ".repeat(num.length);
  const perceived = a.evidence.risks.length ? risksText(a.evidence.risks) : lc(TYPE_LABELS[a.evidence.type]);
  return [
    `  ${num} percepción    ${a.evidence.callIds.join(", ")} · ${perceived}`,
    `  ${pad} razonamiento  ${a.reason}`,
    `  ${pad} herramienta   ${a.tool} → ${toolTarget(a)} · ${toolService(a)} · ${toolArgsText(a)} · origen: ${a.origin === "reglas" ? "reglas" : "IA local"}`,
    `  ${pad} aprobación    ${approvalText(a)}`,
    `  ${pad} resultado     ${resultText(a)}`,
  ];
}

// ───────────────────────────── Agente de espera ─────────────────────────────

/** Duración m:ss. */
export const dur = (s: number) => {
  const t = Math.round(s);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};
const operatorsText = (n: number) => `${n} ${n === 1 ? "operador" : "operadores"}`;
const label = (s: string) => `  ${s.padEnd(20)} `;

function waitingBlock(a: Attention, operators: number): string[] {
  const busy = operators === 1 ? `el operador está ocupado hasta ${clock(a.freeAt)}` : `los ${operators} operadores están ocupados (el primero queda libre a ${clock(a.freeAt)})`;
  const out = [`${label("asistente de espera")}${busy}: lo atiende desde que llega, en ${langText(a.lang)}`];
  if (!a.script.translated) out.push(`${label("aviso")}sin frases pretraducidas en «${a.lang}»: guion en castellano`);
  else if (a.lang !== "es") out.push(`${label(`guion (${langText(a.lang)})`)}«${a.script.text}»`);
  out.push(`${label("guion (castellano)")}«${a.script.textEs}»`);
  const taken = a.operatorAt === null ? "" : ` · la coge un operador a ${clock(a.operatorAt)} (espera ${dur(a.operatorAt - a.t)}, atendida por el asistente mientras tanto)`;
  const place = `puesto ${a.queuePosition} de la cola humana`;
  if (a.outcome === "escalada") out.push(`${label("resultado")}ESCALADA a un operador humano · ${a.queuePosition === 1 ? "pasa la primera de la cola humana" : place}${taken}`);
  else if (a.outcome === "agrupada") out.push(`${label("resultado")}agrupada sin operador en ${a.incidentId} · el asistente la cierra y no ocupa a nadie`);
  else out.push(`${label("resultado")}en cola humana, en su orden · ${place}${taken}`);
  out.push(`${label("motivo")}${a.reason}`);
  return out;
}

/** Resumen del agente de espera: los mismos indicadores con y sin él (simulación de sala). */
export function waitingSummaryLines(w: WaitingReport): string[] {
  const crit = (i: RoomIndicators) => (i.critical && i.critical.wait !== null ? dur(i.critical.wait) : "—");
  const out = [
    `Agente de espera · SIMULACIÓN de sala con ${operatorsText(w.operators)} · supuestos declarados: ${NEW_CALL_SECONDS} s de operador por llamada nueva y ${DUPLICATE_SECONDS} s por repetida (los de la franja de sala de la consola)`,
    `  Llegan con todos los operadores ocupados: sin agente de espera ${w.sin.waited}, que esperan sin que nadie les atienda · con agente ${w.con.waited}, todas atendidas por el asistente desde que llegan`,
    `  Atendidas por el asistente: ${w.con.attendedByAgent} · duplicados resueltos sin operador: ${w.con.resolvedWithoutOperator} · escaladas por riesgo vital: ${w.con.escalated} · siguen en la cola humana: ${w.con.queued}`,
  ];
  if (w.critical) {
    const attended = w.attentions.some((a) => a.callId === w.critical);
    out.push(
      `  Llamada crítica ${w.critical}: la coge un operador a los ${crit(w.sin)} sin agente de espera → ${crit(w.con)} con agente${attended ? " (mientras tanto le atiende el asistente)" : ""}`,
    );
  }
  if (w.sin.meanNewWait !== null && w.con.meanNewWait !== null) {
    out.push(
      `  Espera media de las emergencias nuevas hasta un operador: ${dur(w.sin.meanNewWait)} → ${dur(w.con.meanNewWait)} · tiempo de operador ocupado: ${dur(w.sin.operatorSeconds)} → ${dur(w.con.operatorSeconds)}`,
    );
  }
  out.push("  El asistente nunca sustituye a un operador libre ni decide una zona gris; habla solo con frases fijas pretraducidas.");
  return out;
}

export function summaryLines(run: AgentRun): string[] {
  const s = summarize(run);
  const tools = ACTION_TOOLS.map((t) => `${t} ${s.byTool[t]}`).join(", ");
  return [
    `Resumen · ${run.scenarioName} · SIMULACIÓN`,
    `  ${s.calls} llamadas → ${s.incidents} incidentes · ${s.operatorDecisions} ${s.operatorDecisions === 1 ? "decisión" : "decisiones"} del operador (simulado) en zona gris`,
    `  Acciones preparadas: ${s.prepared} (${tools}) · origen: reglas ${s.byOrigin.reglas}, IA local ${s.byOrigin.ia_local}`,
    `  Automáticas, enviadas al momento con registro: ${s.automatic}`,
    `  Aprobadas por el operador (simulado): ${s.approved} · descartadas: ${s.discarded} · pendientes: ${s.pending}`,
    "  Conectores simulados: ningún servicio real ha recibido nada.",
  ];
}

/** Traza legible: una línea por llamada y, debajo, cada acción nueva con su cadena completa. */
export function formatRun(run: AgentRun, plannerLabel: string): string {
  const byKey = new Map(run.actions.map((a) => [a.key, a]));
  const out: string[] = [
    `Agente 112 · traza del agente de acciones · ${run.scenarioName}`,
    SIMULATION_NOTICE,
    `Planificador: ${plannerLabel} · el operador simulado acierta en la zona gris y aprueba a los ${run.approvalDelayS} s`,
    `Sala simulada: ${operatorsText(run.waiting.operators)} · el asistente de espera solo atiende llamadas que llegan con todos ocupados (supuestos: ${NEW_CALL_SECONDS} s por llamada nueva, ${DUPLICATE_SECONDS} s por repetida)`,
    "",
  ];
  const attended = new Map(run.waiting.attentions.map((a) => [a.callId, a]));
  let n = 0;
  for (const s of run.steps) {
    out.push(stepLine(s));
    const a = attended.get(s.callId);
    if (a) out.push(...waitingBlock(a, run.waiting.operators));
    if (s.warning) out.push(`  aviso: ${s.warning}`);
    for (const i of s.issues) out.push(`  IA local, ${i.outcome}: ${i.tool} · ${i.reason}`);
    for (const k of s.added) out.push(...actionBlock(byKey.get(k)!, ++n));
  }
  out.push("", ...summaryLines(run), "", ...waitingSummaryLines(run.waiting));
  return out.join("\n");
}

const round1 = (x: number | null) => (x === null ? null : Math.round(x * 10) / 10);

/** Agente de espera en JSON (claves en castellano). */
export function waitingToJson(w: WaitingReport) {
  const ind = (i: RoomIndicators) => ({
    lleganConTodosOcupados: i.waited,
    esperanSinQueNadieLesAtienda: i.waitedAlone,
    atendidasPorElAsistente: i.attendedByAgent,
    duplicadosResueltosSinOperador: i.resolvedWithoutOperator,
    escaladas: i.escalated,
    siguenEnColaHumana: i.queued,
    segundosDeOperador: i.operatorSeconds,
    llamadaCritica: i.critical ? { llamada: i.critical.id, segundosHastaOperador: i.critical.wait } : null,
    esperaMediaEmergenciasNuevas: round1(i.meanNewWait),
  });
  return {
    simulacion: true as const,
    supuestos: w.assumptions,
    operadores: w.operators,
    llamadaCritica: w.critical,
    atenciones: w.attentions.map((a) => ({
      llamada: a.callId,
      t: a.t,
      idioma: a.lang,
      incidente: a.incidentId,
      decisionDelMotor: a.decision,
      operadoresOcupadosHasta: a.freeAt,
      resultado: a.outcome,
      motivo: a.reason,
      escalado: a.escalation ? { riesgos: a.escalation.risks, gravedad5: a.escalation.severity5 } : null,
      puestoEnColaHumana: a.queuePosition,
      operadorLaCoge: a.operatorAt,
      guion: {
        idioma: a.script.lang,
        traducido: a.script.translated,
        frases: a.script.lines.map((l) => l.id),
        texto: a.script.text,
        textoEs: a.script.textEs,
      },
    })),
    indicadores: { sinAgente: ind(w.sin), conAgente: ind(w.con) },
  };
}

/** Traza completa exportable (claves en castellano, como el registro de auditoría). */
export function runToJson(run: AgentRun, plannerLabel: string) {
  const s = summarize(run);
  return {
    simulacion: true,
    aviso: SIMULATION_NOTICE,
    sistema: "Agente 112",
    escenario: { id: run.scenarioId, nombre: run.scenarioName },
    planificador: plannerLabel,
    aprobacionSimuladaSegundos: run.approvalDelayS,
    pasos: run.steps.map((st) => ({
      t: st.t,
      llamada: st.callId,
      idioma: st.lang,
      decision: st.decision,
      puntuacion: Math.round(st.score * 100) / 100,
      zonaGrisCon: st.linkedTo,
      operador: st.operator,
      incidente: st.incidentId,
      informacionNueva: st.newInfo,
      accionesNuevas: st.added,
      iaLocal: st.issues,
      aviso: st.warning,
    })),
    acciones: run.actions.map(traceOf),
    resumen: {
      llamadas: s.calls,
      incidentes: s.incidents,
      decisionesDelOperador: s.operatorDecisions,
      accionesPreparadas: s.prepared,
      porHerramienta: s.byTool,
      porOrigen: s.byOrigin,
      automaticas: s.automatic,
      aprobadas: s.approved,
      descartadas: s.discarded,
      pendientes: s.pending,
    },
    agenteDeEspera: waitingToJson(run.waiting),
  };
}
