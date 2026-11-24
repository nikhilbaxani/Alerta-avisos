# Relay del VPS — llamadas del público

Recibe el audio que graba el público desde `/llamar` (QR), lo transcribe con Whisper en CPU, extrae los datos con el extractor de reglas (`lib/rules.ts`) y lo envía por SSE a la bandeja de la consola. **Todo corre en el VPS, con un solo origen**, publicado únicamente a través de Tailscale Funnel:

```
móvil / operador ──HTTPS──▶ Tailscale Funnel ──▶ web (Caddy, 127.0.0.1:8080)
                                                   ├─ /relay/*  ──▶ relay (Node) ──▶ stt (Whisper CPU)
                                                   └─ resto     ──▶ web estática (consola + /llamar)
```

- La web es la exportación estática de la consola (modo simulado, como en GitHub Pages) construida con `NEXT_PUBLIC_RELAY_URL=/relay`.
- Docker publica **solo** `127.0.0.1:8080`. Nada escucha en la IP pública del VPS. `firewalld`, el acceso SSH por Tailscale, el exit node y el resto de dispositivos **no se tocan**.
- `relay` y `stt` no publican puertos: solo se ven dentro de la red de compose.

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
| `RATE_LIMIT` / `RATE_WINDOW_MIN` | 3 / 10 | Llamadas por IP y ventana. |
| `STT_MODEL` | `Systran/faster-whisper-small` | Modelo de Whisper. |
| `LLM_BASE_URL` | — | URL base (compatible OpenAI) del LLM opcional del equipo. Vacío → solo reglas. |
| `LLM_MODEL` | `qwen2.5:14b-instruct` | Nombre del modelo en `LLM_BASE_URL`. |
| `LLM_API_KEY` | — | Clave del LLM (solo en `server/relay.env`, nunca en el repositorio). |
| `LLM_TIMEOUT_MS` | `20000` | Tiempo máximo de espera del LLM antes de pasar a reglas (ms). |
| `COMPOSE_PROFILES` | `local-stt` (en el ejemplo) | Perfil que levanta el Whisper local `stt`. Quítalo si usas el Whisper del sobremesa. |
| `STT_BASE_URL` | `http://stt:8000/v1` | STT del relay (OpenAI-compatible). Con el sobremesa: la URL `…/v1` del gateway. |
| `STT_API_KEY` | — | Clave del STT (`Authorization: Bearer`). Vacío → se reutiliza `LLM_API_KEY` **solo si** `STT_BASE_URL` tiene el mismo origen (esquema + host + puerto) que `LLM_BASE_URL`; a otro host no se envía ninguna clave. Sin clave, sin cabecera. |
| `STT_TIMEOUT_MS` | `180000` | Tiempo máximo de cada petición al STT. |
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
- **Latencia (dos muestras, no un benchmark), medida directamente en el sobremesa:** 14,5 s de castellano → 11,2 s; 18,1 s de árabe → 11,7 s (≈0,7× tiempo real), con texto e idioma correctos. Suma la red y el gateway.
- **Privacidad:** el audio de las llamadas del público también se envía por HTTPS al sobremesa del equipo, donde no se guarda en disco. La página `/llamar` lo dice en el texto de consentimiento.

## Límites del endpoint público

3 MB por llamada (120 s de Opus ≈ 2 MB), tipo `audio/*` o `video/webm|mp4`, consentimiento obligatorio (`consent=1`), 3 llamadas por IP cada 10 min (solo cuentan las peticiones válidas aceptadas), cola de 20 llamadas (503 si está llena), `Origin` no permitido → 403 (sin `Origin`, p. ej. curl, se admite), transcripción y traducción recortadas a 4000 caracteres. Si la traducción falla, la llamada se publica sin ella. El audio se procesa de una en una.

## Latencia esperada (CPU)

Estimación, **no medida**: `small` con `int8` en 2–4 vCPU tarda del orden de 0,5–1× la duración del audio (una llamada de 60 s, ~30–60 s; la primera, algo más por la carga del modelo). Si el audio no está en castellano hay una segunda pasada (`translate`) que casi duplica el tiempo. Si va lento, usa `STT_MODEL=Systran/faster-whisper-base` o `tiny` (menos precisión). Mide en tu VPS con una llamada real antes de la demo.

## Privacidad

- El audio solo vive en memoria del relay y de `stt`: no se escribe en disco y se descarta al terminar la transcripción.
- Los registros no contienen texto de las llamadas ni IPs completas (solo un hash corto).
- Se conserva en memoria el último medio centenar de eventos (texto y extracción) para reenviarlos al conectar; se pierden al reiniciar.
- La transcripción es texto no confiable: no dispara acciones y la consola la muestra como texto plano. Tras aceptarla, el operador decide.
- Los datos van al VPS del equipo; el modelo Whisper se ejecuta allí, sin APIs externas (solo la descarga inicial del modelo). Con el STT principal activado, el audio se envía además por HTTPS al sobremesa del equipo (ver arriba).

## Desarrollo local

```bash
npx tsx server/relay.ts   # necesita un STT en STT_BASE_URL (p. ej. scripts/stt_server.py)
npx vitest run tests/relay.test.ts
```

## Aislar el VPS de la tailnet (obligatorio)

El VPS recibe datos de cualquiera en internet: si alguien lo comprometiera, no debe poder saltar a tus otros equipos de la tailnet. Hay dos capas:

**1. En el VPS (nftables).** `server/tailnet-guard.nft` corta las conexiones *nuevas* que salen del VPS hacia la tailnet (100.64.0.0/10 y `fd7a:115c:a1e0::/48`, salvo MagicDNS 100.100.100.100) y todo lo que salga de los contenedores del Copiloto (puente `br-alerta`) hacia la tailnet o hacia los servicios del VPS publicados en su IP de Tailscale. Lo entrante (tu SSH al VPS, exit node, DNS) y sus respuestas no se tocan.

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
