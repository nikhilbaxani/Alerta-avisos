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
          <h2 id="help-h">Cómo funciona el Agente 112</h2>
          <button className="btn btn-icon" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button>
        </header>
        <p className="help-lead">
          En una catástrofe mucha gente llama por la misma emergencia y las líneas se saturan. El agente agrupa esas
          llamadas repetidas, avisa de lo nuevo que aportan y traduce. <b>La IA propone; el operador decide.</b>
        </p>
        <ol className="help-steps">
          <li><b>Entran llamadas.</b> A la izquierda, cada una con su idioma y un resumen en castellano.</li>
          <li><b>Se agrupan por emergencia.</b> Si dos llamadas hablan del mismo sitio y del mismo problema, se unen. En el mapa, cada punto blanco es una llamada y la línea lo une a su emergencia.</li>
          <li><b>Si la IA duda, te pregunta.</b> Aparece un aviso ámbar arriba del mapa. Pulsa «Mismo incidente» (tecla M) o «Incidente distinto» (tecla D). Hasta que decidas, siguen separadas: nunca se fusionan solas.</li>
          <li><b>Lo más urgente, primero.</b> A la derecha, las emergencias ordenadas por gravedad, personas en riesgo y novedades. El número del mapa es su puesto en esa lista.</li>
          <li><b>Responde en su idioma.</b> Al abrir una emergencia, elige una frase y pulsa «Reproducir al llamante».</li>
        </ol>
        <h3>Para probarlo</h3>
        <p>En <b>Simulación</b>, elige el escenario, pulsa <b>Iniciar</b> y sube la velocidad a ×10 si quieres verlo completo en menos de un minuto. Puedes arrastrar el mapa y acercarlo con la rueda o con los botones + y −.</p>
        <p>En <b>En directo (QR)</b>, escanea el código para enviar una llamada de prueba. Las llamadas del público solo pasan al mapa y a la cola cuando el operador las acepta en la bandeja.</p>
        <h3>Modo simulado</h3>
        <p>Funciona sin internet ni GPU: las llamadas y sus extracciones vienen grabadas en el escenario, pero la agrupación y la prioridad se calculan en directo con el mismo algoritmo que con IA real. Las llamadas son ficticias.</p>
        <p className="note">Ortofoto PNOA © Instituto Geográfico Nacional (CC BY 4.0), incluida en la aplicación para que funcione sin conexión.</p>
      </div>
    </dialog>
  );
}
