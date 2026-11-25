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
          <li><b>Llamadas</b> (izquierda). Cada una con su idioma, un resumen en castellano y la etiqueta de su emergencia, por ejemplo <b>③ INC-03</b>: el número es el mismo que el del mapa. «Por emergencia» las agrupa debajo de cada una.</li>
          <li><b>Mapa.</b> Cada punto es una llamada y la línea la une a su emergencia. Al pulsar una emergencia se abre su ficha y se resaltan sus llamadas. La pastilla ámbar del marcador dice cuántas acciones esperan tu aprobación.</li>
          <li><b>Colores.</b> El color de cada emergencia dice su nivel: <b>rojo</b>, riesgo vital; <b>naranja</b>, grave; <b>verde azulado</b>, leve. El <b>ámbar</b> es solo para lo que te toca decidir o aprobar, el <b>verde</b> para lo ya enviado o solucionado y el <b>azul</b> para la información nueva y lo que tienes seleccionado.</li>
          <li><b>Si la IA duda, te pregunta.</b> Aparece una barra ámbar encima del mapa con las dos llamadas que compara. Pulsa «Mismo incidente» (tecla M) o «Incidente distinto» (tecla D); «Por qué duda la IA» despliega el detalle. Hasta que decidas, siguen separadas: nunca se fusionan solas.</li>
          <li><b>Emergencias y ficha</b> (derecha). Ordenadas por gravedad, personas en riesgo y novedades; debajo, la ficha de la seleccionada con sus llamadas para escucharlas.</li>
          <li><b>Acciones</b> (debajo del mapa). Lo que prepara el agente, filtrable por emergencia: los avisos informativos salen solos, el resto lo apruebas tú y el ES-Alert solo un coordinador.</li>
          <li><b>Responder en su idioma.</b> Si alguien de la emergencia seleccionada llamó en otro idioma, su ficha muestra «Responder»: eliges una frase en castellano y se dice en voz alta en el idioma del llamante. El botón «Responder» de la ficha del mapa lleva directo ahí.</li>
        </ol>
        <h3>Para probarlo</h3>
        <p>Usa el botón <b>Iniciar</b> de arriba y sube la velocidad a ×10 si quieres ver el escenario completo en menos de un minuto. Puedes arrastrar el mapa, acercarlo con la rueda o con los botones + y −, y cambiar entre mapa de calles y satélite. El audio de una llamada solo suena al pulsar «Escuchar». El botón del sol o la luna cambia entre modo claro y oscuro.</p>
        <h3>Incidencias solucionadas</h3>
        <p>Cuando una emergencia está resuelta, pulsa «Solucionada» en su ficha (o en la ficha del mapa) y confirma. Sale del mapa y de la lista, y lo que el agente tenía sin enviar se cierra. El botón del archivo, arriba a la derecha, abre todas las solucionadas con sus llamadas y acciones, y desde ahí se pueden reabrir.</p>
        <h3>Probar con tu propia llamada</h3>
        <p>En «Escribir una llamada» (caja de llamadas) escribe lo que diría el llamante, por ejemplo «hay un incendio en la calle Larios» o «me han robado con una navaja», y elige dónde está. Entra como cualquier otra llamada: se agrupa con las demás y el agente propone los recursos según el tipo y los riesgos (incendio → Bomberos, robo o agresión → Policía Nacional, heridos o inconsciente → SAMU 061, accidente o tráfico → Policía local). Sin IA local se clasifica por palabras clave; con IA local, con el modelo.</p>
        <h3>Modo simulado</h3>
        <p>Funciona sin internet ni GPU: las llamadas y sus extracciones vienen grabadas en el escenario, pero la agrupación y la prioridad se calculan en directo con el mismo algoritmo que con IA real. Las llamadas son ficticias.</p>
        <p className="note">Mapa de calles © colaboradores de OpenStreetMap (ODbL) y ortofoto PNOA © Instituto Geográfico Nacional (CC BY 4.0), incluidos en la aplicación para que funcione sin conexión.</p>
      </div>
    </dialog>
  );
}
