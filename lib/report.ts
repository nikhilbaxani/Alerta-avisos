/**
 * Parte de situación para el jefe de sala o el CECOP (MEMORIA §16.4).
 *
 * Puro: se calcula del estado de una reproducción (`AgentRun`) y nada más. Todas las cifras salen de
 * ese estado o de los supuestos declarados de la sala simulada; ninguna de fuera (tampoco las del
 * pitch). Se genera en JSON (claves en castellano, como el registro de auditoría) y en Markdown, y va
 * rotulado como simulación.
 */
import { ACTION_POLICY, ACTION_TOOLS, TOOL_LABELS, actionIncidents, nearestPlace, toolTarget } from "@/lib/actions";
import type { ActionTool, AgentAction, ApprovalPolicy } from "@/lib/actions";
import { clock, dur, summarize, waitingToJson } from "@/lib/agent";
import type { AgentRun } from "@/lib/agent";
import type { Incident } from "@/lib/engine";
import { TYPE_LABELS } from "@/lib/labels";
import { PLACES } from "@/lib/map";
import { priorityBreakdown } from "@/lib/priority";
import type { IncidentType } from "@/lib/types";

export const REPORT_NOTICE =
  "SIMULACIÓN: parte calculado de una reproducción del escenario con extracciones del guion, operador y coordinador simulados y conectores simulados. Ningún servicio real ha recibido nada. Todas las cifras salen del estado de esta reproducción o de los supuestos declarados al final.";

export interface ReportIncident {
  puesto: number;
  incidente: string;
  tipo: IncidentType;
  tipoTexto: string;
  /** Lugar de referencia más cercano (rótulos del mapa), no la dirección. */
  lugar: string;
  llamadas: number;
  gravedad: number;
  /** Prioridad de la cola (redondeada) a la hora del parte. */
  prioridad: number;
  /** Motivo en una línea (`priorityBreakdown`). */
  motivo: string;
  provisional: boolean;
}

export interface ToolCounts {
  preparadas: number;
  /** Estado `propuesta`: falta la decisión de una persona. */
  pendientes: number;
  /** Estado `aprobada`, todavía sin enviar. */
  aprobadasSinEnviar: number;
  enviadas: number;
  descartadas: number;
  /** Enviadas al momento sin aprobación, con registro. */
  automaticas: number;
  /** Aprobadas por una persona (operador o coordinador), enviadas o no. */
  aprobadasPorPersona: number;
}

export interface ToolRow extends ToolCounts {
  herramienta: ActionTool;
  nombre: string;
  control: ApprovalPolicy;
}

export interface PendingDecision {
  clave: string;
  herramienta: ActionTool;
  nombre: string;
  destino: string;
  ambito: "incidente" | "zona";
  incidentes: string[];
  propuestaEn: number;
  /** Quién tiene que decidir. */
  falta: Exclude<ApprovalPolicy, "automatica">;
}

export interface SituationReport {
  simulacion: true;
  rotulo: "SIMULACIÓN";
  aviso: string;
  sistema: "Agente 112";
  escenario: { id: string; nombre: string };
  hora: { segundos: number; texto: string };
  llamadas: number;
  incidentes: number;
  /** Llamadas repetidas agrupadas en un incidente ya abierto: llamadas − incidentes (como la consola). */
  lineasLiberadas: number;
  decisionesZonaGris: number;
  incidentesPorPrioridad: ReportIncident[];
  zonas: { lugar: string; incidentes: string[] }[];
  acciones: {
    porHerramienta: ToolRow[];
    total: ToolCounts;
    aprobadasPorRol: { operador: number; coordinador: number };
    pendientes: PendingDecision[];
  };
  agenteDeEspera: {
    operadores: number;
    llamadaCritica: string | null;
    sinAgente: ReturnType<typeof waitingToJson>["indicadores"]["sinAgente"];
    conAgente: ReturnType<typeof waitingToJson>["indicadores"]["conAgente"];
    supuestos: string[];
  };
  supuestos: string[];
}

