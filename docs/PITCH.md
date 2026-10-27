# Pitch: Copiloto 112

> Cifras solo de MEMORIA §3, con su fuente. Todo lo demás es del producto y se puede enseñar en la demo.

## Guion de 3 minutos

**1. El problema (0:00–0:20)**
«El 29 de octubre de 2024, la DANA de Valencia generó 19.821 llamadas al 112 para 4.770 incidentes: unas cuatro llamadas por incidente. En el apagón del 28 de abril de 2025 las llamadas se multiplicaron por cuatro y en Cataluña se perdieron más de 10.000. En una catástrofe el cuello de botella no son los recursos: son las líneas. Si seis personas llaman por el mismo coche atrapado, cada minuto con la sexta es un minuto que no se dedica a la única llamada en árabe sobre un infarto.»

**2. Demo (0:20–1:50)**: pulsar Iniciar a ×4.
- El contador pasa de llamadas a incidentes y suben las «líneas liberadas».
- A4 («hay un bebé»): aviso de **información nueva**, sube la prioridad.
- B2, la hija que llama desde otro barrio: se agrupa por **la dirección que menciona**, no por su posición.
- F1: se pone en **ámbar** («a 460 m, puede ser otro coche»). El operador pulsa `D`: «aquí había una segunda persona». Es la decisión que no se deja a la IA.
- E1, en árabe: sube a la cabeza de la cola. Responder «¿La persona respira?» en árabe y pulsar **Reproducir al llamante**.

**3. Por qué nosotros (1:50–2:30)**: 100 % local (datos de salud y localización), castellano y AML, Ley de IA (humano en el bucle y cada decisión explicada), y vía de venta: el pliego andaluz puntúa las aplicaciones software que ofrezca el licitador, así que vendemos al contratista que concursa.

**4. Modelo de negocio y siguientes pasos (2:30–3:00)**: piloto con un contratista, licencia por puesto de operador y evaluación con llamadas reales anonimizadas. Métrica: líneas liberadas y tiempo hasta la llamada crítica.

## Seis diapositivas (texto)

1. **El 112 se satura por duplicados.** 19.821 llamadas, 4.770 incidentes (DANA 2024). Apagón 2025: llamadas ×4.
2. **Copiloto 112.** Agrupa, detecta lo nuevo y traduce. La IA propone, el operador decide.
3. **Demo en vivo.** (Consola: 26 llamadas → 7 incidentes, zona gris, árabe con voz.)
4. **Cuatro cosas que nadie más hace a la vez.** Información nueva en duplicados · agrupar por la dirección mencionada · zona gris visible · respuesta traducida · todo en local.
5. **Mercado.** 43.845 llamadas en idioma extranjero en Andalucía (2024); 362.822 residentes extranjeros en la provincia de Málaga; Andalucía gestionó 894.930 emergencias en 2025. Venta al contratista del pliego.
6. **Siguiente paso.** Piloto con un contratista; evaluación con llamadas reales anonimizadas; cumplimiento de la Ley de IA (alto riesgo, obligaciones desde dic-2027).

## Números y fuentes

| Dato | Fuente |
|---|---|
| 19.821 llamadas / 4.770 incidentes, DANA 29-oct-2024 | 112 Comunitat Valenciana / prensa |
| Apagón 28-abr-2025: llamadas ×4; más de 10.000 perdidas en Cataluña; récord de 4.385 en Aragón | 112 autonómicos / prensa |
| Andalucía 2025: más de 3,7 M de llamadas, 894.930 emergencias; Málaga 197.351 | Junta de Andalucía |
| 43.845 llamadas en idioma extranjero (Andalucía, 2024) | Junta de Andalucía |
| 362.822 residentes extranjeros en la provincia de Málaga | INE |
| Traducción humana hoy: Cataluña ~50 idiomas, unos 30 s para conectar | 112 Catalunya |
| No hemos encontrado un 112 español que agrupe duplicados automáticamente | Investigación propia (oct-2026) |

## Preguntas difíciles del jurado

**¿Y si la IA se equivoca y fusiona dos emergencias distintas?**
Por eso hay tres zonas. Por encima de 0,78 se fusiona y es reversible con «Separar»; entre 0,45 y 0,78 no fusiona: pregunta. En la evaluación del escenario hay 0 fusiones incorrectas, y la zona gris nunca se convierte en fusión automática, tampoco con el modelo local (solo opina).

**¿Mejora la IA de verdad a los operadores?**
Con honestidad: en el ensayo de Corti (JAMA 2021) la IA reconocía mejor las paradas cardiacas, pero no mejoró el reconocimiento de los operadores (93,1 % frente a 90,5 %, no significativo). Lección: no damos alertas que se ignoran; reducimos carga y ordenamos. Nuestra métrica es líneas liberadas y tiempo hasta la llamada crítica, y la validaremos en un piloto.

**¿Qué diferencia hay con Prepared, Carbyne o Motorola?**
Son de nube y de EE. UU., y traducen; no agrupan duplicados. El proyecto Surge Desk sí fusiona, pero no detecta información nueva en duplicados, ni agrupa por dirección mencionada, ni traduce la respuesta del operador. Nosotros somos local, en castellano, con AML y encajados en el pliego.

**¿Qué pasa con la privacidad?**
Datos de salud y localización: todo corre en local, sin nube; el servidor no guarda estado. Clasificar llamadas de emergencia es alto riesgo en la Ley de IA: humano en el bucle, explicación en cada decisión y registro.

**¿Funciona con el audio real?**
En la demo las llamadas son sintéticas (ficticias). La ruta con Whisper está construida y probada con un servidor simulado; la evaluación con audio real es el primer paso del piloto.

**¿Quién paga?**
El contratista que concursa: el pliego andaluz puntúa las aplicaciones software y penaliza tiempos de respuesta de más de 5 s fuera de situaciones extraordinarias. Licencia por puesto de operador.

**¿Y si falla la wifi o la GPU?**
Modo simulado: sin red, sin GPU, sin claves, con el mismo algoritmo de agrupación y prioridad.
