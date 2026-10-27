# MEMORIA del proyecto: Copiloto 112 ("Alerta-avisos")

> Fuente única de verdad del proyecto. Cualquier agente que trabaje en este repo debe leer este archivo antes de empezar. Si algo de aquí se contradice con el código, manda este documento y hay que dejarlo anotado en `docs/DECISIONES.md`.

## 1. Qué es, en una frase

Un copiloto de IA para las salas del 112 en España que, durante una catástrofe (DANA, apagón), **agrupa las llamadas que hablan del mismo incidente**, **detecta cuáles traen información nueva o urgente** y **traduce en tiempo real** a las personas que no hablan castellano. La IA propone y **el operador siempre decide**. Los modelos corren **en local** (privacidad: datos de salud y localización).

## 2. Contexto: hackathon

- Autor: Nick, estudiante de 3.º de Ciberseguridad e IA en la UMA (Málaga).
- Evento: hackathon de emprendimiento con impacto social. Solo software (sin hardware). Hay GPU propia disponible para modelos locales.
- Objetivo de la noche: un **MVP presentable** (demo en directo de 3 minutos más un pitch), no un producto completo.

## 3. El problema (datos para el pitch, con su fuente)

| Dato | Fuente |
|---|---|
| DANA de Valencia (29-oct-2024): 19.821 llamadas al 112 para 4.770 incidentes, unas 4 llamadas por incidente | 112 Comunitat Valenciana / prensa |
| Apagón del 28-abr-2025: llamadas multiplicadas por 4; más de 10.000 llamadas perdidas en Cataluña; récord de 4.385 llamadas en Aragón | 112 autonómicos / prensa |
| Andalucía 2025: más de 3,7 M de llamadas y 894.930 emergencias gestionadas; Málaga 197.351 (agosto 20.820 frente a febrero 12.872) | Junta de Andalucía |
| 43.845 llamadas en idioma extranjero en el 112 Andalucía (2024) | Junta de Andalucía |
| Provincia de Málaga: 362.822 residentes extranjeros | INE |
| Hoy la traducción es humana: Cataluña ~50 idiomas con intérprete telefónico, unos 30 s para conectar | 112 Catalunya |
| No hemos encontrado ningún 112 español que agrupe automáticamente llamadas duplicadas | Investigación propia (oct-2026) |

Mensaje clave: en una catástrofe el cuello de botella no son los recursos sino las líneas. Si 6 personas llaman por el mismo coche atrapado, cada minuto que un operador dedica a la sexta llamada es un minuto que no atiende la única llamada en árabe sobre un infarto.

## 4. Cómo funciona el 112 en España (lo que hay que saber)

- RD 903/1997: el servicio lo prestan las comunidades autónomas. El número es único y la gestión, autonómica.
- Las salas las operan contratistas (p. ej. Ilunion en Valencia) sobre plataformas de Hexagon (Andalucía) o Telefónica Soluciones (mantenimiento en Madrid).
- Andalucía: nueva plataforma PIGEA en 2026 y paso de 8 sedes a un centro único. Pliego técnico CONTR 2026/109830.
- Flujo de una llamada: atención y despacho (tipificación, localización, activación de recursos), seguimiento, coordinación de sala y enlace con otros organismos.
- Lo que ya existe: AML (el móvil envía su posición con 15–20 m de precisión), ES-Alert, eCall y app 112. La IA solo está en pilotos: Andalucía (Cestel/Gladia), sandbox de transcripción en Galicia, plan en Canarias antes de 2027 y herramienta de priorización de la UPV (2026).
- **Vía de venta**: el pliego andaluz puntúa las aplicaciones software que ofrezca el licitador (3 meses para desplegarlas o 2.000 €/mes de penalización). También penaliza un tiempo medio de respuesta de más de 5 s (salvo situaciones extraordinarias) y exige refuerzo en 60 min o 7.000 € de penalización. Nuestro cliente es **el contratista que se presenta al concurso**: le damos una aplicación puntuable que le ayuda a cumplir los indicadores en picos.
- Regulación: con la Ley de IA europea, clasificar llamadas de emergencia es **alto riesgo** (obligaciones desde dic-2027). De ahí el diseño con humano en el bucle, explicabilidad (cada decisión dice por qué) y registro.