/** Hora del parte: el último hecho de la reproducción (llamada, propuesta, aprobación, acuse o descarte). */
export function reportTime(run: AgentRun): number {
  const ts = [
    ...run.steps.map((s) => s.t),
    ...run.actions.flatMap((a) => [a.proposedAt, a.approval?.at, a.receipt?.at, a.discarded?.at].filter((x): x is number => typeof x === "number")),
  ];
  return ts.length ? Math.max(...ts) : 0;
}

function centerOf(i: Incident): { lat: number; lng: number } | null {
  if (!i.points.length) return null;
  return { lat: i.points.reduce((s, p) => s + p.lat, 0) / i.points.length, lng: i.points.reduce((s, p) => s + p.lng, 0) / i.points.length };
}
const placeOf = (i: Incident) => {
  const c = centerOf(i);
  return c ? nearestPlace(c).name : "sin posición";
};

function counts(actions: readonly AgentAction[]): ToolCounts {
  const n = (f: (a: AgentAction) => boolean) => actions.filter(f).length;
  return {
    preparadas: actions.length,
    pendientes: n((a) => a.status === "propuesta"),
    aprobadasSinEnviar: n((a) => a.status === "aprobada"),
    enviadas: n((a) => a.status === "enviada"),
    descartadas: n((a) => a.status === "descartada"),
    automaticas: n((a) => a.approval?.by === "automatica"),
    aprobadasPorPersona: n((a) => a.approval !== null && a.approval.by !== "automatica"),
  };
}

const ASSUMPTIONS: readonly string[] = [
  "Líneas liberadas: llamadas − incidentes, es decir, llamadas repetidas agrupadas en un incidente ya abierto (la misma cuenta que la consola).",
  "Prioridad: la fórmula de la cola de la consola a la hora del parte. La reproducción no marca ningún incidente como atendido, así que los minutos sin atender cuentan desde que se abrió cada uno.",
  "Zonas: lugar de referencia de los rótulos del mapa más cercano al centro de las posiciones AML de cada incidente; no es su dirección.",
  "Acciones: las decide un operador simulado que acierta en la zona gris y aprueba las suyas a los pocos segundos; las de coordinador solo se aprueban si se simula un coordinador (--coordinador). Los conectores y sus acuses son simulados.",
];

