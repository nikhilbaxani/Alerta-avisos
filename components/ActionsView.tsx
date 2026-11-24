import { canApprove } from "@/lib/actions";
import type { AgentAction } from "@/lib/actions";
import Icon from "./Icon";
import { ActionCard } from "./AgentActions";

interface Props {
  actions: AgentAction[];
  provisional: number;
  onApprove: (key: string) => void;
  onDiscard: (key: string) => void;
  onIncident: (id: string) => void;
}

/** Zona de acciones del agente: lo que espera tu confirmación, lo que decide un coordinador y lo ya hecho. */
export default function ActionsView({ actions, provisional, onApprove, onDiscard, onIncident }: Props) {
  const pending = actions.filter((a) => a.status === "propuesta");
  const mine = pending.filter((a) => canApprove(a.policy, "operador"));
  const coord = pending.filter((a) => !canApprove(a.policy, "operador"));
  const sent = actions.filter((a) => a.status === "enviada").sort((a, b) => (b.receipt?.at ?? 0) - (a.receipt?.at ?? 0));
  const discarded = actions.filter((a) => a.status === "descartada");
  const card = (a: AgentAction) => <ActionCard key={a.key} a={a} onApprove={onApprove} onDiscard={onDiscard} onIncident={onIncident} />;

  return (
    <div className="view view-actions">
      <section className="panel" aria-labelledby="todo-h">
        <div className="panel-head">
          <h2 id="todo-h"><Icon name="agent" size={17} />Por confirmar</h2>
          <span className={`pill ${mine.length ? "amber" : ""}`}>{mine.length}</span>
        </div>
        <div className="acts-col">
          {provisional > 0 && (
            <p className="note">
              {provisional === 1 ? "Hay 1 emergencia" : `Hay ${provisional} emergencias`} pendiente{provisional === 1 ? "" : "s"} de tu decisión: el agente no prepara acciones para ella{provisional === 1 ? "" : "s"} hasta que decidas.
            </p>
          )}
          {mine.length === 0 ? (
            <p className="note">Nada que confirmar ahora. Cuando el agente prepare un SMS, una rellamada o el envío de recursos, aparecerá aquí.</p>
          ) : (
            <ul className="acts">{mine.map(card)}</ul>
          )}
          {coord.length > 0 && (
            <>
              <h3>Las aprueba un coordinador</h3>
              <ul className="acts">{coord.map(card)}</ul>
            </>
          )}
          <p className="note">Servicios simulados. Solo los avisos informativos a organismos se envían sin aprobación; el resto lo decides tú.</p>
        </div>
      </section>

      <section className="panel" aria-labelledby="done-h">
        <div className="panel-head">
          <h2 id="done-h"><Icon name="check" size={17} />Enviadas</h2>
          <span className={`pill ${sent.length ? "ok" : ""}`}>{sent.length}</span>
        </div>
        <div className="acts-col">
          {sent.length === 0 ? <p className="note">Todavía no se ha enviado nada.</p> : <ul className="acts">{sent.map(card)}</ul>}
          {discarded.length > 0 && (
            <>
              <h3>Descartadas</h3>
              <ul className="acts">{discarded.map(card)}</ul>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
