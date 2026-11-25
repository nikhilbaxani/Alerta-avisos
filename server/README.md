# Relay del VPS — llamadas del público

Recibe el audio que graba el público desde `/llamar` (QR) y lo transcribe con Whisper. **La persona ve la transcripción y decide:** solo cuando pulsa «Enviar» el relay publica el evento por SSE en la bandeja de la consola. **La extracción de datos (LLM o reglas de `lib/rules.ts`) empieza en cuanto la transcripción está lista, es decir, ANTES de «Enviar»:** con un LLM configurado, el texto de una llamada que la persona acaba descartando ya se ha enviado al LLM del equipo (en el sobremesa, sin guardarse en disco). **Todo corre en el VPS, con un solo origen**, publicado únicamente a través de Tailscale Funnel:

```
móvil / operador ──HTTPS──▶ Tailscale Funnel ──▶ web (Caddy, 127.0.0.1:8080)
                                                   ├─ /relay/*  ──▶ relay (Node) ──▶ stt (Whisper CPU)
                                                   └─ resto     ──▶ web estática (consola + /llamar)
```

- La web es la exportación estática de la consola (modo simulado, como en GitHub Pages) construida con `NEXT_PUBLIC_RELAY_URL=/relay`.
- Docker publica **solo** `127.0.0.1:8080`. Nada escucha en la IP pública del VPS. `firewalld`, el acceso SSH por Tailscale, el exit node y el resto de dispositivos **no se tocan**.
- `relay` y `stt` no publican puertos: solo se ven dentro de la red de compose.

## Flujo y protocolo de `/llamar` (S14)

1. La página sube el audio: `POST /llamar` (multipart `file` + `consent=1`) → `202 {"id": "<32 hex>"}`. El id es **secreto** (128 bits aleatorios) y distinto del id público del evento (`P…`). La llamada queda **pendiente en memoria**; no llega al SSE ni al histórico.
2. La página sondea `GET /llamar/:id` (cada 1–2,5 s) → `{status, transcript?, language?, error?}`:

| `status` | Significado |
|---|---|
| `transcribing` | En cola o transcribiendo (≈9 s por llamada: el STT va de una en una). Incluye `ahead`: cuántas llamadas se transcribirán antes que esta (0 = la que está en proceso); ningún dato de las demás. La espera no caduca ni se olvida. |
| `ready` | Hay `transcript` (texto plano, solo lectura) y `language`. La extracción ya corre en segundo plano. |
| `failed` | STT fallido, audio demasiado largo, sin voz o idioma no reconocido; `error` en castellano sin texto de la llamada. |
| `expired` | Pasó `PENDING_TTL_SECONDS` desde que la transcripción estuvo lista sin «Enviar», o el relay la retiró para dejar sitio a otra (ver «Límites»); el texto y el audio ya se liberaron. |
| `sent` | «Enviar» confirmado (sin texto), aunque la publicación siga en curso. |

3. «Enviar» → `POST /llamar/:id/enviar` responde de inmediato con `200 {"status":"sent"}`; repetirlo con el mismo id devuelve el mismo recibo sin volver a publicar. El relay publica el evento **una sola vez** al terminar la extracción, con reglas si el LLM falla o agota su plazo. La llamada confirmada no caduca mientras espera la publicación. Antes de aceptar: `409` si aún transcribe o falló, `410` si caducó. Si hay un error inesperado al publicar, el relay lo registra y `GET` indica `failed`.
4. «Volver a grabar» → `DELETE /llamar/:id` descarta la llamada (`200`; después `404`). Tras confirmar «Enviar», devuelve `409` sin cancelar la publicación.
5. Un id desconocido, mal formado o ya olvidado → `404` con mensaje en castellano. Las rutas nuevas aplican la misma regla de `Origin` que `POST /llamar` (no permitido → `403`), no necesitan token del operador y no gastan cuota; solo conocer el id da acceso, así que no se puede enumerar la transcripción de otros. Respuestas con `Cache-Control: no-store`.

