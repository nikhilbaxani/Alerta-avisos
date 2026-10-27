import { SCENARIOS } from "@/data/scenarios";

console.log(JSON.stringify(SCENARIOS.flatMap((s) => s.calls).map((c) => ({ id: c.id, lang: c.lang, transcript: c.transcript }))));
