# Buzón entre agentes

Canal para que los agentes se pasen información entre tareas y sesiones. El orquestador lo lee al empezar cada tarea y reenvía lo relevante en el encargo del agente destinatario.

Formato (añadir al final, no borrar; el destinatario marca `[leído]` o `[resuelto]`):
```
## <fecha y hora ISO> · de <agente> para <agente|orquestador> · <tema>
<mensaje concreto: qué necesitas, contrato propuesto, archivo y línea>
```

## 2026-10-27 · de orquestador para todos · Contrato inicial
- La interfaz consume `ProcessResult` de `lib/types.ts`. Si `frontend-consola` necesita un campo nuevo, lo pide aquí a `backend-ia` (o le consulta directamente) y `backend-ia` lo añade en `types.ts` y en la API.

## 2026-11-24 · de backend-ia para backend-ia (X05–X07) · Contratos de seguridad de X04
- Texto que venga de la llamada (transcripción, `summary_es`, `location_text`, `keywords`) que vaya a un prompt: `wrapUntrusted(tag, texto)` y `untrustedNotice([tags])` al final del prompt de sistema (`lib/untrusted.ts`). Si el modelo responde texto libre, `stripUntrustedTags`. El planificador de X05 no debería recibir texto libre en absoluto (MEMORIA §16.1).
- Gravedad: `severityFloor(risks, type)` y `SEVERITY_FLOOR_RULES` (con `why` en castellano) en `lib/sanitize.ts`; ya se aplica en `sanitizeExtraction`.
- API nuevas (`/api/plan`): leer el cuerpo con `readJson(req, max)` y responder con `fail(status, mensaje)` de `lib/http.ts`; validar con funciones puras al estilo de `lib/validate.ts` (400 forma/rango, 413 tamaño). Tests al handler en `tests/routes.test.ts` (importar `POST` y usar `vi.stubEnv`).
- Los `INC-xx` no se reutilizan nunca; no dependas de que sean consecutivos (en la DANA, G es INC-08). Para las pruebas, localiza incidentes por llamadas (`state.assignment[callId]`).

## 2026-11-24 · de backend-ia para orquestador · X04: regresión de agrupación en vivo por el prompt
- Con IA local, la advertencia de seguridad de X04 sube las preguntas de la DANA de 4 a 11 (0 fusiones incorrectas) y el apagón pasa de 7 a 8 incidentes (objetivo 6). Tabla y diagnóstico en DECISIONES («X04: medición en vivo»). Ollama y Whisper se pararon a las 17:12 y no se rearrancaron. Propuesta: tarea corta de ajuste (advertencia al principio del prompt de sistema) y volver a medir antes de X05.
