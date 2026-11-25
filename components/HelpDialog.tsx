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
          <li><b>Llamadas</b> (izquierda). Cada una con su idioma, un resumen en castellano y la etiqueta de su emergencia, por ejemplo <b>③ INC-03</b>: el número es el mismo que el del mapa. «Por emergencia» las agrupa debajo de cada una.</li>
          <li><b>Mapa.</b> Cada punto es una llamada y la línea la une a su emergencia. Al pulsar una emergencia se abre su ficha y se resaltan sus llamadas. La pastilla ámbar del marcador dice cuántas acciones esperan tu aprobación.</li>
          <li><b>Si la IA duda, te pregunta.</b> Aparece un aviso ámbar encima del mapa. Pulsa «Mismo incidente» (tecla M) o «Incidente distinto» (tecla D). Hasta que decidas, siguen separadas: nunca se fusionan solas.</li>
          <li><b>Emergencias y ficha</b> (derecha). Ordenadas por gravedad, personas en riesgo y novedades; debajo, la ficha de la seleccionada con sus llamadas para escucharlas.</li>
          <li><b>Acciones y traducción</b> (debajo del mapa). Lo que prepara el agente, filtrable por emergencia: los avisos informativos salen solos, el resto lo apruebas tú y el ES-Alert solo un coordinador. Al lado, frases para responder en voz alta en el idioma del llamante.</li>
        </ol>
        <h3>Para probarlo</h3>
        <p>En <b>Simulación</b>, elige el escenario, pulsa <b>Iniciar</b> y sube la velocidad a ×10 si quieres verlo completo en menos de un minuto. Puedes arrastrar el mapa, acercarlo con la rueda o con los botones + y −, y cambiar entre mapa de calles y satélite. Pulsa «Escuchar» para reproducir el audio de una llamada simulada. El botón del sol o la luna cambia entre modo claro y oscuro.</p>
        <p>En <b>En directo (QR)</b>, escanea el código para enviar una llamada de prueba. Las llamadas del público solo pasan al mapa y a la cola cuando el operador las acepta en la bandeja.</p>
        <h3>Incidencias solucionadas</h3>
        <p>Cuando una emergencia está resuelta, pulsa «Solucionada» en su ficha (o en la ficha del mapa) y confirma. Sale del mapa y de la lista, y lo que el agente tenía sin enviar se cierra. El botón del archivo, arriba a la derecha, abre todas las solucionadas con sus llamadas y acciones, y desde ahí se pueden reabrir.</p>
        <h3>Escribir una llamada en simulación</h3>
        <p>En «Escribir una llamada» (caja de llamadas) escribe lo que diría el llamante, por ejemplo «hay un incendio en la calle Larios» o «me han robado con una navaja», y elige dónde está. Entra como cualquier otra llamada: se agrupa con las demás y el agente propone los recursos según el tipo y los riesgos (incendio → Bomberos, robo o agresión → Policía Nacional, heridos o inconsciente → SAMU 061, accidente o tráfico → Policía local). Sin IA local se clasifica por palabras clave; con IA local, con el modelo.</p>
        <h3>Modo simulado</h3>
        <p>Funciona sin internet ni GPU: las llamadas y sus extracciones vienen grabadas en el escenario, pero la agrupación y la prioridad se calculan en directo con el mismo algoritmo que con IA real. Las llamadas son ficticias.</p>
        <p className="note">Mapa de calles © colaboradores de OpenStreetMap (ODbL) y ortofoto PNOA © Instituto Geográfico Nacional (CC BY 4.0), incluidos en la aplicación para que funcione sin conexión.</p>
      </div>
    </dialog>
  );
}
