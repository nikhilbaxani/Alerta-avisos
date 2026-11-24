# Buzón entre agentes

Canal para que los agentes se pasen información entre tareas y sesiones. El orquestador lo lee al empezar cada tarea y reenvía lo relevante en el encargo del agente destinatario.

Formato (añadir al final, no borrar; el destinatario marca `[leído]` o `[resuelto]`):
```
## <fecha y hora ISO> · de <agente> para <agente|orquestador> · <tema>
<mensaje concreto: qué necesitas, contrato propuesto, archivo y línea>
```

## 2026-10-27 · de orquestador para todos · Contrato inicial
- La interfaz consume `ProcessResult` de `lib/types.ts`. Si `frontend-consola` necesita un campo nuevo, lo pide aquí a `backend-ia` (o le consulta directamente) y `backend-ia` lo añade en `types.ts` y en la API.

## 2026-11-24 · de backend-ia para backend-ia (X05–X07) · Contratos de seguridad de X04 [leído en X05: aplicado; sigue vigente para X06–X07]
- Texto que venga de la llamada (transcripción, `summary_es`, `location_text`, `keywords`) que vaya a un prompt: `wrapUntrusted(tag, texto)` y `untrustedNotice([tags])` al final del prompt de sistema (`lib/untrusted.ts`). Si el modelo responde texto libre, `stripUntrustedTags`. El planificador de X05 no debería recibir texto libre en absoluto (MEMORIA §16.1).
- Gravedad: `severityFloor(risks, type)` y `SEVERITY_FLOOR_RULES` (con `why` en castellano) en `lib/sanitize.ts`; ya se aplica en `sanitizeExtraction`.
- API nuevas (`/api/plan`): leer el cuerpo con `readJson(req, max)` y responder con `fail(status, mensaje)` de `lib/http.ts`; validar con funciones puras al estilo de `lib/validate.ts` (400 forma/rango, 413 tamaño). Tests al handler en `tests/routes.test.ts` (importar `POST` y usar `vi.stubEnv`).
- Los `INC-xx` no se reutilizan nunca; no dependas de que sean consecutivos (en la DANA, G es INC-08). Para las pruebas, localiza incidentes por llamadas (`state.assignment[callId]`).

## 2026-11-24 · de backend-ia para orquestador · X04: regresión de agrupación en vivo por el prompt
- Con IA local, la advertencia de seguridad de X04 sube las preguntas de la DANA de 4 a 11 (0 fusiones incorrectas) y el apagón pasa de 7 a 8 incidentes (objetivo 6). Tabla y diagnóstico en DECISIONES («X04: medición en vivo»). Ollama y Whisper se pararon a las 17:12 y no se rearrancaron. Propuesta: tarea corta de ajuste (advertencia al principio del prompt de sistema) y volver a medir antes de X05.

## 2026-11-24 · de backend-ia para backend-ia (X06, X07) y orquestador · Contratos del agente de acciones (X05)
- Añadir una herramienta (X07: `aviso_ayuntamiento`, `devolver_llamada`, `proponer_es_alert`) = sumar su nombre a `ACTION_TOOLS`, sus argumentos a `ToolArgs`, su política a `ACTION_POLICY` y su especificación a `TOOLS` en `lib/actions.ts` (reglas, `fromModel`, `parameters` para el LLM, `target`, `describe` y `send` del conector simulado). El compilador obliga a las tres últimas. Prefijo de acuse de 3 letras (`CAD`, `SMS`, `DIS`).
- Política «coordinador» (ES-Alert): ya funciona en `approve`/`canApprove`/`discard`. En `npm run agente` el operador simulado solo aprueba las de política `operador`; las de coordinador se quedan `propuesta` (decidid en X07 si hay un coordinador simulado).
- Lo que propone el modelo nunca es automático: `make()` pone política `operador` a una herramienta automática si `origin === "ia_local"`. Mantenedlo.
- `aviso_ayuntamiento` (X07) cubre semáforos, árbol caído y `via_bloqueada`: en X05 `proponer_recursos` a policía local solo sale por `accidente` o `trafico`, para no duplicar.
- Entrada del planificador: `planInputFrom(incident, facts)` con `facts[callId] = { lang, phone, risks }`. Nada de texto libre. El parte de situación (X07) puede leer `summarize(run)` y `run.actions` de `lib/agent.ts`; el JSON de `runToJson` tiene claves en castellano.
- Para X06 (agente de espera): reutilizad `smsText(frases, idioma)` de `lib/actions.ts` para componer instrucciones solo con frases pretraducidas; si añadís frases a `lib/phrases.ts`, las instructivas que deban ir por SMS hay que sumarlas a `SMS_PHRASE_IDS` y a `SMS_PHRASE_RULES`.
- La consola no llama a `/api/plan` (la interfaz no se toca). Respuesta: `{ engine, proposals, issues, warning? }`; quien la use registra con `addProposals`.

