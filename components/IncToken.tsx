import type { Incident } from "@/lib/engine";
import { rankIncidents } from "@/lib/priority";
import type { ConsoleState } from "@/lib/useConsole";
import { toneOf } from "./format";

/** Puesto de prioridad de cada incidente (el número del marcador del mapa). */
export const ranksOf = (s: ConsoleState) => new Map(rankIncidents(s.engine.incidents, s.clock).map((i, n) => [i.id, n + 1]));

interface Props {
  inc: Incident;
  rank: number;
  /** Nº a destacar en ámbar (acciones por aprobar). */
  count?: number;
  onClick?: () => void;
  pressed?: boolean;
}

/**
 * Etiqueta de un incidente, idéntica en toda la consola: el círculo con su nº de prioridad (mismo color y forma que
 * su marcador en el mapa) y su id. Así se ve de un vistazo a qué emergencia pertenece cada llamada o acción.
 */
export default function IncToken({ inc, rank, count, onClick, pressed }: Props) {
  const tone = toneOf(inc);
  const body = (
    <>
      <i className="inc-n" aria-hidden="true">{rank}</i>
      <span>{inc.id}</span>
      {count ? <b className="inc-count" title={`${count} por aprobar`}>{count}</b> : null}
    </>
  );
  return onClick ? (
    <button className={`inc-token tone-${tone}`} onClick={onClick} aria-pressed={pressed} aria-label={`Ver ${inc.id}, prioridad ${rank}${count ? `, ${count} por aprobar` : ""}`}>
      {body}
    </button>
  ) : (
    <span className={`inc-token tone-${tone}`}>{body}</span>
  );
}
