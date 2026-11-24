/**
 * Reproduce un escenario con el motor real y el agente de acciones (`npm run agente`, MEMORIA §16.2).
 *
 * Todo es simulación: extracciones `mock`, conectores simulados y un operador simulado que acierta en
 * la zona gris (según `gold`, como `npm run eval`) y aprueba las acciones de operador unos segundos
 * de escenario después. Determinista con el planificador de reglas.
 */
import { ACTION_TOOLS, addProposals, approve, discardOrphans, dispatch, planInputFrom, planRules, toolArgsText, toolService, toolTarget, traceOf } from "@/lib/actions";
import type { ActionTool, AgentAction, CallFacts, PlanInput, PlanIssue, Proposal } from "@/lib/actions";
import { confirmDifferent, confirmSame, initialState, processCall } from "@/lib/engine";
import type { EngineCall, Incident } from "@/lib/engine";
import { LANG_NAMES, RISK_LABELS, TYPE_LABELS } from "@/lib/labels";
import type { DecisionAction, IncidentType, RiskTag, Scenario } from "@/lib/types";
import { simulateWaiting } from "@/lib/waiting";
import type { WaitingResult, WaitingRun } from "@/lib/waiting";

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
  waiting: WaitingRun;
}

export async function runAgent(scenario: Scenario, opts: { planner?: Planner; approvalDelayS?: number; operators?: number } = {}): Promise<AgentRun> {
  const planner = opts.planner ?? rulesPlanner;
  const delay = opts.approvalDelayS ?? APPROVAL_DELAY_S;
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
    const r = processCall(state, byId[c.id]);
    state = r.state;
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
    const input = planInputFrom(inc, facts);
    if (inc.type === "inundacion_vehiculo") {
      input.nearby = state.incidents
        .filter((other) => other.id !== inc.id && other.type === inc.type && !other.provisional)
        .map((other) => planInputFrom(other, facts));
    }
    const plan = await planner(input);
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

  // La capacidad de sala no cambia el reloj de la reproducción de acciones X05.
  const waiting = simulateWaiting(calls.map((c, i) => ({
    id: c.id, t: c.t, lang: c.mock.language, type: c.mock.incident_type,
    severity: c.mock.severity, risks: c.mock.risks, decision: steps[i].decision,
  })), opts.operators);
  return { scenarioId: scenario.id, scenarioName: scenario.name, approvalDelayS: delay, steps, actions, incidents: state.incidents, waiting };
}

// ───────────────────────────── Resumen ─────────────────────────────

export interface AgentSummary {
  calls: number;
  incidents: number;
  operatorDecisions: number;
  waiting: { operators: number; attended: number; duplicates: number; escalated: number };
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
    waiting: {
      operators: run.waiting.operators,
      attended: run.waiting.calls.filter((c) => c.waiting?.script != null).length,
      duplicates: run.waiting.calls.filter((c) => c.waiting?.outcome === "duplicate").length,
      escalated: run.waiting.calls.filter((c) => c.waiting?.outcome === "escalated").length,
    },
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

const waitingOutcomes = { queued: "en cola humana", duplicate: "duplicado agrupado sin operador", escalated: "escalada" } as const;

function waitingLine(c: WaitingResult): string[] {
  const w = c.waiting;
  if (!w) return [];
  const outcome = w.outcome === "escalated"
    ? `escalada inmediata a ${clock(c.arrival)} (${w.reasons.map((r) => r === "severity_5" ? "gravedad 5" : lc(RISK_LABELS[r])).join(", ")})`
    : waitingOutcomes[w.outcome];
  return [
    `  Espera ${c.callId} · ${outcome}${c.humanAt === null ? "" : ` · atención de sala a ${clock(c.humanAt)}`}`,
    w.script ? `    Guion: «${w.script.join(" ")}»` : "    Sin guion pretraducido en ese idioma; requiere atención humana.",
  ];
}

export function summaryLines(run: AgentRun): string[] {
  const s = summarize(run);
  const tools = ACTION_TOOLS.map((t) => `${t} ${s.byTool[t]}`).join(", ");
  return [
    `Resumen · ${run.scenarioName} · SIMULACIÓN`,
    `  ${s.calls} llamadas → ${s.incidents} incidentes · ${s.operatorDecisions} ${s.operatorDecisions === 1 ? "decisión" : "decisiones"} del operador (simulado) en zona gris`,
    `  Espera (${s.waiting.operators} ${s.waiting.operators === 1 ? "operador" : "operadores"}): ${s.waiting.attended} atendidas por el asistente · ${s.waiting.duplicates} duplicados sin operador · ${s.waiting.escalated} escaladas`,
    `  Acciones preparadas: ${s.prepared} (${tools}) · origen: reglas ${s.byOrigin.reglas}, IA local ${s.byOrigin.ia_local}`,
    `  Automáticas, enviadas al momento con registro: ${s.automatic}`,
    `  Aprobadas por el operador (simulado): ${s.approved} · descartadas: ${s.discarded} · pendientes: ${s.pending}`,
    "  Conectores simulados: ningún servicio real ha recibido nada.",
  ];
}

/** Traza legible: una línea por llamada y, debajo, cada acción nueva con su cadena completa. */
export function formatRun(run: AgentRun, plannerLabel: string): string {
  const byKey = new Map(run.actions.map((a) => [a.key, a]));
  const waitingById = new Map(run.waiting.calls.map((c) => [c.callId, c]));
  const out: string[] = [
    `Agente 112 · traza del agente de acciones · ${run.scenarioName}`,
    SIMULATION_NOTICE,
    `Planificador: ${plannerLabel} · el operador simulado acierta en la zona gris y aprueba a los ${run.approvalDelayS} s`,
    "Espera: la atención de sala se simula aparte del reloj de las acciones.",
    "",
  ];
  let n = 0;
  for (const s of run.steps) {
    out.push(stepLine(s), ...waitingLine(waitingById.get(s.callId)!));
    if (s.warning) out.push(`  aviso: ${s.warning}`);
    for (const i of s.issues) out.push(`  IA local, ${i.outcome}: ${i.tool} · ${i.reason}`);
    for (const k of s.added) out.push(...actionBlock(byKey.get(k)!, ++n));
  }
  out.push("", ...summaryLines(run));
  return out.join("\n");
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
    espera: {
      operadores: s.waiting.operators,
      atendidas: s.waiting.attended,
      duplicadosSinOperador: s.waiting.duplicates,
      escaladas: s.waiting.escalated,
      llamadas: run.waiting.calls.map((c) => ({
        llamada: c.callId,
        llegada: c.arrival,
        operadorEn: c.humanAt,
        resultado: c.waiting ? waitingOutcomes[c.waiting.outcome] : "operador libre",
        escaladaEn: c.waiting?.outcome === "escalated" ? c.arrival : null,
        motivos: c.waiting?.reasons.map((r) => r === "severity_5" ? "gravedad_5" : r) ?? [],
        guion: c.waiting?.script ?? null,
      })),
    },
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
  };
}
