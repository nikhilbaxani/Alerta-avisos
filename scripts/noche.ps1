# Versión para Windows PowerShell del bucle nocturno (sin WSL).
# Uso:  powershell -ExecutionPolicy Bypass -File scripts\noche.ps1
# Parar: crea un archivo STOP en la raíz del repo.
# Nota: los hooks .sh necesitan bash (Git Bash). Si no lo tienes, funcionan igual las skills y el bucle.
param([int]$Iter = 40, [string]$Modelo = "")
Set-Location (Join-Path $PSScriptRoot "..")
New-Item -ItemType Directory -Force -Path logs | Out-Null
$log = "logs\noche-$(Get-Date -Format yyyyMMdd-HHmm).log"
$env:COPILOTO_NOCHE = "1"
$prompt = 'Eres el orquestador definido en CLAUDE.md. Trabajas sin humano delante. Lee docs/MEMORIA.md, docs/TASKS.md y el final de docs/PROGRESO.md, y ejecuta la skill siguiente-tarea en bucle: delega en los subagentes, verifica con qa-verificador y cierra cada tarea con commit. No hagas preguntas: decide, anota en docs/DECISIONES.md y sigue. Si una tarea falla 3 veces usa la skill desbloquear. Cuando el contexto esté muy lleno, cierra la tarea actual y termina.'
$fallos = 0
for ($i = 1; $i -le $Iter; $i++) {
  if (Test-Path STOP) { "STOP encontrado." | Tee-Object -Append $log; break }
  if (Select-String -Quiet -Path docs\PROGRESO.md -Pattern "TABLERO COMPLETO") { "Tablero completo." | Tee-Object -Append $log; break }
  "===== Iteración $i · $(Get-Date) =====" | Tee-Object -Append $log
  $a = @("-p", $prompt, "--dangerously-skip-permissions", "--output-format", "text")
  if ($Modelo) { $a += @("--model", $Modelo) }
  claude @a *>> $log
  if ($LASTEXITCODE -ne 0) { $fallos++; if ($fallos -ge 3) { "Espero 15 min..." | Tee-Object -Append $log; Start-Sleep 900; $fallos = 0 } } else { $fallos = 0 }
  git log --oneline -1 | Tee-Object -Append $log
  Start-Sleep 5
}