Las llamadas pendientes cuentan contra la cola y el tope por IP (ver «Límites del endpoint público»). Recargar la página a mitad pierde la llamada pendiente (se borra sola al caducar).

## Despliegue paso a paso

Requisitos en el VPS: Docker con el plugin `docker compose`, Tailscale ya instalado y conectado, y unos 2 GB de RAM libres.

**a) Tailscale (una vez, en la consola de administración).** En *Access controls* añade a la política (`nodeAttrs`) el atributo `funnel` para este nodo o su etiqueta:

```json
"nodeAttrs": [
  { "target": ["<este nodo o tag:xxx>"], "attr": ["funnel"] }
]
```

Y en *DNS* activa **HTTPS Certificates** para la tailnet. Anota el nombre del nodo: `https://<nodo>.<tailnet>.ts.net`.

**b) Configura el entorno.** Copia el repositorio al VPS (`git clone` de la rama `feature/llamadas-publico`) y entra en la carpeta:

```bash
cp server/relay.env.example server/relay.env
openssl rand -hex 24        # copia el resultado en RELAY_TOKEN
nano server/relay.env       # RELAY_TOKEN y ALLOWED_ORIGINS=https://<nodo>.<tailnet>.ts.net
```

`ALLOWED_ORIGINS` debe ser exactamente el origen de Funnel (sin barra final): aunque la web y el relay comparten origen, el navegador envía `Origin` en el `POST` y el relay solo acepta los orígenes listados.

**c) Arranca:**

```bash
docker compose -f server/docker-compose.vps.yml --env-file server/relay.env up -d --build
```

La primera vez se construye la web y `stt` descarga el modelo (~460 MB para `small`) en el volumen `whisper_models`.

**d) Comprueba en local** (la primera respuesta puede tardar mientras carga el modelo):

```bash
curl http://127.0.0.1:8080/relay/health
# {"ok":true,"queue":0,"maxCallSeconds":120}
```

**e) Publica con Funnel:**

```bash
sudo tailscale funnel --bg <WEB_PORT>   # 8080 por defecto
tailscale funnel status
```

`funnel status` muestra la URL pública `https://<nodo>.<tailnet>.ts.net` apuntando a `http://127.0.0.1:8080`.

**f) Usa la consola.** El operador abre `https://<nodo>.<tailnet>.ts.net/#op=<RELAY_TOKEN>` (se guarda en el navegador y se borra de la URL; si guardó uno equivocado, «Cambiar token» en la bandeja). La consola muestra un QR que apunta a `/llamar`: el público lo escanea desde el móvil.
`NEXT_PUBLIC_MAX_CALL_SECONDS` (corte de la grabación en el navegador) se fija al construir la web con el mismo `MAX_CALL_SECONDS` del servidor, así que no hay que mantener dos valores; si lo cambias, vuelve a ejecutar el comando del paso c).

**g) Prueba de la IP del cliente (importante).** El límite de llamadas por IP necesita la IP real del cliente. Funnel debería pasarla en `X-Forwarded-For`, pero no está verificado en este despliegue. Prueba con dos móviles **con datos móviles** (no wifi): cada uno hace una llamada y mira:

```bash
docker compose -f server/docker-compose.vps.yml --env-file server/relay.env logs relay
```

Cada línea `recibida` termina en `ip <hash de 8 caracteres>`: deben ser **distintos** entre los dos móviles. Si salen iguales (o ambos como la IP local), Funnel no reenvía la IP del cliente y todo el público compartiría una cuota: pon `RATE_LIMIT=60` en `server/relay.env` y reinicia con el comando del paso c). La moderación del operador sigue protegiendo la pantalla.

**Prueba de suplantación (después de la anterior).** Desde un portátil fuera de la tailnet, envía una llamada con una IP falsa en la cabecera y comprueba que el relay registra tu IP real, no la falsa:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -H 'X-Forwarded-For: 9.9.9.9' \
  -F consent=1 -F 'file=@llamada.webm;type=audio/webm' https://<nodo>.<tailnet>.ts.net/relay/llamar
