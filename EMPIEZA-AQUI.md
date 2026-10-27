# Empieza aquí: dejar el Copiloto 112 construyéndose toda la noche

## Qué hay en este paquete
| Archivo | Para qué |
|---|---|
| `CLAUDE.md` | El orquestador: Claude Code lo lee solo al abrir el repo. Bucle de trabajo, reglas de oro y cuándo mejorar el proceso. |
| `docs/MEMORIA.md` | Todo el proyecto: problema y datos con fuente, el 112 en España, competencia, especificación del algoritmo, diseño y guion de la demo. |
| `docs/TASKS.md` | Tablero con 22 tareas ordenadas por dependencias hasta el MVP, más 3 mejoras opcionales. |
| `docs/PROGRESO.md`, `DECISIONES.md`, `BUZON.md` | Diario de la noche, decisiones tomadas y canal entre agentes. |
| `.claude/agents/` | 5 subagentes: `backend-ia`, `frontend-consola`, `datos-escenario`, `qa-verificador`, `pitch-docs`. |
| `.claude/skills/` | `siguiente-tarea`, `cerrar-tarea`, `verificar-mvp`, `desbloquear`, `mejorar-proceso`, `estado`. |
| `.claude/settings.json` + `.claude/hooks/` | Permisos, reglas de seguridad, contexto al iniciar y el hook que impide que se pare mientras queden tareas. |
| `scripts/noche.sh` / `noche.ps1` | El bucle nocturno: una sesión limpia por iteración, con permisos totales. |
| `lib/types.ts`, `data/scenario-dana-malaga.ts` | Código de partida ya probado: tipos y las 26 llamadas simuladas. |

## 1. Requisitos (una vez)
- Node.js 20 o superior y Git.
- Claude Code instalado y con sesión iniciada (`claude` en la terminal).
- Para los scripts `.sh` en Windows: Git Bash o WSL. Si no, usa `noche.ps1`.
- Opcional, para la IA real: Docker con soporte de GPU (tareas T15–T18). Sin esto, el MVP se construye igual en modo simulado.

## 2. Meter el paquete en tu repo
```bash
git clone git@github.com:nikhilbaxani/Alerta-avisos.git
cd Alerta-avisos
unzip -o ~/Downloads/alerta-avisos-kit.zip -d .     # ajusta la ruta del zip
git add -A && git commit -m "Kit del orquestador y especificación"
```

## 3. Dime tu GPU (opcional pero útil)
Abre `docs/MEMORIA.md` §7 y escribe tu modelo de GPU y su VRAM en la línea "Nick aún no ha dicho qué GPU tiene". Los agentes elegirán los modelos según eso.

## 4. Prueba de 5 minutos antes de irte a dormir
```bash
claude --dangerously-skip-permissions
```
La primera vez te pedirá aceptar el modo de permisos totales: acéptalo. Dentro, escribe `/siguiente-tarea` y comprueba que empieza T01 (crear el proyecto Next.js). Cuando veas que avanza, sal con `/exit`. No pasa nada si lo cortas a medias: la siguiente sesión lo retoma.

## 5. Lanzar la noche
macOS o Linux (evita que el equipo se duerma):
```bash
caffeinate -i bash scripts/noche.sh          # macOS
systemd-inhibit bash scripts/noche.sh        # Linux
```
Windows: pon "Suspender: nunca" en Energía y luego, en PowerShell:
```powershell
powershell -ExecutionPolicy Bypass -File scripts\noche.ps1
```
Opciones: `ITER=80 bash scripts/noche.sh` para más iteraciones y `MODELO=opus` para fijar el modelo.
Para pararlo de forma limpia: crea un archivo `STOP` en la raíz del repo.

## 6. Por la mañana
```bash
claude        # y escribe /estado
npm run dev   # abre http://localhost:3000
```
- Lo que ha pasado: `docs/PROGRESO.md` y `logs/noche-*.log`.
- Lo que necesita algo de ti (GPU, Docker): las tareas `[!]` de `docs/TASKS.md`, con los pasos exactos en PROGRESO.
- Cuando te guste el resultado: `git push`. Los agentes tienen el push prohibido a propósito.

## Cómo funciona por dentro
1. Cada iteración del script abre una sesión nueva de Claude Code con permisos totales. `CLAUDE.md` y el hook de inicio le dan el estado del tablero.
2. El orquestador elige la siguiente tarea disponible, se la encarga al subagente correspondiente con todo el contexto, la verifica con `qa-verificador` (tests, eval y capturas que mira de verdad) y la cierra con un commit.
3. Los agentes se consultan entre sí cuando lo necesitan (por ejemplo, frontend le pide un campo a backend) y dejan avisos en `docs/BUZON.md` para tareas futuras.
4. Cada 4 tareas, o tras un bloqueo, `/mejorar-proceso` revisa lo que falló y **edita las propias skills y agentes** para no repetir el error. Lo deja anotado en DECISIONES.
5. Si una tarea falla 3 veces, se marca bloqueada con instrucciones para ti y se sigue con otra. Si el contexto se llena, la sesión cierra la tarea y el script abre otra limpia. Si se alcanza el límite de uso, espera 15 minutos y reintenta.
6. Termina cuando `verificar-mvp` da el visto bueno (etiqueta `mvp-v1`) y las mejoras opcionales están hechas, o al llegar al número de iteraciones.

## Seguridad (léelo una vez)
Con permisos totales, Claude puede ejecutar cualquier comando en tu equipo sin preguntar. Las reglas `deny` de `.claude/settings.json` siguen activas incluso así: bloquean `git push`, `sudo`, borrados masivos, leer `.env` y `~/.ssh`, y modificar los datos del escenario. Aun así no son un muro perfecto. Recomendado: déjalo en una carpeta dedicada, sin otros proyectos importantes abiertos y, si puedes, en una cuenta de usuario o máquina virtual aparte.
