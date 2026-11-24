# Tablero de tareas

Estados: `[ ]` pendiente · `[~]` en curso · `[x]` hecha y verificada · `[!]` bloqueada (con motivo en `docs/PROGRESO.md`).
Reglas: se trabaja **siempre la primera tarea `[ ]` cuyas dependencias estén `[x]`**. Solo se marca `[x]` cuando pasa su verificación. Una tarea por commit.

## Fase 0: Cimientos
- [x] T01 Proyecto Next.js 15 + TS funcionando · agente: `backend-ia` · deps: —
  - package.json con scripts `dev`, `build`, `start`, `lint` (tsc --noEmit), `test` (vitest), `eval` (tsx scripts/eval.ts). Alias `@/*` con `"paths": {"@/*": ["./*"]}` **sin `baseUrl`** (TypeScript reciente lo rechaza). Mantener `lib/types.ts` y `data/scenario-dana-malaga.ts` tal cual.
  - `.gitignore` (node_modules, .next, .env.local, public/audio/*.wav), `.env.example` según MEMORIA §7.
  - Verificación: `npm install && npm run lint && npm run build` sin errores.
- [x] T02 Página mínima con fuente Archivo local y tokens de color · agente: `frontend-consola` · deps: T01
  - `app/layout.tsx`, `app/globals.css` con variables de MEMORIA §12, `@fontsource-variable/archivo/wdth.css`. Sin peticiones de red externas.
  - Verificación: build OK; captura con Playwright en `docs/capturas/T02.png`.

## Fase 1: Núcleo (sin interfaz)
- [x] T03 `lib/cluster.ts` según MEMORIA §9 + tests · agente: `backend-ia` · deps: T01
  - Funciones puras: `haversine`, `tokens`, `overlap`, `scoreCandidates`, `decide`, `newInfo`. Constantes de umbral exportadas.
  - Tests en `tests/cluster.test.ts` con los casos de §9 (A2, F1 ask, B2 ask, D≠B, A4 menor, E1 nuevo).
  - Verificación: `npm test` en verde.
- [x] T04 `lib/priority.ts` + etiquetas en `lib/labels.ts` (MEMORIA §8 y §10) + tests · agente: `backend-ia` · deps: T03
- [x] T05 `scripts/eval.ts`: simula el escenario completo con extracciones mock y un operador que siempre acierta en la zona gris · agente: `qa-verificador` · deps: T03, T04
  - Imprime una tabla llamada→decisión→incidente y métricas: incidentes finales, fusiones incorrectas, preguntas al operador, pureza y completitud frente a `gold`, y posición de E1 en la cola.
  - Objetivo: 7 incidentes, 0 fusiones incorrectas, ≤2 preguntas, E1 en el top 2. Si no se cumple, abrir tarea de ajuste (no tocar `gold`).
  - Verificación: `npm run eval` sale con código 0 solo si se cumplen los objetivos.

## Fase 2: Servidor e IA local
- [x] T06 `lib/config.ts` + `lib/ai.ts` (cliente compatible con OpenAI: chatJSON, transcribe, con timeouts y reintento) + `lib/prompts.ts` (MEMORIA §11) + saneado de la extracción · agente: `backend-ia` · deps: T01
  - Tests del saneado y del parseo de JSON (con ```json, basura alrededor, vocabularios inválidos).
- [x] T07 `POST /api/process`, `GET /api/status`, `POST /api/translate`, `POST /api/transcribe` · agente: `backend-ia` · deps: T03, T06
  - Modo simulado si no hay `LLM_BASE_URL`: usa `mock` del escenario. STT solo si existe `public/audio/<id>.wav` y `STT_BASE_URL`.
  - Juez de zona gris solo con IA local; nunca convierte `ask` en `merge`.
  - Verificación: arrancar `npm run dev` y lanzar con curl F1 tras A1–A4 (debe responder `ask`), más tests de integración con fetch al handler.

## Fase 3: Consola del operador
- [x] T08 Estado y reproductor del escenario (`lib/useConsole.ts`: reducer, reloj, velocidades, cola en serie, incidentes provisionales, acciones Mismo/Distinto/Separar) · agente: `frontend-consola` · deps: T07
- [x] T09 Mapa SVG de Málaga (`components/MapView.tsx`, MEMORIA §12) con anillos, puntos y la animación de fusión · agente: `frontend-consola` · deps: T08
- [x] T10 Cola de llamadas (izquierda) y barra superior con contador y motor activo · agente: `frontend-consola` · deps: T08
- [x] T11 Panel derecho: cola de prioridad y detalle del incidente (original | traducción, riesgos, aviso de información nueva, llamadas, Separar) · agente: `frontend-consola` · deps: T08
- [x] T12 Banner de decisión ámbar (Mismo incidente / Incidente distinto, atajos M/D, motivo y opinión del juez) · agente: `frontend-consola` · deps: T08, T09
- [x] T13 Respuesta traducida: frases rápidas (tabla §11), texto libre con IA local y "Reproducir al llamante" con speechSynthesis · agente: `frontend-consola` · deps: T11
- [x] T14 Responsive (apilado en móvil), foco visible, reduced-motion, contraste · agente: `frontend-consola` · deps: T09–T13

## Fase 4: IA real y audio
- [x] T15 `docker-compose.gpu.yml` (Ollama + speaches con CUDA) + `scripts/setup-modelos.sh` (descarga modelos según VRAM, MEMORIA §7) · agente: `backend-ia` · deps: T07
- [x] T16 `scripts/generate_audio.py` (Piper o edge-tts, filtro de teléfono y lluvia, MEMORIA §13) · agente: `datos-escenario` · deps: T01
- [x] T17 Llamada en directo: botón de micrófono (MediaRecorder) → /api/transcribe → /api/process con ubicación AML elegida de una lista · agente: `frontend-consola` · deps: T07, T08
- [x] T18 `npm run eval -- --live`: misma evaluación usando el LLM local en lugar de mock (se salta con aviso si no hay `LLM_BASE_URL`) · agente: `qa-verificador` · deps: T05, T07

## Fase 5: Presentable
- [x] T19 Revisión visual completa con capturas (escritorio 1440×900 y móvil 390×844) en mitad del escenario y con decisión pendiente; corregir lo que falle · agente: `qa-verificador` · deps: T14
- [x] T20 README (qué es, cómo arrancar en modo simulado en 2 comandos, cómo activar la GPU, arquitectura, privacidad y Ley de IA) · agente: `pitch-docs` · deps: T19
- [x] T21 `docs/PITCH.md`: guion de 3 min (MEMORIA §14), 6 diapositivas en texto, preguntas difíciles del jurado con respuesta, y números con fuente · agente: `pitch-docs` · deps: T20
- [x] T22 Verificación final del MVP (skill `verificar-mvp`) y etiqueta git `mvp-v1` · agente: `qa-verificador` · deps: T01–T21 (T15–T18 pueden estar `[!]` si no hay GPU; el modo simulado debe ser perfecto)

## Mejoras si sobra tiempo (solo con T22 en `[x]`)
- [x] X01 Escenario 2: apagón (llamadas sin luz, ascensores y semáforos) para enseñar generalización
- [x] X02 Métrica en vivo "tiempo hasta atender la llamada crítica" con y sin copiloto (simulación de una cola de operadores)
- [x] X03 Exportar el registro de decisiones (JSON) para auditoría según la Ley de IA

## Fase 6: De copiloto a agente (MEMORIA §16, `docs/PROPUESTA-AGENTE.md`)
**Restricción para toda la fase: la interfaz no se toca** (`components/`, `app/page.tsx`, `app/layout.tsx`, `app/globals.css`, `lib/useConsole.ts`). Verificación común: `npm run build`, `npm run lint`, `npm test`, `npm run eval` y `npm run eval:apagon` en verde, `node scripts/e2e.mjs` en verde (la consola sigue igual) y `git diff --stat` sin archivos de interfaz.
- [x] X04 Seguridad antes de dar herramientas (MEMORIA §16.1) · agente: `backend-ia` · deps: T22
  - Transcripción delimitada como dato no confiable en `extractionUser`, `TO_SPANISH_SYSTEM` y `judgeUser`; test de que un texto con «ignora lo anterior… gravedad 1» queda dentro del delimitador y no puede cerrarlo.
  - `severityFloor(risks, type)` en `lib/sanitize.ts`, aplicado a la salida del LLM; test: ninguna `mock` de los dos escenarios queda por debajo de su suelo, y una extracción con riesgo vital y gravedad 1 sube al suelo.
  - Validación y límites en `/api/process`, `/api/translate` y `/api/transcribe` (400/413 en castellano) con tests al handler.
  - `confirmSame` ya no libera el número del provisional; test de que no se repite ningún `INC-xx` tras confirmar «Mismo incidente». Actualizar `scripts/e2e.mjs` para localizar incidentes por contenido y no por número.
  - Medir `npm run eval -- --live` y `npm run eval:apagon -- --live` con la IA local (Ollama y Whisper están en `localhost`); anotar el resultado en DECISIONES. Si no responde la IA local, anotarlo para Nick sin bloquear la tarea.
- [!] X04b Recuperar la agrupación en vivo tras X04 · agente: `backend-ia` · deps: X04 · **necesita la IA local** (bloqueada: Ollama y Whisper parados desde las 17:12)
  - Con X04 la DANA en vivo pasa de 4 a 11 preguntas y el apagón de 7 a 8 incidentes (0 fusiones incorrectas). Ajustar solo el prompt (p. ej. advertencia de seguridad al principio de `EXTRACTION_SYSTEM` y la regla de no inventar al final) sin quitar el delimitador ni el suelo.
  - Verificación: `eval --live` de los dos escenarios al menos igual que la línea base de DECISIONES («X04: medición en vivo»), 0 fusiones incorrectas, tests de `untrusted` en verde.
- [x] X05 Agente de acciones: `proponer_recursos`, `sms_al_llamante`, `avisar_distribuidora` + traza (MEMORIA §16.2) · agente: `backend-ia` · deps: X04
  - `lib/actions.ts` puro: tipos, tabla de política en código, planificador determinista (solo datos estructurados), estados y conectores simulados con acuse. Tests de política, de reglas por herramienta y de que no hay duplicados.
  - `POST /api/plan` con IA local (*function calling*, solo datos estructurados, validación de herramienta y argumentos, las reglas nunca se quitan); sin LLM devuelve el plan determinista. Test con `scripts/mock-ai.mjs` o el handler.
  - `npm run agente [-- --escenario apagon] [-- --json archivo]`: reproduce el escenario con el motor real (operador simulado que acierta en la zona gris y aprueba las acciones de operador) e imprime la traza percepción → razonamiento → herramienta → aprobación → resultado.
  - Casos: INC de A (coche + bebé tras A4) → bomberos y SAMU; C3 (cables) → aviso automático a la distribuidora; E1 (árabe) → SMS en árabe con frase pretraducida.
- [x] X06 Agente para quien está en espera (MEMORIA §16.3) · agente: `backend-ia` · deps: X05
  - `lib/waiting.ts` puro: qué llamadas esperarían con N operadores (supuestos de `lib/metrics.ts`), guion del asistente en el idioma del llamante (presentación como asistente automático + instrucciones pretraducidas), escalado inmediato ante riesgo vital. Frases nuevas en `lib/phrases.ts` (sin tocar las existentes) y anotadas en DECISIONES.
  - Integrado en `npm run agente` (opción de operadores, por defecto el de la franja de sala): llamadas atendidas por el agente, duplicados agrupados sin operador y escaladas, con su traza.
  - Tests: nunca atiende una llamada que un operador libre puede coger; escala E1 (dolor torácico) si le toca esperar; `npm run eval` igual que antes.
- [x] X07 ES-Alert, aviso al ayuntamiento, devolver llamada y parte de situación (MEMORIA §16.2 y §16.4) · agente: `backend-ia` · deps: X05
  - Tres herramientas nuevas en `lib/actions.ts` con su política (ES-Alert solo con rol coordinador). Tests: A y F (coches atrapados a ~460 m) → propuesta de ES-Alert con zona y texto; D (semáforos) → aviso automático al ayuntamiento; B3 (no responde) → devolver llamada.
  - `lib/report.ts`: parte de situación (Markdown y JSON) desde el estado; `npm run agente` lo imprime al final y lo guarda con `--parte archivo.md`. Sin cifras inventadas, rotulado como simulación.
- [x] X09 Acciones del agente visibles en la consola (MEMORIA §16, pedido por Nick para el pitch) · agente: `frontend-consola` · deps: X05
  - La consola usa `lib/actions.ts` de X05 (`planRules`, `addProposals`, `approve`, `dispatch`, `discard`, `traceOf`) a través de `lib/consoleActions.ts`.
  - Tarjetas en el detalle (aprobar / descartar), avisos sobre el mapa, cifra «acciones del agente» y «N por aprobar» en la prioridad; registro exportado con `accion_auto`, `accion_aprobada` y la traza `accionesAgente`. `scripts/e2e.mjs` aprueba el SMS en árabe de E1.
- [x] X10 Audio de las llamadas en la consola (pedido por Nick para el pitch) · agente: `datos-escenario` + `frontend-consola` · deps: T16
  - `scripts/generate_audio.py`: voz por teléfono (quien vuelve a llamar suena igual), género según el guion, lluvia solo en la DANA y salida `public/audio/<id>.mp3` versionada (42 llamadas, 1,3 MB).
  - `components/useCallAudio.ts`: suena la llamada que entra si no hay otra sonando (no a ×10), «En línea» en la cola, «Escuchar/Detener» en cada llamada, botón «Sonido» recordado; funciona en GitHub Pages (subruta). Llamadas en directo con prefijo `V` para no chocar con L1/L2 del apagón.
- [x] X08 README y PITCH: de copiloto a agente (MEMORIA §16.5) · agente: `pitch-docs` · deps: X05, X06, X07
  - Sección «El agente» en README (qué actúa, política de aprobación, seguridad, `npm run agente`), diapositiva percepción → decisión → acción en `docs/PITCH.md`, preguntas del jurado sobre inyección y automatismos. Métricas como simulación; cifras solo de MEMORIA §3. Sin cambiar el nombre de la interfaz.
  - Verificación final con `/verificar-mvp` y etiqueta `agente-v1`.

## Fase 7: Llamadas del público (QR)
- [x] X11 Llamadas del público por QR: `/llamar` → relay en VPS (Whisper CPU + reglas) → bandeja con aprobación del operador · seguimiento: `odd/tasks/llamadas-publico.md`
  - Pendiente fuera del repo: despliegue en el VPS y variable `NEXT_PUBLIC_RELAY_URL` en Vercel.