```

Repite la petición sin la cabecera: las dos líneas `recibida` del log deben llevar **el mismo** hash de IP. Si son distintos, Funnel deja pasar la cabecera del cliente sin añadir la suya: pon `RATE_LIMIT=60` como arriba y no confíes en el límite por IP. Caddy conserva la cabecera de Funnel gracias a `trusted_proxies static private_ranges` en `server/Caddyfile`.

**h) Parar:**

```bash
sudo tailscale funnel --https=443 off    # o: sudo tailscale funnel reset  (no verificado: comprueba `tailscale funnel --help` en tu versión)
docker compose -f server/docker-compose.vps.yml --env-file server/relay.env down   # el volumen del modelo se conserva
```

**i) Qué no cambia.** `firewalld`, SSH por Tailscale, el exit node y los demás dispositivos quedan como estaban; Docker solo abre `127.0.0.1:8080`, inaccesible desde fuera salvo a través de Funnel.

Actualizar: `git pull` y repetir el paso c).

## Pasar a un dominio propio (más adelante)

Con un registro `A` apuntando al VPS y los puertos 80/443 libres: en `server/relay.env` pon `SITE_ADDRESS=demo.tudominio.com` y `ALLOWED_ORIGINS=https://demo.tudominio.com`, y en `server/docker-compose.vps.yml` añade a `web` los puertos `"80:80"` y `"443:443"` (Caddy pide el certificado solo). Esto **sí** expone el VPS a internet: revisa antes `firewalld`.

## Variables

