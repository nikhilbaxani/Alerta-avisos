# Decisiones

Formato: `## AAAA-MM-DD · título` + Decisión · Motivo · Alternativa descartada.

## 2026-10-27 · Mapa SVG propio en lugar de teselas
- Decisión: dibujar la bahía de Málaga en SVG con coordenadas aproximadas.
- Motivo: la demo debe funcionar sin red (wifi del hackathon) y sin claves.
- Descartado: Leaflet con teselas de OpenStreetMap o CARTO.

## 2026-10-27 · Permisos totales solo en el bucle nocturno
- Decisión: `.claude/settings.json` usa `acceptEdits` con lista de permitidos y prohibidos; los permisos totales se activan con `--dangerously-skip-permissions` desde `scripts/noche.sh`.
- Motivo: Claude Code ignora `bypassPermissions` en la configuración del proyecto; las reglas `deny` se siguen aplicando incluso con permisos totales.

## 2026-10-28 · `locations` en IncidentSnapshot
- Decisión: campo opcional `locations?: string[]` con los `location_text` de las llamadas del incidente.
- Motivo: MEMORIA §9 compara `location_text` de la llamada con el de los incidentes, pero el snapshot solo traía keywords; así B2 se agrupa por "Cuarteles 14".
- Descartado: usar solo keywords (diluye la coincidencia de dirección).

## 2026-10-28 · Dolor torácico cuenta como estado crítico en la prioridad
- Decisión: el +10 de `sin_respuesta|inconsciente` también aplica a `dolor_pecho` (`lib/priority.ts`).
- Motivo: con la fórmula literal E1 (infarto) quedaba 4.º por los minutos sin atender de los demás; con el ajuste es 2.º a los 30 s de entrar, que es el momento de la demo. No se toca `gold`.
- Descartado: quitar los minutos sin atender (es lo que evita que se olvide a nadie).

## 2026-10-28 · E1 se mide a los 30 s de llegar
- Decisión: `npm run eval` comprueba el puesto de E1 en la cola 30 s después de su llamada, no al final del escenario.
- Motivo: al final G (sin respuesta + atrapados) legítimamente la supera; lo que importa es que en la demo suba arriba.

## 2026-10-28 · Consola en claro con estética de terminal
- Decisión: se mantiene el diseño claro de MEMORIA §12, con detalles de consola (datos en cifras tabulares, reloj T+mm:ss, etiquetas de estado) pero sin tema oscuro.
- Motivo: MEMORIA lo fija; el usuario pidió formato panel de control/consola, que cubre la estructura de tres zonas.

## 2026-10-28 · Tipo `ascensor` en el vocabulario cerrado
- Decisión: se añade `ascensor` a `INCIDENT_TYPES` (etiqueta «Personas atrapadas en ascensor») para el escenario del apagón (X01). No cambia ningún caso de la DANA.
- Motivo: «Otro» no dice nada al operador y los ascensores son el caso típico de un apagón.
- Descartado: dejarlo en `otro` (la agrupación funcionaba, pero la cola era ilegible).

## 2026-10-28 · Segundo escenario en archivo aparte
- Decisión: `data/scenario-apagon-malaga.ts` y `data/scenarios.ts` (registro). El archivo de la DANA no se toca. Los ids de llamada no se repiten entre escenarios (A–G frente a H–M).
- Motivo: la API busca el mock por `callId` en todos los escenarios y las reglas prohíben editar el escenario original.

## 2026-11-24 · IA local nativa, sin Docker
- Decisión: `scripts/ia-local.sh` arranca Ollama (binario en `~/.local/ollama`) y `scripts/stt_server.py`, un servidor propio de faster-whisper compatible con la API de OpenAI (`/v1/models`, `/v1/audio/transcriptions`), en `.venv-stt` con `av<19` y `nvidia-cublas-cu12`.
- Motivo: en el portátil de Nick Docker no ve la GPU (falta nvidia-container-toolkit, que requiere sudo) y solo había 17 GB libres; la ruta Docker ocupaba unos 15 GB.
- Descartado: `docker-compose.gpu.yml` + speaches (se mantiene como alternativa en `setup-modelos.sh`).

## 2026-11-24 · Prompt de extracción con definiciones y escala de gravedad
- Decisión: `EXTRACTION_SYSTEM` define cada tipo y cada riesgo (`Record<…>` obliga a cubrir el vocabulario), fija una escala de gravedad 1–5 y pide palabras clave y lugares siempre en castellano. Algoritmo, umbrales, `gold` y guiones sin tocar.
- Motivo: con qwen2.5:7b real, la gravedad salía 1–2 puntos baja, había palabras clave en otros idiomas y tipos confundidos (H3 ascensor → médica). Eval real antes: DANA 7 incidentes / 4 preguntas, apagón 7/6; 0 fusiones incorrectas siempre.
- Pendiente: el 7B varía entre ejecuciones (B2 llegó a salir «médica»); el último ajuste (médica frente a vivienda) no se ha medido aún con la IA real.

