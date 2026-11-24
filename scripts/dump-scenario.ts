import { SCENARIOS } from "@/data/scenarios";

console.log(JSON.stringify(SCENARIOS.flatMap((s) => s.calls.map((c) => ({ id: c.id, scenario: s.id, lang: c.lang, phone: c.phone, transcript: c.transcript })))));
