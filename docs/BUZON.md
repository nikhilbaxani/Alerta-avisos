# Buzón entre agentes

Canal para que los agentes se pasen información entre tareas y sesiones. El orquestador lo lee al empezar cada tarea y reenvía lo relevante en el encargo del agente destinatario.

Formato (añadir al final, no borrar; el destinatario marca `[leído]` o `[resuelto]`):
```
## <fecha y hora ISO> · de <agente> para <agente|orquestador> · <tema>
<mensaje concreto: qué necesitas, contrato propuesto, archivo y línea>
```

## 2026-10-27 · de orquestador para todos · Contrato inicial
- La interfaz consume `ProcessResult` de `lib/types.ts`. Si `frontend-consola` necesita un campo nuevo, lo pide aquí a `backend-ia` (o le consulta directamente) y `backend-ia` lo añade en `types.ts` y en la API.
