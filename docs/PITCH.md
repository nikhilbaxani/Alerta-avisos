# Pitch: Agente 112

> Las cifras reales y sus fuentes están en [MEMORIA §3](MEMORIA.md#3-el-problema-datos-para-el-pitch-con-su-fuente). Los resultados de la demo son de escenarios ficticios, no mediciones del 112.

## Guion de 3 minutos

**1. El problema (0:00–0:20).** «El 29 de octubre de 2024, la DANA de Valencia generó 19.821 llamadas al 112 para 4.770 incidentes: unas cuatro llamadas por incidente. En el apagón del 28 de abril de 2025 las llamadas se multiplicaron por cuatro y en Cataluña se perdieron más de 10.000. Si varias llamadas describen el mismo incidente, la que trae una emergencia nueva tiene que hacerse sitio en la misma cola».

**2. Demo (0:20–1:50).** Pulsar **Iniciar** a ×4 y dejar lista la salida de `npm run agente` en otra ventana.
- En la consola, enseñar el contador de llamadas e incidentes. Cuando la hija llama desde otro barrio, comparar su posición con la dirección que menciona: se agrupa por la dirección del incidente si el operador confirma la coincidencia.
- En ámbar, para el segundo coche atrapado, pulsar `D` (**Incidente distinto**). Elegir «¿La persona respira?» en árabe y pulsar **Reproducir al llamante**. Señalar cómo la información nueva —por ejemplo, que hay un bebé— cambia la prioridad.
- Pasar a la diapositiva **percepción → decisión → acción** y mostrar la traza en terminal: un aviso de semáforos queda registrado automáticamente; la propuesta de Policía Local requiere al operador. Los coches atrapados generan un borrador de ES-Alert que queda pendiente del coordinador. No se envía nada a servicios reales.

**3. Controles y alcance (1:50–2:30).** Mostrar en el parte las líneas liberadas por agrupación, las acciones preparadas y las llamadas en espera atendidas con guion. Aclarar que la cola y los tiempos son ilustrativos. El asistente en espera solo usa frases pretraducidas y da prioridad inmediata en la cola humana si detecta riesgo vital. El planificador no ve la transcripción y no puede cambiar quién aprueba cada acción. El procesamiento del agente puede hacerse en local.

**4. Piloto (2:30–3:00).** Proponer un piloto con un contratista del 112 y una licencia por puesto de operador. Validar con llamadas reales anonimizadas si se libera capacidad y se atiende antes la llamada crítica; la demo no demuestra ese efecto.

## Seis diapositivas (texto)

1. **Las llamadas repetidas ocupan líneas.** DANA de Valencia: 19.821 llamadas para 4.770 incidentes. Apagón: llamadas ×4. Fuentes abajo.
2. **Agente 112.** Agrupa, detecta información nueva y traduce. La IA propone; el operador decide en la zona gris.
3. **Demo en vivo.** Consola: dirección mencionada, segundo coche en ámbar y respuesta en árabe con voz.
4. **percepción → decisión → acción**
   - **Percepción:** audio y ubicación; en la simulación, extracción del guion. Se obtienen hechos como tipo, posición y riesgos.
   - **Decisión:** se agrupan y priorizan incidentes. El operador decide en ámbar. Con los datos estructurados, el agente prepara acciones y explica qué las motiva.
   - **Acción:** recursos, SMS pretraducido y rellamada requieren al operador; los avisos informativos a distribuidora y ayuntamiento son automáticos solo por reglas; ES-Alert queda en borrador para un coordinador humano. La traza registra aprobación y resultado simulado. Ningún conector llega a un servicio real.
5. **Contexto del piloto.** Andalucía gestionó 894.930 emergencias en 2025 y recibió 43.845 llamadas en idioma extranjero en 2024. Fuentes abajo.
6. **Siguiente paso.** Piloto con un contratista y evaluación con llamadas reales anonimizadas. Medir capacidad liberada y tiempo hasta atender la llamada crítica.

## Números y fuentes

| Dato real | Fuente en MEMORIA §3 |
|---|---|
| DANA de Valencia, 29 de octubre de 2024: 19.821 llamadas al 112, 4.770 incidentes, unas cuatro llamadas por incidente | 112 Comunitat Valenciana / prensa |
| Apagón del 28 de abril de 2025: llamadas ×4; más de 10.000 llamadas perdidas en Cataluña | 112 autonómicos / prensa |
| Andalucía: 894.930 emergencias gestionadas en 2025 y 43.845 llamadas en idioma extranjero en 2024 | Junta de Andalucía |

### Resultados de la simulación

| Escenario y comando | Llamadas → incidentes | Líneas liberadas por agrupación | Acciones preparadas | Llamadas en espera atendidas con guion |
|---|---:|---:|---|---:|
| DANA · `npm run agente` | 26 → 7 | 19 | 25, incluido 1 borrador de ES-Alert pendiente de un coordinador humano | 22 |
| Apagón · `npm run agente -- --escenario apagon` | 16 → 6 | 10 | 18 | 14 |

Son reproducciones con reglas, extracciones del guion y un operador simulado que resuelve el ámbar según la referencia del escenario y aprueba las acciones de su rol tras 5 s de escenario. Las líneas liberadas son llamadas menos incidentes, no líneas telefónicas medidas. Para la cola simulada se usan 2 operadores por defecto; se suponen 60 s por llamada nueva o en ámbar y 15 s por repetida atendida por un operador. En la franja «Simulación de sala» de la consola, la comparación sin copiloto supone 60 s para cualquier llamada; con copiloto, 60 s para la primera llamada de un incidente y 15 s para las repetidas. Son tiempos ilustrativos, no mediciones, y no determinan cuándo se aprueban acciones. Una llamada atendida con guion puede además haberse escalado o haberse agrupado como duplicado; no se suman esos resultados al total de atendidas.

## Preguntas difíciles del jurado

**¿Qué pasa si alguien intenta dar órdenes al modelo en la llamada (inyección de instrucciones)?**
El texto de la llamada se delimita como dato no confiable cuando entra en un prompt. El planificador no ve ese texto: recibe datos estructurados. El código valida las entradas y limita su tamaño, fija una gravedad mínima según el tipo y los riesgos detectados y comprueba las herramientas y sus argumentos. Eso no garantiza que la extracción sea correcta: el mínimo depende de los riesgos detectados. Ni la llamada ni el modelo pueden autorizar una acción.

**¿Qué se automatiza y por qué? ¿Quién aprueba ES-Alert?**
De las acciones hacia servicios, solo se automatizan por reglas los avisos informativos a la distribuidora y al ayuntamiento: comunican una incidencia, no movilizan recursos ni alertan a la población, y quedan registrados. Recursos, SMS y rellamadas requieren al operador. ES-Alert requiere siempre a un coordinador humano; en la demo no hay coordinador simulado y solo queda el borrador. Todos los conectores son simulados.

**¿Y si el modelo se equivoca?**
Se descartan herramientas desconocidas o argumentos inválidos. Una propuesta del modelo que pasa la validación sigue necesitando al operador como mínimo, incluso si es un aviso de los que las reglas pueden automatizar. El operador puede descartarla; ES-Alert conserva el requisito de coordinador. En agrupación, el modelo no decide en ámbar y una fusión automática se puede revertir con «Separar».

**¿Esto ya demuestra una mejora para los operadores?**
No. La simulación muestra cómo se libera capacidad al evitar que algunas llamadas repetidas ocupen a un operador. Hay que medir el efecto sobre el tiempo hasta atender la llamada crítica en un piloto.

**¿Qué pasa con la privacidad?**
La demo del agente usa datos ficticios. Los modelos de la modalidad local pueden ejecutarse en la sala. Para un piloto con llamadas reales habría que definir los controles de acceso y la gestión de datos de salud y localización.

**¿Quién paga?**
El piloto se plantea con un contratista del 112, con licencia por puesto de operador.

**¿Y si falla la wifi o la GPU?**
El modo simulado funciona sin red, sin GPU y sin claves: usa las extracciones del guion y conserva el algoritmo de agrupación y prioridad.
