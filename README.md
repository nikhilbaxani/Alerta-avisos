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

1. **Agrupar**: 26 llamadas → 7 incidentes. El contador de «repetidas» (líneas que quedan libres) sube; cada llamada lleva la etiqueta de su incidente (③ INC-03, el mismo número que en el mapa).
2. **Información nueva**: una llamada duplicada no se descarta; si dice «hay un bebé» o «no contesta», se avisa y sube la prioridad.
3. **La ubicación del llamante no es la del incidente**: quien llama desde otro barrio se agrupa por la dirección que menciona.
4. **Zona gris visible**: un segundo coche atrapado a ~460 m del primero no se fusiona solo; decide el operador.
5. **Respuesta traducida**: frases rápidas (o texto libre con IA local) en el idioma del llamante, con voz.
6. **Tu propia llamada**: en «Escribir una llamada» escribes un incidente (un incendio, un robo…) y el agente propone los recursos que tocan por tipo y riesgos: Bomberos, SAMU 061, Policía local o Policía Nacional. En modo simulado se clasifica por palabras clave (`lib/keywordExtract.ts`); con IA local, con el modelo.

## Presentación interactiva (`/presentacion`)

Se abre con **Ver la presentación** en la bienvenida de la consola, con el icono de la barra superior o directamente en `http://localhost:3000/presentacion`. Son 12 diapositivas en HTML dentro de la propia web. Empiezan por el problema: la DANA de Valencia, el apagón y seis llamadas por el mismo coche. Siguen con piezas **reales** de la consola funcionando: la consola completa en directo, la decisión de la zona gris, las acciones del agente y la respuesta en árabe. Todas responden al ratón y a las teclas `M` y `D`. Al final hay un QR a la página principal, y al pasar de esa diapositiva se abre la consola.

- Teclas: `←` `→` o espacio para avanzar, `F` pantalla completa, `N` notas del orador (el guion de `docs/PITCH.md`). La dirección guarda la diapositiva (`/presentacion#6`).
- Si llegas a la consola desde la presentación (pasando de la última diapositiva, con el logo o con la ×), aparece abajo a la derecha **Volver a la presentación**, que te devuelve a la diapositiva de la que saliste.
- El QR apunta a la web desde la que se abre la presentación (en GitHub Pages, la página publicada). Si presentas desde `localhost`, fija la dirección pública con `NEXT_PUBLIC_DEMO_URL=https://… npm run dev`.
- Funciona sin red: el QR se genera en el navegador (`lib/qr.ts`) y la consola de las diapositivas calcula siempre en modo simulado (`lib/replay.ts` y `useConsole({ offline: true })`).

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

Audio de las llamadas simuladas: los MP3 ya vienen en `public/audio/` (1,3 MB) y la consola los reproduce sin red, solo cuando el operador pulsa **Escuchar** en una llamada (nunca suenan solas). Para regenerarlos: `python3 -m venv .venv-audio && .venv-audio/bin/pip install edge-tts && .venv-audio/bin/python scripts/generate_audio.py` (o Piper). Crea `<id>.wav` (para Whisper, ignorado por git) y `<id>.mp3`, con filtro de teléfono y lluvia en la DANA.

## El agente

El agente usa el tipo de incidente, los riesgos, la gravedad, las llamadas asociadas y la ubicación para preparar acciones. Primero aplica reglas deterministas; un incidente provisional en ámbar no recibe acciones hasta que el operador decida. **Todos los conectores son simulados**: el registro y el acuse no implican que se haya movilizado un recurso, enviado un SMS, hecho una rellamada ni difundido una alerta. Ningún servicio real recibe nada.

| Herramienta | Qué hace en la simulación | Aprobación |
|---|---|---|
| `proponer_recursos` | Prepara una propuesta para bomberos, SAMU o Policía Local en el sistema de despacho (CAD). | Operador |
| `sms_al_llamante` | Prepara un SMS de seguridad con frases pretraducidas en el idioma del llamante. | Operador |
| `avisar_distribuidora` | Avisa de cables en el suelo o de un corte que afecta a personas vulnerables. | Automática con registro, solo por reglas |
| `aviso_ayuntamiento` | Avisa de semáforos apagados, un árbol caído o una vía bloqueada. No sustituye una propuesta de movilizar a la Policía Local. | Automática con registro, solo por reglas |
| `devolver_llamada` | Prepara una rellamada prioritaria cuando llega como novedad que la persona en peligro no responde. | Operador |
| `proponer_es_alert` | Prepara una zona y un mensaje de plantilla en castellano e inglés; por ejemplo, ante varios vehículos atrapados por agua en incidentes cercanos. | Siempre un coordinador humano; no basta el operador |

### Seguridad y aprobación