/** Parte de situación calculado del estado de la reproducción. */
export function situationReport(run: AgentRun): SituationReport {
  const now = reportTime(run);
  const s = summarize(run);
  const ranked = run.incidents
    .map((i, k) => ({ i, k, b: priorityBreakdown(i, now) }))
    .sort((x, y) => y.b.total - x.b.total || x.k - y.k)
    .map(({ i, b }, n): ReportIncident => ({
      puesto: n + 1,
      incidente: i.id,
      tipo: i.type,
      tipoTexto: TYPE_LABELS[i.type],
      lugar: placeOf(i),
      llamadas: i.callIds.length,
      gravedad: i.severity,
      prioridad: Math.round(b.total),
      motivo: b.reasons.join(", "),
      provisional: i.provisional,
    }));

  const byPlace = new Map<string, string[]>();
  for (const i of run.incidents) byPlace.set(placeOf(i), [...(byPlace.get(placeOf(i)) ?? []), i.id]);
  const order = (name: string) => {
    const k = PLACES.findIndex((p) => p.name === name);
    return k < 0 ? PLACES.length : k;
  };
  const zonas = [...byPlace.entries()]
    .map(([lugar, incidentes]) => ({ lugar, incidentes }))
    .sort((a, b) => b.incidentes.length - a.incidentes.length || order(a.lugar) - order(b.lugar));

  const porHerramienta: ToolRow[] = ACTION_TOOLS.map((t) => ({
    herramienta: t,
    nombre: TOOL_LABELS[t],
    control: ACTION_POLICY[t],
    ...counts(run.actions.filter((a) => a.tool === t)),
  }));
  const pendientes: PendingDecision[] = run.actions
    .filter((a) => a.status === "propuesta" && a.policy !== "automatica")
    .map((a) => ({
      clave: a.key,
      herramienta: a.tool,
      nombre: TOOL_LABELS[a.tool],
      destino: toolTarget(a),
      ambito: a.tool === "proponer_es_alert" ? "zona" : "incidente",
      incidentes: actionIncidents(a),
      propuestaEn: a.proposedAt,
      falta: a.policy as Exclude<ApprovalPolicy, "automatica">,
    }));

  const w = waitingToJson(run.waiting);
  return {
    simulacion: true,
    rotulo: "SIMULACIÓN",
    aviso: REPORT_NOTICE,
    sistema: "Agente 112",
    escenario: { id: run.scenarioId, nombre: run.scenarioName },
    hora: { segundos: now, texto: clock(now) },
    llamadas: s.calls,
    incidentes: s.incidents,
    lineasLiberadas: Math.max(0, s.calls - s.incidents),
    decisionesZonaGris: s.operatorDecisions,
    incidentesPorPrioridad: ranked,
    zonas,
    acciones: { porHerramienta, total: counts(run.actions), aprobadasPorRol: { ...s.approvedBy }, pendientes },
    agenteDeEspera: {
      operadores: w.operadores,
      llamadaCritica: w.llamadaCritica,
      sinAgente: w.indicadores.sinAgente,
      conAgente: w.indicadores.conAgente,
      supuestos: [...w.supuestos],
    },
    supuestos: [...ASSUMPTIONS],
  };
}

// ───────────────────────────── Markdown ─────────────────────────────

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const time = (s: number | null) => (s === null ? "—" : dur(s));

function pendingLine(p: PendingDecision): string {
  const who =
    p.falta === "coordinador"
      ? "falta la aprobación de un **coordinador** (el operador no puede aprobarla)"
      : "falta la aprobación del **operador**";
  return `- ${p.nombre} → ${p.destino} · ${p.incidentes.join(", ")} · propuesta a ${clock(p.propuestaEn)} · ${who}`;
}

