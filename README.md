# Agente 112

Agente de IA para las salas del 112 en España. En una catástrofe (DANA, apagón) **agrupa las llamadas que hablan del mismo incidente**, **detecta las que traen información nueva** y **traduce en tiempo real** a quien no habla castellano. La IA propone; **el operador decide**. Los modelos corren **en local**.

![Consola a mitad del escenario, con una decisión pendiente](docs/capturas/consola-decision.png)

## Arrancar en modo simulado (2 comandos, sin GPU, sin wifi, sin claves)

```bash
npm install
npm run dev        # http://localhost:3000
```

Pulsa **Iniciar** (velocidad ×4 o ×10). Verás 26 llamadas en 6 idiomas convertirse en 7 incidentes. Dos veces la consola se para en **ámbar** y pregunta: `M` = mismo incidente, `D` = incidente distinto. En el modo simulado la agrupación y la prioridad **se calculan igual** con el algoritmo real; solo la extracción de cada llamada viene del guion. La demo no hace ninguna petición externa: el mapa es una ortofoto del IGN incluida en la aplicación (sin teselas) y la fuente se instala con npm. El botón **Cómo funciona** lo explica todo en un minuto; el mapa se arrastra y se acerca con la rueda o con + y −.

En la pestaña **Simulación**, el selector cambia entre dos escenarios: **DANA en Málaga** (26 llamadas, 6 idiomas) y **Apagón en Málaga** (16 llamadas: ascensores, semáforos, oxígeno domiciliario y una residencia sin luz), para ver que el sistema generaliza.

## Qué enseña la demo

1. **Agrupar**: 26 llamadas → 7 incidentes. El contador de «líneas liberadas» sube.
2. **Información nueva**: una llamada duplicada no se descarta; si dice «hay un bebé» o «no contesta», se avisa y sube la prioridad.
3. **La ubicación del llamante no es la del incidente**: quien llama desde otro barrio se agrupa por la dirección que menciona.
4. **Zona gris visible**: un segundo coche atrapado a ~460 m del primero no se fusiona solo; decide el operador.
5. **Simulación de sala**: espera hasta atender la llamada crítica con y sin copiloto (con 1–4 operadores). Son supuestos ilustrativos (60 s por llamada nueva, 15 s por duplicado), no datos reales.
6. **Respuesta traducida**: frases rápidas (o texto libre con IA local) en el idioma del llamante, con voz.

## El agente

El agente usa el tipo, los riesgos y la ubicación de los incidentes para preparar acciones. Se muestra en terminal, no como controles nuevos en la consola. La [política de aprobación](lib/actions.ts) está en código y se comprueba con tests; no la decide el modelo ni el texto de la llamada.

| Herramienta | Qué prepara | Quién aprueba |
|---|---|---|
| `proponer_recursos` | Propuesta de movilización de bomberos, SAMU o policía local en el CAD | Operador |
| `sms_al_llamante` | SMS con instrucciones pretraducidas | Operador |
| `avisar_distribuidora` | Aviso informativo por cables en el suelo o falta de suministro con personas vulnerables | Automático con registro, solo por reglas |
| `aviso_ayuntamiento` | Aviso informativo a Movilidad por semáforos apagados, árbol caído o vía bloqueada | Automático con registro, solo por reglas |
| `devolver_llamada` | Rellamada a quien informó de que una persona no responde | Operador |
| `proponer_es_alert` | Borrador de alerta con zona calculada y texto fijo | Siempre un coordinador humano; no hay coordinador simulado |

Solo se automatizan los avisos informativos a organismos; no movilizan recursos. Toda propuesta del modelo necesita revisión del operador como mínimo: si propone un aviso, este deja de ser automático; si propone un ES-Alert, sigue siendo necesaria la aprobación del coordinador. La reproducción simula al operador, pero deja ES-Alert pendiente. **Todos los conectores y acuses son simulados: ningún servicio real recibe nada.**

**Seguridad.** En los prompts que usan texto de la llamada, este se delimita como dato no confiable, no como instrucción. El planificador solo recibe datos estructurados, como tipo, riesgos y coordenadas, sin transcripciones ni resúmenes libres. El código impone una gravedad mínima según el tipo y los riesgos detectados, valida las entradas y limita el tamaño de las peticiones a la API. Las propuestas del modelo se comprueban contra la lista de herramientas y sus argumentos admitidos. ES-Alert no toma texto ni zona del llamante ni del modelo.

