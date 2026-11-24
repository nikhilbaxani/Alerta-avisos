import { traceOf } from "@/lib/actions";
import type { ConsoleState } from "@/lib/useConsole";

/** Registro de decisiones exportable para auditoría (Ley de IA: trazabilidad y supervisión humana). */
export function buildAuditLog(s: ConsoleState, engineLabel: string) {
  return {
    generado: new Date().toISOString(),
    sistema: "Agente 112",
    escenario: s.scenarioId,
    motor: engineLabel,
    nota: "La IA propone; todas las decisiones en zona gris las toma el operador. Las acciones del agente sobre servicios son simuladas: solo los avisos informativos van sin aprobación.",
    tiempoEscenarioSegundos: Math.round(s.clock),
    llamadas: Object.values(s.recs).map((r) => ({
      id: r.id,
      t: r.t,
      estado: r.status,
      incidente: s.engine.assignment[r.id] ?? null,
      accion: r.result?.decision.action ?? null,
      puntuacion: r.result?.decision.score ?? null,
      motivo: r.result?.decision.reason ?? null,
      opinionIA: r.result?.decision.judge ?? null,
    })),
    incidentes: s.engine.incidents.map((i) => ({
      id: i.id,
      tipo: i.type,
      gravedad: i.severity,
      llamadas: i.callIds,
      pendienteDeDecision: i.provisional,
      avisosInformacionNueva: i.alerts,
    })),
    respuestas: s.replies,
    accionesAgente: s.actions.map(traceOf),
    eventos: s.audit,
  };
}