## 5. Competencia y cómo nos diferenciamos

| Quién | Qué hace | Diferencia |
|---|---|---|
| Prepared (EE. UU., más de 30 M$) | Traducción bidireccional, transcripción | Nube y EE. UU.; no agrupa duplicados |
| Carbyne | Traducción (hasta un 70 % más rápido) | Nube; producto de plataforma completa |
| Motorola Solutions (Interpreter Agent, compró Hyper) | Traducción | Integrado en su CAD, caro |
| Aurelian (14 M$) | Automatiza el 74 % de las llamadas no urgentes; copiloto Cora | Llamadas no urgentes |
| Surge Desk (proyecto en GitHub) | Fusiona duplicados entre idiomas y pregunta al supervisor si la confianza es menor del 70 % (26 llamadas → 6 emergencias, datos simulados) | Competidor directo de la idea |

**Nuestros diferenciadores (hay que enseñarlos en la demo):**
1. **Información nueva en duplicados**: una llamada duplicada no se descarta, se compara con lo ya sabido. Si trae algo nuevo ("hay un bebé dentro", "ya no contesta", "cables en el suelo") se marca y sube la prioridad.
2. **La ubicación del llamante no es la del incidente**: la hija que llama desde otro barrio por su madre de c/ Cuarteles se agrupa por la dirección que menciona, no por su posición AML.
3. **Zona gris visible**: el caso del segundo coche atrapado a 460 m del primero no se fusiona solo. El operador lo decide y así no se pierde a una persona.
4. **Respuesta traducida**: el operador responde en castellano con frases rápidas o texto libre y el sistema lo dice en el idioma del llamante.
5. **100 % local, España y marco del pliego**: castellano, AML, Ley de IA y venta a través de contratistas.

Advertencia de evidencia (para ser honestos en el pitch): en el ensayo de Corti (JAMA 2021) la IA reconocía paradas cardiacas mejor que las personas, pero **no mejoró el reconocimiento de los operadores** (93,1 % frente a 90,5 %, no significativo). Lección: la IA debe reducir carga y ordenar, no dar alertas que se ignoran. Nuestra métrica es "líneas liberadas" y "tiempo hasta la llamada crítica", no "precisión del modelo".

## 6. Alcance del MVP (lo que debe funcionar mañana)

1. **Escenario simulado** que se reproduce con controles (Iniciar, Pausar, velocidad ×1/×4/×10, Reiniciar): DANA en Málaga con 26 llamadas, 6 idiomas y 7 incidentes. Ya escrito en `data/scenario-dana-malaga.ts`.
2. **Procesamiento de cada llamada**: audio → transcripción (Whisper) → extracción estructurada (LLM local) → agrupación → prioridad.
3. **Consola del operador** con tres zonas: cola de llamadas, mapa de Málaga e incidente seleccionado (original | traducción, riesgos, llamadas, respuesta traducida).
4. **Decisiones del operador**: confirmar "Mismo incidente" o "Incidente distinto" en la zona gris, y "Separar" una llamada fusionada por error.
5. **Modo simulado sin GPU** (obligatorio, es el plan B si falla la wifi o la GPU): usa las extracciones `mock` del escenario. La agrupación y la prioridad **se calculan igual** con el algoritmo real; no están precalculadas.
6. **Modo IA local**: si `LLM_BASE_URL` y `STT_BASE_URL` están definidas, se usan Ollama/vLLM y Whisper de verdad.
7. **Evaluación**: `npm run eval` agrupa las 26 llamadas y compara con `gold`. Objetivo: 26 → 7 incidentes, 0 fusiones incorrectas y como mucho 2 preguntas al operador.
8. **Llamada en directo** (deseable): micrófono del navegador → Whisper → mismo flujo. Solo con IA local.

Fuera del MVP: integración real con CAD, autenticación, base de datos, despliegue en la nube, telefonía real.

