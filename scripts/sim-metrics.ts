import { getScenario } from "@/data/scenarios";
import { initialState, processCall } from "@/lib/engine";
import { compare } from "@/lib/metrics";
import type { SimCall } from "@/lib/metrics";

for (const id of ["dana-malaga", "apagon-malaga"]) {
  const calls = [...getScenario(id).calls].sort((a, b) => a.t - b.t);
  let state = initialState();
  const sim: SimCall[] = calls.map((c) => {
    state = processCall(state, { id: c.id, t: c.t, aml: c.aml, extraction: c.mock }).state;
    const inc = state.assignment[c.id];
    return { id: c.id, t: c.t, extraction: c.mock, incidentId: inc, first: state.incidents.find((i) => i.id === inc)!.callIds[0] === c.id };
  });
  for (const n of [1, 2, 3, 4]) console.log(id, n, JSON.stringify(compare(sim, n)));
}
