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

## 2026-11-24T19:20 · X06 · hecha
- Qué se hizo: `lib/waiting.ts` (sala con y sin agente de espera con los supuestos de `lib/metrics.ts`, triaje, guion con frases fijas en `WAITING_PHRASES`, separadas de `PHRASES` para no cambiar la consola) e integración en `npm run agente -- --operadores N` (por defecto 2, como la franja de sala).
- Triaje (decidido por el orquestador tras la primera entrega): escala solo el riesgo vital que la sala aún no conoce (incidente nuevo, zona gris, provisional, información nueva o riesgo vital o gravedad 5 nuevos para el incidente, p. ej. G2); un duplicado con riesgo vital ya conocido sigue en la cola humana en su orden; un duplicado sin riesgo vital se cierra sin operador. La primera versión escalaba también los duplicados conocidos y retrasaba emergencias nuevas (C1 0:19 → 2:07).
- Resultado (simulación, 2 operadores, DANA): 20 llamadas atendidas por el asistente en vez de esperar sin nadie, 6 duplicados sin operador, 7 escaladas; espera media de emergencias nuevas igual (0:13) y E1 igual (0:26); 1:30 menos de operador. Con 1 operador la espera media empeora (lo vital desconocido pasa delante). No vender como mejora de esperas.
- Verificación (orquestador): lint OK; 257 tests; `eval` y `eval:apagon` idénticos; `npm run agente` OK; build OK; e2e en modo simulado OK; `PHRASES` sin líneas borradas; interfaz, `data/` y `lib/metrics.ts` sin tocar.
- Pendiente: revisión del árabe de las frases nuevas por un hablante nativo.
- Siguiente: X07.

## 2026-11-24 · X07 · hecha y verificada en modo simulado
- Qué se hizo: herramientas `aviso_ayuntamiento`, `devolver_llamada` y `proponer_es_alert` en `lib/actions.ts`; ES-Alert por zona tras confirmar incidentes distintos, sin duplicados y con aprobación exclusiva de coordinador; `lib/report.ts` genera el parte calculado del estado en Markdown y JSON; la CLI incorpora `--coordinador` y `--parte`.
- Verificación de la entrega: `npm run lint`, 303 tests, `npm run build`, `npm run eval` (DANA 7 incidentes/0 fusiones incorrectas/2 preguntas) y `npm run eval:apagon` (6/0/1), todos correctos. E2E de consola correcto en modo simulado: decisiones F1/B2, respuesta en árabe, Separar, auditoría, apagón y móvil sin desbordamiento ni errores de consola. Capturas de esta comprobación en `/tmp/alerta-avisos-commit-qa/`, sin reemplazar las capturas versionadas.
- CLI y exportaciones Markdown/JSON comprobadas: DANA 25 acciones, 24 enviadas y 1 ES-Alert pendiente de coordinador; con `--coordinador`, 25 enviadas; apagón 18 acciones enviadas y sin ES-Alert. Todos los servicios y acuses son simulados. Sin cambios de interfaz ni de `data/`.
- Límite de la comprobación: el primer E2E con la configuración local de IA devolvió errores 502; al arrancar una instancia con `LLM_BASE_URL` y `STT_BASE_URL` vacíos, el E2E pasó. No se acredita IA real ni se cierra X04b.
- Entrega adicional: fuentes y exportaciones de marca Avance 112, `docs/texto.md`, `nombres.md` y `pendiente de implementacion-agents.md`, que concreta X08, X04b y las validaciones restantes.
- Siguiente: X08 (README, PITCH y verificación final para `agente-v1`). X04b sigue pendiente de resolver y medir con IA local.

