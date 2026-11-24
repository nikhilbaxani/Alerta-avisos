# Llamadas del público por QR

El público escanea un QR, graba su «llamada» en el móvil, el audio va a un servicio en el VPS (Whisper en CPU + extractor de reglas) y el resultado llega por SSE a una bandeja de entrada de la consola (Vercel), donde el operador la acepta o la descarta antes de que entre en la agrupación.
Rama: `feature/llamadas-publico`. Leer hasta `## Log`.

## Specs

- **S1 · Flujo.** «usar mi servidor vps de exitnode para que la gente escaneando un qr pueda llamar y el audio grabado se envíe al servidor y eso lo muestra en vercel en la web que tenemos desplegado el resultado.»
- **S2 · IA en el VPS.** Decisión del usuario: «Solo Whisper en el VPS». Sin LLM: la extracción la hace un extractor de reglas determinista (`lib/rules.ts`) que devuelve un `Extraction` válido (`lib/types.ts`, vocabularios cerrados). Para llamadas que no están en castellano, Whisper hace además una pasada `task=translate` (al inglés) y las reglas trabajan sobre castellano o inglés. `translation_es` = null; el texto en inglés viaja aparte (`translation_en`).
- **S3 · Grabación web.** Decisión del usuario: «Grabar en la web (Recomendado)». Página móvil `/llamar` en la app Next: aviso visible «Demo de hackathon. No es un servicio de emergencias. En una emergencia real, llama al 112.», casilla de consentimiento (sin ella no se graba), botón grabar/terminar, contador, envío al VPS y mensaje de recibido.
- **S4 · Duración.** «el audio no sea menor a 20s, que acepte 1min -2min como máximo pero no hay mínimo». Sin mínimo (salvo audio vacío); máximo 120 s, configurable (`MAX_CALL_SECONDS`, por defecto 120): el navegador corta la grabación a los 120 s y el servidor rechaza audio con duración > máximo + 5 s.
- **S5 · Ubicación por voz.** «lo de la ubicación que se lo diga con el audio y ya». Sin GPS ni lista: el extractor busca lugares de Málaga en un nomenclátor (`lib/gazetteer.ts`) y usa sus coordenadas como `aml` (`acc` 150 m). Si no reconoce ningún lugar: `location.known = false`, `aml` = Málaga centro con `acc` 1500, y la consola **nunca fusiona automáticamente** esa llamada (un `merge` se rebaja a `ask`).
- **S6 · Moderación.** Respuesta del usuario: «me parece bien». Las llamadas del público entran en una bandeja de entrada de la consola; nada pasa al motor ni al mapa hasta que el operador pulsa «Aceptar»; «Descartar» la quita.
- **S7 · Despliegue.** «Docker disponible» en el VPS: `docker-compose` con Caddy (HTTPS automático), el servicio relay (Node) y Whisper en CPU (`scripts/stt_server.py`). Pasos de despliegue documentados; no desplegamos nosotros.
- **S8 · Modo simulado intacto.** Sin `NEXT_PUBLIC_RELAY_URL` la consola funciona exactamente igual que hoy y la bandeja no aparece. Si el VPS cae, la consola sigue funcionando.
- **S9 · Seguridad del endpoint público.** Tamaño máximo 3 MB (la grabadora fija 64 kbps: 2 min ≈ 1 MB), tipo `audio/*` o `video/webm|mp4`, consentimiento obligatorio, límite 3 llamadas / 10 min por IP, cola máxima 20 (503 si llena), CORS solo para `ALLOWED_ORIGINS`, el audio solo vive en memoria y se descarta tras transcribir, sin teléfono ni nombre. El flujo `/events` exige `token` (comparación en tiempo constante). La transcripción es texto no confiable: no dispara acciones y se muestra como texto plano.

- **S10 · Todo en el VPS con Funnel.** «lo que tenemos pensado es la web también sea por el vps no usamos vercel ni nada de eso»; modo elegido: «Sí, con Tailscale Funnel (Recomendado)». La consola y `/llamar` se sirven como web estática (exportación estática, modo simulado) desde el VPS junto al relay, con un solo origen: Tailscale Funnel → Caddy en `127.0.0.1:8080` → `/relay/*` al relay y el resto a la web (`NEXT_PUBLIC_RELAY_URL=/relay`). firewalld, SSH por Tailscale, el exit node y los demás dispositivos no se tocan. La IP del cliente para la cuota se toma del `X-Forwarded-For` saltando direcciones locales y privadas desde la derecha; si Funnel no la pasa, se documenta la prueba y subir `RATE_LIMIT`.

