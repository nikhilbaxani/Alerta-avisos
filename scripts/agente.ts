// npm run agente [-- --escenario apagon] [-- --operadores N] [-- --coordinador] [-- --json traza.json] [-- --parte parte.md] [-- --live]
// Reproduce el escenario con el motor real, el agente de acciones y el agente de espera e imprime la
// traza percepción → razonamiento → herramienta → aprobación → resultado, las llamadas que atiende
// el asistente de espera con N operadores (por defecto, los de la franja de sala) y, al final, el
// parte de situación. Sin --coordinador, el ES-Alert queda pendiente de coordinador. Todo es simulación.
import { writeFileSync } from "node:fs";
import { getScenario } from "@/data/scenarios";
import { formatRun, rulesPlanner, runAgent, runToJson } from "@/lib/agent";
import type { Planner } from "@/lib/agent";
import { getConfig, llmEnabled } from "@/lib/config";
import { planIncident } from "@/lib/plan";
import { reportMarkdown, situationReport } from "@/lib/report";
import { parseOperators } from "@/lib/waiting";

/** Valor de una opción: `--opcion valor` o `--opcion=valor`. */
function option(names: string[]): string | undefined {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    for (const n of names) {
      if (argv[i] === n) return argv[i + 1] ?? "";
      if (argv[i].startsWith(`${n}=`)) return argv[i].slice(n.length + 1);
    }
  }
  return undefined;
}

const SCENARIOS: Record<string, string> = { dana: "dana-malaga", "dana-malaga": "dana-malaga", apagon: "apagon-malaga", "apagon-malaga": "apagon-malaga" };

async function main() {
  const scn = option(["--escenario", "--scenario"]) ?? "dana";
  if (!SCENARIOS[scn]) {
    console.error(`Escenario desconocido: «${scn}». Usa «dana» o «apagon».`);
    process.exit(1);
  }
  const operators = parseOperators(option(["--operadores", "--operators"]));
  if (!operators.ok) {
    console.error(operators.error);
    process.exit(1);
  }
  const jsonPath = option(["--json"]);
  if (jsonPath === "" || jsonPath?.startsWith("--")) {
    console.error("Falta el archivo de --json (p. ej. --json traza.json).");
    process.exit(1);
  }
  const reportPath = option(["--parte", "--report"]);
  if (reportPath === "" || reportPath?.startsWith("--")) {
    console.error("Falta el archivo de --parte (p. ej. --parte parte.md).");
    process.exit(1);
  }
  const coordinator = process.argv.includes("--coordinador") || process.argv.includes("--coordinator");

  let planner: Planner = rulesPlanner;
  let label = "reglas deterministas (solo datos estructurados)";
  if (process.argv.includes("--live")) {
    const cfg = getConfig();
    if (llmEnabled(cfg)) {
      planner = (input) => planIncident(cfg, input);
      label = `reglas + IA local (${cfg.llmModel}, function calling validado; las reglas nunca se quitan)`;
    } else {
      console.log("AVISO: --live necesita LLM_BASE_URL (p. ej. http://localhost:11434/v1). Se usan las reglas deterministas.\n");
    }
  }

  const run = await runAgent(getScenario(SCENARIOS[scn]), { planner, operators: operators.value, coordinator });
  const report = situationReport(run);
  const markdown = reportMarkdown(report);
  console.log(formatRun(run, label));
  console.log(`\n${markdown}`);
  if (reportPath) {
    writeFileSync(reportPath, `${markdown}\n`);
    console.log(`\nParte de situación en Markdown: ${reportPath}`);
  }
  if (jsonPath) {
    writeFileSync(jsonPath, `${JSON.stringify({ ...runToJson(run, label), parteDeSituacion: report }, null, 2)}\n`);
    console.log(`\nTraza completa en JSON (con el parte de situación): ${jsonPath}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