## 2026-11-24 · Logo Avance 112 en la cabecera
- Petición de Nick: integrar arriba el GIF de Avance 112 sin fondo, hacer pull antes del push y subir la entrega.
- Cambio: se reutilizan el GIF transparente y el PNG existentes mediante importaciones locales en `TopBar`; el PNG se selecciona con `prefers-reduced-motion`. Los estilos adaptan la cabecera a móvil y recortan solo el margen transparente del archivo.
- Verificación: build y TypeScript correctos; Chromium comprueba carga del GIF, píxel con alfa 0, fondo CSS transparente, controles Iniciar/Pausar y ausencia de solapamientos o scroll horizontal a 320, 390, 768, 980, 1024, 1280 y 1440 px. Con movimiento reducido se carga el PNG. Capturas revisadas en `/tmp/alerta-avisos-logo-qa/`.
- GitHub Pages: exportación estática comprobada en una copia temporal sin rutas API; el GIF y el PNG se incluyen bajo `/Alerta-avisos/_next/static/media/`. La petición autoriza únicamente esta actualización visual de la cabecera, sin modificar la lógica del agente.

## 2026-11-24 · Logo sin repetición en la consola
- Petición de Nick: reservar el bucle para la futura landing y evitar la repetición en la interfaz.
- Cambio: `TopBar` utiliza el SVG animado existente, que termina en reposo tras una entrada. El GIF original mantiene su bucle; el PNG sigue siendo la alternativa para movimiento reducido.
- Verificación: TypeScript correcto y prueba con Chromium en la aplicación local; se observa la entrada, se comparan capturas tras finalizar y después del antiguo periodo de 4,8 s, al pasar el cursor y al usar Iniciar/Pausar. El logo permanece fijo; móvil sin desbordamiento y movimiento reducido con PNG. Captura en `/tmp/alerta-avisos-logo-qa/logo-una-vez.png`.

## 2026-11-24 · X09 · hecha
- Qué se hizo: la consola usa el agente de acciones de X05–X07 (seis herramientas, incluido el ES-Alert de zona, que solo aprueba un coordinador): `lib/consoleActions.ts` (estado de la consola → `PlanInput`), estado y registro de acciones en `lib/useConsole.ts` y `lib/audit.ts` (traza completa), `components/AgentActions.tsx` y `components/AgentFeed.tsx`, cifra en el resumen y pastilla «por aprobar» en la prioridad. MEMORIA §16 y CLAUDE.md actualizados (la interfaz cambia en X09–X10 por petición de Nick).
- Verificación: ver el commit; `node scripts/e2e.mjs` aprueba el SMS en árabe y comprueba el registro.
- Siguiente: X10 (audio de las llamadas).

## 2026-11-24 · X10 · hecha
- Qué se hizo: audio regenerado para los dos escenarios con MP3 versionado, reproducción en la consola (`components/useCallAudio.ts`), indicador «En línea», «Escuchar/Detener», botón «Sonido»; ids de llamadas en directo `V…`; guion del pitch y README actualizados.
- Verificación: lint, build, 46 tests, `eval` y `eval:apagon` en verde; `node scripts/e2e.mjs` OK (comprueba los MP3 y «Escuchar»); reproducción automática a ×4 probada con Playwright; `scripts/live-test.mjs` con `mock-ai.mjs` OK; exportación de GitHub Pages servida bajo `/Alerta-avisos/`: suena A1 y no hay peticiones fallidas; capturas revisadas.
- Pendiente: escucharlo de verdad en el portátil de la demo (volumen del proyector).

## 2026-11-24 · Rediseño: zonas, mapa de calles y modo claro/oscuro · hecho
- Qué se hizo: estética oscura tipo consola de despacho; cabecera con pestañas (Llamadas, Emergencias, Traducción, Acciones, Análisis) y barra de simulación + cifras; decisión ámbar global; ficha emergente sobre el mapa; mapa vectorial de OpenStreetMap (`scripts/build_streets.py`, `assets/map/streets.json`) con conmutador Mapa/Satélite; modo claro y oscuro; barra de pestañas inferior en móvil. `scripts/e2e.mjs` y `scripts/capturas.mjs` navegan por las pestañas (mismas comprobaciones). Ver DECISIONES.
- Verificación: lint, build, 312 tests, `eval` en verde; `node scripts/e2e.mjs` OK; `node scripts/capturas.mjs` sin errores ni scroll horizontal en móvil; capturas de escritorio (oscuro y claro) y móvil revisadas.