**Llamadas en espera.** El asistente solo interviene si la llamada tendría que esperar. Se presenta como asistente automático, pregunta qué pasa y dónde, y usa solo frases pretraducidas en el idioma del llamante. Si detecta riesgo vital, da prioridad inmediata a la llamada en la cola humana, sin interrumpir las llamadas activas. Puede evitar que un operador atienda un duplicado de alta confianza si no hay criterio de escalado y existe un guion para el idioma. Nunca resuelve la zona gris. El guion se muestra en la traza; no se reproduce en una llamada real.

### Ejecutar el agente

```bash
npm run agente                                      # DANA en Málaga, por defecto
npm run agente -- --escenario apagon                # apagón en Málaga
npm run agente -- --operadores N                    # sustituye N por un entero positivo (por defecto: 2)
npm run agente -- --parte archivo.md                # guarda el parte en Markdown
npm run agente -- --json archivo                    # guarda la traza y el parte en JSON
npm run agente -- --help                            # lista todas las opciones, incluida --live
```

Por defecto usa las extracciones del guion y reglas deterministas, sin servidor, GPU, red ni claves. Con `--live` y un modelo local configurado, el modelo puede añadir propuestas al plan; la cola y los conectores siguen siendo simulados.

La traza muestra la evidencia, el motivo, la herramienta, la aprobación y el resultado. Al final siempre se imprime un **parte de situación simulado**: llamadas e incidentes, líneas liberadas por agrupación (llamadas menos incidentes), prioridades y motivos, zonas con más incidentes, estado de las acciones y resumen de la espera. Los tiempos de sala son ilustrativos: 60 s por llamada nueva o en ámbar y 15 s por repetida atendida por un operador. No son tiempos de un servicio real ni se usan como reloj de las acciones.

## Activar la IA local (GPU NVIDIA)

```bash
bash scripts/setup-modelos.sh      # levanta Ollama + speaches con Docker y descarga modelos según tu VRAM
npm run dev                        # la barra superior pasa a «IA local: <modelo>»
```

Sin Docker ni sudo (si Docker no ve la GPU): `bash scripts/ia-local.sh` arranca Ollama (`~/.local/ollama`) y un servidor de Whisper propio (`scripts/stt_server.py`), y crea `.env.local`. Para pararlos: `bash scripts/ia-local.sh stop`. Con IA real, reproduce el escenario a ×1.

**Versión web (modo simulado):** cada push a `main` publica la consola en GitHub Pages (`.github/workflows/pages.yml`). Requisito: *Settings → Pages → Source: GitHub Actions*.

| VRAM | LLM | Voz a texto |
|---|---|---|
| 8 GB | `qwen2.5:7b-instruct` | `faster-whisper-small` |
| 12–16 GB | `qwen2.5:14b-instruct` | `faster-whisper-large-v3-turbo` |
| 24 GB o más | `qwen2.5:32b-instruct` | `faster-whisper-large-v3` |

Todo se configura con `.env.local` (plantilla en `.env.example`): `LLM_BASE_URL`, `LLM_MODEL`, `STT_BASE_URL`, `STT_MODEL`. Con IA local, además: texto libre traducido, opinión del modelo en la zona gris (solo opina, nunca decide) y **llamada en directo** con el micrófono.

Audio de las llamadas simuladas (opcional): `pip install edge-tts` y `python3 scripts/generate_audio.py` (o Piper) crea `public/audio/<id>.wav` con filtro de teléfono y lluvia.

## Llamadas del público por QR (opcional)

El público escanea el QR de la consola, abre `/llamar` en el móvil y graba una llamada de prueba (sin mínimo, máximo 2 minutos). Dice qué pasa y **dónde** (calle o barrio de Málaga). El audio va a un relay en un VPS que lo transcribe con Whisper en CPU, extrae tipo, riesgos y lugar con reglas deterministas (`lib/rules.ts`, `lib/gazetteer.ts`, sin LLM) y lo envía por SSE a la **bandeja «Llamadas del público»** de la consola. Nada entra en el mapa ni en la agrupación hasta que el operador pulsa **Aceptar**. Si no se reconoce el lugar, la llamada nunca se fusiona sola.

