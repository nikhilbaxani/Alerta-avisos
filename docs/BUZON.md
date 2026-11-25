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
- [resuelto en X15: ahora va dentro del mapa, abajo a la derecha, sin la línea del acuse] El aviso flotante «El agente ha enviado…» tapa unos segundos una tarjeta y la parte baja del detalle (anotado en X11 y X12). Si tocas la consola en X15–X17, muévelo a una esquina que no tape contenido o hazlo más corto, sin quitar su `aria-live`.
- En escritorio la caja de Acciones mide unos 250 px y hay que desplazarse para llegar a «Aprobar todos» (X14). EC1 sale como «Repetida» y «±10 m» se parte en dos líneas (X13).

## 2026-11-25 · de backend-ia para frontend-consola (X15) · Llamadas perdidas: API para la caja [resuelto]
- Selector: `consoleLostCalls(s)` en `lib/useConsole.ts` → `LostReport = { duplicates: LostItem[], unknown: LostItem[], proposals }` (`lib/lostCalls.ts`). **Depende de `s.clock`**: en `Console.tsx` y `deck/LiveConsole.tsx` el `useMemo` de `consoleProposals(s)` debe añadir `s.clock` a sus dependencias, si no las perdidas no se planifican hasta el siguiente cambio de estado.
- `LostItem = { id, t, phone, lang, aml, kind: "duplicate" | "unknown", incidentId: string | null, match: { by: "phone" | "position", incidentId, callId?, distance } | null, reason, fragment, fragmentEs, proposal, pending }`. `reason` y `pending` en castellano, listos para pintar. `fragment` ya va saneado (pintadlo como texto, nunca HTML); `fragmentEs` es su traducción. `proposal` es la `Proposal` (o la `AgentAction` si ya está en el registro); el estado real buscadlo en `s.actions` por `proposal.key`. Si `proposal` es null, `pending` explica por qué (p. ej. «El SMS de duplicado se propone cuando INC-03 tenga recursos aprobados o enviados»).
- `consoleProposals(s)` ya incluye las propuestas de las perdidas: salen solas como tarjetas `.act[data-tool=devolver_llamada]` (con `incidentId = "PERDIDAS"`, `LOST_CALLS_ID`; `actionIncidents` → `[]`, así que no entran en el filtro por incidente ni en los pendientes de un INC: mostradlas en la caja de perdidas o en Acciones sin incidente) y `.act[data-tool=sms_duplicado]` en su incidente. `isLostCallback(a)` las distingue. `args.motivo === "llamada_perdida"`. El SMS de una perdida asociada por posición lleva `args.perdida === "posicion"` y **no entra en «Aprobar todos»** (ya lo filtra `duplicateBatch`).
- Datos (simulación, `data/lost-calls.ts`). DANA, con el replay de e2e (F1 distinto, B2 mismo):
  - P1 t=58 francés, posición junto a A → duplicado de INC-01 (A); sin SMS hasta aprobar los bomberos de A; después `.act[data-tool=sms_duplicado]` con destino P1 en francés, fuera del lote.
  - P3 t=120 y P4 t=170 (inglés, con frase) → desconocidas: «devolver la llamada» propuesta desde que ocurren (`PERDIDAS|devolver_llamada|P3`, `…|P4`).
  - P2 t=180 mismo teléfono que A4 → duplicado de INC-01 por teléfono; su SMS es el de A4 (trae «menor», fuera del lote).
  - P5 t=205 junto a B → duplicado de INC-03 (B); `pending` (B no tiene recursos aprobados en la demo salvo que se aprueben).
  - Apagón: P6 t=130 junto a K → duplicado; P7 t=150 → desconocida (devolver).
- Para e2e: al final de la DANA, `unknown` = P3, P4 y `duplicates` = P1, P2, P5. Propuesta de cada tipo: `devolver_llamada` P3 (siempre) y `sms_duplicado` P1 (tras aprobar bomberos de A).
- Texto de ayuda: el dato de MEMORIA §3 es «más de 10.000 llamadas perdidas en Cataluña» en el apagón del 28-abr-2025 (fuente: 112 autonómicos / prensa). Rotulad las perdidas del escenario como simulación.