## 2026-11-24 · de backend-ia para backend-ia (X07) y orquestador · Contratos de espera (X06)
- `npm run agente -- --operadores N` (también `--operadores=N`): entero positivo; por defecto 2, como en la franja de sala. `npm run agente -- --help` muestra las opciones. Se mantiene `--escenario`, `--json` y `--live`; la espera siempre usa reglas sin red.
- Para el parte usa `summarize(run).waiting` (`operators`, `attended`, `duplicates`, `escalated`). Duplicados y escaladas son subconjuntos de las llamadas en espera; no sumes esos contadores a `attended`. `attended` cuenta solo las que tienen guion pretraducido; una escalada puede ocurrir aunque falte guion para el idioma. `run.waiting.calls` ofrece el detalle y `runToJson` lo exporta bajo `espera` en castellano.
- `arrival` es el instante de escalado si `outcome` es `escalated`; `humanAt` es el inicio de atención en la simulación de sala (nulo si se resolvió sin operador). No lo confundas con `steps[].t` ni con el reloj de aprobaciones, acuses y decisiones de zona gris del replay X05. El flujo X05, `run.actions` y su política no cambian; los `ask` no cuentan como duplicados resueltos sin operador. No uses los tiempos o contadores de espera como datos reales.
- `WAITING_PROMPTS` contiene únicamente presentación y preguntas de voz simulada. Los consejos reutilizan `smsText` con IDs existentes. No se añadió ninguna frase al vocabulario de SMS. El guion no es una acción de `lib/actions.ts` ni se entrega por un canal real.

### X06: decisiones pendientes de pasar a DECISIONES
- **2026-11-24 — Capacidad de sala y reloj de las acciones.** Decisión: simular la cola por separado, con 2 operadores por defecto y 60 s por nueva o ámbar y 15 s por repetida atendida por un humano. Motivo: conservar la reproducción y la auditoría X05 sin confundir el escalado inmediato con el inicio de atención de sala. Alternativa descartada: reordenar el motor o desplazar las aprobaciones en función de la cola.
- **2026-11-24 — Prioridad y duplicados.** Decisión: encolar el riesgo vital en cuanto se detecta, incluso en duplicados, por delante del resto y sin interrumpir llamadas activas; solo una fusión de alta confianza sin criterio de escalado y con guion disponible libera una línea. Motivo: una llamada repetida puede traer una emergencia y una zona gris exige intervención humana. Alternativa descartada: cerrar toda repetida o tratar la zona gris como fusión automática.
- **2026-11-24 — Guion pretraducido.** Decisión: añadir `asistente_automatico` («Soy el asistente automático del 112.») y `que_pasa` («¿Qué ha pasado?») en es/en/de/fr/ar/it, solo para la espera; reutilizar `direccion` y los consejos existentes `garaje` (vivienda o garaje inundado) y `cables` (cables eléctricos). Motivo: informar con transparencia, sin generar texto ni prometer que ya viene ayuda; si no hay traducción del guion, se conserva la vía humana. Alternativa descartada: generar o traducir el guion con un modelo, anunciar ayuda no confirmada o incorporar estas dos frases al SMS.