## 7. Arquitectura

- **Stack**: Next.js 15 (App Router) + React 19 + TypeScript. Sin Tailwind: CSS propio con variables. Sin base de datos: el estado vive en el cliente y el servidor no guarda estado.
- **Sin dependencias de red en la demo**: nada de teselas de mapa ni fuentes de Google. El mapa es un SVG propio de la bahía de Málaga y la fuente se instala con npm (`@fontsource-variable/archivo`).

```
navegador (consola)                     servidor Next.js (sin estado)            GPU local
───────────────────                     ─────────────────────────────            ─────────
reloj del escenario ─ llamada ─────────▶ POST /api/process
cola SERIE (una a una)                    ├─ STT: audio/<id>.wav → Whisper ─────▶ speaches / faster-whisper
  envía {callId|transcript, aml,          │   (si no hay audio: transcript del guion)
         incidents snapshot}              ├─ extracción JSON (LLM) ─────────────▶ Ollama / vLLM (OpenAI-compatible)
                                          │   (modo simulado: mock del escenario)
                                          ├─ agrupación (lib/cluster.ts, determinista)
                                          └─ zona gris: el LLM opina (judge), pero decide el operador
◀──────────── {transcript, extraction, decision, engine, timings}
aplica: merge / new / ask (incidente provisional)
POST /api/translate  (frase del operador → idioma del llamante) ─────────────────▶ LLM
GET  /api/status     (qué motores están activos)
POST /api/transcribe (micrófono en directo)
```

Las llamadas se procesan **en serie** en el cliente para que cada una vea los incidentes creados por las anteriores.

### Variables de entorno (`.env.local`, plantilla en `.env.example`)

```
LLM_BASE_URL=http://localhost:11434/v1   # Ollama (vacío = modo simulado)
LLM_MODEL=qwen2.5:14b-instruct
LLM_API_KEY=local
STT_BASE_URL=http://localhost:8000/v1    # speaches / faster-whisper-server (vacío = guion)
STT_MODEL=Systran/faster-whisper-large-v3
```

Modelos según VRAM (Nick aún no ha dicho qué GPU tiene): 8 GB → `qwen2.5:7b-instruct` + `whisper small`; 12–16 GB → `qwen2.5:14b-instruct` + `large-v3-turbo`; 24 GB o más → `qwen2.5:32b-instruct` + `large-v3`. Todo configurable por variables de entorno.

## 8. Modelo de datos

Definido en `lib/types.ts` (ya escrito, no cambiar sin anotarlo en DECISIONES):
- `ScenarioCall`: id, t (s), lang, phone (enmascarado), aml {lat, lng, acc}, transcript, gold, mock (Extraction).
- `Extraction`: language, translation_es, summary_es, incident_type, location_text, keywords[], risks[], people_at_risk, severity 1–5.
- `IncidentSnapshot`: id, type, points[], keywords[], risks[], summary, provisional?
- `Decision`: action merge|ask|new, incidentId, score, candidates[], reason (castellano), judge?

Vocabularios cerrados: `RISK_TAGS` e `INCIDENT_TYPES` (en `types.ts`). El LLM solo puede devolver valores de esos vocabularios; todo lo demás se filtra.

Etiquetas en castellano para la interfaz:
- Riesgos: vida "Riesgo vital", atrapados "Personas atrapadas", menor "Menor implicado", mayor "Persona mayor", movilidad_reducida "Movilidad reducida", agua_subiendo "Agua subiendo", sin_respuesta "No responde", inconsciente "Inconsciente", herido "Heridos", dolor_pecho "Dolor torácico", sin_luz "Sin suministro eléctrico", trafico "Riesgo de tráfico", via_bloqueada "Vía cortada", vehiculo_danado "Vehículo dañado", cables_electricos "Cables eléctricos en el suelo".
- Tipos: inundacion_vehiculo "Vehículo atrapado por agua", inundacion_vivienda "Vivienda inundada", garaje_inundado "Garaje inundado", arbol_caido "Árbol caído", semaforos "Semáforos apagados", medica "Emergencia médica", incendio "Incendio", accidente "Accidente de tráfico", otro "Otro".

