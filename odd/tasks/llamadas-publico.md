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
- **S9 · Seguridad del endpoint público.** Tamaño máximo 8 MB, tipo `audio/*` o `video/webm|mp4`, consentimiento obligatorio, límite 3 llamadas / 10 min por IP, cola máxima 20 (503 si llena), CORS solo para `ALLOWED_ORIGINS`, el audio solo vive en memoria y se descarta tras transcribir, sin teléfono ni nombre. El flujo `/events` exige `token` (comparación en tiempo constante). La transcripción es texto no confiable: no dispara acciones y se muestra como texto plano.

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
| T4 | todas | Integración, e2e, README/DECISIONES/PROGRESO | a7fa4eb + este commit |

## Log

- **L1** (usuario): «vale ahora, hemos pensado de usar mi servidor vps de exitnode para que la gente escaneando un qr pueda llamar y el audio grabado se envíe al servidor y eso lo muestra en vercel en la web que tenemos desplegado el resultado.»
- **L2** (decisiones del usuario): IA → «Solo Whisper en el VPS»; llamada → «Grabar en la web (Recomendado)»; ubicación → «Elegir en una lista (Recomendado)», corregido en moderación: «me parece bien, pero lo de la ubicación que se lo diga con el audio y ya»; VPS → «Docker disponible».
- **L3** (usuario): «el audio no sea menor a 20s, que acepte 1min -2min como máximo pero no hay mínimo».
- **L4** (exploración): X04 ya hizo `lib/validate.ts` (reutilizable sin Next) y `lib/http.ts` (depende de Next). La consola no recalcula `decide` para acciones `new`, así que una llamada externa se decide en el navegador al aceptarla. No había SSE, Docker ni Vercel.
- **L5** (integración): ids del relay con etiqueta de arranque (`P<tag><n>`) para que un reinicio no repita ids ocultos por el `seen` de la bandeja; test del relay con el extractor real; título de `/llamar` cambiado a «Llamada de prueba al Copiloto 112». 269 tests, tsc, eval, eval:apagon y build en verde. Sin probar: docker build, Whisper real en CPU, micrófono real en móvil.
