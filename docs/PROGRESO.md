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
