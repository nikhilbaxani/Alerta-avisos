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

## 2026-11-24 · de backend-ia para backend-ia (X06, X07) y orquestador · Contratos del agente de acciones (X05) [leído en X06: aplicado (frases vía `safetyPhrases`, sin tocar `SMS_PHRASE_IDS`); sigue vigente para X07]
- Añadir una herramienta (X07: `aviso_ayuntamiento`, `devolver_llamada`, `proponer_es_alert`) = sumar su nombre a `ACTION_TOOLS`, sus argumentos a `ToolArgs`, su política a `ACTION_POLICY` y su especificación a `TOOLS` en `lib/actions.ts` (reglas, `fromModel`, `parameters` para el LLM, `target`, `describe` y `send` del conector simulado). El compilador obliga a las tres últimas. Prefijo de acuse de 3 letras (`CAD`, `SMS`, `DIS`).
- Política «coordinador» (ES-Alert): ya funciona en `approve`/`canApprove`/`discard`. En `npm run agente` el operador simulado solo aprueba las de política `operador`; las de coordinador se quedan `propuesta` (decidid en X07 si hay un coordinador simulado).
- Lo que propone el modelo nunca es automático: `make()` pone política `operador` a una herramienta automática si `origin === "ia_local"`. Mantenedlo.
- `aviso_ayuntamiento` (X07) cubre semáforos, árbol caído y `via_bloqueada`: en X05 `proponer_recursos` a policía local solo sale por `accidente` o `trafico`, para no duplicar.
- Entrada del planificador: `planInputFrom(incident, facts)` con `facts[callId] = { lang, phone, risks }`. Nada de texto libre. El parte de situación (X07) puede leer `summarize(run)` y `run.actions` de `lib/agent.ts`; el JSON de `runToJson` tiene claves en castellano.
- Para X06 (agente de espera): reutilizad `smsText(frases, idioma)` de `lib/actions.ts` para componer instrucciones solo con frases pretraducidas; si añadís frases a `lib/phrases.ts`, las instructivas que deban ir por SMS hay que sumarlas a `SMS_PHRASE_IDS` y a `SMS_PHRASE_RULES`.
- La consola no llama a `/api/plan` (la interfaz no se toca). Respuesta: `{ engine, proposals, issues, warning? }`; quien la use registra con `addProposals`.

## 2026-11-24 · de backend-ia para backend-ia (X07) y orquestador · Contratos del agente de espera (X06)
- `runAgent(escenario, { operators })` (por defecto `DEFAULT_OPERATORS = 2`, el de la franja de sala) devuelve además `run.roomCalls` (llamadas de la sala) y `run.waiting: WaitingReport` (`lib/waiting.ts`). Para el parte de situación: `run.waiting.con.attendedByAgent`, `.resolvedWithoutOperator`, `.escalated`, `.queued`, `.waitedAlone`, `.critical` (`{ id, wait }`), `.meanNewWait`, `.operatorSeconds`, y lo mismo en `run.waiting.sin` (sin agente de espera); `run.waiting.attentions[]` trae cada llamada atendida (`outcome`: `agrupada` | `en_cola` | `escalada`, `reason` en castellano, `queuePosition`, `operatorAt`, `script`). `run.waiting.assumptions` son los supuestos declarados: el parte debe rotularlo como simulación y citarlos.
- Texto ya hecho: `waitingSummaryLines(run.waiting)` en `lib/agent.ts`; JSON: `waitingToJson(run.waiting)` (clave `agenteDeEspera` de `runToJson`, claves en castellano).
- Regla de triaje (decisión del orquestador; DECISIONES «X06: triaje»): solo escala, y pasa la primera de la cola, el riesgo vital que la sala aún no conoce (nueva, zona gris, provisional, información nueva o un riesgo vital que el incidente no tenía, como G2). Un duplicado con riesgo vital ya conocido sigue en la cola en su orden. `en_cola` puede llevar `vital` no vacío.
- Cifras para X07/X08 (simulación con supuestos; con agente frente a sin agente):
  - Esperan sin que nadie les atienda: DANA 25 → 0 (1 operador) y 23 → 0 (2 operadores); apagón 15 → 0 y 14 → 0.
  - Espera media de las emergencias nuevas: con 2 operadores **no cambia** (DANA 0:13, apagón 0:23); con 1 **empeora** (DANA 1:49 → 2:21, apagón 1:49 → 2:04).
  - Llamada crítica hasta un operador: **no cambia** (E1 0:26, J1 0:40), pero la atiende el asistente desde que llega y pasa la primera de la cola.
  - Duplicados cerrados sin operador: DANA 6 (90 s de operador), apagón 5 (75 s).
  - No lo presentéis como «menos espera»: lo que gana es que nadie espera sin que le atiendan y que se libera tiempo de operador. Ya no vale el «E1 0:26 → 0:08» de la primera versión.