- **S11 · LLM del sobremesa en el relay.** Usuario: «esto es para el modelo grande que procesa el texto que whisper transcribe» (`LLM_BASE_URL=https://pc-sobremesa.tail0093c8.ts.net:8443/v1`, `LLM_MODEL=strata`; la key va solo en `server/relay.env` del VPS, nunca en el repo) y elige «Sí, opción A (Recomendado)». Si `LLM_BASE_URL` está definido, el relay extrae con el LLM (prompt `EXTRACTION_SYSTEM` + `sanitizeExtraction`, con `translation_es`) y geolocaliza con el nomenclátor; si el LLM falla o tarda más de `LLM_TIMEOUT_MS` (20 s), usa las reglas (con la pasada `translate` de Whisper). El evento indica `extractor: "llm" | "rules"` y la consola lo muestra. El VPS llega al LLM por la ruta pública de Funnel del sobremesa: el aislamiento de la tailnet no cambia.

- **S12 · Pestañas Simulación / En directo.** Usuario: «lo que digo en la web que está la pestaña esta que cambia de malaga dana y apagón, hazlo que sea tipo que sea la pestaña simulado y la pestaña real donde aparece lo que le mandamos por el qr». Dos pestañas en la barra superior: «Simulación» (selector DANA/Apagón y controles de reproducción como hoy) y «En directo (QR)» (mapa, colas e incidentes vacíos donde solo entran las llamadas del público aceptadas en la bandeja; bandeja y QR visibles; sin reloj ni controles de reproducción). Cada pestaña conserva su estado al cambiar. Sin `NEXT_PUBLIC_RELAY_URL`, «En directo» aparece desactivada con un aviso.

## Contrato compartido (`lib/publicCall.ts`)

```ts
export interface PublicCallEvent {
  id: string;                 // "P1", "P2"… (asignado por el relay)
  receivedAt: string;         // ISO 8601
  durationS: number;
  language: string;           // ISO 639-1 que detecta Whisper
  transcript: string;         // original
  translation_en: string | null;
  extraction: Extraction;     // de lib/rules.ts
  location: { place: string | null; known: boolean; aml: Aml };
  timings: { sttMs: number; totalMs: number };
}
export function isPublicCallEvent(x: unknown): x is PublicCallEvent;
```

- `lib/gazetteer.ts`: `locate(text: string): { place: string; location_text: string; aml: Aml } | null`.
- `lib/rules.ts`: `extractByRules(input: { transcript: string; language: string; translation_en: string | null }): { extraction: Extraction; location: PublicCallEvent["location"] }`.
- Relay HTTP: `POST /llamar` (multipart: `file`, `consent=1`) → `202 {id}`; `GET /events?token=…` → SSE `event: call` + `data: <PublicCallEvent JSON>`, reenvía los últimos 50 al conectar, latido cada 15 s; `GET /health` → `{ok, queue}`.
- Consola: `NEXT_PUBLIC_RELAY_URL`; token del operador desde `?op=` o `localStorage`.

## Tasks

| ID | Specs | Ruta | Commit |
|---|---|---|---|
| T1 | S2, S5 | Extractor de reglas + nomenclátor + contrato, con tests (`lib/rules.ts`, `lib/gazetteer.ts`, `lib/publicCall.ts`, `tests/`) | f57706b |
| T2 | S1, S4, S7, S9 | Relay del VPS + Whisper CPU + Docker/Caddy (`server/`, `scripts/stt_server.py`) | 830f196 |
| T3 | S3, S4, S6, S8 | Página `/llamar` + QR + bandeja de entrada en la consola | 1f2534c |
| T4 | todas | Integración, e2e, README/DECISIONES/PROGRESO | a7fa4eb |
| T6 | S10, S9 | Despliegue todo-en-VPS con Funnel: web estática + Caddy interno + relay + stt | — |
| T7 | S11, S2, S5 | Extracción con el LLM del sobremesa en el relay, reglas como respaldo | — |
| T8 | S12 | Pestañas Simulación / En directo en la consola | — |
| T5 | S3–S6, S8, S9 | Endurecimiento tras verificación y revisión | 3a0b4d7, a91d0ef, dc47872 |

## Log