- Despliegue (todo en el VPS, sin Vercel): [`server/README.md`](server/README.md). Una sola URL pública de **Tailscale Funnel** (`https://<nodo>.<tailnet>.ts.net`) → Caddy en `127.0.0.1:8080` → la web estática (consola y `/llamar`) y, bajo `/relay/*`, el relay con Whisper. La web se construye con `NEXT_PUBLIC_RELAY_URL=/relay` (mismo origen), así que no hay CORS entre dominios ni nada más que desplegar.
- El operador abre la consola una vez con `https://<nodo>.<tailnet>.ts.net/#op=<RELAY_TOKEN>` (el fragmento `#` no viaja al servidor; se guarda en el navegador y se borra de la URL; `?op=` sigue funcionando por compatibilidad pero conviene evitarlo). Si el token guardado es incorrecto, el botón «Cambiar token» de la bandeja lo reemplaza.
- Abre **En directo (QR)** para ver el QR y la bandeja. El mapa, la cola y la lista de prioridades empiezan vacíos y solo muestran llamadas del público aceptadas. Esta vista no tiene reloj ni controles de reproducción; al volver a **Simulación** se recupera el escenario donde lo dejaste.
- Sin `NEXT_PUBLIC_RELAY_URL`, **En directo (QR)** aparece desactivada con un aviso. **Simulación** sigue funcionando sin conexión.
- `/llamar` avisa de que es una demo y **no** un servicio de emergencias, pide consentimiento y no recoge teléfono ni nombre; el audio solo vive en memoria del relay.

## Arquitectura

```
navegador (consola) ── POST /api/process ──▶ servidor Next.js (sin estado)
  reloj + cola SERIE                           ├─ STT (Whisper) o guion
  estado de incidentes                         ├─ extracción JSON (LLM) o mock
  decisiones del operador                      ├─ agrupación determinista (lib/cluster.ts)
                                               └─ zona gris: el LLM opina, decide el operador
```

- `lib/cluster.ts`: puntuación 0,45·espacio + 0,30·tipo + 0,25·texto; ≥ 0,78 fusiona, 0,45–0,78 pregunta, < 0,45 incidente nuevo. Cada decisión lleva su motivo en castellano.
- `lib/engine.ts`: estado de incidentes (fusionar, provisional, confirmar, **Separar**), puro y probado.
- `lib/priority.ts`: gravedad, personas, riesgo vital, información nueva y tiempo sin atender.
- Sin base de datos: el estado vive en el cliente. Sin teselas ni fuentes externas.
- Mapa: ortofoto PNOA © Instituto Geográfico Nacional (CC BY 4.0) en `assets/map/`, generada una sola vez con `python3 scripts/build_satellite.py` (descarga del WMS del IGN y rellena los huecos del mosaico sobre el mar). Misma proyección que `lib/map.ts`.

## Comprobaciones

```bash
npm run build && npm test && npm run eval     # compilación, 27 tests, evaluación sobre el escenario
npm run eval:apagon                           # evaluación del escenario del apagón (6 incidentes, 1 pregunta)
npm run eval -- --live                        # lo mismo con el LLM local (se salta si no hay LLM_BASE_URL)
npm run start -- -p 3112 & node scripts/e2e.mjs   # prueba extremo a extremo con Playwright
```

`npm run eval` agrupa las 26 llamadas y compara con la referencia: **7 incidentes, 0 fusiones incorrectas, 2 preguntas al operador**, y la llamada en árabe (infarto) entre las dos primeras de la cola.

## Privacidad y Ley de IA

- **Local por diseño**: las llamadas contienen datos de salud y localización; los modelos se ejecutan en la sala, sin nube. El servidor no guarda nada.
- **Humano en el bucle**: clasificar llamadas de emergencia es alto riesgo en la Ley de IA europea (obligaciones desde dic-2027). La zona gris nunca se resuelve sola, cada fusión automática se puede deshacer con «Separar» y cada decisión explica por qué.
- **Registro**: el botón «Exportar registro» descarga en JSON cada decisión (automática o del operador), su puntuación, su motivo y las respuestas enviadas.
- Todos los datos del escenario son ficticios.

## Alcance

MVP de hackathon. Fuera: integración con un CAD real, autenticación, telefonía real, despliegue en la nube. La IA se evalúa por **líneas liberadas** y **tiempo hasta la llamada crítica**, no por precisión del modelo.

Más: [docs/MEMORIA.md](docs/MEMORIA.md) (especificación), [docs/PITCH.md](docs/PITCH.md), [docs/DECISIONES.md](docs/DECISIONES.md).
