import { CITY_LABELS, RESOURCE_LABELS, canApprove, toolService, toolTarget } from "@/lib/actions";
import type { ActionTool, AgentAction } from "@/lib/actions";
import Icon from "./Icon";
import type { IconName } from "./Icon";
import { langName, mmss } from "./format";

export const TOOL_ICON: Record<ActionTool, IconName> = {
  proponer_recursos: "truck",
  sms_al_llamante: "message",
  avisar_distribuidora: "bolt",
  aviso_ayuntamiento: "building",
  devolver_llamada: "callback",
  proponer_es_alert: "alert",
};

/** Título corto de la acción, en lenguaje de sala. */
export function actionTitle(a: AgentAction): string {
  switch (a.tool) {
    case "proponer_recursos":
      return `Enviar ${RESOURCE_LABELS[a.args.servicio]}`;
    case "sms_al_llamante":
      return `SMS en ${langName(a.args.idioma).toLowerCase()} a ${a.args.telefono ?? a.args.llamada}`;
    case "avisar_distribuidora":
      return a.args.canal === "averias" ? "Avisar a la distribuidora: cables en el suelo" : "Pedir reposición prioritaria de la luz";
    case "aviso_ayuntamiento":
      return `Avisar al ayuntamiento: ${CITY_LABELS[a.args.motivo]}`;
    case "devolver_llamada":
      return `Devolver la llamada a ${a.args.telefono ?? a.args.llamada}`;
    case "proponer_es_alert":
      return `ES-Alert a la población de la zona de ${a.args.zona.nombre}`;
  }
}

const whoText = (a: AgentAction) => {
  if (a.status === "descartada") {
    if (a.discarded?.reason.endsWith("solucionado por el operador")) return "Sin enviar: la incidencia se solucionó";
    return a.discarded?.by === "sistema" ? "Descartada por el sistema" : "Descartada por el operador";
  }
  return a.approval?.by === "automatica" ? "Enviado automáticamente" : "Aprobado y enviado";
};

interface CardProps {
  a: AgentAction;
  /** Etiquetas de la emergencia (o las de la zona) a la que pertenece. */
  tokens?: React.ReactNode;
  onApprove: (key: string) => void;
  onDiscard: (key: string) => void;
}

/** Tarjeta de una acción que prepara el agente: aprobar/descartar si le toca al operador, o su estado. */
export function ActionCard({ a, tokens, onApprove, onDiscard }: CardProps) {
  const state = a.status === "enviada" ? "sent" : a.status === "descartada" ? "discarded" : "pending";
  const mine = canApprove(a.policy, "operador");
  const title = actionTitle(a);
  return (
    <li className={`act st-${state === "pending" && !mine ? "coord" : state}`}>
      <span className="act-icon" aria-hidden="true"><Icon name={TOOL_ICON[a.tool]} size={18} /></span>
      <div className="act-body">
        {tokens && <span className="act-incs">{tokens}</span>}
        <span className="act-title">{title}</span>
        <span className="act-target">{a.reason}</span>
        {a.tool === "sms_al_llamante" && (
          <p className="act-sms">
            <span lang={a.args.idioma} dir={a.args.idioma === "ar" ? "rtl" : "ltr"}>{a.args.texto}</span>
            <small>«{a.args.texto_es}»</small>
          </p>
        )}
        {a.tool === "proponer_es_alert" && (
          <p className="act-sms">
            <span>{a.args.texto_es}</span>
            <small lang="en">{a.args.texto_en}</small>
          </p>
        )}
        {state === "pending" && mine && (
          <div className="act-buttons">
            <button className="btn btn-dark btn-sm" onClick={() => onApprove(a.key)} aria-label={`Aprobar y enviar: ${title}`}>
              <Icon name="check" size={15} />Aprobar y enviar
            </button>
            <button className="btn btn-sm" onClick={() => onDiscard(a.key)} aria-label={`Descartar: ${title}`}>Descartar</button>
            <span className="act-who">Necesita tu aprobación · {toolService(a)}</span>
          </div>
        )}
        {state === "pending" && !mine && <span className="act-who">La aprueba un {a.policy}: {toolTarget(a)}</span>}
        {state === "sent" && a.receipt && (
          <span className="act-status ok" role="status">
            <Icon name="check" size={15} />
            {whoText(a)} · acuse {a.receipt.reference} · {mmss(a.receipt.at)}
          </span>
        )}
        {state === "discarded" && <span className="act-status">{whoText(a)}{a.discarded ? ` · ${mmss(a.discarded.at)}` : ""}</span>}
      </div>
    </li>
  );
}

interface ListProps {
  actions: AgentAction[];
  provisional: boolean;
  onApprove: (key: string) => void;
  onDiscard: (key: string) => void;
}

/** Lista de acciones de un incidente (la usa la presentación). */
export default function AgentActions({ actions, provisional, onApprove, onDiscard }: ListProps) {
  return (
    <section className="block agent acts-col" aria-label="Acciones del agente">
      {provisional ? (
        <p className="note">Decide primero si es el mismo incidente: hasta entonces el agente no prepara acciones.</p>
      ) : actions.length === 0 ? (
        <p className="note">Nada que preparar para esta emergencia por ahora.</p>
      ) : (
        <ul className="acts">{actions.map((a) => <ActionCard key={a.key} a={a} onApprove={onApprove} onDiscard={onDiscard} />)}</ul>
      )}
      <p className="note">Servicios simulados. Solo los avisos informativos a organismos se envían sin aprobación; el resto lo decides tú.</p>
    </section>
  );
}
