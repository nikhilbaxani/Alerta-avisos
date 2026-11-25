import { describe, expect, it } from "vitest";
import { getScenario } from "@/data/scenarios";
import { snapshot } from "@/lib/engine";
import {
  factsFrom,
  incidentMissing,
  missingInfo,
  missingPhrase,
  MISSING_IDS,
  MISSING_RULES,
  type MissingFacts,
} from "@/lib/missingInfo";
import { MISSING_PHRASES, PHRASES } from "@/lib/phrases";
import { init, reducer, simulatedResult, type ConsoleState } from "@/lib/useConsole";
import type { Extraction, IncidentType } from "@/lib/types";

const base = (type: IncidentType, over: Partial<MissingFacts> = {}): MissingFacts => ({
  type,
  risks: [],
  people: 0,
  locations: [],
  texts: [],
  ...over,
});
const ids = (f: MissingFacts) => missingInfo(f).map((m) => m.id);

const ex = (over: Partial<Extraction>): Extraction => ({
  language: "es",
  translation_es: null,
  summary_es: "",
  incident_type: "otro",
  location_text: "",
  keywords: [],
  risks: [],
  people_at_risk: 0,
  severity: 3,
  ...over,
});

/** Reproduce el escenario en el reductor de la consola (modo simulado), con la zona gris decidida según `gold`. */
function play(scenarioId: string, until = Infinity): ConsoleState {
  const scn = getScenario(scenarioId);
  const gold = Object.fromEntries(scn.calls.map((c) => [c.id, c.gold]));
  let s = { ...init(0, scenarioId), running: true };
  for (const c of [...scn.calls].sort((a, b) => a.t - b.t)) {
    if (c.t > until) break;
    s = reducer(s, { type: "tick", dt: c.t - s.clock });
    while (s.queue.length) {
      const id = s.queue[0];
      s = reducer(s, { type: "begin", id });
      s = reducer(s, { type: "processed", epoch: s.epoch, id, result: simulatedResult(scenarioId, id, s.engine.incidents.map(snapshot)) });
      const prov = s.engine.incidents.find((i) => i.id === s.engine.assignment[id] && i.provisional);
      if (prov) {
        const linked = s.engine.incidents.find((i) => i.id === prov.linkedTo)!;
        s = reducer(s, { type: "decide", incidentId: prov.id, same: gold[linked.callIds[0]] === gold[id] });
      }
    }
  }
  return s;
}

const LANGS = ["en", "de", "fr", "ar", "it"];

describe("frases de «Falta saber» (X12)", () => {
  it("cada dato tiene su pregunta en castellano y pretraducida en en/de/fr/ar/it", () => {
    for (const id of MISSING_IDS) {
      const p = missingPhrase(MISSING_RULES[id].phraseId);
      expect(p, id).toBeDefined();
      expect(p!.es).toMatch(/^¿.+\?$/);
      for (const l of LANGS) expect(p!.tr[l]?.trim(), `${id}/${l}`).toBeTruthy();
    }
  });
  it("las frases nuevas van aparte y no repiten ids de PHRASES", () => {
    const old = new Set(PHRASES.map((p) => p.id));
    for (const p of MISSING_PHRASES) expect(old.has(p.id)).toBe(false);
    expect(PHRASES.map((p) => p.id)).toEqual(["calma", "heridos", "direccion", "garaje", "respira", "cables"]);
  });
});