## 2026-11-24 · Pantalla única por cajas, mapa fluido, audio a mano e incidentes enlazados · hecho
- Qué se hizo: ver DECISIONES (misma fecha). `components/Console.tsx` (rejilla de cajas), `ActionsBox`, `TranslateBox`, `IncToken`, `CallQueue` (Recientes / Por emergencia / Por decidir), `MapView` (capa base memorizada + transformación durante gestos, pastilla de acciones por aprobar), `useCallAudio` sin reproducción automática. Fuera `SimStrip`, `ActionsView`, `TranslateView` y las pestañas.
- Verificación: lint, build, 312 tests, `eval` en verde; `node scripts/e2e.mjs` OK (ahora también comprueba que no suena audio solo); `node scripts/capturas.mjs` sin errores ni scroll horizontal en móvil; capturas de escritorio (oscuro/claro) y móvil revisadas.

## 2026-11-24 · Recursos por tipo de incidente (robo → Policía Nacional) y llamada escrita a mano · hecho
- Qué se hizo: ver DECISIONES (misma fecha). `lib/types.ts`, `lib/labels.ts`, `lib/prompts.ts`, `lib/sanitize.ts`, `lib/actions.ts` (servicio y regla), `lib/keywordExtract.ts`, `components/ManualCall.tsx`; tests nuevos en `tests/actions.test.ts` y `tests/keywordExtract.test.ts`.
- Verificación: lint, build, 328 tests, `eval` y `eval:apagon` en verde; `node scripts/e2e.mjs` OK; prueba en el navegador: incendio → Bomberos, robo con navaja → Policía Nacional, inconsciente → SAMU 061, sin errores de consola.

## 2026-11-25 · Incidencia solucionada, archivo y rótulos del mapa · hecho
- Qué se hizo: ver DECISIONES (misma fecha). `lib/engine.ts` (`resolveBlocker`, `resolveIncident`, `reopenIncident`), acciones `resolve`/`reopen` en `lib/useConsole.ts`, `components/ResolveButton.tsx`, `components/ArchiveDialog.tsx`, estados «solucionada» en llamadas y acciones, rótulos del mapa arreglados y cabecera compacta hasta 1366 px.
- Verificación: lint, build, 328 tests, `eval` en verde; `node scripts/e2e.mjs` OK (ahora también soluciona, abre el archivo y reabre); capturas revisadas en oscuro y claro.

## 2026-11-25 · Integración con la presentación de GitHub (`/presentacion`) · hecho
- Qué se hizo: merge de `origin/main` (presentación interactiva, QR, vuelta desde la consola) con el rediseño de la consola. Conflictos resueltos conservando las dos partes (`useConsole` exporta `init`/`reducer` y además lleva el archivo; iconos; DECISIONES). La presentación usa ya las piezas nuevas: `TopBar` sin botones de tema ni archivo (son opcionales), `MapView` sin botones de la ficha (opcionales), `PriorityList` como caja y `AgentActions` como lista de `ActionCard`. CSS de la consola incrustada (diapositiva 6) adaptado a la cabecera de una fila. El enlace a la presentación de la barra superior se oculta entre 1101 y 1599 px (ahí no cabe); sigue en la bienvenida. Los avisos del agente suben cuando aparece «Volver a la presentación».
- Verificación: lint, build, 336 tests (incluidos los de la presentación), `eval` y `eval:apagon` en verde; `node scripts/e2e.mjs` OK; las 12 diapositivas revisadas con capturas, sin errores de consola.

## 2026-11-25T02:08:19+01:00 · X11 · hecha
- Qué se hizo: caja «En espera» (`components/WaitingBox.tsx`) en la columna izquierda de la consola, alimentada por `lib/waitingConsole.ts` (función pura que reutiliza `lib/waiting.ts` con las llamadas ya llegadas; `lib/agent.ts` usa la misma lógica). Selector de 1–4 operadores (2 por defecto), contadores atendidas/agrupadas/escaladas, aviso rojo de escalada, guion del asistente en el idioma del llamante y rótulo «Simulación con supuestos declarados».
- Verificación (qa-verificador APTO): lint OK, build OK, 347 tests en verde (incluidos X06 y `tests/waitingConsole.test.ts`), eval OK (7/7, 0 fusiones incorrectas), eval:apagon OK (6/6), `e2e.mjs` OK (caja, ≥1 atendida por el asistente, E1 escalada con 1 y 2 operadores), exportación de GitHub Pages probada en copia temporal; capturas `docs/capturas/X11v-*.png` revisadas (escritorio y móvil, oscuro y claro), sin errores de consola ni scroll horizontal.
- Decisiones: ver DECISIONES (X11).
- Pendiente menor (no de X11): el aviso pasajero «El agente ha enviado…» se pinta encima de una tarjeta durante su animación a mitad de escenario.
- Siguiente: X12.

