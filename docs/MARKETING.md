# Marketing: logo, eslogan y estrategia de comunicación

> Entregable 3 del hackathon. Cifras: solo las de `docs/MEMORIA.md` §3, con su fuente. Nombre pendiente de decidir en equipo (ver PR #1): hay versión «Copiloto 112» y «Agente 112» del logo; el símbolo, la paleta y la estrategia sirven para las dos.

## 1. Logo

![Logo Copiloto 112](marca/logo-copiloto-112.svg)

| Archivo | Uso |
|---|---|
| [`marca/simbolo.svg`](marca/simbolo.svg) | Icono solo: favicon, avatar de redes, esquina de diapositivas |
| [`marca/logo-copiloto-112.svg`](marca/logo-copiloto-112.svg) | Logo principal sobre fondo claro |
| [`marca/logo-agente-112.svg`](marca/logo-agente-112.svg) | Variante si el equipo adopta el nombre «Agente 112» |
| [`marca/logo-oscuro.svg`](marca/logo-oscuro.svg) | Sobre fondo oscuro (vídeo, pantalla del escenario) |

**Qué cuenta el símbolo** (es el producto en una imagen):
- **Tres puntos que convergen**: varias llamadas sobre lo mismo.
- **Un solo anillo**: se agrupan en un incidente. Es el «momento memorable» de la consola (MEMORIA §12).
- **Arco ámbar**: el tramo que decide el operador. En la consola el ámbar solo significa «decisión humana pendiente»; en el logo, igual.
- **Centro rojo**: la persona en peligro, que es lo que importa.

**Paleta** (la misma de la consola, MEMORIA §12): tinta `#15222E`, papel `#E9EDF0`, ámbar `#F2A900` (solo decisión humana), rojo vital `#C61F2B`, azul agua `#2B6CB0`.

**Tipografía**: Archivo (la de la consola). Los SVG la usan si está instalada y si no caen en Arial Narrow o Arial; para imprimir o subir al Drive, exportar a PNG desde un equipo con Archivo instalada.

**Reglas**: no usar el ámbar para decorar; no poner el logo sobre fotos de víctimas ni de la DANA; tamaño mínimo del símbolo 24 px.

## 2. Eslogan

**Principal: «La IA propone. El operador decide.»**
Ya está en la presentación, resume el diseño (humano en el bucle) y responde a la primera duda del jurado y del cliente: «¿y si la IA se equivoca?».

Alternativas por público:

| Eslogan | Para quién | Por qué |
|---|---|---|
| «Seis llamadas, un incidente.» | Jurado, prensa | Explica el producto en cuatro palabras (ejemplo del coche atrapado) |
| «Cuando todos llaman, que nadie se pierda.» | Ciudadanía | Habla del miedo real: no ser atendido en una catástrofe |
| «Libera líneas cuando más faltan.» | Contratistas, jefes de sala | Su problema: líneas saturadas e indicadores del pliego |
| «Coordina, actúa y escala. Decide el operador.» | Si se adopta «Agente 112» | Encaja con el reto: un agente que actúa con control humano |

No usar eslóganes que prometan resultados no medidos («salva vidas», «X % más rápido»): la evidencia honesta (Corti, JAMA 2021) es uno de nuestros puntos fuertes.

## 3. Estrategia de comunicación

### Posicionamiento (una frase)
Para los **contratistas que operan las salas del 112**, que en una catástrofe se quedan sin líneas, Copiloto 112 es **la IA local que agrupa las llamadas duplicadas, detecta lo nuevo y traduce**, y a diferencia de las soluciones de nube estadounidenses **funciona en la sala, en castellano y con el operador al mando**.

### Públicos y mensajes

| Público | Papel | Mensaje clave | Prueba que lo sostiene |
|---|---|---|---|
| **Contratistas que concursan** (p. ej. Ilunion, plataformas Hexagon / Telefónica) | Pagan | «Una aplicación puntuable en el pliego que os ayuda a cumplir indicadores en los picos» | Pliego CONTR 2026/109830: puntúa aplicaciones software y penaliza respuestas de más de 5 s |
| **Operadores y jefes de sala** | Usan | «Menos llamadas repetidas, tú decides en la duda» | Demo: 26 llamadas → 7 incidentes, zona ámbar, «Separar» |
| **Administración (112 autonómicos, Junta)** | Licitan y regulan | «Local, explicable y preparado para la Ley de IA» | Registro exportable; alto riesgo con obligaciones desde dic-2027 |
| **Ciudadanía extranjera y asociaciones** | Se benefician | «Te respondemos en tu idioma» | 43.845 llamadas en idioma extranjero al 112 de Andalucía (2024); 362.822 residentes extranjeros en la provincia de Málaga (INE) |
| **Jurado y prensa** | Amplifican | «El cuello de botella no son los recursos, son las líneas» | DANA: 19.821 llamadas para 4.770 incidentes; apagón: más de 10.000 llamadas perdidas en Cataluña |

### Canales

| Canal | Contenido | Público |
|---|---|---|
| **Demo en vivo y GitHub Pages** | Consola en modo simulado, enlace público sin instalar nada | Jurado, contratistas, operadores |
| **Vídeo de 20–30 s** (`brag.mp4`) | El momento de las llamadas que se agrupan | Redes, pitch |
| **LinkedIn** | Hilo del problema con fuentes + vídeo + enlace a la demo | Contratistas, sector emergencias, administración |
| **Contacto directo** | Correo de una página y demo de 15 min | Contratistas que se presentan al pliego |
| **Universidad (UMA) y ecosistema emprendedor** | Nota de prensa del hackathon | Prensa local, posibles mentores |
| **Asociaciones de residentes extranjeros** | Mensaje del idioma | Ciudadanía (validar la necesidad, no vender) |

### Calendario

| Fase | Cuándo | Objetivo | Acciones |
|---|---|---|---|
| 1. Hackathon | Ahora | Ganar visibilidad y validar | Pitch, demo pública, vídeo, publicación en LinkedIn del equipo |
| 2. Después del evento | Primeras semanas | Conseguir conversaciones | Contactar con contratistas del pliego andaluz; demo de 15 min |
| 3. Piloto | Siguientes meses | Prueba real | Evaluación con llamadas reales anonimizadas; caso de estudio |

### Cómo sabremos si funciona
Sin cifras objetivo inventadas; contaremos:
- visitas a la demo pública y reproducciones del vídeo;
- contratistas contactados y demos hechas;
- pilotos o cartas de interés firmadas.

### Tono y límites éticos
- Tono de sala: claro, sereno, verbos concretos. Nada de alarmismo.
- **No usar imágenes ni testimonios de víctimas reales** de la DANA ni del apagón para vender.
- Las cifras, siempre con fuente (MEMORIA §3). La simulación de sala se presenta como ilustrativa, no como dato medido.
- Nunca decir que la IA decide: decide el operador.
