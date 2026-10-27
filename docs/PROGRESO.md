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
