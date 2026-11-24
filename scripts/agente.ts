// npm run agente -- [--escenario apagon] [--operadores N] [--json traza.json] [--live]
// Reproduce el escenario con el motor real y el agente de acciones e imprime la traza
// percepción → razonamiento → herramienta → aprobación → resultado. Todo es simulación.
import { writeFileSync } from "node:fs";
import { getScenario } from "@/data/scenarios";
import { formatRun, rulesPlanner, runAgent, runToJson } from "@/lib/agent";
import type { Planner } from "@/lib/agent";
import { getConfig, llmEnabled } from "@/lib/config";
import { planIncident } from "@/lib/plan";
import { DEFAULT_OPERATORS } from "@/lib/waiting";

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
  if (process.argv.includes("--help")) {
    console.log(`Uso: npm run agente -- [--escenario dana|apagon] [--operadores N] [--json archivo] [--live]\n--operadores N: entero positivo; por defecto ${DEFAULT_OPERATORS}, como en la franja de sala.`);
    return;
  }
  const scn = option(["--escenario", "--scenario"]) ?? "dana";
  if (!SCENARIOS[scn]) {
    console.error(`Escenario desconocido: «${scn}». Usa «dana» o «apagon».`);
    process.exit(1);
  }
  const jsonPath = option(["--json"]);
  if (jsonPath === "") {
    console.error("Falta el archivo de --json (p. ej. --json traza.json).");
    process.exit(1);
  }

  const rawOperators = option(["--operadores"]);
  const operators = rawOperators === undefined ? DEFAULT_OPERATORS : Number(rawOperators);
  if ((rawOperators !== undefined && !/^\d+$/.test(rawOperators)) || !Number.isSafeInteger(operators) || operators < 1) {
    console.error("--operadores requiere un número entero positivo (p. ej. --operadores 2).");
    process.exit(1);
  }

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

  const run = await runAgent(getScenario(SCENARIOS[scn]), { planner, operators });
  console.log(formatRun(run, label));
  if (jsonPath) {
    writeFileSync(jsonPath, `${JSON.stringify(runToJson(run, label), null, 2)}\n`);
    console.log(`\nTraza completa en JSON: ${jsonPath}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
