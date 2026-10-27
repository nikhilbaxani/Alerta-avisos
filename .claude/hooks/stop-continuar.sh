#!/usr/bin/env bash
# Hook Stop: si quedan tareas y no se ha pedido parar, devuelve a Claude al trabajo.
# Límite de seguridad: como mucho MAX_CONT continuaciones por sesión, para evitar bucles.
# Solo actúa en modo nocturno (variable COPILOTO_NOCHE=1, la pone scripts/noche.sh).
[ "${COPILOTO_NOCHE:-0}" = "1" ] || exit 0
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
input=$(cat)
sid=$(printf '%s' "$input" | sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
[ -f STOP ] && exit 0
grep -q "TABLERO COMPLETO" docs/PROGRESO.md 2>/dev/null && exit 0
grep -qE '^- \[( |~)\] (T|X)' docs/TASKS.md 2>/dev/null || exit 0
MAX_CONT=${MAX_CONT:-6}
mkdir -p .claude/.estado
f=".claude/.estado/stop-${sid:-sin-id}"
n=$(cat "$f" 2>/dev/null || echo 0)
[ "$n" -ge "$MAX_CONT" ] && exit 0
echo $((n+1)) > "$f"
echo "Quedan tareas en docs/TASKS.md. Si el contexto está muy lleno, cierra la tarea actual y termina; si no, continúa con la skill siguiente-tarea." >&2
exit 2
