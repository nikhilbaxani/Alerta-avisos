# Pitch: Agente 112

> Las cifras reales proceden de MEMORIA §3. Las cifras de la demo son resultados de simulación, no mediciones de un servicio de emergencias.

## Guion de 3 minutos

**1. El problema (0:00–0:20).** «En la DANA de Valencia del 29 de octubre de 2024, el 112 recibió 19.821 llamadas para 4.770 incidentes. En el apagón del 28 de abril de 2025, las llamadas se multiplicaron por cuatro y en Cataluña se perdieron más de 10.000. Cuando varias personas avisan del mismo incidente, ¿cómo distinguimos un aviso repetido de una llamada que trae información urgente?»

**2. Demo (0:20–1:50).** Abrir **Simulación**, elegir **DANA** y empezar a ×4 con **Sonido** activado. Dejar que se oiga el inicio de A1 y usar la diapositiva «Percepción → decisión → acción» para narrar lo que cambia en pantalla.

- E1 entra en árabe y se prioriza por dolor torácico. Abrir su incidente: **Escuchar** reproduce la llamada ficticia y **Aprobar y enviar** registra el SMS en árabe con un acuse simulado.
- F1 queda en ámbar: podría ser otro coche. Pulsar **Incidente distinto** y mostrar el borrador de ES-Alert en el detalle: tiene zona y mensaje, pero el operador no puede aprobarlo. En B2, decidir **Mismo incidente**: importa la dirección mencionada, no el barrio desde el que llama la hija.
- A4 aporta el aviso de un bebé en peligro. C3 informa de cables en el suelo: aparece sobre el mapa el acuse simulado del aviso automático a la distribuidora. Acelerar a ×10 para cerrar el escenario y señalar el contador de agrupación.
- Si el relay está disponible, abrir **En directo (QR)** y mostrar una llamada de prueba ya enviada desde un móvil. El operador la revisa y pulsa **Aceptar** para que entre en el mapa y la cola de esa pestaña. No altera el escenario ni activa las herramientas del agente. Si no hay relay, mantener la demo en **Simulación**, que funciona sin conexión.

**3. Qué cambia en la sala (1:50–2:30).** «El modelo no autoriza envíos. Solo los avisos informativos disparados por reglas salen sin aprobación, y aquí todos los envíos son simulados. En terminal, el asistente de espera da indicaciones y escala toda llamada en espera con riesgo vital o gravedad 5, aunque sea un duplicado. En la simulación, la llamada crítica llega antes a un operador en la DANA y tarda lo mismo en el apagón. El parte reúne incidentes, prioridades, acciones y pendientes».

**4. Siguiente paso (2:30–3:00).** Piloto con un contratista, licencia por puesto de operador y evaluación con llamadas reales anonimizadas. Medir carga de trabajo, tiempo hasta atender la llamada crítica y errores de agrupación antes de integrar servicios reales.

## Seis diapositivas (texto)

1. **Saturación del 112.** 19.821 llamadas para 4.770 incidentes en la DANA de Valencia. En el apagón, llamadas ×4.
2. **Agente 112.** Agrupa avisos, detecta información nueva y traduce. La IA propone; la zona gris la decide el operador.
3. **Percepción → decisión → acción.** **Percepción:** audio o guion, ubicación y riesgos extraídos. **Decisión:** agrupar, priorizar y preguntar en ámbar. **Acción:** un cable en el suelo genera un aviso informativo simulado; recursos, SMS y rellamada requieren aprobación; ES-Alert solo lo aprueba un coordinador humano. La traza deja el motivo, la aprobación y el resultado.
4. **Dos modos de demostración.** **Simulación:** llamadas ficticias con audio, tarjetas y acuses simulados. **En directo (QR):** llamadas de prueba del público por móvil; entran en una cola separada tras revisión, sin ejecutar el agente de acciones.
5. **Qué muestra la simulación.** DANA: 19 líneas liberadas por agrupación, 25 acciones preparadas y 19 llamadas atendidas por el asistente de espera. Son cifras de la simulación, no mediciones de una sala real.
6. **Siguiente paso.** Piloto con un contratista, validación con llamadas anonimizadas y revisión de riesgos, supervisión humana y trazabilidad antes de cualquier integración real.

## Números y fuentes

### Datos reales