| Variable | Por defecto | Qué hace |
|---|---|---|
| `SITE_ADDRESS` | `:8080` | Dirección de Caddy. `:8080` = HTTP plano detrás de Funnel. |
| `RELAY_TOKEN` | — | Token de `/events`. Sin él, `/events` responde 503. |
| `ALLOWED_ORIGINS` | — | Orígenes permitidos (CORS y `Origin` de los POST), separados por comas: el de Funnel. |
| `MAX_CALL_SECONDS` | 120 | Máximo de duración; `stt` responde 413 (sin transcribir) si supera máximo + 5 s. También se usa al construir la web. |
| `RATE_LIMIT` / `RATE_WINDOW_MIN` | 3 / 10 | Cuota por IP y ventana: llamadas **enviadas o aún pendientes**. Una descartada o caducada sin enviar devuelve su unidad (una sola vez). |
| `UPLOAD_LIMIT` | 3 × `RATE_LIMIT` (9) | Audios aceptados por IP y ventana; **no se devuelve** al descartar (evita gastar tiempo de STT grabando y descartando). Vacío = por defecto. Si cambias `RATE_LIMIT`, el valor por defecto sigue a `RATE_LIMIT`. |
| `PENDING_PER_IP` | 2 | Llamadas de una misma IP (/64 en IPv6) en transcripción, esperando «Enviar» o confirmadas pendientes de publicar. La siguiente → 429 «envía o descarta la anterior». |
| `MAX_PENDING` | 20 | Llamadas retenidas en todo el relay, incluidas las confirmadas pendientes de publicar (más una en proceso). Para unas 50 personas a la vez: `MAX_PENDING=50`. |
| `PENDING_TTL_SECONDS` | 300 | Tiempo que una llamada **ya transcrita** espera a «Enviar» antes de caducar y liberar su memoria (cuenta desde que el texto está listo, no desde la subida; el id responde `expired` hasta el doble y luego `404`). |
| `STT_MODEL` | `Systran/faster-whisper-small` | Modelo de Whisper. |
| `LLM_BASE_URL` | — | URL base (compatible OpenAI) del LLM opcional del equipo. Vacío → solo reglas. |
| `LLM_MODEL` | `qwen2.5:14b-instruct` | Nombre del modelo en `LLM_BASE_URL`. |
| `LLM_API_KEY` | — | Clave del LLM (solo en `server/relay.env`, nunca en el repositorio). |
| `LLM_TIMEOUT_MS` | `20000` | Tiempo máximo de espera del LLM antes de pasar a reglas (ms); cuenta desde que la petición sale, no desde que espera hueco. |
| `LLM_CONCURRENCY` | `2` | Peticiones simultáneas del relay al LLM (entero ≥ 1; otro valor → 2). Las demás esperan en el relay por orden, con prioridad para las llamadas cuyo «Enviar» ya está pulsado. Motivo: el STT y el LLM comparten gateway y este admite pocas conexiones simultáneas por IP (8 en el sobremesa); sin límite, una ráfaga de extracciones agota las conexiones y el STT recibe 429. |
| `LLM_DEFER_MAX_MS` | `20000` | Mientras el STT tenga llamadas por transcribir, el relay no arranca la extracción del LLM de las llamadas sin «Enviar»; arrancan al quedar libre el STT, al pulsar «Enviar» o pasado este plazo desde que su transcripción está lista (entero ≥ 0; `0` = no aplazar, como antes; otro valor → 20000). Motivo: el LLM y Whisper comparten GPU y lo que la gente espera en el móvil es la transcripción; nadie espera la extracción de una llamada aún no enviada. |
| `COMPOSE_PROFILES` | `local-stt` (en el ejemplo) | Perfil que levanta el Whisper local `stt`. Quítalo si usas el Whisper del sobremesa. |
| `STT_BASE_URL` | `http://stt:8000/v1` | STT del relay (OpenAI-compatible). Con el sobremesa: la URL `…/v1` del gateway. |
| `STT_API_KEY` | — | Clave del STT (`Authorization: Bearer`). Vacío → se reutiliza `LLM_API_KEY` **solo si** `STT_BASE_URL` tiene el mismo origen (esquema + host + puerto) que `LLM_BASE_URL`; a otro host no se envía ninguna clave. Sin clave, sin cabecera. |
| `STT_TIMEOUT_MS` | `180000` | Tiempo máximo de cada petición al STT (incluye sus reintentos). |
| `STT_RETRIES` | `3` | Reintentos del STT ante HTTP 429, 502, 503, 504 o error de red (esperas de 500 ms, 1 s y 2 s; respeta `Retry-After` en segundos, máximo 5 s). `0` los desactiva. Otros errores (400, 413, 500…) fallan al instante. Motivo: el gateway del sobremesa limita las conexiones simultáneas por IP y responde 429 al pasarse. |
| `STT_LOCAL_MODEL` | `STT_MODEL` | Modelo del `stt` local si el relay usa otro `STT_MODEL` (p. ej. `whisper` del gateway). |
| `STT_BEAM_SIZE` / `STT_CPU_THREADS` | 5 / 0 | Ajuste de velocidad de `scripts/stt_server.py` (local o sobremesa): beam 1 es más rápido y algo menos preciso; hilos 0 = valor de la biblioteca. |
| `LLM_EXTRA_BODY` | — | Objeto JSON que se añade a la petición (no puede cambiar modelo, mensajes ni temperatura). Con modelos que razonan: `{"chat_template_kwargs":{"enable_thinking":false}}` (con `strata`, de ~65 s a ~5 s por llamada). |

El relay (`server/relay.ts`) lee además `PORT` (8080), `HOST` (dirección de escucha; por defecto `0.0.0.0` para Docker, usa `127.0.0.1` en local), `STT_BASE_URL` y `TRUST_PROXY=1` (compose ya lo activa): la IP del cliente se toma de `X-Forwarded-For` **recorriéndolo desde la derecha** y saltando direcciones locales y privadas (loopback, RFC1918, 100.64.0.0/10 de Tailscale, `fc00::/7`, `fe80::/10`); lo que queda a la izquierda de la primera dirección pública lo controla el cliente y se ignora. Si todas son locales se usa la dirección del socket. Las direcciones IPv6 se limitan por prefijo /64.

## LLM del equipo (opcional)

