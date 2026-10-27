#!/usr/bin/env bash
# Inyecta en el contexto el estado del tablero al empezar cada sesión.
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
T=docs/TASKS.md
[ -f "$T" ] || exit 0
hechas=$(grep -cE '^- \[x\] T' "$T")
total=$(grep -cE '^- \[.\] T' "$T")
echo "Estado del tablero: $hechas/$total tareas hechas."
echo "En curso:";    grep -E '^- \[~\]' "$T" | head -3
echo "Bloqueadas:";  grep -E '^- \[!\]' "$T" | head -5
echo "Siguientes pendientes:"; grep -E '^- \[ \]' "$T" | head -3
echo "Recuerda: lee docs/MEMORIA.md y sigue la skill siguiente-tarea."
exit 0
