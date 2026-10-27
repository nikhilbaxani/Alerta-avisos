---
name: desbloquear
description: Protocolo cuando una tarea del tablero falla tres veces o depende de algo que no hay en el entorno (GPU, Docker, red). Evita bucles y deja instrucciones para Nick.
argument-hint: "[id de tarea]"
---
Para la tarea $ARGUMENTS:

1. Diagnóstico de 5 minutos como máximo: ¿el fallo es de código, del entorno (no hay GPU, Docker, red, permisos) o de la especificación (los criterios se contradicen)?
2. Según el tipo:
   - **Código**: un último intento con un enfoque distinto y más simple (menos alcance, misma regla de oro). Si falla, sigue al paso 3.
   - **Entorno**: deja todo preparado (scripts, configuración, instrucciones) para que funcione en cuanto exista lo que falta, y verifica al menos que el modo simulado no se rompe.
   - **Especificación**: elige la interpretación que mejor sirve a la demo, anótala en `docs/DECISIONES.md` y reintenta una vez.
3. Si sigue sin resolverse: marca `[!]` en `docs/TASKS.md` y añade en `docs/PROGRESO.md`:
   ```
   ## <fecha y hora ISO> · $ARGUMENTS · BLOQUEADA
   - Síntoma: (error literal resumido)
   - Probado: (lista)
   - Qué necesita Nick: (pasos exactos, p. ej. "instalar Docker Desktop con soporte GPU y ejecutar …")
   ```
   Si hay cambios a medias que rompen el build, revierte con `git checkout -- .` o haz commit en una rama `wip/$ARGUMENTS`; nunca dejes `main` rota.
4. Vuelve a `/siguiente-tarea`: elige otra tarea que no dependa de esta.