Si defines `LLM_BASE_URL`, `LLM_MODEL` y `LLM_API_KEY` en `server/relay.env`, tras la transcripción de Whisper el relay extrae los datos y traduce al castellano con el LLM del equipo (usando `EXTRACTION_SYSTEM` y `sanitizeExtraction` para mantener los vocabularios cerrados y el suelo de gravedad), geolocaliza con el nomenclátor (`lib/gazetteer.ts`) y se salta la segunda pasada `translate` de Whisper (ahorra CPU). La consola muestra «LLM del equipo» en el motor del evento.

- **Respaldo automático:** si `LLM_BASE_URL` está vacío, o si el LLM falla, devuelve una respuesta inválida o tarda más de `LLM_TIMEOUT_MS` (20 s por defecto), el relay registra el aviso y pasa al extractor de reglas (`lib/rules.ts`; con LLM configurado no hay pasada `translate`, solo la transcripción; sin LLM, con la pasada `translate` de Whisper si el idioma no es castellano).
- **Aislamiento intacto:** el relay llega al LLM por su URL pública HTTPS (p. ej. Tailscale Funnel del sobremesa), sin acceso a la tailnet; la regla `server/tailnet-guard.nft` no cambia.
- **Clave:** guárdala solo en `server/relay.env` (fuera de git) y **rótala tras el evento**.

## Whisper grande en el sobremesa (opcional)

Whisper `base` en 1 vCPU transcribe y, sobre todo, «traduce» (solo a inglés) mal. Con `STT_BASE_URL` apuntando al gateway del equipo y `STT_MODEL=whisper`, el relay transcribe con `large-v3-turbo` (CPU) en el sobremesa, tras el mismo gateway y la misma clave que el LLM: `POST {gateway}/v1/audio/transcriptions` (multipart `file`, `model`, `task`, `response_format=verbose_json`, `Authorization: Bearer …`). Hay **un único STT**: sin respaldo en el `stt` local (así no se suma latencia ni complejidad).

```bash
# server/relay.env en el VPS (placeholders; la clave real solo ahí)
STT_BASE_URL=https://<gateway>/v1
STT_MODEL=whisper
# COMPOSE_PROFILES=local-stt   ← bórrala o coméntala: el Whisper local ya no se levanta
```

- **Una sola pasada de Whisper por llamada.** Con LLM configurado el relay nunca pide `translate`: la traducción al castellano (y el idioma, si el gateway solo devuelve `{"text": …}`) salen del LLM en la misma petición de extracción. Si el LLM falla, la llamada se publica con las reglas y sin traducción (no se hace una segunda pasada). Sin LLM, todo sigue como siempre: reglas + pasada `translate` del STT.
- **Fallos del STT:** 413 = audio demasiado largo (descartada); cualquier otro error (red, tiempo, estado no 2xx, cuerpo mal formado) → la llamada no se publica y se registra el error. Sin `language` ni del STT ni del LLM, la llamada se descarta; sin `duration` se acepta.
- **Límite de duración (S4):** el STT del sobremesa debe ser `scripts/stt_server.py` arrancado con **el mismo `MAX_CALL_SECONDS` que el VPS** (120): rechaza con 413 audio de más de `MAX_CALL_SECONDS + 5` s antes de transcribir, y un no-2xx nunca publica una llamada. Si el gateway reescribe el 413 por otro error, la llamada también se descarta.
- **Velocidad:** `scripts/stt_server.py` acepta `--beam-size` (`STT_BEAM_SIZE`, 5 por defecto) y `--cpu-threads` (`STT_CPU_THREADS`, 0 = biblioteca); beam 1 acelera a costa de algo de precisión. Mide antes de la demo.
- **Perfil `local-stt`:** el servicio `stt` solo se levanta con `COMPOSE_PROFILES=local-stt` (ya en `relay.env.example`, así el despliegue sin sobremesa funciona igual que antes). Un `relay.env` anterior que no tenga esa línea deja de levantar el `stt` local: añádela, o configura el sobremesa. Requiere Docker Compose ≥ 2.20 (`depends_on … required: false`).
- **Aislamiento intacto:** el VPS llega al sobremesa solo por su URL pública HTTPS; `server/tailnet-guard.nft` no cambia.
- **Latencia (medición actual, 6 hilos de CPU; pocas muestras, no un benchmark):** 14,5 s de castellano → 8,9 s; 18,1 s de árabe → 9,1–9,5 s; una llamada real de 6 s → 9,2 s. El coste es casi fijo por ventana de ~30 s de audio, no proporcional a la duración. Suma la red y el gateway.
- **Privacidad:** con este STT el audio de las llamadas del público se transcribe en el sobremesa del equipo (allí es donde va para el STT), y el texto transcrito se envía al LLM del equipo en el mismo sobremesa; no se guarda en disco ni en el VPS ni en el sobremesa. La página `/llamar` lo dice en el texto de consentimiento.

