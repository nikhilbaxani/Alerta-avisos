---
name: mejorar-proceso
description: Retrospectiva que mejora el propio sistema de trabajo; revisa qué ha fallado en las últimas tareas y edita las skills, los subagentes, CLAUDE.md o el tablero para que no se repita. Úsala cada 4 tareas cerradas, tras cualquier bloqueo, o cuando un agente repite el mismo error.
---
Eres el responsable de que el equipo trabaje cada vez mejor. Sigue estos pasos:

1. **Datos**: lee las últimas 80 líneas de `docs/PROGRESO.md`, `docs/BUZON.md`, las tareas `[!]` y `git log --oneline -20`. Busca patrones:
   - verificaciones NO APTO repetidas por la misma causa;
   - encargos a subagentes a los que les faltaba contexto;
   - pasos de una skill que se saltan o que no sirven;
   - tareas demasiado grandes (más de 3 intentos o más de unos 400 líneas de diff).
2. **Cambios** (como mucho 3 por retrospectiva, pequeños y concretos):
   - Editar una skill en `.claude/skills/*/SKILL.md` o un agente en `.claude/agents/*.md`: añadir el paso o la advertencia que habría evitado el fallo.
   - Partir una tarea grande del tablero en `Txx.a`, `Txx.b`… con criterios propios.
   - Añadir una regla a `CLAUDE.md` solo si afecta a todos los agentes.
   - Puedes crear una skill nueva si un procedimiento se ha repetido 2 veces o más (p. ej. "captura-playwright").
3. **Límites** (no se pueden cambiar nunca, ni por esta skill):
   - las reglas de oro de `CLAUDE.md` (modo simulado sin red, la IA propone y el operador decide, `gold` intacto, sin push, sin datos inventados);
   - los criterios de aceptación de T05 (objetivos del eval) y de T22;
   - esta sección de límites.
   No borres skills ni agentes: modifícalos.
4. **Registro**: en `docs/DECISIONES.md` añade `## <fecha> · Retro: <título>` con el problema observado (con pruebas), el cambio hecho (archivo) y el resultado esperado. Haz commit: `proceso: <resumen>`.
5. Vuelve a `/siguiente-tarea`.
