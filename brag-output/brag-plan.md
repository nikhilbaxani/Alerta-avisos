# Brag Plan: Copiloto 112

## What is this app?
Una consola para salas del 112 que agrupa las llamadas que hablan del mismo incidente, detecta las que traen información nueva y traduce en tiempo real; la IA propone, el operador decide, y todo corre en local.

## The angle
Una sala del 112 en una catástrofe se bloquea con duplicados, no con falta de recursos. El vídeo hace sentir eso en 3 segundos (llamadas que se amontonan) y luego lo deshace: 26 llamadas se pliegan en 7 incidentes. El giro humano es la zona gris ámbar: la máquina se para y pregunta. Todo el copy sale de la propia consola y del README; el tono es serio porque el tema lo es.

## Hook (first 2-3 seconds)
Pantalla oscura. Una pila de líneas de llamada entrantes (códigos reales del escenario: A1, A2, A3, A4... con el idioma ES/EN/DE/AR en la etiqueta) cae una a una. Sobre ellas, texto: «26 llamadas.» Hold. Luego: «Un mismo coche atrapado.»

## Key moments (the middle)
- Las llamadas A1, A2, A3 y A4 (coche atrapado en el paso inferior de Campanillas) se pliegan en una sola tarjeta: INC-01 · Vehículo atrapado por agua. El contador pasa de «11 llamadas» a «6 incidentes» y sube «5 líneas liberadas» (cifras de la captura final-escritorio-decision.png).
- Zona gris: banner ámbar «¿La llamada F1 es el mismo incidente que INC-01?» con los botones «Mismo incidente [M]» e «Incidente distinto [D]». Un cursor simulado pulsa D. Subtítulo de producto: «La IA propone. El operador decide.»
- La llamada E1 en árabe («Hombre de 70 años con dolor torácico...») sube al puesto 2 de la cola con la etiqueta «Crítica».

## Outro / punchline
Cierre: «26 llamadas → 7 incidentes.» y debajo, «Copiloto 112». Última línea pequeña: «Modo simulado: sin GPU, sin wifi, sin claves.»

## User flow worth showing
1. Entrada: pulsar «Iniciar» (×4) y empezar a caer las llamadas.
2. Acción clave: la consola se para en ámbar y el operador pulsa D.
3. Resultado: 7 incidentes ordenados por prioridad, con la llamada en árabe arriba.

## Tone
- Preset: polished
- Creative direction: película silenciosa de sala de control; sobria, nocturna, sin chistes.
- Interpretation: pocas escenas, holds largos, tipografía grande, movimiento contenido; la tensión viene del contraste caos → orden.

## Format: landscape — 1920x1080
## Duration: 21 seconds

## Visual identity (from the project)
- Background: #15222e (--ink, barra superior y paneles oscuros); papel #e9edf0 (--paper) para las capturas de UI
- Accent: #f2a900 (--amber); alertas #c61f2b (--red)
- Text: #ffffff sobre oscuro; #15222e sobre claro
- Display font: Archivo Variable (instalada con @fontsource-variable/archivo)
- Body font: Archivo Variable
- Strongest visual element: el banner ámbar de decisión y el mapa SVG con los puntos de llamada

## Share copy (draft)
26 llamadas al 112, un solo coche atrapado. Copiloto 112 las agrupa, detecta lo nuevo y traduce, y cuando duda, pregunta al operador. Todo en local.

## Audio direction
- Role: sparse professional accents
- Music: happy-beats-business-moves-vol-12-by-ende-dot-app.mp3 (polished/cinematic)
- Music treatment: entra en 0 s a volumen 0.30, baja a 0.20 durante la escena ámbar, fade-out en los últimos 2 s.
- Music cue guidance: preset leído (vol-12, ~110 BPM). strongCues objetivo: 8.74 s (el pliegue de llamadas en un incidente), 13.11 s (zona gris ámbar), 17.47 s (la llamada en árabe sube); salida cerca de 22.93 s si cabe. Rejilla de beats 6.56–8.19 s para las llamadas que se pliegan una a una.
- Audio-reactive treatment: subtle; el brillo ámbar del banner respira con el RMS. Sin ecualizador ni ondas.
- SFX posture: sparse, ligado al movimiento.
- Audio-coupled moments: caída de las líneas de llamada (accent solo en la primera y la última), pliegue en INC-01 (impacto suave), clic del cursor sobre «Incidente distinto».
- Restraint rule: nada de alarmas ni sirenas; es un tema de emergencias y el sonido no debe dramatizarlo.