## Límites del endpoint público

3 MB por llamada (120 s de Opus ≈ 2 MB), tipo `audio/*` o `video/webm|mp4`, consentimiento obligatorio (`consent=1`), `Origin` no permitido → 403 (sin `Origin`, p. ej. curl, se admite), transcripción y traducción recortadas a 4000 caracteres. Si la traducción falla, la llamada se publica sin ella. El audio se procesa de una en una. Cada petición rechazada (400, 413, 415…) devuelve lo que reservó.

- **Cuota por IP** (`RATE_LIMIT` por `RATE_WINDOW_MIN`, 3 / 10 min): cuentan las llamadas **enviadas o aún pendientes**. «Volver a grabar» (DELETE antes de «Enviar»), caducar sin enviar o ser retirada por falta de sitio devuelven la unidad, una sola vez. Una llamada enviada conserva la suya.
- **Tope de subidas por IP** (`UPLOAD_LIMIT`, por defecto 3 × `RATE_LIMIT`, misma ventana): cuenta los audios aceptados y **nunca se devuelve**; así grabar y descartar no es una forma gratuita de gastar STT (429 «has subido demasiados audios»).
- **Pendientes por IP** (`PENDING_PER_IP`, 2): llamadas transcribiéndose, esperando «Enviar» o pendientes de publicar. La tercera → 429. Publicar, descartar o caducar liberan hueco.
- **Cola global** (`MAX_PENDING`, 20 retenidas más una en proceso; las publicadas no cuentan). Si está llena, la subida nueva **retira a la llamada `ready` más antigua** (esperando «Enviar»; nunca una que se transcribe ni una que ya se envía): su dueño ve el mensaje de caducada, se libera su memoria y se le devuelve la cuota. Solo si no hay ninguna retirable → 503. Así llamadas abandonadas no bloquean a nadie.
- **Mucha gente a la vez.** El STT va en serie (≈9 s por llamada): 50 personas a la vez esperan hasta ≈8 min la última. La página muestra los segundos y «Hay N llamadas por delante de la tuya» y sigue esperando mientras el relay conteste `transcribing`; solo se rinde si el relay dice `failed`/`expired`/404 o fallan 8 consultas seguidas. Ni el TTL ni el olvido (2×TTL) corren mientras la llamada espera turno, y el tiempo máximo del STT (`STT_TIMEOUT_MS`) cuenta desde el turno de cada llamada. Con `MAX_PENDING=50` y las IP distintas de un grupo, caben las 50; desde una misma IP (p. ej. wifi compartida con NAT) solo 2 a la vez y 3 por ventana: si pasa, sube `RATE_LIMIT` y `PENDING_PER_IP`.

## Latencia esperada (CPU)

Con el Whisper del sobremesa (6 hilos): 8,9 s para 14,5 s de castellano, 9,1–9,5 s para 18,1 s de árabe y 9,2 s para una llamada real de 6 s; el coste es casi fijo por ventana de ~30 s. Con el `stt` local del VPS (`small`, `int8`, 2–4 vCPU) la estimación sigue sin medirse: del orden de 0,5–1× la duración del audio. Si el audio no está en castellano y no hay LLM hay una segunda pasada (`translate`) que casi duplica el tiempo. Si va lento, usa `STT_MODEL=Systran/faster-whisper-base` o `tiny` (menos precisión).