- **L1** (usuario): «vale ahora, hemos pensado de usar mi servidor vps de exitnode para que la gente escaneando un qr pueda llamar y el audio grabado se envíe al servidor y eso lo muestra en vercel en la web que tenemos desplegado el resultado.»
- **L2** (decisiones del usuario): IA → «Solo Whisper en el VPS»; llamada → «Grabar en la web (Recomendado)»; ubicación → «Elegir en una lista (Recomendado)», corregido en moderación: «me parece bien, pero lo de la ubicación que se lo diga con el audio y ya»; VPS → «Docker disponible».
- **L3** (usuario): «el audio no sea menor a 20s, que acepte 1min -2min como máximo pero no hay mínimo».
- **L4** (exploración): X04 ya hizo `lib/validate.ts` (reutilizable sin Next) y `lib/http.ts` (depende de Next). La consola no recalcula `decide` para acciones `new`, así que una llamada externa se decide en el navegador al aceptarla. No había SSE, Docker ni Vercel.
- **L5** (integración): ids del relay con etiqueta de arranque (`P<tag><n>`) para que un reinicio no repita ids ocultos por el `seen` de la bandeja; test del relay con el extractor real; título de `/llamar` cambiado a «Llamada de prueba al Copiloto 112». 269 tests, tsc, eval, eval:apagon y build en verde. Sin probar: docker build, Whisper real en CPU, micrófono real en móvil.
- **L6** (verificación independiente): S1–S9 PASS. Hallazgos: audio largo bloquea Whisper (DoS), token dentro de la imagen Docker, XFF primer salto, IPv6 sin agrupar, `?op=` en logs, POST de otros orígenes, transcripción sin límite, STT como root, cuota gastada por peticiones rechazadas.
- **L7** (revisión nativa aprobada, avisos no bloqueantes): alias genéricos («rincón», «puerto», «alameda») como lugar conocido, bandeja sin reconexión, token incorrecto sin salida, recibo «la verá» falso, fallo de traducción tira la llamada, colisión de ids en el mismo segundo.
- **L8** (T5): las 16 correcciones aplicadas; 289 tests, tsc, eval, eval:apagon y build en verde. Sin probar: ruta 413 de `stt_server.py` con Whisper real, reconexión y «Cambiar token» de la bandeja, build de las imágenes Docker.
- **L9** (revisión nativa de T5): corrección exigida 1, carrera de cuota (comprobar y contar separados por un await) → reserva síncrona de cuota y hueco de cola, devuelta si no hay 202 (a91d0ef, tests de peticiones solapadas en RED→GREEN). Corrección exigida 2, volumen de modelos de root tras actualizar → `chown` y `setpriv` al arrancar (dc47872). Revisión aprobada. S9 pasa de 8 MB a 3 MB y la grabadora fija 64 kbps (AAC en iOS). Pendiente aparte (avisos): decodificación sin límite antes del 413, recuperación de lugares de una palabra («aeropuerto», «cuarteles»), tests de la UI de la bandeja, escucha solo IPv4, `setpriv` sin comprobar con Docker real.
- **L10** (usuario): «vale primero hay que dejar el ssh exitnode expuesto al público luego, primero hay que quitar la conexión de tailscale, el firewalld cerrado solo de tailscale, la conexión a mi otros dipositivos y al sobremesa». Se desaconseja (riesgo de quedarse fuera; el relay no lo necesita).
- **L11** (usuario): «con tailscale como hago que la gente mande el audio usando el qr que le lleva a una web» → Funnel propuesto.
- **L12** (usuario): «lo que tenemos pensado es la web también sea por el vps no usamos vercel ni nada de eso»; elige «Sí, con Tailscale Funnel (Recomendado)».
- **L13** (T6): web estática + Caddy interno (`127.0.0.1:8080`) + relay + stt; Funnel delante. IP del cliente: XFF desde la derecha saltando locales/privadas; Caddy con `trusted_proxies static private_ranges` para no sustituir la cabecera de Funnel (si no, todo el público compartiría cuota). 293 tests, tsc, evals y build en verde; exportación estática con `/relay` comprobada en copia temporal y capturas sin errores de CSP en Chrome. Sin probar: build Docker, Caddy real, si Funnel envía `X-Forwarded-For` (prueba documentada en `server/README.md`, paso g).
- **L14** (despliegue en oracle-exit, 1 vCPU ARM, Ubuntu 24.04): `~/alerta-avisos`, `WEB_PORT=8095` (8080 lo usa SearXNG), Whisper `base`, Funnel en https://oracle-exit.tail0093c8.ts.net. Prueba por internet: llamada en castellano de 7 s → STT 5–6 s → inundacion_vehiculo, Campanillas conocida, gravedad 5; el relay ve la IP pública real y la suplantación con `X-Forwarded-For` se ignora; aceptar en la consola crea INC-01 sin errores.
- **L15** (usuario): «pero está puesto los modelos whisper? … esto es para el modelo grande que procesa el texto que whisper transcribe»; elige opción A. Comprobado: `strata` responde en ~9 s y traduce bien árabe; `pc-sobremesa.tail0093c8.ts.net` resuelve a una IP pública de Funnel (176.58.90.46), así que el contenedor llega por internet (200, 340 ms) con el aislamiento intacto. La key se pegó en el chat: rotarla tras el hackathon.
- **L16** (usuario): «De mientras, lo que digo en la web que está la pestaña esta que cambia de malaga dana y apagón, hazlo que sea tipo que sea la pestaña simulado y la pestaña real donde aparece lo que le mandamos por el qr».
