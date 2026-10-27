#!/usr/bin/env bash
# Ejecuta el orquestador en bucle toda la noche, con una sesión limpia por iteración.
# Uso:  bash scripts/noche.sh            (40 iteraciones como máximo)
#       ITER=80 MODELO=opus bash scripts/noche.sh
# Para pararlo de forma limpia: crea un archivo STOP en la raíz (touch STOP).
set -u
cd "$(dirname "$0")/.." || exit 1
ITER=${ITER:-40}
MODELO=${MODELO:-}
mkdir -p logs
LOG="logs/noche-$(date +%Y%m%d-%H%M).log"
export COPILOTO_NOCHE=1
PROMPT='Eres el orquestador definido en CLAUDE.md. Trabajas sin humano delante. Lee docs/MEMORIA.md, docs/TASKS.md y el final de docs/PROGRESO.md, y ejecuta la skill siguiente-tarea en bucle: delega en los subagentes, verifica con qa-verificador y cierra cada tarea con commit. No hagas preguntas: decide, anota en docs/DECISIONES.md y sigue. Si una tarea falla 3 veces usa la skill desbloquear. Cuando el contexto esté muy lleno, cierra la tarea actual y termina.'
fallos=0
for i in $(seq 1 "$ITER"); do
  [ -f STOP ] && { echo "STOP encontrado, salgo." | tee -a "$LOG"; break; }
  if grep -q "TABLERO COMPLETO" docs/PROGRESO.md 2>/dev/null; then
    echo "Tablero completo. Fin." | tee -a "$LOG"; break
  fi
  echo "===== Iteración $i · $(date '+%F %T') =====" | tee -a "$LOG"
  args=(-p "$PROMPT" --dangerously-skip-permissions --output-format text)
  [ -n "$MODELO" ] && args+=(--model "$MODELO")
  if claude "${args[@]}" >>"$LOG" 2>&1; then
    fallos=0
  else
    fallos=$((fallos+1))
    echo "La sesión terminó con error ($fallos seguidos)." | tee -a "$LOG"
    # Probablemente límite de uso: espera y reintenta.
    [ "$fallos" -ge 3 ] && { echo "Espero 15 min…" | tee -a "$LOG"; sleep 900; fallos=0; }
  fi
  git log --oneline -1 | tee -a "$LOG"
  sleep 5
done
echo "Fin del bucle nocturno $(date '+%F %T'). Resumen:" | tee -a "$LOG"
grep -cE '^- \[x\] T' docs/TASKS.md | xargs echo "Tareas hechas:" | tee -a "$LOG"
