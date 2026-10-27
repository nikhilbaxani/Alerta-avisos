import { scenario } from "@/data/scenario-dana-malaga";

console.log(JSON.stringify(scenario.calls.map((c) => ({ id: c.id, lang: c.lang, transcript: c.transcript }))));