## Storyboard

### Scene 1 — Hook: las llamadas se amontonan — 4s
Fondo #15222e. Las líneas de llamada (ID, idioma, texto corto real como «Coche atascado en el paso inferior de Campanillas con gente dentro; el agua sube.») caen en pila. Texto: «26 llamadas.» (hold 1,2 s) y «Un mismo coche atrapado.» (hold 1,5 s).
Sequential/interaction: sí; 5-6 filas de llamada caen una a una, cada fila sin texto que leer salvo ID y idioma.
Audio intent: tensión baja, el bed entra.
Audio-coupled idea: tick suave en la primera y la última fila.
Music: bed entra en 0 s.
Transition mood: hard → Scene 2

### Scene 2 — El pliegue: 4 llamadas, 1 incidente — 5s
Recreación de la consola (cola de llamadas a la izquierda, tarjeta INC-01 a la derecha). A1, A2, A3 y A4 se deslizan hacia INC-01 · «Vehículo atrapado por agua». Contador: «11 llamadas → 6 incidentes · 5 líneas liberadas». Etiqueta roja «Crítica».
Sequential/interaction: sí; cada llamada entra en la tarjeta en un beat alterno (mínimo 0,5 s de separación, texto de la tarjeta fijo y legible al final, hold 1,5 s).
Audio intent: alivio, orden.
Audio-coupled idea: impacto suave en el pliegue, bloqueado al strongCue 8.74 s.
Music: sin cambio.
Transition mood: soft → Scene 3

### Scene 3 — La zona gris — 5s
Banner ámbar #f2a900: «¿La llamada F1 es el mismo incidente que INC-01?» y «A 347 m de INC-01, mismo tipo, coinciden: coche, Campanillas, agua. Puntuación 0,69: puede ser el mismo incidente u otro distinto. Decide el operador.» Botones «Mismo incidente [M]» y «Incidente distinto [D]». El cursor pulsa D. Hold final con «La IA propone. El operador decide.»
Sequential/interaction: sí; cursor simulado que se mueve y pulsa «Incidente distinto».
Audio intent: pausa, atención.
Audio-coupled idea: clic en la pulsación, bloqueado a ~13.11 s.
Music: baja a 0.20.
Transition mood: clean → Scene 4

### Scene 4 — La llamada en árabe — 4s
La cola reordena: E1 · AR sube al puesto 2: «Hombre de 70 años con dolor torácico y dificultad respiratoria; 6.ª planta, sin luz ni...» con etiqueta «Crítica». Subtítulo: «Respuesta en el idioma del llamante.»
Sequential/interaction: sí; la fila sube de posición con las demás desplazándose.
Audio intent: sube un poco, resolución humana.
Audio-coupled idea: acento suave al llegar a la posición, ~17.47 s.
Music: vuelve a 0.30.
Transition mood: soft → Scene 5

### Scene 5 — Cierre — 3s
Fondo oscuro. «26 llamadas → 7 incidentes.» (hold 1,5 s) y «Copiloto 112». Línea pequeña: «Modo simulado: sin GPU, sin wifi, sin claves.»
Sequential/interaction: none
Audio intent: calma, fade-out.
Audio-coupled idea: none
Music: fade-out en los últimos 2 s.
Transition mood: fin.

**Total: 4 + 5 + 5 + 4 + 3 = 21 s.**

**Music mood for this video:** cinematic sobrio (vol-12, volumen bajo).
**Audio summary:** bed discreto, tres acentos ligados al pliegue, al clic del operador y a la subida de la llamada en árabe, fade-out al cierre.

## Claims grounding
Todo el copy sale del propio proyecto: README (26 llamadas, 7 incidentes, modo simulado sin GPU/wifi/claves, «La IA propone; el operador decide»), la captura de la consola (11 llamadas → 6 incidentes, 5 líneas liberadas, banner F1/INC-01 con 347 m y puntuación 0,69) y los datos de `data/scenario-dana-malaga.ts`. No se usan cifras externas ni la simulación de sala (son supuestos ilustrativos, según docs/PITCH.md). Todos los datos del escenario son ficticios, y los teléfonos ya vienen enmascarados.
