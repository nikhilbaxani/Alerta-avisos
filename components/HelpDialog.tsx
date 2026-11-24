"use client";

import { useEffect, useRef } from "react";
import Icon from "./Icon";

/** Explicación en lenguaje llano de qué hace la consola, para quien la ve por primera vez. */
export default function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog ref={ref} className="help" aria-labelledby="help-h" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <div className="help-body">
        <header>
          <h2 id="help-h">Cómo funciona el Copiloto 112</h2>
          <button className="btn btn-icon" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button>
        </header>
        <p className="help-lead">
          En una catástrofe mucha gente llama por la misma emergencia y las líneas se saturan. El copiloto agrupa esas
          llamadas repetidas, avisa de lo nuevo que aportan y traduce. <b>La IA propone; el operador decide.</b>
        </p>
        <ol className="help-steps">
          <li><b>Llamadas.</b> Entran a la izquierda, cada una con su idioma y un resumen en castellano. En el mapa, cada punto es una llamada y la línea la une a su emergencia; al pulsar una emergencia se abre su ficha sobre el mapa.</li>
          <li><b>Se agrupan por emergencia.</b> Si dos llamadas hablan del mismo sitio y del mismo problema, se unen y la línea queda libre.</li>
          <li><b>Si la IA duda, te pregunta.</b> Aparece un aviso ámbar arriba, en cualquier zona de la consola. Pulsa «Mismo incidente» (tecla M) o «Incidente distinto» (tecla D). Hasta que decidas, siguen separadas: nunca se fusionan solas.</li>
          <li><b>Emergencias.</b> Ordenadas por gravedad, personas en riesgo y novedades. El número del mapa es su puesto en esa lista.</li>
          <li><b>Traducción.</b> Lo que dijo cada llamante extranjero, traducido, y frases para responderle en voz alta en su idioma.</li>
          <li><b>Acciones.</b> Lo que prepara el agente. Los avisos informativos a organismos salen solos; el resto espera a que lo apruebes, y el ES-Alert solo lo aprueba un coordinador.</li>
        </ol>
        <h3>Para probarlo</h3>
        <p>Usa el botón <b>Iniciar</b> de arriba y sube la velocidad a ×10 si quieres ver el escenario completo en menos de un minuto. Puedes arrastrar el mapa, acercarlo con la rueda o con los botones + y −, y cambiar entre mapa de calles y satélite. El botón del sol o la luna cambia entre modo claro y oscuro.</p>
        <h3>Modo simulado</h3>
        <p>Funciona sin internet ni GPU: las llamadas y sus extracciones vienen grabadas en el escenario, pero la agrupación y la prioridad se calculan en directo con el mismo algoritmo que con IA real. Las llamadas son ficticias.</p>
        <p className="note">Mapa de calles © colaboradores de OpenStreetMap (ODbL) y ortofoto PNOA © Instituto Geográfico Nacional (CC BY 4.0), incluidos en la aplicación para que funcione sin conexión.</p>
      </div>
    </dialog>
  );
}