## 2026-11-24 · Versión estática en GitHub Pages
- Decisión: con `GITHUB_PAGES=1`, `next.config.mjs` hace `output: "export"`; el workflow quita `app/api` y el cliente (`STATIC_EXPORT`) usa directamente el plan B del navegador (mismo algoritmo con las extracciones del escenario).
- Motivo: enlace público estable para equipo y jurado sin depender del portátil. Probado en local: 26 → 7, 0 errores de consola, 0 peticiones fallidas, escritorio y móvil.
- Descartado: túneles (localtunnel devolvía 408 y se cerraba) y Vercel (requiere cuenta; sigue siendo viable).

## 2026-11-24 · Traducción al castellano en una llamada aparte
- Decisión: `translation_es` ya no se pide en el JSON de extracción; si la llamada no está en castellano, `processCall` hace una segunda llamada solo de traducción (`TO_SPANISH_SYSTEM`). Si falla, queda `null` y la consola enseña el original.
- Motivo: con qwen2.5:7b real la traducción salía `null` en muchas llamadas extranjeras (K2, A2, C3) y la de E1 inventaba lugares («estación de Abú Umar», porque Whisper quita la puntuación del árabe). Con la llamada aparte, las 5 probadas traducen; E1 dice «Mi padre tiene 70 años…». Cuesta ~2 s más por llamada extranjera.
- Pendiente: el `summary_es` de E1 todavía puede inventar el nombre de la estación.

## 2026-11-24 · De copiloto a agente sin tocar la interfaz
- Decisión: se aplica `docs/PROPUESTA-AGENTE.md` como tareas X04–X08 (MEMORIA §16): seguridad primero, después agente de acciones con conectores simulados, agente para llamadas en espera, ES-Alert y parte de situación. Por indicación de Nick, la interfaz de la consola no se toca: el agente vive en `lib/`, `app/api/` y `scripts/` y se demuestra con `npm run agente`.
- Motivo: el reto pide agentes que actúen y conecten servicios; hoy el sistema percibe y razona, pero no actúa. La consola ya está verificada y presentada (vídeo y presentación), así que no se arriesga.
- Automatismos: solo los avisos informativos a organismos (distribuidora, ayuntamiento) se envían sin aprobación, con registro; la tabla de política está en código y tests, nunca la decide el LLM. ES-Alert siempre lo aprueba un humano con rol de coordinador. Ninguna `ask` se convierte en fusión.
- Descartado: tarjetas de acción y paneles en la consola (Nick no quiere cambios de interfaz) y renombrar la consola a «Agente 112» (pendiente de decisión de Nick).

## 2026-11-24 · Mapa satelital (ortofoto PNOA del IGN) en lugar del dibujo SVG
- Decisión: el fondo del mapa es la ortofoto PNOA máxima actualidad del IGN (CC BY 4.0, atribución visible en el mapa), descargada una vez por WMS con `scripts/build_satellite.py` y guardada en `assets/map/` (detalle 6000 px de la bahía, 2,7 MB, que se carga al acercar; vista general 2800 px con el entorno, 0,7 MB). Misma proyección equirectangular de MEMORIA §12, así que las coordenadas de los escenarios no cambian. El mapa se arrastra y se acerca con rueda o botones, además de las zonas rápidas.
- Motivo: Nick pidió un mapa satelital; el dibujo aproximado no se parecía a la costa real. Se mantiene la regla de MEMORIA §7 (nada de teselas ni red en tiempo de ejecución): las imágenes van dentro de la aplicación y funcionan sin wifi y en GitHub Pages.
- Detalles: el mosaico del IGN tiene huecos y bloques de neblina sobre el mar; el script los rellena con el color del mar más cercano (solo muestrea píxeles de mar). Por debajo de ~0,0002°/px el WMS sirve otro mosaico con otros colores, por eso el entorno se descarga al doble de resolución.
- Descartado: teselas en línea (Esri, OSM, IGN WMTS), que rompen el modo sin red; Sentinel-2 (10 m/px, demasiado borroso al acercar a Campanillas).

## 2026-11-24 · Rediseño de la consola para que la entienda cualquiera
- Decisión: se mantiene la paleta de MEMORIA §12 (ámbar solo para decisiones, rojo para lo crítico, consola en claro) pero con menos bordes negros y más jerarquía tipográfica. Cambios: títulos por tipo y lugar («Vehículo atrapado por agua · Paso inferior A-357») con el INC como dato secundario; idiomas con nombre completo; cada llamada dice qué pasó con ella («Repetida · agrupada en INC-01», «Emergencia nueva»); el aviso ámbar compara lado a lado la llamada nueva y el incidente abierto; el número del marcador en el mapa es el puesto en la lista de prioridad; cuatro cifras de resumen arriba; pantalla de bienvenida y diálogo «Cómo funciona»; iconos SVG propios (sin librerías).
- Motivo: Nick pidió una interfaz más intuitiva, accesible para cualquiera y que no pareciera hecha deprisa. Los textos de botones y atajos de MEMORIA («Mismo incidente», «Incidente distinto», M/D, «Separar llamada», «Reproducir al llamante») no cambian.
- Relación con X04–X08: este rediseño lo pidió Nick expresamente después de aprobar el plan de agente; X04–X08 siguen sin tocar la interfaz.
- Descartado: tema oscuro tipo panel de control (MEMORIA lo descarta) y librerías de componentes o iconos.