## 2026-11-25T02:26:24+01:00 · X12 · hecha
- Qué se hizo: `lib/missingInfo.ts` (tabla `MISSING_RULES` por tipo: respira, dirección, personas, altura del agua, planta, heridos; `incidentMissing(incident, calls)`), `MISSING_PHRASES` aparte en `lib/phrases.ts` (personas, altura_agua, planta en en/de/fr/ar/it; las existentes se reutilizan por id). Lista «Falta saber» en `IncidentDetail`: el clic prepara la pregunta en el idioma del llamante en la caja de Traducción, sin reproducirla; si todo es en castellano, se muestra en la ficha.
- Verificación (qa-verificador APTO): lint OK, build OK, 368 tests (21 de `missingInfo`), eval 7/7 y eval:apagon 6/6 sin fusiones incorrectas, `e2e.mjs` OK (E1 muestra `respira` y el clic prepara «هل الشخص يتنفس؟» sin sonar), exportación de GitHub Pages OK, capturas `docs/capturas/X12-*` revisadas en oscuro y claro, sin errores de consola ni scroll horizontal en móvil.
- Decisiones: ver DECISIONES («X12: Falta saber»).
- Pendiente menor: el aviso flotante «El agente ha enviado…» tapa unos segundos la parte baja del detalle (ya anotado en X11).
- Siguiente: X13.

## 2026-11-25T02:40:57+01:00 · X13 · hecha
- Qué se hizo: canal `ecall` en `lib/types.ts` y `lib/ecall.ts` (datos estructurados: activación, ocupantes, rumbo, vehículo, posición; transcripción generada a partir de los datos, sin STT ni LLM). eCall EC1 (t=14, gold A, manual, 3 ocupantes, ±10 m) en `data/scenario-dana-extra.ts`, unida en `data/scenarios.ts`; el escenario protegido no se toca. En la consola: icono de coche y rótulo «eCall» en la cola, tarjeta «Mensaje de datos (sin voz)» con sus datos y sin «Escuchar».
- Verificación (qa-verificador APTO): lint OK, build OK, 374 tests (6 en `tests/ecall.test.ts`), eval 7/0/2 (F1 y B2, E1 2.º; EC1 merge INC-01 0,90), eval:apagon 6/0/1, `e2e.mjs` OK (27 llamadas, eCall en A), GitHub Pages OK, capturas `docs/capturas/X13-*` revisadas en escritorio y móvil, oscuro y claro, sin errores de consola ni scroll horizontal.
- Decisiones: ver DECISIONES (X13: canal eCall, transcripción generada, fuera de la sala de voz del agente de espera, tipo fijado en el escenario). Recuentos 26→27 ajustados solo en el número.
- Pendiente menor: EC1 sale como «Repetida» en la cola; «±10 m» se parte en dos líneas en la tarjeta; README/PITCH dicen 26 llamadas (para X08). En X14 decidir si EC1 recibe SMS de duplicado.
- Siguiente: X14.

## 2026-11-25T02:56:16+01:00 · X14 · hecha
- Qué se hizo: herramienta `sms_duplicado` en `lib/actions.ts` (política «operador», fuera de las que puede proponer el LLM), frase nueva `DUPLICATE_PHRASES` en `lib/phrases.ts` (es/en/de/fr/ar/it). Se propone solo si el incidente tiene recursos aprobados o enviados; una vez por teléfono (también entre incidentes); EC1 excluida. Lote por incidente con «Aprobar todos (n)» en la caja de acciones (`actionApproveBatch`); los repetidos que traen información nueva (A4, C3, G2, B3/B4, G3/G4) van aparte y marcados. Traza de `npm run agente` y registro con `batch: true`.
- Verificación (qa-verificador APTO): lint OK, build OK, 388 tests (nuevo `tests/duplicate.test.ts`), eval 7/0/2 y eval:apagon 6/0/1 sin cambios, `e2e.mjs` OK (aprueba el lote de INC-01), exportación de GitHub Pages OK, capturas `docs/capturas/X14-*` revisadas (escritorio/móvil, oscuro/claro), 0 errores de consola, sin scroll horizontal en móvil. `data/` sin cambios.
- Decisiones: ver DECISIONES (X14).
- Pendiente menor: en escritorio la caja de Acciones es baja (~250 px) y hay que desplazarse para llegar a «Aprobar todos».
- Siguiente: X15.

