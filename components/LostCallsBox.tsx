import type { AgentAction } from "@/lib/actions";
import type { Incident } from "@/lib/engine";
import type { LostItem, LostReport } from "@/lib/lostCalls";
import Icon from "./Icon";
import IncToken from "./IncToken";
import { actionTitle } from "./AgentActions";
import { langName, mmss } from "./format";

interface Props {
  report: LostReport;
  actions: AgentAction[];
  incidents: Incident[];
  ranks: Map<string, number>;
  onApprove: (key: string) => void;
  onDiscard: (key: string) => void;
  onIncident: (id: string) => void;
}

/** Estado de la propuesta de una llamada perdida, buscado en el registro de acciones (la misma que en Acciones). */
function ProposalState({ item, actions, onApprove, onDiscard }: { item: LostItem; actions: AgentAction[]; onApprove: Props["onApprove"]; onDiscard: Props["onDiscard"] }) {
  if (!item.proposal) return <p className="lost-wait" data-state="none">{item.pending ?? "Sin propuesta por ahora."}</p>;
  const a = actions.find((x) => x.key === item.proposal!.key);
  const title = actionTitle((a ?? item.proposal) as AgentAction);
  if (!a || a.status === "propuesta") {
    // Hasta que el registro la recoge (un instante) se muestra como propuesta, pero sin botones.
    return (
      <div className="lost-prop" data-state="pending">
        <span className="lost-prop-title">{title}</span>
        {a?.tool === "sms_duplicado" && (
          <p className="act-sms">
            <span lang={a.args.idioma} dir={a.args.idioma === "ar" ? "rtl" : "ltr"}>{a.args.texto}</span>
            {a.args.idioma !== "es" && <small>«{a.args.texto_es}»</small>}
          </p>
        )}
        {a && (
          <div className="act-buttons">
            <button className="btn btn-dark btn-sm" onClick={() => onApprove(a.key)} aria-label={`Aprobar y enviar: ${title} (llamada perdida ${item.id})`}>
              <Icon name="check" size={15} />{a.tool === "devolver_llamada" ? "Devolver la llamada" : "Aprobar y enviar"}
            </button>
            <button className="btn btn-sm" onClick={() => onDiscard(a.key)} aria-label={`Descartar: ${title} (llamada perdida ${item.id})`}>Descartar</button>
            <span className="act-who">Pendiente de tu aprobación</span>
          </div>
        )}
      </div>
    );
  }
  if (a.status === "descartada") return <p className="lost-wait" data-state="discarded">{title}: descartada{a.discarded ? ` · ${mmss(a.discarded.at)}` : ""}</p>;
  return (
    <p className="act-status ok lost-done" data-state="sent" role="status">
      <Icon name="check" size={15} />
      {a.tool === "devolver_llamada" ? "Devolución aprobada y enviada" : "SMS aprobado y enviado"}
      {a.receipt ? ` · acuse ${a.receipt.reference} · ${mmss(a.receipt.at)}` : ""}
    </p>
  );
}

/**
 * Pestaña «Perdidas» de la caja de llamadas (X15, simulación): quien se cuelga antes de que le atiendan. Las desconocidas
 * (puede ser un aviso nuevo) van arriba para devolver la llamada primero; los probables duplicados, debajo,
 * con el SMS de duplicado de X14. Nada se envía sin el clic del operador.
 */
/** Llamadas perdidas cuya propuesta (devolver o SMS) espera el clic del operador. */
export function lostToApprove(report: LostReport, actions: AgentAction[]): number {
  return [...report.unknown, ...report.duplicates].filter((i) => i.proposal && actions.find((a) => a.key === i.proposal!.key)?.status === "propuesta").length;
}

export default function LostCallsBox({ report, actions, incidents, ranks, onApprove, onDiscard, onIncident }: Props) {
  const byId = new Map(incidents.map((i) => [i.id, i]));
  const total = report.unknown.length + report.duplicates.length;

  const row = (item: LostItem) => {
    const inc = item.incidentId ? byId.get(item.incidentId) : undefined;
    return (
      <li key={item.id} className={`lost-row kind-${item.kind}`} data-lost={item.id} data-kind={item.kind}>
        <div className="wait-top">
          <b className="wait-id">{item.id}</b>
          <span className="wait-meta">{mmss(item.t)} · {langName(item.lang).toLowerCase()} · {item.phone}</span>
          {inc && <IncToken inc={inc} rank={ranks.get(inc.id) ?? 0} onClick={() => onIncident(inc.id)} />}
        </div>
        <p className="wait-reason">{item.reason}</p>
        {item.fragment && (
          <p className="lost-said">
            <span lang={item.lang} dir={item.lang === "ar" ? "rtl" : undefined}>«{item.fragment}»</span>
            {item.fragmentEs && item.lang !== "es" && <small>«{item.fragmentEs}»</small>}
          </p>
        )}
        <ProposalState item={item} actions={actions} onApprove={onApprove} onDiscard={onDiscard} />
      </li>
    );
  };

  return (
    <>
      <div className="box-body">
        {total === 0 ? (
          <p className="empty">Si alguien cuelga antes de que le atiendan, aparece aquí con lo que se sabe: teléfono y posición.</p>
        ) : (
          <div className="lost-lists">
            <section aria-labelledby="lost-unknown-h">
              <h3 id="lost-unknown-h">Devolver primero <span className="pill">{report.unknown.length}</span></h3>
              {report.unknown.length ? <ul className="wait-list">{report.unknown.map(row)}</ul> : <p className="note">Ninguna sin incidente conocido.</p>}
            </section>
            <section aria-labelledby="lost-dup-h">
              <h3 id="lost-dup-h">Probables duplicados <span className="pill">{report.duplicates.length}</span></h3>
              {report.duplicates.length ? <ul className="wait-list">{report.duplicates.map(row)}</ul> : <p className="note">Ninguna coincide con un incidente abierto.</p>}
            </section>
          </div>
        )}
      </div>
      <div className="wait-foot">
        <details className="wait-assume">
          <summary><b>Simulación.</b> Por qué importa</summary>
          <p>En el apagón del 28-abr-2025 hubo más de 10.000 llamadas perdidas en Cataluña (fuente: 112 autonómicos / prensa). Las de este escenario son simuladas.</p>
        </details>
      </div>
    </>
  );
}
