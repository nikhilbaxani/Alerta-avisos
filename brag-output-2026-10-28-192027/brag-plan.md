# Plan del vídeo: Copiloto 112

Todo el vídeo y el texto para compartir van en castellano.

## Preguntas previas
- **Qué es:** una consola para las salas del 112 que agrupa las llamadas del mismo incidente, avisa cuando un duplicado trae información nueva y responde al llamante en su idioma. La IA propone y el operador decide. Los modelos corren en local.
- **Para quién:** operadores del 112 en una catástrofe (DANA, apagón), cuando las líneas se saturan con duplicados.
- **Qué lo distingue:** la zona gris. Cuando duda («a 347 m, puede ser otro coche»), no fusiona: para y pregunta (M / D). Además, todo es local.
- **La cifra más potente:** 26 llamadas en 6 idiomas se quedan en 7 incidentes, con 19 líneas liberadas y 0 fusiones incorrectas (salida de `npm run eval` y captura final).
- **Gancho visual:** seis llamadas reales sobre el *mismo* coche atrapado (A1–A6: ES, EN, DE, ES, ES, EN) se apilan y se pliegan en una sola tarjeta, INC-01.
- **Interfaz real:** la consola de verdad, conducida con Playwright y con el reloj controlado. Se pulsa Iniciar, entran llamadas y suben los contadores; en el banner ámbar, el cursor pulsa «Incidente distinto»; después, INC-05 en árabe: una frase rápida y «Reproducir al llamante».
- **Tono:** polished. Una sala de control en silencio: sobria y nocturna, en tinta y ámbar, sin chistes.
- **Datos:** todo viene del escenario ficticio del repo, con los teléfonos enmascarados.

## Identidad
- Colores de `app/globals.css`: tinta `#15222e`, papel `#e9edf0`, ámbar `#f2a900`, rojo `#c61f2b`, agua `#2b6cb0`.
- Tipografía: Archivo Variable (eje `wdth`), la misma que usa la app.

## Música
- 96 BPM: un pulso dura 0,625 s y un compás 2,5 s. Son 8 compases, 20,0 s (600 fotogramas a 30 fps).
- Re menor, con la progresión i–VI–III–VII (Rem–Si♭–Fa–Do), un acorde por compás.
- Instrumentos: un bombo suave, un bajo en corcheas (el reloj que aprieta), un pad oscuro y un arpegio de campana que entra con la revelación.
- Efectos afinados en la tonalidad: notas del acorde al caer cada tarjeta, un «whoomp» grave al agruparlas, un clic y un acorde ámbar en la decisión, y un golpe final.
- Todos los cortes caen en un pulso.

## Guion gráfico (32 pulsos)
| # | Pulsos | Tiempo | Escena | Texto |
|---|---|---|---|---|
| 1 Gancho | 0–6 | 0,00–3,75 | Fondo tinta. Seis tarjetas de llamada reales de INC-01 (A1…A6, con su idioma) caen una por corchea. En el pulso 4 se pliegan en una sola: «INC-01 · Vehículo atrapado por agua · 6 llamadas · Crítica». | «6 llamadas.» / «Un solo coche atrapado.» |
| 2 Revelación | 6–11 | 3,75–6,875 | La tarjeta sale y entra la marca. | «Para las salas del 112, en plena catástrofe» · «Copiloto 112» · «Agrupa las llamadas del mismo incidente.» |
| 3 Agrupar | 11–16 | 6,875–10,0 | El panel tinta sube y deja ver la **consola real** en marcha (T+0:20 → T+2:10). La cámara se acerca a los contadores y a la cola. | «Cada duplicado libera una línea.» |
| 4 Zona gris | 16–22 | 10,0–13,75 | La cámara se desliza hasta el banner ámbar. El cursor pulsa «Incidente distinto D» en el pulso 20. | «Si duda, pregunta. Decide el operador.» |
| 5 Árabe | 22–26 | 13,75–16,25 | Cortinilla tinta. Aparece INC-05 (E1, en árabe). El cursor pulsa «¿La persona respira?», aparece el árabe y luego pulsa «Reproducir al llamante». | «Responde en el idioma del llamante.» |
| 6 Cierre | 26–32 | 16,25–20,0 | La tinta sube desde abajo. | «26 llamadas → 7 incidentes» · «Copiloto 112» · «La IA propone. El operador decide.» · en pequeño: «Modo simulado: sin GPU, sin wifi, sin claves.» |
