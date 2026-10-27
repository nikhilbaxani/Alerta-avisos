# Tablero de tareas

Estados: `[ ]` pendiente · `[~]` en curso · `[x]` hecha y verificada · `[!]` bloqueada (con motivo en `docs/PROGRESO.md`).
Reglas: se trabaja **siempre la primera tarea `[ ]` cuyas dependencias estén `[x]`**. Solo se marca `[x]` cuando pasa su verificación. Una tarea por commit.

## Fase 0: Cimientos
- [~] T01 Proyecto Next.js 15 + TS funcionando · agente: `backend-ia` · deps: —
  - package.json con scripts `dev`, `build`, `start`, `lint` (tsc --noEmit), `test` (vitest), `eval` (tsx scripts/eval.ts). Alias `@/*` con `"paths": {"@/*": ["./*"]}` **sin `baseUrl`** (TypeScript reciente lo rechaza). Mantener `lib/types.ts` y `data/scenario-dana-malaga.ts` tal cual.
  - `.gitignore` (node_modules, .next, .env.local, public/audio/*.wav), `.env.example` según MEMORIA §7.
  - Verificación: `npm install && npm run lint && npm run build` sin errores.
- [ ] T02 Página mínima con fuente Archivo local y tokens de color · agente: `frontend-consola` · deps: T01
  - `app/layout.tsx`, `app/globals.css` con variables de MEMORIA §12, `@fontsource-variable/archivo/wdth.css`. Sin peticiones de red externas.
  - Verificación: build OK; captura con Playwright en `docs/capturas/T02.png`.

## Fase 1: Núcleo (sin interfaz)
- [ ] T03 `lib/cluster.ts` según MEMORIA §9 + tests · agente: `backend-ia` · deps: T01
  - Funciones puras: `haversine`, `tokens`, `overlap`, `scoreCandidates`, `decide`, `newInfo`. Constantes de umbral exportadas.
  - Tests en `tests/cluster.test.ts` con los casos de §9 (A2, F1 ask, B2 ask, D≠B, A4 menor, E1 nuevo).
  - Verificación: `npm test` en verde.
- [ ] T04 `lib/priority.ts` + etiquetas en `lib/labels.ts` (MEMORIA §8 y §10) + tests · agente: `backend-ia` · deps: T03
- [ ] T05 `scripts/eval.ts`: simula el escenario completo con extracciones mock y un operador que siempre acierta en la zona gris · agente: `qa-verificador` · deps: T03, T04
  - Imprime una tabla llamada→decisión→incidente y métricas: incidentes finales, fusiones incorrectas, preguntas al operador, pureza y completitud frente a `gold`, y posición de E1 en la cola.
  - Objetivo: 7 incidentes, 0 fusiones incorrectas, ≤2 preguntas, E1 en el top 2. Si no se cumple, abrir tarea de ajuste (no tocar `gold`).
  - Verificación: `npm run eval` sale con código 0 solo si se cumplen los objetivos.

## Fase 2: Servidor e IA local
- [ ] T06 `lib/config.ts` + `lib/ai.ts` (cliente compatible con OpenAI: chatJSON, transcribe, con timeouts y reintento) + `lib/prompts.ts` (MEMORIA §11) + saneado de la extracción · agente: `backend-ia` · deps: T01
  - Tests del saneado y del parseo de JSON (con ```json, basura alrededor, vocabularios inválidos).
- [ ] T07 `POST /api/process`, `GET /api/status`, `POST /api/translate`, `POST /api/transcribe` · agente: `backend-ia` · deps: T03, T06
  - Modo simulado si no hay `LLM_BASE_URL`: usa `mock` del escenario. STT solo si existe `public/audio/<id>.wav` y `STT_BASE_URL`.
  - Juez de zona gris solo con IA local; nunca convierte `ask` en `merge`.
  - Verificación: arrancar `npm run dev` y lanzar con curl F1 tras A1–A4 (debe responder `ask`), más tests de integración con fetch al handler.

## Fase 3: Consola del operador
- [ ] T08 Estado y reproductor del escenario (`lib/useConsole.ts`: reducer, reloj, velocidades, cola en serie, incidentes provisionales, acciones Mismo/Distinto/Separar) · agente: `frontend-consola` · deps: T07
- [ ] T09 Mapa SVG de Málaga (`components/MapView.tsx`, MEMORIA §12) con anillos, puntos y la animación de fusión · agente: `frontend-consola` · deps: T08
- [ ] T10 Cola de llamadas (izquierda) y barra superior con contador y motor activo · agente: `frontend-consola` · deps: T08
- [ ] T11 Panel derecho: cola de prioridad y detalle del incidente (original | traducción, riesgos, aviso de información nueva, llamadas, Separar) · agente: `frontend-consola` · deps: T08
- [ ] T12 Banner de decisión ámbar (Mismo incidente / Incidente distinto, atajos M/D, motivo y opinión del juez) · agente: `frontend-consola` · deps: T08, T09
- [ ] T13 Respuesta traducida: frases rápidas (tabla §11), texto libre con IA local y "Reproducir al llamante" con speechSynthesis · agente: `frontend-consola` · deps: T11
- [ ] T14 Responsive (apilado en móvil), foco visible, reduced-motion, contraste · agente: `frontend-consola` · deps: T09–T13

## Fase 4: IA real y audio
- [ ] T15 `docker-compose.gpu.yml` (Ollama + speaches con CUDA) + `scripts/setup-modelos.sh` (descarga modelos según VRAM, MEMORIA §7) · agente: `backend-ia` · deps: T07
- [ ] T16 `scripts/generate_audio.py` (Piper o edge-tts, filtro de teléfono y lluvia, MEMORIA §13) · agente: `datos-escenario` · deps: T01
- [ ] T17 Llamada en directo: botón de micrófono (MediaRecorder) → /api/transcribe → /api/process con ubicación AML elegida de una lista · agente: `frontend-consola` · deps: T07, T08
- [ ] T18 `npm run eval -- --live`: misma evaluación usando el LLM local en lugar de mock (se salta con aviso si no hay `LLM_BASE_URL`) · agente: `qa-verificador` · deps: T05, T07

## Fase 5: Presentable
- [ ] T19 Revisión visual completa con capturas (escritorio 1440×900 y móvil 390×844) en mitad del escenario y con decisión pendiente; corregir lo que falle · agente: `qa-verificador` · deps: T14
- [ ] T20 README (qué es, cómo arrancar en modo simulado en 2 comandos, cómo activar la GPU, arquitectura, privacidad y Ley de IA) · agente: `pitch-docs` · deps: T19
- [ ] T21 `docs/PITCH.md`: guion de 3 min (MEMORIA §14), 6 diapositivas en texto, preguntas difíciles del jurado con respuesta, y números con fuente · agente: `pitch-docs` · deps: T20
- [ ] T22 Verificación final del MVP (skill `verificar-mvp`) y etiqueta git `mvp-v1` · agente: `qa-verificador` · deps: T01–T21 (T15–T18 pueden estar `[!]` si no hay GPU; el modo simulado debe ser perfecto)

## Mejoras si sobra tiempo (solo con T22 en `[x]`)
- [ ] X01 Escenario 2: apagón (llamadas sin luz, ascensores y semáforos) para enseñar generalización
- [ ] X02 Métrica en vivo "tiempo hasta atender la llamada crítica" con y sin copiloto (simulación de una cola de operadores)
- [ ] X03 Exportar el registro de decisiones (JSON) para auditoría según la Ley de IA
