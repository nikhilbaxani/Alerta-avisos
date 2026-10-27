// Servidor falso compatible con OpenAI para probar el modo "IA local" sin GPU.
// Uso: node scripts/mock-ai.mjs [puerto]   →   LLM_BASE_URL=http://localhost:9100/v1 STT_BASE_URL=http://localhost:9100/v1
import http from "node:http";

const port = Number(process.argv[2] ?? 9100);
const extraction = {
  language: "en",
  translation_es: "Hay un árbol caído sobre un coche en el paseo marítimo; la carretera está cortada.",
  summary_es: "Árbol caído sobre un coche en el paseo marítimo; vía cortada.",
  incident_type: "arbol_caido",
  location_text: "Paseo Marítimo Pablo Ruiz Picasso",
  keywords: ["árbol", "coche", "Paseo Marítimo", "carretera cortada"],
  risks: ["via_bloqueada", "vehiculo_danado"],
  people_at_risk: 0,
  severity: 3,
};

http
  .createServer((req, res) => {
    const send = (obj) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(obj)); };
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (req.url.endsWith("/models")) return send({ data: [{ id: "mock" }] });
      if (req.url.endsWith("/audio/transcriptions"))
        return send({ text: "There is a big tree fallen on a car on the seafront promenade, the road is blocked." });
      if (req.url.endsWith("/chat/completions")) {
        const j = JSON.parse(body);
        const sys = j.messages[0].content;
        let content;
        if (sys.startsWith("Traduce")) content = "ترجمة تجريبية";
        else if (sys.includes('"same"')) content = JSON.stringify({ same: false, confidence: 0.7, reason: "Parecen dos vehículos distintos." });
        else {
          // Para las llamadas del escenario devuelve la extracción de referencia vía el transcript.
          content = JSON.stringify(extraction);
        }
        return send({ choices: [{ message: { content } }] });
      }
      res.statusCode = 404;
      res.end();
    });
  })
  .listen(port, () => console.log(`mock-ai en http://localhost:${port}/v1`));
