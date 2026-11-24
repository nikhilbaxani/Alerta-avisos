# Pendiente de implementación: agentes

Fecha de revisión: 24 de noviembre de 2026.

Documento de continuidad basado en [docs/TASKS.md](docs/TASKS.md),
[docs/MEMORIA.md §16](docs/MEMORIA.md#16-ampliación-de-copiloto-a-agente-x04x08),
[docs/DECISIONES.md](docs/DECISIONES.md) y el código existente.
El tablero conserva el estado de las tareas; este documento concreta qué falta,
en qué orden retomarlo y cómo comprobarlo.

## Estado de la implementación

| Tarea | Estado | Entrega existente |
|---|---|---|
| X04: seguridad | Hecha; regresión en vivo registrada como X04b | Texto no confiable delimitado, suelo de gravedad, límites de API e identificadores que no se reutilizan. |
| X05: agente de acciones | Hecha | Recursos, SMS, distribuidora, reglas de aprobación, planificación con IA local opcional y traza. |
| X06: asistente de espera | Hecha | Simulación de sala, guion pretraducido, escalado del riesgo vital nuevo e indicadores con y sin agente. |
| X07: coordinación | Hecha y verificada en modo simulado | Ayuntamiento, devolución de llamadas, propuesta de ES-Alert y parte de situación Markdown/JSON. |
| X08: documentación y entrega | Pendiente | Relato completo del agente en README/PITCH y verificación para `agente-v1`. |

X07 vive en `lib/actions.ts`, `lib/agent.ts`, `lib/report.ts` y
`scripts/agente.ts`, con cobertura en `tests/coordination.test.ts` y
`tests/report.test.ts`. ES-Alert queda pendiente de coordinador por defecto;
`--coordinador` simula su aprobación. Los conectores y acuses son simulados.

Verificación de esta entrega: TypeScript, 303 tests, build, evaluaciones DANA y
apagón y prueba de navegador en modo simulado correctos. Se comprobaron también
las exportaciones Markdown/JSON: DANA prepara 25 acciones (24 enviadas y un
ES-Alert pendiente); con coordinador simulado envía las 25; apagón prepara y
envía 18. Estas cifras proceden de las reproducciones de prueba.

## 1. X08: README y pitch del agente

Responsable previsto: `pitch-docs`. Dependencias: X05, X06 y X07 verificadas.

- [ ] Añadir la sección «El agente» a `README.md`: percepción, decisión, acción,
  herramientas disponibles, seguridad y política automática/operador/coordinador.
- [ ] Documentar `npm run agente`, `--escenario apagon`, `--operadores N`,
  `--coordinador`, `--json archivo.json`, `--parte archivo.md` y `--live`.
  Aclarar que `--live` cambia el planificador, mientras las extracciones de la
  reproducción proceden del guion y los servicios siguen simulados.
- [ ] Actualizar `docs/PITCH.md` con la diapositiva percepción → decisión → acción
  y respuestas sobre inyección de instrucciones, automatismos y aprobaciones.
- [ ] Presentar las métricas del agente como simulación con supuestos. No afirmar
  una reducción general de la espera: X06 registra escenarios con un operador
  donde la espera media de emergencias nuevas empeora.
- [ ] Revisar la coherencia con `docs/PROYECTO.md` y el material de presentación.
  Las cifras externas deben proceder de MEMORIA §3; las de la demo, del estado
  y las ejecuciones verificadas.
- [ ] Actualizar el recuento de tests del README, que todavía menciona 27.
- [ ] Ejecutar la verificación final del MVP prevista en el tablero, registrar
  resultados en `docs/PROGRESO.md` y crear la etiqueta `agente-v1` únicamente
  cuando se cumplan los criterios. Después, marcar X08 como hecha.

La entrega de marca «Avance 112» está en `docs/marca/avance-112/` con sus fuentes,
SVG, PNG y animaciones. Por petición posterior de Nick, su GIF transparente ya
se integra en la cabecera, con PNG estático para movimiento reducido. La
documentación del agente conserva el nombre aprobado en MEMORIA §16.5 hasta
que se revise el relato en X08.

## 2. X04b: recuperar la agrupación con IA local

Responsable previsto: `backend-ia`. Dependencia: X04 y disponibilidad del modelo.
El tablero la registra bloqueada por la parada de Ollama y Whisper; comprobar
su disponibilidad antes de retomar el diagnóstico, sin dar esa nota histórica
por una comprobación actual de los servicios.

- [ ] Confirmar disponibilidad y modelo local. Si procede arrancarlos, el proyecto
  dispone de `bash scripts/ia-local.sh`.
- [ ] Repetir `npm run eval -- --live` y `npm run eval:apagon -- --live` y guardar
  resultados junto con el modelo y la configuración utilizados.
- [ ] Ajustar el prompt de extracción para recuperar palabras clave y lugares
  coherentes entre idiomas; contrastar la hipótesis de mover la advertencia de
  seguridad al principio y dejar la regla de no inventar al final.
- [ ] Mantener el delimitador de datos no confiables, el suelo de gravedad y los
  tests de inyección. No cambiar `gold`, las llamadas ni los umbrales para ocultar
  la regresión.
- [ ] Comparar con la tabla «X04: medición en vivo» de `docs/DECISIONES.md`:
  línea base DANA 7 incidentes y 4 preguntas; apagón 7 incidentes y 4 preguntas;
  0 fusiones incorrectas en ambos. Tras X04 se registraron DANA 7/0/11 y apagón
  8/0/3 (incidentes/fusiones incorrectas/preguntas).
- [ ] Cumplir al menos la línea base previa a X04 y mantener 0 fusiones
  incorrectas; registrar la comparación, actualizar PROGRESO y cerrar X04b.
  La referencia simulada sigue siendo DANA 7/0/2 y apagón 6/0/1.

## 3. Validaciones complementarias pendientes

- [ ] Probar el function calling con qwen2.5 real: la validación automatizada
  existente cubre respuestas de modelo simuladas y no acredita el modelo real.
- [ ] Revisar con un hablante nativo las frases nuevas en árabe de
  `WAITING_PHRASES` antes de utilizarlas con llamantes reales, como indica X06.

## Verificación para continuar y cerrar tareas

```bash
npm run lint
npm test
npm run build
npm run eval
npm run eval:apagon

# Terminal 1: consola sin depender de los servicios locales de IA.
LLM_BASE_URL= STT_BASE_URL= npm run start -- -p 3112
# Terminal 2:
node scripts/e2e.mjs

# Partes y trazas de ejemplo, fuera del repositorio.
npm run agente -- --json /tmp/agente-dana.json --parte /tmp/parte-dana.md
npm run agente -- --coordinador --json /tmp/agente-coordinador.json
npm run agente -- --escenario apagon --json /tmp/agente-apagon.json --parte /tmp/parte-apagon.md
```

Comprobar que los partes cuadran con las acciones y los incidentes del JSON,
están rotulados como simulación y que ES-Alert requiere al coordinador. Las
evaluaciones simuladas deben conservar DANA 7 incidentes/0 fusiones incorrectas/2
preguntas y apagón 6/0/1. Un fallo del modelo real se registra aparte y no se
presenta como validación del modo simulado.

## Límites vigentes para quien retome el trabajo

- La fase de agentes no modifica `components/`, `app/page.tsx`, `app/layout.tsx`,
  `app/globals.css` ni `lib/useConsole.ts`. La integración del logo en la cabecera
  es una petición posterior y acotada de Nick, registrada en DECISIONES.
- El modo simulado funciona sin GPU, red ni claves; la zona gris la decide una
  persona y las políticas de herramientas permanecen en código.
- Integración real con CAD, SMS, telefonía y ES-Alert, autenticación y persistencia
  quedan fuera del alcance aprobado del MVP. Requieren una planificación propia.