## 9. Algoritmo de agrupación (especificación, `lib/cluster.ts`)

Puro, determinista y probado con tests. Para una llamada nueva c y cada incidente abierto I:

1. **Tipo** `s_t`: 1 si coincide el tipo; 0,4 si ambos son de la familia inundación (`inundacion_vehiculo`, `inundacion_vivienda`, `garaje_inundado`); 0 en otro caso. **Si `s_t = 0`, la puntuación es 0** (unos semáforos nunca se fusionan con una vivienda inundada aunque estén a 500 m).
2. **Espacio** `s_d`: d = distancia mínima (haversine) entre c.aml y los puntos de I; d_ef = max(0, d − acc/2); `geo = max(0, 1 − d_ef/800)`. Además, `loc` = solapamiento de tokens entre `location_text` de c y los de I × 0,9. `s_d = max(geo, loc)`. Así se cubre a quien llama desde lejos dando la dirección.
3. **Texto** `s_x`: coeficiente de solapamiento |A∩B| / min(|A|,|B|) entre tokens de `keywords` (minúsculas, sin tildes, sin signos, sin palabras vacías como de, del, la, el, en, calle, avenida, y raíz de 6 letras).
4. `score = 0,45·s_d + 0,30·s_t + 0,25·s_x`.
5. Decisión con el mejor candidato: `score ≥ 0,78` → **merge** (automático y reversible con "Separar"); `0,45 ≤ score < 0,78` → **ask** (se crea un incidente *provisional* enlazado al candidato, en ámbar, y el operador decide; con IA local el LLM añade su opinión `judge` y su motivo, pero no decide); `< 0,45` → **new**.
6. **Información nueva**: al fusionar, los riesgos de la llamada que no estaban en el incidente y pertenecen a {menor, sin_respuesta, inconsciente, herido, cables_electricos, atrapados, dolor_pecho} generan un aviso "Información nueva" y suben la gravedad en 1 (máximo 5).
7. `reason` siempre en castellano y concreto: "A 120 m de INC-01, mismo tipo, coinciden: coche, paso inferior, Campanillas".

Casos que la evaluación debe cumplir (comprobados a mano con la especificación):
- A2–A6 → se fusionan con A (A5 tiene AML de ±300 m).
- **F1 → ask** frente a A (≈0,62): coche distinto a 460 m. El operador elige "Incidente distinto". F2 se fusiona con el F provisional.
- **B2 → ask** frente a B (AML a 1,6 km, pero misma dirección "Cuarteles 14"). El operador elige "Mismo incidente".
- D nunca se fusiona con B (tipo distinto) aunque esté a ~550 m.
- A4 → aviso "Menor implicado"; C3 → "Cables eléctricos en el suelo"; B3 → "No responde"; G3 → "No responde" y "Personas atrapadas".
- E1 (árabe, infarto, una sola llamada) → incidente nuevo y **primero de la cola de prioridad** o entre los dos primeros.

Si al implementarlo los números reales difieren, ajustar pesos o umbrales **solo** si se siguen cumpliendo todos los casos, y anotarlo en DECISIONES.

## 10. Prioridad de incidentes

`prioridad = gravedad·20 + min(personas,5)·4 + (vida ? 10) + (sin_respuesta|inconsciente ? 10) + (info nueva en los últimos 60 s ? 8) + min(nº llamadas,10) + minutos sin atender`. La cola de la derecha se ordena por prioridad y explica en una línea por qué está ahí.

## 11. Prompts del LLM (`lib/prompts.ts`)