/** El parte en Markdown, para imprimirlo en la terminal o guardarlo con `--parte`. */
export function reportMarkdown(r: SituationReport): string {
  const t = r.acciones.total;
  const pendingCoord = r.acciones.pendientes.filter((p) => p.falta === "coordinador").length;
  const w = r.agenteDeEspera;
  const crit = w.llamadaCritica ? `Llamada crítica (${w.llamadaCritica}) hasta un operador` : "Llamada crítica hasta un operador";
  const rows: [string, (x: typeof w.sinAgente) => string][] = [
    ["Llegan con todos los operadores ocupados", (x) => String(x.lleganConTodosOcupados)],
    ["Esperan sin que nadie les atienda", (x) => String(x.esperanSinQueNadieLesAtienda)],
    ["Atendidas por el asistente de espera", (x) => String(x.atendidasPorElAsistente)],
    ["De ellas, duplicados resueltos sin operador", (x) => String(x.duplicadosResueltosSinOperador)],
    ["De ellas, escaladas por riesgo vital", (x) => String(x.escaladas)],
    ["De ellas, siguen en la cola humana sin escalar", (x) => String(x.siguenEnColaHumana)],
    [crit, (x) => time(x.llamadaCritica?.segundosHastaOperador ?? null)],
    ["Espera media de las emergencias nuevas hasta un operador", (x) => time(x.esperaMediaEmergenciasNuevas)],
    ["Tiempo de operador ocupado", (x) => dur(x.segundosDeOperador)],
  ];

  const out: string[] = [
    "# Parte de situación · SIMULACIÓN",
    "",
    `> ${r.aviso}`,
    "",
    `**${r.sistema}** · ${r.escenario.nombre} · hora del escenario **${r.hora.texto}**`,
    "",
    "## Resumen",
    "",
    `- ${r.llamadas} llamadas → ${r.incidentes} incidentes · ${r.lineasLiberadas} líneas liberadas (llamadas repetidas agrupadas)`,
    `- ${plural(r.decisionesZonaGris, "decisión", "decisiones")} del operador (simulado) en zona gris; ninguna fusión dudosa se hizo sola`,
    `- Acciones del agente: ${t.preparadas} preparadas · ${t.enviadas} enviadas (${t.automaticas} automáticas con registro y ${t.enviadas - t.automaticas} tras aprobarlas una persona) · ${t.descartadas} descartadas · ${plural(t.pendientes, "pendiente", "pendientes")}${pendingCoord ? ` (${pendingCoord} de coordinador)` : ""}`,
    `- Agente de espera (${plural(w.operadores, "operador", "operadores")}): esperan sin que nadie les atienda ${w.sinAgente.esperanSinQueNadieLesAtienda} sin agente → ${w.conAgente.esperanSinQueNadieLesAtienda} con agente; ${w.conAgente.escaladas} escaladas por riesgo vital y ${w.conAgente.duplicadosResueltosSinOperador} duplicados cerrados sin operador`,
    "",
    `## Incidentes por prioridad (a ${r.hora.texto})`,
    "",
    ...r.incidentesPorPrioridad.map(
      (i) =>
        `${i.puesto}. **${i.incidente} · ${i.tipoTexto}** · cerca de ${i.lugar} · ${plural(i.llamadas, "llamada", "llamadas")} · prioridad ${i.prioridad}${i.provisional ? " · PROVISIONAL, pendiente del operador" : ""} — ${i.motivo}`,
    ),
    "",
    "## Zonas con más incidentes",
    "",
    ...r.zonas.map((z) => `- ${z.lugar}: ${plural(z.incidentes.length, "incidente", "incidentes")} (${z.incidentes.join(", ")})`),
    "",
    "## Acciones del agente por herramienta y estado",
    "",
    "| Herramienta | Aprueba | Preparadas | Aprobadas por una persona | Enviadas | Descartadas | Pendientes |",
    "|---|---|---:|---:|---:|---:|---:|",
    ...r.acciones.porHerramienta.map(
      (x) =>
        `| ${x.nombre} (\`${x.herramienta}\`) | ${x.control === "automatica" ? "automática, con registro" : x.control} | ${x.preparadas} | ${x.aprobadasPorPersona} | ${x.enviadas} | ${x.descartadas} | ${x.pendientes} |`,
    ),
    `| **Total** | | ${t.preparadas} | ${t.aprobadasPorPersona} | ${t.enviadas} | ${t.descartadas} | ${t.pendientes} |`,
    "",
    `Aprobadas por una persona: operador ${r.acciones.aprobadasPorRol.operador}, coordinador ${r.acciones.aprobadasPorRol.coordinador}.${t.aprobadasSinEnviar ? ` Aprobadas y todavía sin enviar: ${t.aprobadasSinEnviar}.` : ""}`,
    "",
    "### Decisiones pendientes",
    "",
    ...(r.acciones.pendientes.length ? r.acciones.pendientes.map(pendingLine) : ["Ninguna."]),
    "",
    `## Agente de espera (sala simulada con ${plural(w.operadores, "operador", "operadores")})`,
    "",
    "| Indicador | Sin agente de espera | Con agente de espera |",
    "|---|---:|---:|",
    ...rows.map(([label, f]) => `| ${label} | ${f(w.sinAgente)} | ${f(w.conAgente)} |`),
    "",
    "Supuestos de la sala simulada:",
    "",
    ...w.supuestos.map((x) => `- ${x}`),
    "",
    "## Supuestos del parte",
    "",
    ...r.supuestos.map((x) => `- ${x}`),
    "",
    "_SIMULACIÓN. Ningún dato de este parte procede de un servicio real._",
  ];
  return out.join("\n");
}