describe("missingInfo por tipo de incidente", () => {
  it("médica: respira, dirección y planta; respira va primero", () => {
    expect(ids(base("medica"))).toEqual(["respira", "direccion", "planta"]);
  });
  it("médica: desaparece respira si se sabe la consciencia (riesgo o texto)", () => {
    expect(ids(base("medica", { risks: ["inconsciente"] }))).not.toContain("respira");
    expect(ids(base("medica", { texts: ["Está consciente y habla."] }))).not.toContain("respira");
  });
  it("inundación de vehículo: dirección, personas y altura del agua", () => {
    expect(ids(base("inundacion_vehiculo"))).toEqual(["direccion", "personas", "altura_agua"]);
    expect(
      ids(base("inundacion_vehiculo", { people: 2, locations: ["Camino del Prado"], texts: ["agua a las rodillas"] })),
    ).toEqual([]);
  });
  it("vivienda inundada: también la planta", () => {
    expect(ids(base("inundacion_vivienda"))).toEqual(["direccion", "personas", "altura_agua", "planta"]);
    expect(ids(base("inundacion_vivienda", { texts: ["Planta baja inundada"] }))).not.toContain("planta");
  });
  it("garaje inundado: dirección, personas y altura del agua", () => {
    expect(ids(base("garaje_inundado"))).toEqual(["direccion", "personas", "altura_agua"]);
    expect(ids(base("garaje_inundado", { texts: ["medio metro de agua"] }))).not.toContain("altura_agua");
  });
  it("incendio: dirección, personas, planta y heridos", () => {
    expect(ids(base("incendio"))).toEqual(["direccion", "personas", "planta", "heridos"]);
  });
  it("ascensor: dirección, personas y planta", () => {
    expect(ids(base("ascensor"))).toEqual(["direccion", "personas", "planta"]);
  });
  it("accidente: heridos; si hay heridos se pregunta si respira", () => {
    expect(ids(base("accidente"))).toEqual(["direccion", "heridos"]);
    expect(ids(base("accidente", { risks: ["herido"] }))).toEqual(["respira", "direccion"]);
  });
  it("árbol caído y delito: dirección y heridos", () => {
    expect(ids(base("arbol_caido"))).toEqual(["direccion", "heridos"]);
    expect(ids(base("delito"))).toEqual(["direccion", "heridos"]);
  });
  it("semáforos y otro: solo la dirección si no hay vía", () => {
    expect(ids(base("semaforos"))).toEqual(["direccion"]);
    expect(ids(base("otro"))).toEqual(["direccion"]);
    expect(ids(base("semaforos", { locations: ["Avenida de Andalucía"] }))).toEqual([]);
  });
  it("dirección: falta si solo hay AML o un lugar sin vía; se sabe con calle o carretera", () => {
    expect(ids(base("otro", { locations: ["Edificio junto a la estación, Torremolinos"] }))).toEqual(["direccion"]);
    expect(ids(base("otro", { locations: ["Paso inferior A-357, Campanillas"] }))).toEqual([]);
    expect(ids(base("otro", { locations: ["Calle Cuarteles 14"] }))).toEqual([]);
  });
  it("cada elemento trae rótulo y frase", () => {
    for (const m of missingInfo(base("incendio"))) {
      expect(m.label.length).toBeGreaterThan(3);
      expect(m.phrase.id).toBe(m.phraseId);
    }
  });
});

describe("factsFrom: un dato desaparece cuando lo aporta una llamada posterior", () => {
  it("la segunda llamada da la altura del agua y las personas", () => {
    const first = ex({ incident_type: "garaje_inundado", location_text: "Rincón de la Victoria", summary_es: "Garaje inundándose." });
    expect(missingInfo(factsFrom([first])).map((m) => m.id)).toEqual(["direccion", "personas", "altura_agua"]);
    const second = ex({
      incident_type: "garaje_inundado",
      location_text: "Avenida del Mediterráneo",
      summary_es: "Agua por la cintura; un vecino abajo.",
      people_at_risk: 1,
    });
    expect(missingInfo(factsFrom([first, second]))).toEqual([]);
  });
});

describe("escenario DANA en la consola", () => {
  it("E1 (dolor torácico, árabe): falta saber si respira (primero) y la dirección exacta; la planta ya se sabe", () => {
    const s = play("dana-malaga", 102);
    const inc = s.engine.incidents.find((i) => i.id === s.engine.assignment.E1)!;
    const m = incidentMissing(inc, s.calls);
    expect(m.map((x) => x.id)).toEqual(["respira", "direccion"]);
    expect(m[0].phraseId).toBe("respira");
    expect(m[0].phrase.tr.ar).toBe("هل الشخص يتنفس؟ هل هو واعٍ؟");
  });
  it("A (coche en el paso inferior): con la primera llamada no falta nada", () => {
    const s = play("dana-malaga", 8);
    const inc = s.engine.incidents.find((i) => i.id === s.engine.assignment.A1)!;
    expect(incidentMissing(inc, s.calls)).toEqual([]);
  });
  it("B (vivienda inundada): falta la altura del agua hasta que B3 dice que llega por la cintura", () => {
    const early = play("dana-malaga", 47);
    const b1 = early.engine.incidents.find((i) => i.id === early.engine.assignment.B1)!;
    expect(incidentMissing(b1, early.calls).map((x) => x.id)).toEqual(["altura_agua"]);
    const late = play("dana-malaga", 241);
    const b3 = late.engine.incidents.find((i) => i.id === late.engine.assignment.B3)!;
    expect(b3.callIds).toContain("B1");
    expect(incidentMissing(b3, late.calls)).toEqual([]);
  });
  it("G (garaje): la altura del agua ya la da G1; nada falta al final", () => {
    const s = play("dana-malaga");
    const inc = s.engine.incidents.find((i) => i.id === s.engine.assignment.G1)!;
    expect(incidentMissing(inc, s.calls).map((x) => x.id)).toEqual([]);
  });
  it("C (árbol caído): sigue faltando saber si hay heridos", () => {
    const s = play("dana-malaga");
    const inc = s.engine.incidents.find((i) => i.id === s.engine.assignment.C1)!;
    expect(incidentMissing(inc, s.calls).map((x) => x.id)).toEqual(["heridos"]);
  });
  it("es determinista y no depende del orden de llamadas del mismo incidente", () => {
    const s = play("dana-malaga");
    for (const inc of s.engine.incidents) {
      const a = incidentMissing(inc, s.calls);
      const b = incidentMissing({ ...inc, callIds: [...inc.callIds].reverse() }, s.calls);
      expect(a).toEqual(b);
    }
  });
});