- **Extracción**: sistema "Eres el copiloto de un operador del 112 en España…"; devuelve SOLO JSON con las claves de `Extraction`; `translation_es` es null si el idioma es `es`; `risks` e `incident_type` solo del vocabulario; nunca inventa datos que no están en la llamada. Usar `temperature: 0` y `response_format: {type: "json_object"}`; parseo robusto (quitar ```json, un reintento) y saneado (vocabularios, gravedad 1–5).
- **Juez de zona gris**: recibe el resumen del incidente, el resumen de la llamada y la distancia, y devuelve `{same, confidence, reason}` en castellano. Es solo una opinión.
- **Traducción**: texto del operador → idioma del llamante, registro claro e imperativo de emergencia, sin añadir nada.

Frases rápidas pretraducidas (funcionan también en modo simulado):

| es | en | de | fr | ar | it |
|---|---|---|---|---|---|
| Mantenga la calma, la ayuda está en camino. | Stay calm, help is on the way. | Bleiben Sie ruhig, Hilfe ist unterwegs. | Restez calme, les secours arrivent. | حافظ على هدوئك، المساعدة في الطريق. | Mantenga la calma, i soccorsi stanno arrivando. |
| ¿Hay alguien herido? | Is anyone injured? | Ist jemand verletzt? | Y a-t-il des blessés ? | هل هناك أي مصاب؟ | C'è qualcuno ferito? |
| ¿Me puede decir la dirección exacta? | Can you tell me the exact address? | Können Sie mir die genaue Adresse sagen? | Pouvez-vous me donner l'adresse exacte ? | هل يمكنك أن تخبرني بالعنوان الدقيق؟ | Può dirmi l'indirizzo esatto? |
| No baje al garaje ni entre en el agua. Suba a una planta alta. | Do not go down to the garage or into the water. Go to a higher floor. | Gehen Sie nicht in die Garage und nicht ins Wasser. Gehen Sie in ein höheres Stockwerk. | Ne descendez pas au garage et n'entrez pas dans l'eau. Montez à un étage supérieur. | لا تنزل إلى المرآب ولا تدخل الماء. اصعد إلى طابق أعلى. | Non scenda in garage e non entri nell'acqua. Salga a un piano più alto. |
| ¿La persona respira? ¿Está consciente? | Is the person breathing? Are they conscious? | Atmet die Person? Ist sie bei Bewusstsein? | La personne respire-t-elle ? Est-elle consciente ? | هل الشخص يتنفس؟ هل هو واعٍ؟ | La persona respira? È cosciente? |
| Aléjese de los cables del suelo. | Keep away from the cables on the ground. | Halten Sie Abstand zu den Kabeln am Boden. | Éloignez-vous des câbles au sol. | ابتعد عن الأسلاك الموجودة على الأرض. | Si allontani dai cavi a terra. |

En modo simulado el texto libre se desactiva con el aviso "La traducción libre necesita el modelo local". La voz se reproduce con `window.speechSynthesis` usando el idioma del llamante.

## 12. Diseño de la consola

- **Concepto**: consola de sala de alta legibilidad, en claro, inspirada en la señalética de emergencias y el chaleco reflectante. Nada de "dashboard oscuro con neón".
- **Paleta**: papel frío `#E9EDF0` (fondo), tinta `#15222E` (texto y bordes fuertes), ámbar `#F2A900` (**solo** para decisiones pendientes del operador), rojo vital `#C61F2B` (gravedad 5 o riesgo vital), azul agua `#2B6CB0` (mar, ríos, inundación), gris de rejilla `#C3CCD4`. El blanco `#FFFFFF` solo para superficies de lectura (transcripciones).
- **Tipografía**: una familia, Archivo variable (eje de anchura): estrecha (wdth 75–85) para la cola densa y los datos, normal para las transcripciones. Escala 13/15/18/24 px. Nada de mayúsculas en etiquetas.
- **Layout** (escritorio; en móvil se apilan):

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Copiloto 112   DANA en Málaga   T+02:41  [Pausar][×1 ×4 ×10][Reiniciar]  │
│ 17 llamadas → 6 incidentes · 11 líneas liberadas · 1 decisión pendiente  │  ← motor: Simulado / IA local
├───────────────┬──────────────────────────────────┬───────────────────────┤
│ Llamadas      │                                  │ Prioridad             │
│ 02:38 de A3 … │   MAPA SVG bahía de Málaga       │ 1 INC-04 Infarto (ar) │
│ 02:31 en A2 … │   anillos = incidentes           │ 2 INC-01 Coche + bebé │
│ 02:20 es F1 ⚠ │   puntos = llamadas → su anillo  │ ───────────────────── │
│ …             │   ámbar discontinuo = decidir    │ INC-01 detalle        │
│               │ [banner ámbar: ¿Mismo incidente?]│ original | traducción │
│               │                                  │ riesgos, llamadas     │
│               │                                  │ responder [frases]    │
└───────────────┴──────────────────────────────────┴───────────────────────┘
```

- **El momento memorable**: cuando una llamada se fusiona, su punto viaja hasta el anillo del incidente y el anillo crece. Es la única animación automática (y se respeta `prefers-reduced-motion`).
- Mapa: proyección equirectangular de lon −4,60…−4,24 y lat 36,59…36,77, viewBox 1000×623. Costa aproximada (oeste a este): Benalmádena (−4,53, 36,59), Torremolinos (−4,495, 36,615), Los Álamos (−4,475, 36,635), desembocadura del Guadalhorce (−4,445, 36,665), Huelin (−4,435, 36,698), puerto (−4,418, 36,71), Malagueta (−4,408, 36,718), P.º Marítimo (−4,395, 36,719), El Palo (−4,365, 36,718), La Cala (−4,31, 36,716), Rincón (−4,28, 36,715), (−4,24, 36,725). Guadalhorce: (−4,60, 36,70) → (−4,53, 36,695) → (−4,49, 36,685) → desembocadura. Río Campanillas: (−4,56, 36,75) → (−4,535, 36,70). Guadalmedina: (−4,43, 36,77) → (−4,423, 36,712). Etiquetas: Málaga centro, Campanillas, Torremolinos, Aeropuerto (−4,49, 36,675), Rincón de la Victoria, El Palo.
- Accesibilidad: foco visible, contraste AA, gravedad comunicada con texto además de color, y atajos de teclado M (mismo) y D (distinto) en el banner de decisión.
- Textos: castellano, tono de sala, verbos claros. Botones: "Mismo incidente", "Incidente distinto", "Separar llamada", "Reproducir al llamante". Siempre se ve qué motor está activo: "Modo simulado" o "IA local: qwen2.5:14b".

## 13. Audio simulado

`scripts/generate_audio.py` (se ejecuta en el ordenador de Nick, que tiene red y GPU) genera `public/audio/<id>.wav` desde los `transcript` del escenario con Piper TTS (voces es/en/de/fr/it/ar; si falta una voz, se usa edge-tts como alternativa). Después aplica un filtro de teléfono con ffmpeg (paso banda 300–3400 Hz, 8 kHz mono) y mezcla lluvia o ruido marrón a −25 dB. Si no hay audio para una llamada, el servidor usa el guion y la interfaz lo indica ("transcripción del guion").

## 14. Guion de la demo (3 min)

1. (20 s) El problema: datos de la DANA y del apagón, 4 llamadas por incidente y llamadas perdidas.
2. (90 s) Reproducir el escenario a ×4. Enseñar que el contador baja de llamadas a incidentes; el bebé de A4 (información nueva) sube la prioridad; F1 en ámbar, el operador pulsa "Incidente distinto" ("aquí había una segunda persona"); B2, la hija que llama desde lejos, se agrupa por la dirección; E1 en árabe pasa a ser el primero de la cola y respondemos "¿La persona respira?" en árabe con voz.
3. (40 s) Por qué nosotros: local, castellano, Ley de IA (humano en el bucle y explicable), y venta a contratistas que se presentan a concursos que puntúan aplicaciones.
4. (30 s) Modelo de negocio y siguientes pasos: piloto con un contratista, licencia por puesto de operador y evaluación con llamadas reales anonimizadas.

## 15. Estado al empezar la noche

- Hecho: investigación, especificación (este archivo), `lib/types.ts` y `data/scenario-dana-malaga.ts` (26 llamadas con extracciones mock y gold).
- Pendiente: todo lo de `docs/TASKS.md`.
