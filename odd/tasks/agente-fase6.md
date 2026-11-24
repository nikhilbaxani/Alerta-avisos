# Fase 6: de copiloto a agente (X06–X08)

Cierra la fase 6 del tablero (`docs/TASKS.md`): agente de espera, herramientas nuevas con parte de situación, y README/PITCH.
Fuente de verdad: `docs/MEMORIA.md` §16 y `docs/PROPUESTA-AGENTE.md`. Contratos entre tareas: `docs/BUZON.md`.

## Specs

- **S1** (restricción de toda la fase, tablero): «**la interfaz no se toca** (`components/`, `app/page.tsx`, `app/layout.tsx`, `app/globals.css`, `lib/useConsole.ts`). Verificación común: `npm run build`, `npm run lint`, `npm test`, `npm run eval` y `npm run eval:apagon` en verde, `node scripts/e2e.mjs` en verde (la consola sigue igual) y `git diff --stat` sin archivos de interfaz.»
- **S2** (X06, tablero): «`lib/waiting.ts` puro: qué llamadas esperarían con N operadores (supuestos de `lib/metrics.ts`), guion del asistente en el idioma del llamante (presentación como asistente automático + instrucciones pretraducidas), escalado inmediato ante riesgo vital. Frases nuevas en `lib/phrases.ts` (sin tocar las existentes) y anotadas en DECISIONES.»
- **S3** (X06, tablero): «Integrado en `npm run agente` (opción de operadores, por defecto el de la franja de sala): llamadas atendidas por el agente, duplicados agrupados sin operador y escaladas, con su traza.»
- **S4** (X06, tablero): «Tests: nunca atiende una llamada que un operador libre puede coger; escala E1 (dolor torácico) si le toca esperar; `npm run eval` igual que antes.»
- **S5** (X07, tablero): «Tres herramientas nuevas en `lib/actions.ts` con su política (ES-Alert solo con rol coordinador). Tests: A y F (coches atrapados a ~460 m) → propuesta de ES-Alert con zona y texto; D (semáforos) → aviso automático al ayuntamiento; B3 (no responde) → devolver llamada.»
- **S6** (X07, tablero): «`lib/report.ts`: parte de situación (Markdown y JSON) desde el estado; `npm run agente` lo imprime al final y lo guarda con `--parte archivo.md`. Sin cifras inventadas, rotulado como simulación.»
- **S7** (X08, tablero): «Sección «El agente» en README (qué actúa, política de aprobación, seguridad, `npm run agente`), diapositiva percepción → decisión → acción en `docs/PITCH.md`, preguntas del jurado sobre inyección y automatismos. Métricas como simulación; cifras solo de MEMORIA §3. Sin cambiar el nombre de la interfaz.»
- **S8** (X08, tablero): «Verificación final con `/verificar-mvp` y etiqueta `agente-v1`.»
- **S9** (reglas de oro, `CLAUDE.md`): el modo simulado funciona sin GPU, wifi ni claves; la zona gris (`ask`) nunca se fusiona sola; la política de acciones está en código y tests, nunca la decide el LLM; ES-Alert siempre lo aprueba un humano; no se cambia `gold` ni los textos de las llamadas; no se inventan datos.

## Tasks

| ID | Specs | Ruta | Commit |
|---|---|---|---|
| T1 | S1, S2, S3, S4, S9 | X06: `lib/waiting.ts`, frases, integración en `npm run agente`, tests | 7765718 |
| T2 | S1, S5, S6, S9 | X07: tres herramientas en `lib/actions.ts`, `lib/report.ts`, `--parte`, tests | 36d0415, 030154b |
| T3 | S7, S8 | X08: README y PITCH; verificación final y etiqueta `agente-v1` | — |

## Log

- **L1** (usuario): «Sigue con la parte del hackathon sin terminar del talent land, nunca trabaje tu razona y manda a otros agentes a trabajar tu solo te encargar de razonar e guiar para el proyecto. Mira lo que se ha quedado.»
- **L2** (usuario, encauce): elige «Seguimiento ODD y delegar (Recomendado)».
- **L3** (estado al empezar): X04 y X05 hechas (225 tests entonces, 293 tras llamadas del público). X04b bloqueada por la IA local parada; no forma parte de este documento. En paralelo, otro worker termina T8 de `odd/tasks/llamadas-publico.md` (pestañas, archivos de interfaz).
- **L4** (T1/X06, worker): `lib/waiting.ts`, frases `asistente_automatico` y `que_pasa`, `--operadores` en `npm run agente`. RED 9 fallos → GREEN 28/28; suite 331/331, `tsc` OK, `eval` 7/0/2 (E1 2.º), `eval:apagon` 6/0/1 (J1 1.º), `npm run agente` determinista en los dos escenarios. Sin ejecutar: build y e2e (se comprueban con la verificación de T8 y en T3). Decisiones X06 en `docs/BUZON.md`, pendientes de pasar a DECISIONES en T2.
- **L5** (T2/X07, worker): tres herramientas nuevas en `lib/actions.ts` (ES-Alert solo coordinador y sin coordinador simulado, aviso automático al ayuntamiento, devolver llamada), `lib/report.ts` y `--parte`. RED 12 fallos → GREEN 90/90; suite 340/340, `tsc` OK, `eval` 7/0/2, `eval:apagon` 6/0/1, `npm run agente` determinista (DANA: 24 acciones, 23 envíos simulados, 1 ES-Alert pendiente para A/F con radio de 272 m; apagón: 17 envíos, sin ES-Alert). El umbral de 500 m para ES-Alert es un supuesto de demo. Las decisiones X06 y X07 quedaron dentro del commit 131e105 (DECISIONES). Sin ejecutar: build, e2e y `--live`; verificación independiente de la política lanzada aparte.
- **L6** (revisión nativa de X07, lineage review-f8bb610d89b06c1e, lentes risk y reliability): corrección exigida, la propuesta de policía local quedaba suprimida cuando había aviso municipal → restaurada (030154b, RED 5 fallos → GREEN 88/88; suite 343/343; DANA 25 acciones con 1 ES-Alert pendiente, apagón 18). Revisión aprobada. Avisos no bloqueantes pendientes: `nearby` fabricado en `/api/plan` sin test, índice de `points` frente a `calls` en la zona de ES-Alert, casos límite del umbral de 500 m sin tests, mensaje de política «(operador)» incorrecto para `aviso_ayuntamiento` en `tests/plan.test.ts:227`.
