# Decisiones

Formato: `## AAAA-MM-DD · título` + Decisión · Motivo · Alternativa descartada.

## 2026-10-27 · Mapa SVG propio en lugar de teselas
- Decisión: dibujar la bahía de Málaga en SVG con coordenadas aproximadas.
- Motivo: la demo debe funcionar sin red (wifi del hackathon) y sin claves.
- Descartado: Leaflet con teselas de OpenStreetMap o CARTO.

## 2026-10-27 · Permisos totales solo en el bucle nocturno
- Decisión: `.claude/settings.json` usa `acceptEdits` con lista de permitidos y prohibidos; los permisos totales se activan con `--dangerously-skip-permissions` desde `scripts/noche.sh`.
- Motivo: Claude Code ignora `bypassPermissions` en la configuración del proyecto; las reglas `deny` se siguen aplicando incluso con permisos totales.

## 2026-10-28 · `locations` en IncidentSnapshot
- Decisión: campo opcional `locations?: string[]` con los `location_text` de las llamadas del incidente.
- Motivo: MEMORIA §9 compara `location_text` de la llamada con el de los incidentes, pero el snapshot solo traía keywords; así B2 se agrupa por "Cuarteles 14".
- Descartado: usar solo keywords (diluye la coincidencia de dirección).

## 2026-10-28 · Dolor torácico cuenta como estado crítico en la prioridad
- Decisión: el +10 de `sin_respuesta|inconsciente` también aplica a `dolor_pecho` (`lib/priority.ts`).
- Motivo: con la fórmula literal E1 (infarto) quedaba 4.º por los minutos sin atender de los demás; con el ajuste es 2.º a los 30 s de entrar, que es el momento de la demo. No se toca `gold`.
- Descartado: quitar los minutos sin atender (es lo que evita que se olvide a nadie).

## 2026-10-28 · E1 se mide a los 30 s de llegar
- Decisión: `npm run eval` comprueba el puesto de E1 en la cola 30 s después de su llamada, no al final del escenario.
- Motivo: al final G (sin respuesta + atrapados) legítimamente la supera; lo que importa es que en la demo suba arriba.

## 2026-10-28 · Consola en claro con estética de terminal
- Decisión: se mantiene el diseño claro de MEMORIA §12, con detalles de consola (datos en cifras tabulares, reloj T+mm:ss, etiquetas de estado) pero sin tema oscuro.
- Motivo: MEMORIA lo fija; el usuario pidió formato panel de control/consola, que cubre la estructura de tres zonas.
