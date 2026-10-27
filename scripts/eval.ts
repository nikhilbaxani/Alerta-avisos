import { getScenario } from "@/data/scenarios";
import { applyDecision, confirmDifferent, confirmSame, initialState, processCall } from "@/lib/engine";
import type { EngineCall } from "@/lib/engine";
import { getConfig, llmEnabled } from "@/lib/config";
import { processCall as processViaApi } from "@/lib/process";
import { snapshot } from "@/lib/engine";
import type { Decision } from "@/lib/types";
import { priorityOf, rankIncidents } from "@/lib/priority";

const live = process.argv.includes("--live");
const scnArg = process.argv.find((a) => a.startsWith("--scenario="))?.split("=")[1];
const scenario = getScenario(scnArg === "apagon" ? "apagon-malaga" : "dana-malaga");
const isDana = scenario.id === "dana-malaga";
const cfg = getConfig();
if (live && !llmEnabled(cfg)) {
  console.log("AVISO: --live necesita LLM_BASE_URL (p. ej. http://localhost:11434/v1). Evaluación en vivo omitida.");
  process.exit(0);
}

async function main() {
const calls = [...scenario.calls].sort((a, b) => a.t - b.t);
const byId: Record<string, EngineCall> = {};
const gold: Record<string, string> = {};
for (const c of calls) {
  byId[c.id] = { id: c.id, t: c.t, aml: c.aml, extraction: c.mock };
  gold[c.id] = c.gold;
}

let state = initialState();
const history: { t: number; state: typeof state }[] = [];
let questions = 0;
const rows: string[] = [];
for (const c of calls) {
  let decision: Decision;
  if (live) {
    const r = await processViaApi(cfg, { callId: c.id, aml: c.aml, incidents: state.incidents.map(snapshot) });
    byId[c.id] = { ...byId[c.id], extraction: r.extraction };
    state = applyDecision(state, byId[c.id], r.decision);
    decision = r.decision;
  } else {
    const r = processCall(state, byId[c.id]);
    state = r.state;
    decision = r.decision;
  }
  let note = "";
  if (decision.action === "ask") {
    questions++;
    // Operador ideal: compara con el gold del incidente enlazado.
    const prov = state.assignment[c.id];
    const linked = decision.incidentId!;
    const linkedGold = gold[state.incidents.find((i) => i.id === linked)!.callIds[0]];
    if (linkedGold === c.gold) {
      state = confirmSame(state, prov, byId);
      note = "operador: mismo";
    } else {
      state = confirmDifferent(state, prov);
      note = "operador: distinto";
    }
  }
  history.push({ t: c.t, state });
  rows.push(
    `${c.id.padEnd(3)} ${decision.action.padEnd(5)} ${(decision.incidentId ?? "-").padEnd(7)} ${decision.score.toFixed(2)}  ${note}`,
  );
}
console.log(rows.join("\n"));

// Pureza / completitud.
const goldToInc: Record<string, Set<string>> = {};
let wrongMerges = 0;
for (const inc of state.incidents) {
  const golds = new Set(inc.callIds.map((id) => gold[id]));
  if (golds.size > 1) wrongMerges += inc.callIds.length - Math.max(...[...golds].map((g) => inc.callIds.filter((id) => gold[id] === g).length));
  for (const g of golds) (goldToInc[g] ??= new Set()).add(inc.id);
}
const nGold = new Set(Object.values(gold)).size;
const split = Object.values(goldToInc).filter((s) => s.size > 1).length;
const ranking = rankIncidents(state.incidents, calls[calls.length - 1].t);
// Puesto de la llamada crítica (E1 infarto / J1 oxígeno) en la cola 30 s después de llegar.
const critId = isDana ? "E1" : "J1";
const e1Call = calls.find((c) => c.id === critId)!;
const tDemo = e1Call.t + 30;
const snap = [...history].reverse().find((h) => h.t <= tDemo)!.state;
const e1Pos = rankIncidents(snap.incidents, tDemo).findIndex((i) => i.id === snap.assignment[critId]) + 1;

console.log("\nPrioridad final:");
ranking.forEach((i, n) =>
  console.log(`${n + 1}. ${i.id} [${[...new Set(i.callIds.map((x) => gold[x]))].join("")}] ${priorityOf(i, calls[calls.length - 1].t).toFixed(0)} ${i.summary.slice(0, 60)}`),
);
console.log(
  `\nIncidentes: ${state.incidents.length} (objetivo ${nGold}) · gold repartidos: ${split} · fusiones incorrectas: ${wrongMerges} · preguntas: ${questions} · ${critId} en puesto ${e1Pos} (T+${tDemo}s)`,
);
const ok = state.incidents.length === nGold && split === 0 && wrongMerges === 0 && questions <= 2 && e1Pos >= 1 && e1Pos <= 2;
console.log(ok ? "EVAL OK" : "EVAL FALLA");
process.exit(ok ? 0 : 1);

}
main().catch((e) => { console.error(e); process.exit(1); });