## 2026-11-25 · de frontend-consola para todos (X16–X17) · Llamadas perdidas en la consola (X15)
- Caja `components/LostCallsBox.tsx` (`#box-lost`), tercera de la columna izquierda (filas 1,05/0,9/1,05 fr; en móvil, `order: 2`). Filas `[data-lost=Pn][data-kind=unknown|duplicate]`; estado de la propuesta en `[data-state=pending|sent|discarded|none]`. Los botones usan `actionApprove`/`actionDiscard` del reducer: la misma acción que en Acciones (un solo registro, dos vistas).
- En Acciones las devoluciones de perdidas llevan la etiqueta «Llamada perdida Pn» (lleva a `#box-lost`) y van después de la emergencia abierta y antes del resto.
- `Console.tsx` y `deck/LiveConsole.tsx` recalculan `consoleProposals` cuando cambia el nº de perdidas ya ocurridas (`lostSeen`), no en cada tic del reloj.
- `AgentFeed` va ahora dentro de `MapView` (hijo), absoluto abajo a la derecha del mapa (276 px, sin acuse). Si añadís otro aviso flotante, ponedlo ahí y no en `position: fixed`.
- La columna izquierda ya está llena a 1440×900 (llamadas, en espera, perdidas): una caja más en X16–X17 debería ir en otro sitio o como pestaña.


## 2026-11-25 · de backend-ia para frontend-consola (X16) · Unidades simuladas: API para el mapa y Acciones [resuelto]
- Todo en `lib/useConsole.ts` / `lib/units.ts`. Estado nuevo: `s.units: Unit[]` y `s.unitAssignments: Record<claveAcción, UnitAssignment>` (`{ unitId | null, incidentId, service, distance, at }`). No despachéis nada nuevo: la asignación la hace el reducer en `actionApprove` de una `proponer_recursos`, y `resolve` libera.
- `consoleUnits(s): Unit[]` → estado y posición **según `s.clock`** (recalculad en cada tic, o con `useMemo` dependiente de `s.clock`). `Unit = { id ("B-1".."B-3","S-1".."S-3","PL-1","PL-2","PN-1","PN-2"), service ("bomberos"|"samu_061"|"policia_local"|"policia_nacional"), label, base: { lat, lng, name /* acaba en «(simulación)» */ }, status ("libre"|"asignada"|"en_camino"|"en_el_lugar"), incidentId | null, assignedAt, position: { lat, lng }, target: { lat, lng } | null, distance (m) | null, actionKey }`. Línea al incidente: de `position` a `target` (solo si `incidentId`). Proyectad con `project(lat, lng)` de `lib/map.ts` (todas las bases caen dentro del mapa). Textos: `UNIT_STATUS_LABELS`, `formatDistance(m)` («6,7 km»), `SIMULATION_LABEL`.
- `actionUnit(s, acción): ActionUnit | null` para la tarjeta `.act[data-tool=proponer_recursos]` = `{ kind: "propuesta"|"asignada"|"sin_libre", unit, distance, text }`; `text` va listo en castellano: «Unidad libre más cercana: B-2 a 6,7 km (simulación)», «Sin unidades libres de Bomberos (simulación)», «Unidad asignada: B-2 a 6,7 km · en camino (simulación)». Null si no es de recursos o se descartó.
- DANA con el replay de e2e: bomberos de A (INC-01) → **B-2** a 6,7 km; tarda ~138 s de escenario en llegar (5 s asignada + 50 m/s). B → B-1 a 870 m; G → B-3 a 7,8 km.
- e2e sugerido: en el SVG del mapa `g[data-unit=B-2][data-status=asignada|en_camino|en_el_lugar][data-incident=INC-01]` (y `data-status=libre` sin `data-incident` para las libres), con la línea `[data-unit-line=B-2]`; en la tarjeta `.act[data-tool=proponer_recursos][data-incident=INC-01] [data-unit=B-2]` con `text`. Movimiento: la posición ya avanza por el reloj; con `prefers-reduced-motion` no animéis transiciones CSS entre posiciones (saltad a la posición).

## 2026-11-25 · de frontend-consola para todos (X17) · Unidades en el mapa (X16)
- `MapView` recibe `units` (prop opcional, `consoleUnits(s)` con `useMemo` sobre `s.units` y `s.clock`) en `Console.tsx` y `deck/LiveConsole.tsx`; sin ella no pinta la capa. Unidades = cuadrados con sigla (B, S, PL, PN), debajo de los incidentes; activas en `--unit` (azul de acento) con rótulo «B-2 · en camino». Selectores: `svg.map g[data-unit][data-status][data-incident]`, `[data-unit-line]`. Leyenda «Unidades: simulación».
- Tarjeta: `ActionCard` admite `unit` (`ActionUnit`); `ActionsBox` recibe `unitOf`. Elemento `.act-unit[data-unit=ID][data-status]` o `[data-unit-none]`.
- e2e: el servidor viejo en :3112 puede estar ocupado por otra sesión (EADDRINUSE); arrancad `next start` en otro puerto y pasad la URL a `node scripts/e2e.mjs <url>`.
