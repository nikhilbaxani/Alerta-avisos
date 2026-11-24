# Relay del VPS — llamadas del público

Recibe el audio que graba el público desde `/llamar` (QR), lo transcribe con Whisper en CPU, extrae los datos con el extractor de reglas (`lib/rules.ts`) y lo envía por SSE a la bandeja de la consola en Vercel.

```
móvil ──POST /llamar──▶ Caddy (HTTPS) ──▶ relay (Node) ──▶ stt (Whisper CPU)
consola (Vercel) ◀──SSE /events?token=…── Caddy ◀── relay
```

Solo Caddy publica puertos (80 y 443). `relay` y `stt` no son accesibles desde fuera.

## Despliegue paso a paso

Requisitos en el VPS: Docker con el plugin `docker compose`, puertos 80 y 443 libres y unos 2 GB de RAM libres.

1. **DNS.** Crea un registro `A` (por ejemplo `relay.tudominio.com`) con la IP del VPS. Espera a que propague: Caddy necesita que el dominio ya apunte al VPS para obtener el certificado.
2. **Copia el repositorio** al VPS (`git clone` de la rama `feature/llamadas-publico` o `rsync`) y entra en la carpeta.
3. **Configura el entorno:**
   ```bash
   cp server/relay.env.example server/relay.env
   openssl rand -hex 24        # copia el resultado en RELAY_TOKEN
   nano server/relay.env       # RELAY_DOMAIN, RELAY_TOKEN y ALLOWED_ORIGINS
   ```
   `ALLOWED_ORIGINS` es la URL de la consola en Vercel (por ejemplo `https://tu-consola.vercel.app`, sin barra final). Solo ese origen podrá llamar desde el navegador.
4. **Arranca:**
   ```bash
   docker compose -f server/docker-compose.vps.yml --env-file server/relay.env up -d --build
   ```
   La primera vez `stt` descarga el modelo (~460 MB para `small`) en el volumen `whisper_models`; después queda en caché.
5. **Comprueba** (la primera respuesta puede tardar mientras carga el modelo):
   ```bash
   curl https://relay.tudominio.com/health
   # {"ok":true,"queue":0,"maxCallSeconds":120}
   docker compose -f server/docker-compose.vps.yml logs -f stt relay
   ```
6. **Vercel.** En el proyecto de la consola añade la variable de entorno `NEXT_PUBLIC_RELAY_URL=https://relay.tudominio.com` y vuelve a desplegar. El operador abre la consola con `https://tu-consola.vercel.app/#op=<RELAY_TOKEN>` (se guarda en `localStorage` y se borra de la URL; se usa `#` y no `?` para que el token no llegue a los registros de Vercel. `?op=` sigue aceptándose por compatibilidad). Si guardó uno equivocado, usa «Cambiar token» en la bandeja.
   Además, `NEXT_PUBLIC_MAX_CALL_SECONDS` (Vercel, corte de la grabación en el navegador) y `MAX_CALL_SECONDS` (VPS) **deben coincidir**: si el navegador permite más que el servidor, las llamadas largas se descartan.

Actualizar: `git pull` y repetir el comando del paso 4. Parar: `docker compose -f server/docker-compose.vps.yml down` (el volumen del modelo se conserva).

## Variables

| Variable | Por defecto | Qué hace |
|---|---|---|
| `RELAY_DOMAIN` | — | Dominio que sirve Caddy (HTTPS automático). |
| `RELAY_TOKEN` | — | Token de `/events`. Sin él, `/events` responde 503. |
| `ALLOWED_ORIGINS` | — | Orígenes CORS permitidos, separados por comas. |
| `MAX_CALL_SECONDS` | 120 | Máximo de duración; `stt` decodifica el audio y responde 413 (sin transcribir) si supera máximo + 5 s. Debe coincidir con `NEXT_PUBLIC_MAX_CALL_SECONDS` en Vercel. |
| `RATE_LIMIT` / `RATE_WINDOW_MIN` | 3 / 10 | Llamadas por IP y ventana. |
| `STT_MODEL` | `Systran/faster-whisper-small` | Modelo de Whisper. |

El relay (`server/relay.ts`) lee además `PORT` (8080), `HOST` (dirección de escucha; por defecto `0.0.0.0` para Docker, usa `127.0.0.1` en local), `STT_BASE_URL` y `TRUST_PROXY=1` (compose ya lo activa: la IP del cliente es el **último** salto de `X-Forwarded-For`, el que añade Caddy; los anteriores los controla el cliente). Las direcciones IPv6 se limitan por prefijo /64.

## Límites del endpoint público

3 MB por llamada (120 s de Opus ≈ 2 MB), tipo `audio/*` o `video/webm|mp4`, consentimiento obligatorio (`consent=1`), 3 llamadas por IP cada 10 min (solo cuentan las peticiones válidas aceptadas), cola de 20 llamadas (503 si está llena), `Origin` no permitido → 403 (sin `Origin`, p. ej. curl, se admite), transcripción y traducción recortadas a 4000 caracteres. Si la traducción falla, la llamada se publica sin ella. El audio se procesa de una en una.

## Latencia esperada (CPU)

Estimación, **no medida**: `small` con `int8` en 2–4 vCPU tarda del orden de 0,5–1× la duración del audio (una llamada de 60 s, ~30–60 s; la primera, algo más por la carga del modelo). Si el audio no está en castellano hay una segunda pasada (`translate`) que casi duplica el tiempo. Si va lento, usa `STT_MODEL=Systran/faster-whisper-base` o `tiny` (menos precisión). Mide en tu VPS con una llamada real antes de la demo.

## Privacidad

- El audio solo vive en memoria del relay y de `stt`: no se escribe en disco y se descarta al terminar la transcripción.
- Los registros no contienen texto de las llamadas ni IPs completas (solo un hash corto).
- Se conserva en memoria el último medio centenar de eventos (texto y extracción) para reenviarlos al conectar; se pierden al reiniciar.
- La transcripción es texto no confiable: no dispara acciones y la consola la muestra como texto plano. Tras aceptarla, el operador decide.
- Los datos van al VPS del equipo; el modelo Whisper se ejecuta allí, sin APIs externas (solo la descarga inicial del modelo).

## Desarrollo local

```bash
npx tsx server/relay.ts   # necesita un STT en STT_BASE_URL (p. ej. scripts/stt_server.py)
npx vitest run tests/relay.test.ts
```