- Frases: `WAITING_PHRASES` va aparte de `PHRASES` (la consola pinta un botón por cada elemento de `PHRASES`). Si X07 quiere una frase nueva para la devolución de llamada, igual: exportación aparte.
- `safetyPhrases(tipo, riesgos)` en `lib/actions.ts` es la elección de instrucciones del SMS, reutilizable sin `PlanInput`.

## 2026-11-24 · de orquestador para el compañero de la sala en directo (QR) y para backend-ia · La consola ya usa el agente de X05
- `ConsoleState.actions` es el `AgentAction[]` de `lib/actions.ts` (X05). Acciones nuevas del reducer en `lib/useConsole.ts`: `plan` (añade las propuestas con `addProposals`; envía las automáticas y descarta huérfanas), `actionApprove` (`approve` + `dispatch` como rol operador) y `actionDiscard`.
- `lib/consoleActions.ts` (`proposalsFor`) traduce incidentes + llamadas + teléfonos a `PlanInput` con `planInputFrom`, `planRules` y `planZoneAlerts`: es puro y sirve igual en un servidor de sala. En una sala compartida, haced `addProposals` una sola vez en el servidor y difundid el registro; no repitáis `plan` en cada cliente.
- Herramientas de X07 ya cubiertas en la consola: `aviso_ayuntamiento` (automática), `devolver_llamada` (operador) y `proponer_es_alert` (de zona: `incidentId` = `ZONA-…`, se muestra en el detalle de cada incidente de `args.incidentes` con `actionIncidents`; la aprueba un coordinador, así que la consola no ofrece botones y dice «La aprueba un coordinador»). `lib/consoleActions.ts` añade `planZoneAlerts` a las reglas por incidente. Una herramienta nueva necesita además título e icono en `components/AgentActions.tsx` (`actionTitle`, `TOOL_ICON`): el compilador avisa porque son `switch` y `Record` exhaustivos.
- Audio de las llamadas del escenario (X10): `public/audio/<id>.mp3` (versionado). Las llamadas en directo (`V1…`) no tienen archivo.

## 2026-11-25 · de frontend-consola para todos (X12–X17) · Agente de espera en la consola (X11)
- `lib/waitingConsole.ts`: `heardOf(before, after, callId, decision)` (lo que oye el asistente; lo usan `runAgent` y el reductor), `roomCall`, `consoleRoomCalls(s)` y `consoleWaiting(s, operators)` → `{ operators, calls, report, rows (más reciente primero, con withOperator), escalatedWaiting }`.
- `ConsoleState.heard` es nuevo: si añadís otra vía que aplique una llamada al motor, rellenadlo (si no, esa llamada no entra en la caja).
- Caja `#box-waiting` en `.col-left` (debajo de `#box-calls`); en ≤1100 px va con `order: 2`. e2e usa `[data-wait=attended|grouped|escalated]` y `[data-call=ID][data-outcome=…]`.
- El puerto 3112 lo tenía ocupado otro `next start` con un build antiguo: e2e y capturas se pasaron en 3113.

## 2026-11-25 · de backend-ia para frontend-consola (X12) · «Falta saber» [resuelto]
- `incidentMissing(incident, s.calls)` en `lib/missingInfo.ts` → `MissingItem[]` = `{ id, label, phraseId, phrase }` en orden (lo vital primero). `incident` es el `Incident` del motor (`s.engine.incidents`), `s.calls` es `ConsoleState.calls`. Se recalcula solo: cuando una llamada nueva aporta el dato, desaparece.
- `label` es el rótulo corto en castellano («Si respira y está consciente», «Dirección exacta»…); `phrase` es una `Phrase` (`es` + `tr[lang]`) igual que las de `PHRASES`, así que el clic puede usar el mismo flujo de «Reproducir al llamante» (`ReplyPanel`: hoy busca solo en `PHRASES`; para las nuevas, usad `missingPhrase(id)` que busca en `PHRASES` y `MISSING_PHRASES`).
- No metáis `MISSING_PHRASES` en la lista de botones de frases rápidas. Si todas las llamadas son en castellano, la pregunta se dice en castellano (`phrase.es`).
- E1 (DANA, árabe) a t=102: `["respira", "direccion"]`; `respira` en árabe es `هل الشخص يتنفس؟ هل هو واعٍ؟` (frase existente `respira`). Para e2e: B a t=47 tiene `altura_agua`, que desaparece tras B3 (t=241).