## 2026-11-25T03:26:10+01:00 · X15 · hecha
- Qué se hizo: llamadas perdidas simuladas en `data/lost-calls.ts` (P1–P5 DANA, P6–P7 apagón; `Scenario.lost`, fuera del motor y del eval). `lib/lostCalls.ts` puro (`analyzeLostCalls`: mismo teléfono y luego posición con `spatial()` de `lib/cluster.ts`, solo incidentes abiertos; devoluciones delante de duplicados). `devolver_llamada` con `motivo: "llamada_perdida"` y SMS de X14 para duplicados, ambos de operador. Caja `#box-lost` (`components/LostCallsBox.tsx`) con «Devolver primero» y «Probables duplicados», motivo, estado y Aprobar/Descartar; ayuda plegable con la cifra de §3 y su fuente. El aviso flotante del agente va ahora dentro del mapa (pendiente de X11/X12 resuelto).
- Verificación (qa-verificador APTO): lint OK, build OK, 405 tests (17 en `tests/lostCalls.test.ts`), eval 7/0/2 y eval:apagon 6/0/1 sin cambios, `e2e.mjs` OK (caja, P3 desconocida antes de P1 duplicado, aprobar P3 no envía P1), GitHub Pages OK, capturas `docs/capturas/X15-*` revisadas, 0 errores de consola, sin scroll horizontal en móvil. Escenario protegido intacto.
- Decisiones: ver DECISIONES («X15: llamadas perdidas»).
- Pendiente menor: a 1440×900 la caja de perdidas es baja (solo se ve P3 sin desplazar); columna izquierda llena (X16/X17 no deberían añadir otra caja ahí); `/presentacion` no muestra la caja; una devolución propuesta no se retira si la perdida pasa a duplicado.
- Siguiente: X16.

## 2026-11-25T07:22:41+01:00 · X16 · hecha
- Qué se hizo: `lib/units.ts` puro con parque simulado de 10 unidades (B-1..3, S-1..3, PL-1..2, PN-1..2; bases rotuladas «(simulación)»). Al aprobar `proponer_recursos` el reducer asigna la libre más cercana del servicio (haversine) o dice que no hay; estado y posición se derivan del reloj (`consoleUnits`: asignada → en camino → en el lugar) y `resolve` las libera. Mapa: cuadrados con sigla y rótulo de estado, línea discontinua al incidente, leyenda «Unidades: simulación», sin transición con `prefers-reduced-motion`. La tarjeta de Acciones muestra la unidad propuesta/asignada.
- Verificación (qa-verificador APTO): lint OK, build OK, 418 tests (incluido `tests/units.test.ts`: más cercana, sin libres, avance, liberación), eval 7/0/2 y eval:apagon 6/0/1 sin fusiones incorrectas, `e2e.mjs` OK (B-2 asignada a INC-01 en el mapa con su línea y en la tarjeta), GitHub Pages OK, capturas `docs/capturas/X16-*` revisadas (escritorio/móvil, oscuro/claro), 0 errores de consola, sin scroll horizontal. `data/` sin cambios.
- Decisiones: ver DECISIONES («X16: unidades simuladas»).
- Pendiente menor: si se aprueba con el escenario terminado (reloj parado en end+1) la unidad se queda «asignada» y no avanza; al aprobar se abre la ficha de INC-01 y en escritorio tapa B-2; en móvil el aviso «Enviado con tu aprobación» tapa el botón «Satélite».
- Siguiente: X17.
