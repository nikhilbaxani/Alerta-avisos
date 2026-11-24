"use client";

import { useEffect, useState } from "react";
import Icon from "./Icon";

interface Props {
  incidentId: string;
  /** Motivo por el que aún no se puede (duda ámbar pendiente), o null. */
  blocker: string | null;
  onResolve: (id: string) => void;
  small?: boolean;
}

/**
 * «Incidencia solucionada» en dos pasos (pulsar y confirmar), para no archivar una emergencia sin querer.
 * Se puede deshacer desde el archivo con «Reabrir».
 */
export default function ResolveButton({ incidentId, blocker, onResolve, small }: Props) {
  const [confirm, setConfirm] = useState(false);
  useEffect(() => setConfirm(false), [incidentId]);
  useEffect(() => {
    if (!confirm) return;
    const t = setTimeout(() => setConfirm(false), 5000);
    return () => clearTimeout(t);
  }, [confirm]);
  const size = small ? "btn-sm" : "";
  if (confirm) {
    return (
      <span className="resolve-confirm" role="group" aria-label={`Confirmar que ${incidentId} está solucionada`}>
        <button className={`btn btn-ok ${size}`} onClick={() => onResolve(incidentId)} aria-label={`Confirmar: ${incidentId} solucionada`}>
          <Icon name="check" size={15} />Sí, archivar
        </button>
        <button className={`btn ${size}`} onClick={() => setConfirm(false)}>Cancelar</button>
      </span>
    );
  }
  return (
    <button
      className={`btn btn-out ${size}`}
      onClick={() => setConfirm(true)}
      disabled={!!blocker}
      title={blocker ?? "La emergencia está resuelta: sale del mapa y pasa al archivo"}
      aria-label={`Marcar ${incidentId} como solucionada`}
    >
      <Icon name="solved" size={15} />Solucionada
    </button>
  );
}