## 2026-11-25 · de frontend-consola para todos (X13–X17) · «Falta saber» en la consola (X12)
- Bloque `section.missing` en `IncidentDetail` (antes de «Riesgos detectados»); botones `[data-missing=<id>]` con `aria-pressed` y nombre accesible «Preparar la pregunta en <idioma>: <rótulo>».
- Clic → `Console.prepareAsk` guarda `ask = { incidentId, phraseId, n }` (tipo `Ask` en `components/ReplyPanel.tsx`) y lleva el foco a `#box-translate`; `ReplyPanel` selecciona la frase (busca con `missingPhrase`, así acepta `MISSING_PHRASES`) sin reproducirla. Si todo es castellano, la pregunta se muestra en el propio bloque para leerla.
- `.said-box` lleva `data-phrase=<id>|libre` (lo usa e2e). Para preparar otra frase desde otro sitio, reutilizad `prepareAsk`.

## 2026-11-25 · de backend-ia para todos (X14–X17, pitch-docs) · eCall y llamadas extra (X13)
- Llamadas nuevas de la DANA: `data/scenario-dana-extra.ts` (`danaExtra: ScenarioCall[]`). `data/scenarios.ts` exporta `dana` (base protegida + extra, ordenadas por `t`); usad siempre `getScenario("dana-malaga")`, no el archivo protegido. X15: las llamadas perdidas van en ese mismo archivo, con su campo nuevo opcional en `ScenarioCall` (como `channel`).
- Campos nuevos opcionales: `channel?: "voice" | "ecall"` y `ecall?: ECallData` (`activation`, `occupants`, `heading`, `vehicle`). `isEcall(c)` en `lib/ecall.ts`. EC1 (t=14, gold A) se fusiona con INC-01; sin audio ni idioma extranjero; no entra en la sala del agente de espera.
- Consola: `#box-calls li[data-call=ID][data-channel=voice|ecall][data-incident=INC-xx]`; tarjeta `#box-detail [data-callcard=ID][data-channel=…]`.
- Recuentos: DANA ahora 27 avisos → 7 incidentes · 20 líneas liberadas (README/PITCH que digan «26 llamadas» → revisar en X17). X14: EC1 tiene teléfono (SIM del vehículo) pero no habla; no le mandéis el SMS de duplicado (no hay nadie al teléfono que lo lea en el coche… o decididlo y anotadlo).

## 2026-11-25 · de backend-ia para frontend-consola (X15) y todos · SMS de duplicado (X14)
- Herramienta `sms_duplicado` (operador, en `SYSTEM_TOOLS`: el LLM no la ve). La propone `planDuplicateSms(planInput, acciones)` de `lib/actions.ts`, solo con `proponer_recursos` aprobada/enviada en ese incidente; una vez por teléfono (también entre incidentes), nunca al teléfono de la primera llamada de voz ni a una eCall (`PlanCall.channel`). Args: `{ llamada, telefono, idioma, frase, texto, texto_es, revisar }`; `revisar` no vacío = trajo información nueva → fuera del lote.
- La consola ya la planifica: `consoleProposals(s)` en `lib/useConsole.ts` (pasa canales y `s.actions` a `proposalsFor(…, { channels, actions })`). Para X15 (llamadas perdidas): si la perdida tiene teléfono y entra en `s.calls`/`s.arrived` con su incidente, sale sola en el siguiente `plan`. Si no entra al motor, construid un `PlanInput` con `planInputFrom(incidente, facts)` añadiendo esa llamada a `calls` y pasad el resultado de `planDuplicateSms` a `dispatch({ type: "plan", proposals })`. Frase: `DUPLICATE_PHRASES` / `duplicateText(lang)` en `lib/phrases.ts`/`lib/actions.ts`.
- Lote: `duplicateBatch`, `approveBatch` y la acción del reducer `{ type: "actionApproveBatch", incidentId }`. e2e: `#box-actions [data-batch=INC-01]` con botón «Aprobar todos (n)»; tarjetas `.act[data-tool][data-status][data-incident]`; enviada dice «Aprobado en lote y enviado · acuse DUP-…».

## 2026-11-25 · de orquestador para frontend-consola (X15–X17) · Pendientes menores repetidos
- El aviso flotante «El agente ha enviado…» tapa unos segundos una tarjeta y la parte baja del detalle (anotado en X11 y X12). Si tocas la consola en X15–X17, muévelo a una esquina que no tape contenido o hazlo más corto, sin quitar su `aria-live`.
- En escritorio la caja de Acciones mide unos 250 px y hay que desplazarse para llegar a «Aprobar todos» (X14). EC1 sale como «Repetida» y «±10 m» se parte en dos líneas (X13).