## Privacidad

- El audio solo vive en memoria del relay y de quien lo transcribe: no se escribe en disco en ninguno y se descarta al terminar la transcripción. El texto de una llamada pendiente solo está en memoria hasta la publicación, «Volver a grabar» o la caducidad.
- **Texto al LLM antes de «Enviar»:** la extracción empieza cuando la transcripción está lista. Con LLM configurado, el texto de una llamada que luego se descarta ya se envió al LLM del equipo.
- Los registros no contienen texto de las llamadas, el id secreto ni IPs completas (solo un hash corto).
- Se conserva en memoria el último medio centenar de eventos (texto y extracción) para reenviarlos al conectar; se pierden al reiniciar.
- La transcripción es texto no confiable: no dispara acciones y la consola la muestra como texto plano. Tras aceptarla, el operador decide.
- Los datos llegan al VPS del equipo. Con el `stt` local, Whisper se ejecuta en el VPS (sin APIs externas; solo la descarga inicial del modelo). Con el STT del sobremesa (despliegue actual), el audio se transcribe **en el sobremesa del equipo** —ahí es donde va para el STT, por HTTPS— y el texto transcrito se envía al LLM del equipo en ese mismo sobremesa; en ninguno de los dos sitios se guarda en disco.
- **Consola del operador tras recargar:** el relay reenvía los últimos 50 eventos al conectar. La consola guarda en `localStorage`, por URL de relay, las ids ya aceptadas o descartadas (las últimas 500) y no las ofrece otra vez. El estado de la sesión en vivo **no** se guarda: tras recargar, los incidentes aceptados ya no están en el mapa y no se recrean.

## Desarrollo local

```bash
npx tsx server/relay.ts   # necesita un STT en STT_BASE_URL (p. ej. scripts/stt_server.py)
npx vitest run tests/relay.test.ts
```

## Aislar el VPS de la tailnet (obligatorio)

El VPS recibe datos de cualquiera en internet: si alguien lo comprometiera, no debe poder saltar a tus otros equipos de la tailnet. Hay dos capas:

**1. En el VPS (nftables).** `server/tailnet-guard.nft` corta las conexiones *nuevas* que salen del VPS hacia la tailnet (100.64.0.0/10 y `fd7a:115c:a1e0::/48`, salvo MagicDNS 100.100.100.100) y todo lo que salga de los contenedores del Agente 112 (puente `br-alerta`) hacia la tailnet o hacia los servicios del VPS publicados en su IP de Tailscale. Lo entrante (tu SSH al VPS, exit node, DNS) y sus respuestas no se tocan.

```bash
# Prueba segura: marcha atrás automática a los 5 minutos por si te quedas sin acceso
sudo systemd-run --on-active=300 --unit=tailnet-guard-rollback /usr/sbin/nft delete table inet tailnet_guard
sudo nft -f server/tailnet-guard.nft
# Abre una sesión SSH NUEVA para comprobar el acceso; si va bien, hazlo permanente:
sudo systemctl stop tailnet-guard-rollback.timer
sudo install -m 0644 server/tailnet-guard.nft /etc/tailnet-guard.nft
sudo install -m 0644 server/tailnet-guard.service /etc/systemd/system/tailnet-guard.service
sudo systemctl daemon-reload && sudo systemctl enable --now tailnet-guard
# Quitarlo: sudo systemctl disable --now tailnet-guard
```

**2. En la política de Tailscale (la que manda).** La capa 1 se puede saltar con root en el VPS; la política se aplica en tus propios dispositivos. Etiqueta el VPS (`tag:publico`) y permite conexiones solo desde tus dispositivos de usuario (`autogroup:member`), nunca desde `*`. Un nodo etiquetado no pertenece a `autogroup:member`, así que no puede iniciar conexiones hacia nadie, mientras tú sigues entrando en él y usándolo como exit node.
