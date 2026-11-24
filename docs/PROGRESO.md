# Progreso

Registro cronológico. Cada tarea cerrada o bloqueada añade una entrada al final (formato en las skills `cerrar-tarea` y `desbloquear`).

## Inicio
- Hecho fuera de este repo: investigación del 112 en España, especificación en docs/MEMORIA.md, `lib/types.ts` y `data/scenario-dana-malaga.ts` (26 llamadas, 7 incidentes).
- Siguiente: T01.

## 2026-10-28T00:12 · T01, T03, T04, T05 · hechas
- Qué se hizo: proyecto Next 15 (TypeScript 5.9, Next no soporta TS 7); `lib/cluster.ts`, `lib/engine.ts` (estado de incidentes, merge/ask/new, Separar), `lib/priority.ts`, `lib/labels.ts`; `scripts/eval.ts`.
- Verificación: `npm run lint`, `npm run build`, `npm test` (18 tests), `npm run eval` → 7 incidentes, 0 fusiones incorrectas, 2 preguntas (F1 y B2), E1 2.º.
- Decisiones: ver DECISIONES (locations, dolor_pecho, medición de E1).
- Siguiente: T06/T07 (IA y API), T02 y consola.

## 2026-10-28T00:25 · T06, T07 · hechas
- Qué se hizo: `lib/config|ai|prompts|sanitize|process.ts` y rutas `/api/process|status|translate|transcribe`. Sin `LLM_BASE_URL` usa el `mock`; el juez de zona gris solo opina.
- Verificación: 27 tests (incluye cliente LLM simulado con ```json y F1→ask), curl real a `/api/status` y `/api/process`, build OK.
- Siguiente: T02 y consola (T08–T14).

## 2026-10-28T01:10 · T02, T08–T14 · hechas
- Qué se hizo: consola completa en `components/` + `lib/useConsole.ts` (reloj, velocidades ×1/×4/×10, cola serie con plan B local si falla `/api/process`, incidentes provisionales, Mismo/Distinto/Separar), mapa SVG con zoom Bahía/Centro/Campanillas y animación de fusión, cola de prioridad, detalle con original | castellano, aviso de información nueva, frases rápidas con voz (`speechSynthesis`) y texto libre solo con IA local, atajos M y D, responsive (apilado en móvil), `prefers-reduced-motion`.
- Verificación: lint, build, 27 tests y eval en verde; `scripts/shot.mjs` (Playwright) pasa el escenario completo a ×10 resolviendo F1 y B2 con teclado, sin errores de consola; capturas miradas en `docs/capturas/` (escritorio 1440×900 y móvil 390×844). Correcciones tras mirarlas: mapa demasiado pequeño → zoom por zonas y tamaños escalados; polígono del mar; etiqueta cortada; mapa móvil cuadrado.
- Decisiones: ver DECISIONES (estética de consola en claro).
- Siguiente: T19 revisión visual a fondo; T16 audio; T20/T21 docs.

## 2026-10-28T01:25 · T19 · hecha
- Qué se hizo: `scripts/e2e.mjs` (Playwright): reproduce el escenario a ×10, comprueba que F1 y B2 quedan en ámbar hasta que el operador pulsa D/M, 26 llamadas → 7 incidentes, respuesta en árabe, Separar y cero errores de consola. Capturas revisadas: escritorio, móvil, centro y árabe.
- Verificación: `node scripts/e2e.mjs` → E2E OK. Cambio tras mirar: la vista previa traducida y "Reproducir al llamante" suben encima de las frases.
- Siguiente: T16 (audio), T20, T21.

## 2026-10-28T01:40 · T15, T16 · hechas (T15 con una salvedad)
- T15: `docker-compose.gpu.yml` (Ollama + speaches CUDA) y `scripts/setup-modelos.sh` (elige modelos según VRAM; en esta máquina RTX 4070 Laptop 8 GB → `qwen2.5:7b-instruct` + `faster-whisper-small`). Verificado: `docker compose config -q` y `bash -n`. **No se han descargado imágenes ni modelos ni se ha probado la IA en vivo** (varios GB; lo debe lanzar Nick): `bash scripts/setup-modelos.sh`.
- T16: `scripts/generate_audio.py` (Piper si hay modelos en `models/piper/`, si no edge-tts; filtro de teléfono y lluvia con ffmpeg). Probado con edge-tts en `.venv-audio/`: 26 audios en `public/audio/` (ignorados por git). Para regenerar: `python3 -m venv .venv-audio && .venv-audio/bin/pip install edge-tts && .venv-audio/bin/python scripts/generate_audio.py`.
- Siguiente: T17 (micrófono), T18 (eval --live), T20, T21.

## 2026-10-28T02:05 · T17, T18 · hechas (probadas contra IA simulada, no contra GPU)
- T17: `components/LivePanel.tsx` (micrófono con MediaRecorder → `/api/transcribe` → `/api/process`, ubicación AML elegida de una lista; solo activo si Whisper responde en `/api/status`). Las llamadas en directo entran como `L1…` en el mismo flujo.
- T18: `npm run eval -- --live` usa el LLM real (`lib/process.ts`); sin `LLM_BASE_URL` se salta con aviso y sale con 0.
- Verificación: `scripts/mock-ai.mjs` (servidor OpenAI-compatible falso) + `scripts/live-test.mjs` (Playwright con micrófono falso): la consola muestra «IA local», la llamada entra y se agrupa, sin errores. Captura `docs/capturas/T17-directo.png`. Falta probar con Ollama y Whisper reales (Nick: `bash scripts/setup-modelos.sh`).
- Siguiente: T20 (README), T21 (PITCH), T22.

## 2026-10-28T02:20 · T20, T21 · hechas
- README (arranque en 2 comandos, GPU, arquitectura, privacidad/Ley de IA) y `docs/PITCH.md` (guion 3 min, 6 diapositivas, preguntas del jurado, tabla de fuentes). Cifras solo de MEMORIA §3.
- Siguiente: T22 (verificar-mvp, etiqueta `mvp-v1`).

## 2026-10-28T03:00 · X03 y T22 · hechas — MVP presentable
- X03: botón «Exportar registro» (JSON de auditoría); probado en `scripts/e2e.mjs`.
- T22 (verificación hecha por el orquestador, sin subagente): instalación limpia (`rm -rf node_modules .next && npm install && npm run build`) OK; `npm run lint`, `npm test` (27) y `npm run eval` en verde (7 incidentes, 0 fusiones incorrectas, 2 preguntas, E1 2.º); sin `https://` externos en `app/ components/ lib/ data/`; `node scripts/e2e.mjs` OK (ámbar con M/D, árabe, Separar, exportar, 0 errores de consola, móvil sin scroll horizontal); capturas `docs/capturas/final-*.png` miradas; cifras de PITCH ⊆ MEMORIA §3.
- Pendiente para Nick: probar la IA real (`bash scripts/setup-modelos.sh`; luego `npm run eval -- --live`). No se ha probado con GPU.
- Siguiente: X01 (escenario apagón), X02 (métrica con/sin copiloto).

## 2026-10-28T03:40 · X01 · hecha
- Escenario 2 «Apagón en Málaga» (`data/scenario-apagon-malaga.ts`, 16 llamadas, 4 idiomas, 6 incidentes) + registro `data/scenarios.ts` + selector en la barra superior. Tipo nuevo `ascensor`.
- Verificación: `npm run eval:apagon` → 6 incidentes, 0 fusiones incorrectas, 1 pregunta (M1, segundo ascensor a ~560 m), J1 (oxígeno) 1.º; 30 tests; e2e recorre ambos escenarios; captura `docs/capturas/X01-apagon.png`.

## 2026-10-28T04:10 · X02 · hecha
- `lib/metrics.ts` (simulación de sala con N operadores: sin copiloto por orden de llegada, con copiloto primero incidentes nuevos por gravedad y duplicados a 15 s) + franja `components/SimStrip.tsx` + 3 tests. Supuestos declarados en la interfaz y en PITCH (no son datos reales). `npx tsx scripts/sim-metrics.ts` imprime la comparación por escenario y operadores.
- Estado: T01–T22 y X01–X03 hechas, etiqueta `mvp-v1` (sobre T22). Pendiente solo lo que requiere a Nick: IA real con GPU (`bash scripts/setup-modelos.sh`, `npm run eval -- --live`).

## 2026-11-24 · IA real en GPU, GitHub Pages y documento del proyecto (con Nick)
- IA local nativa (Ollama v0.40.17 + Whisper small en la RTX 4070): Whisper 0,4–0,9 s por llamada; qwen2.5:7b 4–9 s (más con la GPU a 89 °C, que baja a 210–420 MHz). `eval --live`: 0 fusiones incorrectas en las 5 ejecuciones, pero más preguntas de las previstas (ver DECISIONES).
- Prompt de extracción ajustado; evals simulados, 33 tests y build en verde.
- GitHub Pages: workflow + exportación estática probada en local. `docs/PROYECTO.md` con capturas y diagramas (`docs/img/`).
- Pendiente: medir con IA real el último ajuste del prompt; activar Pages en GitHub.

## 2026-11-24T17:40 · X04 · hecha (con una salvedad en vivo)
- Qué se hizo: transcripción y resúmenes delimitados como datos no confiables (`lib/untrusted.ts`); gravedad mínima por riesgos (`severityFloor`, solo salida del LLM); validación y límites en `/api/process`, `/api/translate` y `/api/transcribe` (`lib/validate.ts`, `lib/http.ts`, 400/413 en castellano); los `INC-xx` ya no se reutilizan (en la DANA, G pasa a INC-08) y `scripts/e2e.mjs` busca los incidentes por contenido.
- Verificación (orquestador): lint OK; 153 tests; `eval` 7/0/2 con E1 2.º y `eval:apagon` 6/0/1 con J1 1.º (simulado, igual que antes); build OK; `node scripts/e2e.mjs` con el servidor en modo simulado (`LLM_BASE_URL= STT_BASE_URL=`) → E2E OK. Ningún archivo de interfaz tocado.
- Salvedad: con IA local la agrupación empeora (DANA 11 preguntas frente a 4; apagón 8 incidentes frente a 7), con 0 fusiones incorrectas. Abierta X04b, bloqueada porque Ollama y Whisper se pararon a las 17:12.
- Aviso de entorno: `.env.local` apunta a la IA local; si está parada, la consola cae al plan B del navegador pero registra 502 en la consola del navegador. Para la demo sin GPU, arrancar con `LLM_BASE_URL= STT_BASE_URL= npm run dev`.
- Decisiones: 5 entradas X04 en DECISIONES.
- Siguiente: X05 (X04b espera a la IA local).

## 2026-11-24 · Mapa satelital y rediseño de la interfaz (con Nick)
- Qué se hizo: ortofoto PNOA del IGN incluida en la app (`scripts/build_satellite.py`, `assets/map/`), mapa con arrastre y zoom; rediseño de barra superior, resumen, llamadas, aviso de decisión, prioridad, detalle, respuesta traducida, simulación, bienvenida y ayuda (`components/`, `app/globals.css`). Ver DECISIONES.
- Verificación: `npm run lint`, `npm run build`, 33 tests, `npm run eval` (7 incidentes, 0 fusiones incorrectas, 2 preguntas, E1 2.º) y `eval:apagon` en verde; `node scripts/e2e.mjs` OK (adaptado a los nuevos contadores); `node scripts/capturas.mjs` sin errores de consola ni scroll horizontal en móvil; capturas `docs/capturas/consola-*.png` y `movil-*.png` revisadas. Exportación de GitHub Pages probada en una copia: las imágenes salen con la subruta.
- Llamada en directo (`scripts/live-test.mjs` con `mock-ai.mjs`) OK con el botón renombrado a «Grabar».
- Pendiente: probar la interfaz nueva con la IA real en GPU.

## 2026-11-24T18:30 · X05 · hecha
- Qué se hizo: `lib/actions.ts` (herramientas `proponer_recursos`, `sms_al_llamante` y `avisar_distribuidora`; política en código; planificador determinista con `PlanInput` sin texto libre; estados y conectores simulados con acuse; traza), `lib/plan.ts` y `POST /api/plan` (function calling con IA local, validado; sin LLM, reglas), `lib/agent.ts` y `npm run agente` (traza percepción → razonamiento → herramienta → aprobación → resultado).
- Verificación (orquestador): lint OK; 225 tests; `eval` 7/0/2 y `eval:apagon` 6/0/1, iguales que antes; `npm run agente` determinista (DANA: 20 acciones, 2 automáticas; apagón: 15, 4 automáticas); build OK; e2e en modo simulado OK; `/api/plan` con cuerpo inválido → 400 en castellano. Build estático de GitHub Pages reproducido sin `app/api` y desde cero: pasa (Next no comprueba los tipos de `tests/`, aunque `tsc` sí fallaría allí). Ninguna interfaz, `data/` ni frase existente tocada.
- Sin probar: function calling con qwen2.5 real (IA local parada); probado con fetch simulado y `mock-ai`.
- Decisiones: 6 entradas X05 en DECISIONES (SMS solo a quien no habla castellano, destino de la distribuidora por canal, provisionales sin acciones, lo que propone el modelo siempre pasa por el operador…).
- Siguiente: X06 (X04b espera a la IA local).

## 2026-11-24 · Llamadas del público por QR (rama `feature/llamadas-publico`)
- Seguimiento: `odd/tasks/llamadas-publico.md`. Contrato `lib/publicCall.ts`; extractor de reglas + nomenclátor (26/26 tipos correctos en las llamadas en castellano de los escenarios); relay `server/` con Docker, Caddy y Whisper CPU; `/llamar`, QR y bandeja en la consola.
- Verificación: 269 tests, `tsc`, `npm run eval` y `eval:apagon` OK, `npm run build` OK (`/llamar` estática); capturas `docs/capturas/llamar-movil.png` y `bandeja.png` revisadas (aceptar y descartar probados contra un SSE simulado).
- Sin probar: build de las imágenes Docker, Whisper real en CPU, grabación real en móvil (iOS Safari incluido). Necesita a Nick/equipo: desplegar en el VPS (`server/README.md`) y poner `NEXT_PUBLIC_RELAY_URL` en Vercel.
- Endurecimiento (T5): Whisper rechaza audio > máximo antes de transcribir, relay a 3 MB, IP real por el último salto de Caddy e IPv6 /64, cuota solo para llamadas válidas, 403 a otros orígenes, transcripción ≤ 4000 caracteres, ids aleatorios por arranque, secretos fuera de la imagen, STT sin root, alias genéricos fuera del nomenclátor, reconexión de la bandeja, token por `#op=` y recibo honesto. 289 tests.
- Desplegado en oracle-exit detrás de Tailscale Funnel (https://oracle-exit.tail0093c8.ts.net): web, relay y Whisper `base` en CPU; prueba por internet OK (IP real, sin suplantación, llamada aceptada → INC-01).

## 2026-11-24T22:40 · X06 · hecha
- Qué se hizo: `lib/waiting.ts` (sala simulada con N operadores, cola humana, escalado inmediato por riesgo vital, guion del asistente solo con frases pretraducidas), frases `asistente_automatico` y `que_pasa` en seis idiomas (`lib/phrases.ts`, sin tocar las existentes), integración en `lib/agent.ts` y `npm run agente -- --operadores N` (por defecto 2).
- Verificación (worker): 331 tests, `tsc` OK, `eval` 7/0/2 con E1 2.º y `eval:apagon` 6/0/1 con J1 1.º, `npm run agente` determinista (DANA, 2 operadores: 22 atendidas por el asistente, 7 duplicados sin operador, 13 escaladas; apagón: 14, 5 y 8). La zona gris nunca se resuelve sin operador. Ninguna interfaz tocada.
- Sin ejecutar en esta tarea: `npm run build` y e2e (otro agente tenía `.next`); `--live`.
- Decisiones: tres entradas X06 en `docs/BUZON.md`, pendientes de pasar a DECISIONES en X07. Los tiempos de sala son ilustrativos.
- Siguiente: X07.

## 2026-11-24T23:00 · Pestañas Simulación / En directo (QR) · hecha
- Qué se hizo: el control principal de la barra superior son dos pestañas; «Simulación» conserva el selector DANA/Apagón y la reproducción, «En directo (QR)» muestra la bandeja de llamadas del público y solo lo aceptado por el operador. Estado separado por pestaña (`lib/consoleMode.ts`); la simulación retoma donde estaba.
- Verificación (independiente): `tsc`, 331 tests, `eval` 7/0/2, `eval:apagon` 6/0/1, build con y sin relay y `scripts/e2e.mjs` en verde; capturas `docs/capturas/pestanas-*.png` de escritorio y móvil revisadas.
- Pendiente: redesplegar en el VPS para que se vea en público; el e2e necesita `npx playwright install chromium` en esta máquina.

## 2026-11-24T23:30 · X07 · hecha (verificación independiente de la política en curso)
- Qué se hizo: tres herramientas nuevas en `lib/actions.ts` con su política en código (propuesta de ES-Alert solo aprobable por un coordinador humano, aviso informativo automático al ayuntamiento, devolver llamada con aprobación del operador), `lib/report.ts` (parte de situación en Markdown y JSON, rotulado como simulación) y `npm run agente -- --parte archivo.md`.
- Verificación (worker): 340 tests, `tsc` OK, `eval` 7/0/2 y `eval:apagon` 6/0/1 iguales que antes; `npm run agente` determinista. DANA: 24 acciones, 23 envíos simulados y 1 ES-Alert pendiente (A y F, radio 272 m); D → aviso automático al ayuntamiento; B3 → devolver llamada. Sin coordinador simulado. Ninguna interfaz tocada.
- Sin ejecutar: `npm run build`, e2e y `--live` con modelo real. El umbral de 500 m para proponer ES-Alert es un supuesto de la demo, no un protocolo oficial.
- Decisiones: X06 y X07 en DECISIONES (entraron en el commit de las pestañas, 131e105).
- Siguiente: X08.
