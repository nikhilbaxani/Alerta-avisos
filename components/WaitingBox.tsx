import { RISK_LABELS } from "@/lib/labels";
import type { ConsoleState } from "@/lib/useConsole";
import { WAITING_ASSUMPTIONS } from "@/lib/waiting";
import type { WaitingOutcome } from "@/lib/waiting";
import type { ConsoleWaiting, WaitingRow } from "@/lib/waitingConsole";
import IncToken from "./IncToken";
import { langName, mmss, plural } from "./format";

const OPERATOR_CHOICES = [1, 2, 3, 4];

const OUTCOME: Record<WaitingOutcome, { label: string; tone: string }> = {
  escalada: { label: "Escalada a un operador", tone: "warn" },
  agrupada: { label: "Agrupada sin operador", tone: "ok" },
  en_cola: { label: "En cola humana", tone: "" },
};

/** El primer riesgo vital, el más concreto (`VITAL_RISKS` va de lo específico a «riesgo vital»). */
const vitalOf = (r: WaitingRow) => {
  const first = r.escalation?.risks[0];
  return first ? RISK_LABELS[first].toLowerCase() : r.escalation?.severity5 ? "gravedad 5" : "";
};

interface Props {
  s: ConsoleState;
  /** Calculada en `CallsBox` (también da la cifra de la pestaña). */
  view: ConsoleWaiting;
  operators: number;
  onOperators: (n: number) => void;
  ranks: Map<string, number>;
  onSelect: (incidentId: string) => void;
}

/**
 * Pestaña «En espera» de la caja de llamadas (X11): el asistente automático atiende a quien llega con todos los operadores ocupados
 * (sala simulada con los supuestos de `lib/metrics.ts`). Nunca sustituye a un operador libre ni decide la zona gris.
 */
export default function WaitingBox({ s, view, operators, onOperators, ranks, onSelect }: Props) {
  const { con, sin } = view.report;
  const incOf = (id: string) => s.engine.incidents.find((i) => i.id === id) ?? s.archived.find((a) => a.incident.id === id)?.incident;

  return (
    <>
      <div className="calls-tools wait-tools">
        <div className="wait-ops" role="group" aria-label="Operadores disponibles en la sala simulada">
          <span className="wait-ops-label" aria-hidden="true">Operadores disponibles</span>
          <div className="seg">
            {OPERATOR_CHOICES.map((n) => (
              <button key={n} aria-pressed={operators === n} aria-label={plural(n, "operador", "operadores")} onClick={() => onOperators(n)}>
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>
      <dl className="wait-stats" aria-label="Asistente de espera: resumen">
        <div><dt>atendidas por el asistente</dt><dd data-wait="attended">{con.attendedByAgent}</dd></div>
        <div><dt>agrupadas sin operador</dt><dd data-wait="grouped">{con.resolvedWithoutOperator}</dd></div>
        <div className={con.escalated ? "is-warn" : ""}><dt>escaladas</dt><dd data-wait="escalated">{con.escalated}</dd></div>
      </dl>
      <div aria-live="polite">
        {view.escalatedWaiting.map((r) => (
          <p key={r.callId} className="wait-alert" role="status">
            <b>{r.callId} escalada</b> · {langName(r.lang).toLowerCase()}{vitalOf(r) ? ` · ${vitalOf(r)}` : ""}: pasa la primera de la cola humana.
          </p>
        ))}
      </div>
      <div className="box-body">
        {view.rows.length === 0 ? (
          <p className="empty">
            {view.calls === 0
              ? "Cuando una llamada llegue con todos los operadores ocupados, el asistente automático la atenderá aquí, en el idioma del llamante."
              : `Con ${plural(view.operators, "operador", "operadores")} nadie ha tenido que esperar: el asistente no atiende llamadas que un operador libre puede coger.`}
          </p>
        ) : (
          <ul className="wait-list">
            {view.rows.map((r) => {
              const o = OUTCOME[r.outcome];
              const inc = incOf(r.incidentId);
              return (
                <li key={r.callId} className={`wait-row out-${r.outcome}`} data-call={r.callId} data-outcome={r.outcome}>
                  <div className="wait-top">
                    <b className="wait-id">{r.callId}</b>
                    <span className="wait-meta">{mmss(r.t)} · {langName(r.lang)}</span>
                    {inc && <IncToken inc={inc} rank={ranks.get(inc.id) ?? 0} onClick={() => onSelect(inc.id)} />}
                    <span className={`pill ${o.tone}`}>{o.label}</span>
                  </div>
                  <p className="wait-status">
                    {r.outcome === "agrupada"
                      ? "Cerrada por el asistente: no ocupa a ningún operador."
                      : r.withOperator
                        ? `Con un operador desde las ${mmss(r.operatorAt!)}; esperó ${mmss(r.operatorAt! - r.t)} atendida por el asistente.`
                        : `Atendida por el asistente; puesto ${r.queuePosition} de la cola humana al llegar.`}
                  </p>
                  <p className="wait-reason">{r.reason}</p>
                  <details className="wait-script">
                    <summary>Qué le dice el asistente ({r.script.translated ? langName(r.lang).toLowerCase() : "castellano"})</summary>
                    <p lang={r.script.translated ? r.lang : "es"} dir={r.script.translated && r.lang === "ar" ? "rtl" : undefined}>{r.script.text}</p>
                    {r.script.translated && r.lang !== "es" && <p className="wait-es">{r.script.textEs}</p>}
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="wait-foot">
        <p>
          <b>Simulación con supuestos declarados.</b>
          {view.calls > 0 && ` Sin asistente esperarían solas: ${sin.waitedAlone}; con él, ${con.waitedAlone}.`}
        </p>
        <details className="wait-assume">
          <summary>Supuestos</summary>
          <ul>
            {WAITING_ASSUMPTIONS.map((a) => <li key={a}>{a}</li>)}
          </ul>
        </details>
      </div>
    </>
  );
}
