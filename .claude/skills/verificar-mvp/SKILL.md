---
name: verificar-mvp
description: Verificación final de que el MVP del Copiloto 112 es presentable en el hackathon. Úsala en la tarea T22 o cuando Nick pregunte si la demo está lista.
---
Delega en `qa-verificador` esta lista completa y exige pruebas de cada punto:

1. Instalación limpia: `rm -rf node_modules .next && npm install && npm run build`.
2. `npm run lint`, `npm test` y `npm run eval` en verde. Copia la tabla de métricas del eval.
3. Sin red: busca en el código `https://` en tiempo de ejecución (fuentes, teselas, CDNs). Solo se permiten `LLM_BASE_URL` y `STT_BASE_URL`.
4. Recorrido de la demo con Playwright a ×10, con capturas en `docs/capturas/final-*.png`:
   - inicio vacío con un mensaje claro;
   - a mitad: contador de llamadas → incidentes, mapa con anillos, cola de prioridad;
   - banner ámbar de F1 o B2: pulsar "Incidente distinto" o "Mismo incidente" y comprobar el resultado; probar también la tecla M/D;
   - incidente de E1: original en árabe y traducción, frase rápida en árabe y botón "Reproducir al llamante";
   - "Separar llamada" en un incidente fusionado;
   - final: 26 llamadas → 7 incidentes y 0 errores en la consola del navegador;
   - móvil 390×844 sin scroll horizontal.
5. README: los dos comandos de arranque funcionan tal y como están escritos.
6. `docs/PITCH.md` existe y todas sus cifras están en MEMORIA §3.

Si todo es APTO: `git tag mvp-v1` y anota en PROGRESO "MVP presentable". Si no, crea en TASKS.md tareas `T22.n` concretas para cada fallo, antes de T22, y continúa con `/siguiente-tarea`.
