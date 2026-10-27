---
name: cerrar-tarea
description: Cierra una tarea verificada del tablero; la marca [x], registra el progreso en docs/PROGRESO.md y hace un commit. Úsala solo después de un veredicto APTO.
argument-hint: "[id de tarea, p. ej. T07]"
---
Cierra la tarea $ARGUMENTS:

1. Comprueba que la última verificación fue APTO y que `npm run build` pasa. Si no, no cierres: vuelve a `/siguiente-tarea` paso 4.
2. En `docs/TASKS.md` cambia `[~]` por `[x]` en esa tarea.
3. Añade al final de `docs/PROGRESO.md`:
   ```
   ## <fecha y hora ISO> · $ARGUMENTS · hecha
   - Qué se hizo: (2–4 líneas)
   - Verificación: (comandos y resultado; capturas si hay)
   - Decisiones: (o "ninguna"; si hay, también en docs/DECISIONES.md)
   - Siguiente: (id de la siguiente tarea disponible)
   ```
4. `git add -A` (sin `.env*` ni `public/audio/*.wav`) y `git commit -m "$ARGUMENTS: <título corto>"`. No hagas push.
