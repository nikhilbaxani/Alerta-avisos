---
name: siguiente-tarea
description: Elige la siguiente tarea disponible de docs/TASKS.md y la lleva de principio a fin (delegar al subagente, verificar, cerrar). Úsala siempre que haya que continuar el trabajo del MVP.
---
Ejecuta exactamente este flujo. No te saltes pasos.

1. **Situación**: lee `docs/TASKS.md`, las últimas 40 líneas de `docs/PROGRESO.md` y `git status`.
   - Si hay una tarea `[~]` (de una sesión anterior), retómala: revisa su diff y continúa desde el paso 3 o 4.
2. **Elegir**: la primera tarea `[ ]` cuyas dependencias (`deps:`) estén todas `[x]`. Si ninguna está disponible:
   - si T22 está `[x]`, pasa a las mejoras X01–X03;
   - si todo lo que queda depende de tareas `[!]`, usa `/desbloquear` sobre la tarea bloqueada más importante;
   - si no hay nada más que hacer, escribe "TABLERO COMPLETO" en `docs/PROGRESO.md` y termina.
   Marca la tarea elegida `[~]` en el tablero.
3. **Delegar**: lanza el subagente indicado (`agente:`) con un encargo autosuficiente que incluya:
   - id y título de la tarea, y sus criterios de aceptación copiados literalmente;
   - qué secciones de `docs/MEMORIA.md` aplican y qué archivos debe crear o tocar;
   - "Al terminar, ejecuta la verificación y devuelve: archivos tocados, comandos y resultado, y pendientes."
   Si la tarea es pequeña (menos de unas 30 líneas), puedes hacerla tú directamente.
4. **Verificar**: lanza `qa-verificador` con el id de la tarea. Si el veredicto es NO APTO, vuelve a delegar al mismo agente con la lista de fallos literal. Cuenta los intentos: al tercer NO APTO, usa `/desbloquear`.
5. **Cerrar**: usa `/cerrar-tarea` con el id.
6. Vuelve al paso 1 con la siguiente tarea mientras te quede contexto. Si notas que el contexto está muy lleno, termina tras cerrar la tarea actual: el script nocturno abrirá una sesión nueva.