| Dato | Fuente |
|---|---|
| DANA de Valencia (29-oct-2024): 19.821 llamadas al 112 para 4.770 incidentes | 112 Comunitat Valenciana / prensa ([MEMORIA §3](MEMORIA.md#3-el-problema-datos-para-el-pitch-con-su-fuente)) |
| Apagón (28-abr-2025): llamadas ×4 y más de 10.000 perdidas en Cataluña | 112 autonómicos / prensa ([MEMORIA §3](MEMORIA.md#3-el-problema-datos-para-el-pitch-con-su-fuente)) |

### Resultados de la simulación

| Indicador | DANA: `npm run agente` | Apagón: `npm run agente -- --escenario apagon` |
|---|---:|---:|
| Llamadas → incidentes | 26 → 7 | 16 → 6 |
| Líneas liberadas (llamadas menos incidentes) | 19 | 10 |
| Acciones preparadas | 25 | 18 |
| Envíos simulados sin aprobación, por reglas | 4 | 5 |
| ES-Alert pendientes de coordinación | 1 | 0 |
| Llamadas atendidas por el asistente de espera | 19 | 13 |
| De las atendidas, derivadas con prioridad por riesgo vital o gravedad 5 | 10 | 8 |
| De las atendidas, duplicados resueltos sin operador | 6 | 4 |
| De las atendidas, en cola humana sin escalar | 3 | 1 |
| Espera de la llamada crítica hasta un operador, sin y con asistente | E1: 26 s → 8 s | J1: 40 s → 40 s |

**Supuestos del agente.** Extracciones del guion, reglas deterministas, operador simulado que acierta en ámbar y aprueba las acciones de su competencia, sin simular al coordinador en estas ejecuciones. El reloj de las acciones y acuses es el del escenario, no el de la cola de la sala. Los tres resultados del asistente (escalada, cierre de un duplicado o cola humana sin escalar) son excluyentes y suman el total de llamadas atendidas.

**Supuestos de la sala.** Ambas ejecuciones usan 2 operadores, 60 s por llamada nueva y 15 s por repetida. La franja de la consola compara con y sin copiloto: sin copiloto son 60 s por llamada y orden de llegada; con copiloto, primero las emergencias nuevas por gravedad. La tabla compara otra cosa: mantiene esa priorización y añade el asistente de espera, que puede atender varias llamadas a la vez. Solo los duplicados que cierra dejan de ocupar al operador; las demás llamadas conservan el mismo coste humano. No son tiempos medidos ni una estimación de llamadas perdidas que se recuperarían.

## Preguntas difíciles del jurado

**¿Y si alguien dicta instrucciones para manipular el modelo?**
La extracción y la traducción al castellano delimitan la transcripción como dato no confiable; el juez de zona gris hace lo mismo con el texto que compara. El planificador no recibe esa transcripción ni resúmenes libres. El código valida datos y tamaños en la API, comprueba herramientas y argumentos e impone una gravedad mínima por tipo y riesgos detectados. Son barreras, no una garantía de que la extracción sea correcta.

**¿Qué es automático y quién aprueba ES-Alert?**
Solo los avisos informativos a la distribuidora y al ayuntamiento cuando los disparan las reglas: notifican y dejan un registro, no despachan recursos ni emiten alertas a la población. El operador aprueba recursos, SMS y rellamadas. Una propuesta del modelo nunca se envía sola, ni siquiera si es un aviso informativo. ES-Alert exige un coordinador humano; en la consola el operador solo ve el borrador. El terminal puede simular la aprobación de coordinación, pero ningún conector envía nada a un servicio real.

**¿Qué pasa si el modelo se equivoca?**
Una propuesta incoherente con la herramienta o sus argumentos se rechaza; una propuesta válida pero inoportuna puede descartarla quien deba aprobarla. El planificador mantiene las reglas si el modelo falla. Si la extracción no detecta un riesgo, el suelo de gravedad no lo recupera. En agrupación, el modelo no resuelve el ámbar; una fusión automática errónea se puede deshacer con **Separar**.

**¿Reduce la espera de verdad?**
Todavía no lo sabemos. En estas simulaciones, el asistente da una primera respuesta y cierra algunos duplicados sin operador. La espera de la llamada crítica hasta un operador baja en la DANA y no cambia en el apagón. Haría falta un piloto para medir el efecto en una sala real.

**¿Qué pasa con el audio y la privacidad?**
En **Simulación** el audio es ficticio y está incluido con la consola. En **En directo (QR)** el audio de prueba se envía al relay para transcribirlo con Whisper; vive en memoria y no se pide nombre ni teléfono. Es una demo, no un canal del 112. Con el relay desactivado, la simulación sigue funcionando sin red, GPU ni claves.

**¿Quién paga?**
La vía propuesta es un piloto con un contratista del 112 y una licencia por puesto de operador. El pliego andaluz puntúa las aplicaciones que ofrezca el licitador.
