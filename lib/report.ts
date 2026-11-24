import { summarize } from "@/lib/agent";
import type { AgentRun } from "@/lib/agent";
import { TYPE_LABELS } from "@/lib/labels";
import { priorityBreakdown, rankIncidents } from "@/lib/priority";

const COORDINATOR_NOTICE = "Sin coordinador simulado: ES-Alert requiere aprobación de un coordinador humano.";

/** Parte JSON de la reproducción, sin transcripciones, resúmenes ni teléfonos. */
export function situationReport(run: AgentRun) {
  const { calls, incidents, waiting } = summarize(run);
  const end = run.steps.at(-1)?.t ?? 0;
  const zones = new Map<string, number>();
  const priorities = rankIncidents(run.incidents, end).map((incident) => {
    // Una celda de 0,01° por incidente, según su primera posición AML (no por volumen de llamadas).
    const first = incident.points[0];
    const cell = (n: number) => (Math.floor(n * 100) / 100).toFixed(2);
    const zone = first ? `${cell(first.lat)}, ${cell(first.lng)}` : "Sin posición AML";
    zones.set(zone, (zones.get(zone) ?? 0) + 1);
    const { total, reasons } = priorityBreakdown(incident, end);
    return { id: incident.id, tipo: TYPE_LABELS[incident.type], prioridad: total, motivos: reasons };
  });
  const acciones = { propuesta: 0, aprobada: 0, enviada: 0, descartada: 0 };
  for (const { status } of run.actions) acciones[status]++;
  return {
    simulacion: true,
    escenario: { id: run.scenarioId, nombre: run.scenarioName },
    llamadas: calls,
    incidentes: incidents,
    lineasLiberadas: calls - incidents,
    prioridades: priorities,
    zonas: [...zones].map(([celda, incidentes]) => ({ celda, incidentes })).sort((a, b) => b.incidentes - a.incidentes || a.celda.localeCompare(b.celda, "es")),
    acciones,
    espera: { operadores: waiting.operators, atendidas: waiting.attended, escaladas: waiting.escalated, duplicadosSinOperador: waiting.duplicates },
    coordinadorSimulado: false,
    aviso: COORDINATOR_NOTICE,
  } as const;
}

export function reportMarkdown(report: ReturnType<typeof situationReport>): string {
  const { acciones, espera } = report;
  return [
    "# Parte de situación · SIMULACIÓN",
    "",
    `Escenario: ${report.escenario.nombre}. Ningún servicio real recibe avisos ni llamadas.`,
    "",
    `${report.llamadas} llamadas → ${report.incidentes} incidentes · ${report.lineasLiberadas} líneas liberadas por agrupación.`,
    "",
    "## Incidentes por prioridad al cierre",
    "",
    ...report.prioridades.map((i) => `- ${i.id} · ${i.tipo} · ${i.motivos.join(", ")}.`),
    "",
    "## Zonas con más incidentes",
    "",
    "Celdas de 0,01° (latitud, longitud), según la primera posición AML de cada incidente.",
    "",
    ...report.zonas.map((z) => `- ${z.celda}: ${z.incidentes} ${z.incidentes === 1 ? "incidente" : "incidentes"}.`),
    "",
    "## Acciones por estado final",
    "",
    `Propuestas pendientes: ${acciones.propuesta} · Aprobadas pendientes de envío: ${acciones.aprobada} · Enviadas: ${acciones.enviada} · Descartadas: ${acciones.descartada}.`,
    report.aviso,
    "",
    "## Agente de espera",
    "",
    `Operadores: ${espera.operadores} · Atendidas con guion: ${espera.atendidas} · Escaladas: ${espera.escaladas} · Duplicados agrupados sin operador: ${espera.duplicadosSinOperador}.`,
    "",
  ].join("\n");
}