- La política está en [`lib/actions.ts`](lib/actions.ts) y tiene [pruebas](tests/actions.test.ts). Solo los avisos informativos a la distribuidora y al ayuntamiento disparados por reglas pueden registrarse como enviados sin aprobación. El modelo puede añadir propuestas, no quitar las de las reglas ni autorizar envíos: cualquier propuesta suya pasa por aprobación del operador como mínimo; ES-Alert sigue reservado al coordinador.
- Al registrar, aprobar, descartar o enviar una acción, el código deriva de nuevo la aprobación exigida a partir de la tabla, según la herramienta y su origen: falsificar el campo de política no permite aprobar ni enviar una acción. Un borrador de ES-Alert del modelo queda pendiente de un coordinador humano; `--coordinador` solo simula esa aprobación.
- La extracción y la traducción al castellano delimitan la transcripción como dato no confiable; el juez de la zona gris delimita también el texto que compara. El código aplica a la extracción del modelo una gravedad mínima según el tipo y los riesgos detectados. Ese suelo no corrige un riesgo que el modelo no haya detectado.
- El planificador recibe datos estructurados, no transcripciones ni resúmenes libres. `POST /api/plan` valida las herramientas y sus argumentos y devuelve propuestas; no envía nada. Las rutas `/api/process`, `/api/translate`, `/api/transcribe` y `/api/plan` validan sus entradas y limitan su tamaño.

### Asistente de espera y parte de situación

En la sala simulada, el asistente interviene solo cuando todos los operadores están ocupados. Se presenta como asistente automático, pregunta qué ocurre y dónde, y da las instrucciones de seguridad que correspondan con frases fijas en el idioma del llamante (en castellano si falta traducción). Escala de inmediato toda llamada en espera con riesgo vital o gravedad 5, incluidos los duplicados con riesgo ya conocido. La llamada gana prioridad en la cola humana, pero no interrumpe una llamada ya en curso. Solo cierra sin operador los duplicados que el motor agrupa con un incidente confirmado y que no aportan información nueva ni indican riesgo vital. Nunca resuelve la zona gris.

Al final, el **parte de situación**, rotulado como simulación, recoge llamadas e incidentes, líneas liberadas por agrupación, prioridades y sus motivos, zonas de referencia, estados de las acciones y métricas de la sala con y sin asistente de espera.

### Dónde se ve en la consola

En **Simulación**, el detalle del incidente muestra las tarjetas de «Acciones del agente», con **Aprobar y enviar** o **Descartar** cuando corresponde al operador. ES-Alert se muestra sin esos botones en los incidentes de la zona. Los envíos simulados aparecen sobre el mapa con su acuse; la cabecera cuenta las acciones enviadas, la cola marca las propuestas por aprobar y el registro JSON incluye la traza de acciones. **En directo (QR)** no genera acciones ni reproduce el audio del escenario.

### Ejecutar el agente en terminal

```bash
npm run agente
npm run agente -- --escenario apagon
```

Sin opciones reproduce la DANA sin servidor, con extracciones del guion y un operador simulado que resuelve la zona gris con la referencia del escenario y aprueba lo que corresponde a su rol. Imprime la traza (percepción → motivo → herramienta → aprobación → resultado), el guion de espera y el parte.

| Opción | Comportamiento |
|---|---|
| `--escenario dana\|apagon` | Selecciona el escenario. |
| `--operadores N` | Configura la sala simulada: entero de 1 a 50; por defecto, 2. |
| `--coordinador` | Simula la aprobación del coordinador. Sin esta opción, ES-Alert queda pendiente si se propone. No equivale a una aprobación real ni difunde una alerta. |
| `--parte archivo.md` | Guarda también el parte de situación en Markdown. |
| `--json archivo.json` | Guarda la traza completa y el parte en JSON. |
| `--live` | Añade propuestas del modelo local al plan de reglas si está configurado. La extracción sigue siendo la del guion; sin modelo configurado se usan las reglas. No activa la pestaña QR. |

También se admiten los alias `--scenario`, `--operators`, `--coordinator` y `--report`. La CLI no ofrece una pantalla de ayuda: `--help` se ignora y, si va solo, ejecuta la DANA.

## Llamadas del público por QR (opcional)

El público escanea el QR de la consola, abre `/llamar` en el móvil y graba una llamada de prueba (sin mínimo, máximo 2 minutos). Dice qué pasa y **dónde** (calle o barrio de Málaga). El audio va a un relay en un VPS que lo transcribe con Whisper en CPU, extrae tipo, riesgos y lugar con un LLM si se configura, con reglas deterministas de respaldo (`lib/rules.ts`, `lib/gazetteer.ts`) y lo envía por SSE a la **bandeja «Llamadas del público»** de la consola. Nada entra en el mapa ni en la agrupación hasta que el operador pulsa **Aceptar**. Si no se reconoce el lugar, la llamada nunca se fusiona sola.

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
