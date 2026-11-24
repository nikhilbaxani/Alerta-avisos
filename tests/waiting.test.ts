import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getScenario } from "@/data/scenarios";
import { formatRun, runAgent, runToJson } from "@/lib/agent";
import { simulate } from "@/lib/metrics";
import { PHRASES, WAITING_PHRASE_IDS, WAITING_PHRASES } from "@/lib/phrases";
import {
  DEFAULT_OPERATORS,
  compareWaiting,
  parseOperators,
  simulateRoom,
  triage,
  waitingScript,
} from "@/lib/waiting";
import type { WaitingCall } from "@/lib/waiting";
import type { RiskTag } from "@/lib/types";

const dana = getScenario("dana-malaga");
const apagon = getScenario("apagon-malaga");
const LANGS = ["en", "de", "fr", "ar", "it"];
const ALL_PHRASES = [...PHRASES, ...WAITING_PHRASES];
const fixed = (id: string, lang: string) => {
  const p = ALL_PHRASES.find((x) => x.id === id)!;
  return lang === "es" ? p.es : p.tr[lang];
};

/** Llamada sintética para la sala simulada. */
function mk(id: string, t: number, o: Partial<WaitingCall> = {}): WaitingCall {
  const risks: RiskTag[] = o.extraction?.risks ?? [];
  return {
    id,
    t,
    extraction: { severity: 3, risks },
    incidentId: `INC-${id}`,
    first: true,
    lang: "es",
    decision: "new",
    newInfo: [],
    intoProvisional: false,
    incidentType: "otro",
    incidentRisks: risks,
    known: null,
    ...o,
  };
}
/** Duplicado fusionado por el motor; por defecto el incidente no tenía nada antes (`known`). */
const dup = (id: string, t: number, o: Partial<WaitingCall> = {}) =>
  mk(id, t, { first: false, decision: "merge", incidentId: "INC-X", known: { risks: [], severity: 1 }, ...o });
/** Duplicado de un incidente que ya tenía riesgo vital (como A2 con A1). */
const knownVital = (id: string, t: number, o: Partial<WaitingCall> = {}) =>
  dup(id, t, { extraction: { severity: 5, risks: ["vida"] }, known: { risks: ["vida"], severity: 5 }, ...o });

describe("frases del asistente de espera", () => {
  it("PHRASES (botones de la consola) no cambia: mismos elementos e ids", () => {
    expect(PHRASES.map((p) => p.id)).toEqual(["calma", "heridos", "direccion", "garaje", "respira", "cables"]);
    expect(PHRASES.find((p) => p.id === "calma")!.es).toBe("Mantenga la calma, la ayuda está en camino.");
  });

  it("las frases nuevas van aparte, con las cinco traducciones y sin chocar con PHRASES", () => {
    expect(WAITING_PHRASES.map((p) => p.id)).toEqual([...WAITING_PHRASE_IDS]);
    for (const p of WAITING_PHRASES) {
      expect(PHRASES.some((x) => x.id === p.id)).toBe(false);
      expect(p.es.trim()).not.toBe("");
      expect(Object.keys(p.tr).sort()).toEqual([...LANGS].sort());
      for (const l of LANGS) expect(p.tr[l].trim()).not.toBe("");
      expect(p.tr.ar).toMatch(/[؀-ۿ]/);
      expect(p.tr.ar).not.toMatch(/[A-Za-z]/);
    }
  });

  it("la presentación dice que es un asistente automático y que le atenderá un operador", () => {
    const p = WAITING_PHRASES.find((x) => x.id === "asistente")!;
    expect(p.es).toMatch(/asistente automático/);
    expect(p.es).toMatch(/operador/);
    expect(p.tr.en).toMatch(/automated assistant/);
  });
});

describe("triaje del asistente de espera", () => {
  it("escala el riesgo vital que la sala no conoce (dolor torácico, inconsciente, no responde, riesgo vital) o gravedad 5", () => {
    for (const r of ["dolor_pecho", "inconsciente", "sin_respuesta", "vida"] as RiskTag[]) {
      expect(triage(mk("x", 0, { extraction: { severity: 3, risks: [r] } }))).toMatchObject({ outcome: "escalada", vital: [r] });
      // Duplicado que trae un riesgo vital que el incidente no tenía (G2 trae «vida» a un garaje que no la tenía).
      const c = dup("x", 0, { extraction: { severity: 3, risks: [r] }, known: { risks: ["agua_subiendo"], severity: 3 } });
      expect(triage(c)).toMatchObject({ outcome: "escalada", vital: [r] });
      expect(triage(c).reason).toMatch(/, nuevo para INC-X\.$/);
    }
    expect(triage(mk("x", 0, { extraction: { severity: 5, risks: [] } }))).toMatchObject({ outcome: "escalada", severity5: true });
    expect(triage(mk("E1", 0, { extraction: { severity: 5, risks: ["vida", "dolor_pecho", "mayor"] } })).reason).toMatch(/dolor torácico, riesgo vital y gravedad 5/);
  });

  it("un duplicado sin novedad con riesgo vital ya conocido no escala y no se cierra: sigue en la cola", () => {
    const t = triage(knownVital("A2", 0));
    expect(t.outcome).toBe("en_cola");
    expect(t.vital).toEqual(["vida"]);
    expect(t.reason).toBe("Duplicado de INC-X con riesgo vital ya conocido por la sala (riesgo vital y gravedad 5): sigue en la cola humana en su orden, sin pasar por delante.");
  });

  it("el duplicado con riesgo vital escala si trae algo que nadie conoce: información nueva, gravedad 5 nueva o un provisional", () => {
    expect(triage(knownVital("A4", 0, { newInfo: ["menor"] })).outcome).toBe("escalada");
    const sev = triage(knownVital("x", 0, { known: { risks: ["vida"], severity: 4 } }));
    expect(sev.outcome).toBe("escalada");
    expect(sev.reason).toMatch(/riesgo vital y gravedad 5; nuevo para INC-X: gravedad 5\./);
    expect(triage(knownVital("x", 0, { intoProvisional: true })).outcome).toBe("escalada");
    expect(triage(knownVital("x", 0, { known: null })).outcome).toBe("escalada");
    expect(triage(knownVital("x", 0, { decision: "ask" })).outcome).toBe("escalada");
  });

  it("un duplicado que el motor fusiona solo y sin información nueva se cierra sin operador", () => {
    expect(triage(dup("D2", 0, { extraction: { severity: 2, risks: ["trafico", "sin_luz"] } })).outcome).toBe("agrupada");
  });

  it("información nueva, incidente provisional, incidente nuevo o zona gris → sigue en la cola humana", () => {
    expect(triage(dup("C3", 0, { newInfo: ["cables_electricos"], extraction: { severity: 4, risks: ["cables_electricos"] } })).outcome).toBe("en_cola");
    expect(triage(dup("x", 0, { intoProvisional: true })).outcome).toBe("en_cola");
    expect(triage(mk("C1", 0)).outcome).toBe("en_cola");
    expect(triage(mk("M1", 0, { decision: "ask" })).outcome).toBe("en_cola");
  });

  it("una zona gris (ask) nunca se convierte en fusión, tenga lo que tenga", () => {
    for (const first of [true, false])
      for (const newInfo of [[], ["menor"]] as RiskTag[][])
        for (const severity of [1, 3, 5] as const)
          expect(triage(mk("x", 0, { decision: "ask", first, newInfo, extraction: { severity, risks: [] } })).outcome).not.toBe("agrupada");
  });
});

describe("guion del asistente", () => {
  const base = { type: "otro" as const, risks: [] as RiskTag[], operatorOnIt: true };

  it("empieza siempre por la presentación como asistente automático y solo usa frases fijas", () => {
    for (const lang of ["es", ...LANGS])
      for (const outcome of ["agrupada", "en_cola", "escalada"] as const)
        for (const operatorOnIt of [true, false]) {
          const s = waitingScript({ ...base, lang, outcome, operatorOnIt, type: "inundacion_vehiculo", risks: ["vida", "cables_electricos"] });
          expect(s.lines[0].id).toBe("asistente");
          expect(s.lines[1].id).toBe("que_ocurre");
          for (const l of s.lines) {
            expect(l.text).toBe(fixed(l.id, lang));
            expect(l.es).toBe(fixed(l.id, "es"));
          }
          expect(s.text).toBe(s.lines.map((l) => l.text).join(" "));
          expect(s.textEs).toBe(s.lines.map((l) => l.es).join(" "));
          expect(s.translated).toBe(true);
        }
  });

  it("escalada: avisa de que le pasa con un operador justo después de escucharle", () => {
    const s = waitingScript({ ...base, lang: "ar", outcome: "escalada", operatorOnIt: false, type: "medica", risks: ["vida", "dolor_pecho"] });
    expect(s.lines.map((l) => l.id)).toEqual(["asistente", "que_ocurre", "escalado", "calma_espera"]);
    expect(s.text).toContain(WAITING_PHRASES.find((p) => p.id === "escalado")!.tr.ar);
  });

  it("no promete que la ayuda esté en camino si ningún operador ha cogido aún la emergencia", () => {
    const nueva = waitingScript({ ...base, lang: "es", outcome: "en_cola", operatorOnIt: false, type: "medica", risks: [] });
    expect(nueva.lines.map((l) => l.id)).toEqual(["asistente", "que_ocurre", "calma_espera", "en_cola"]);
    const repetida = waitingScript({ ...base, lang: "es", outcome: "agrupada", operatorOnIt: true, type: "ascensor", risks: ["atrapados"] });
    expect(repetida.lines.map((l) => l.id)).toEqual(["asistente", "que_ocurre", "calma", "ya_avisado"]);
    for (const p of WAITING_PHRASES) expect(p.es).not.toMatch(/en camino|la estamos atendiendo/);
  });

  it("instrucciones por tipo y riesgos con la elección del SMS (X05)", () => {
    const s = waitingScript({ ...base, lang: "en", outcome: "en_cola", type: "arbol_caido", risks: ["cables_electricos"] });
    expect(s.lines.map((l) => l.id)).toEqual(["asistente", "que_ocurre", "cables", "en_cola"]);
    const sem = waitingScript({ ...base, lang: "es", outcome: "agrupada", type: "semaforos", risks: ["trafico", "sin_luz"] });
    expect(sem.lines.map((l) => l.id)).toEqual(["asistente", "que_ocurre", "ya_avisado"]);
  });

  it("sin traducción al idioma del llamante, guion en castellano y marcado", () => {
    const s = waitingScript({ ...base, lang: "pt", outcome: "en_cola" });
    expect(s.translated).toBe(false);
    expect(s.text).toBe(s.textEs);
  });
});

describe("sala simulada con agente de espera", async () => {
  const runs = { dana: await runAgent(dana), apagon: await runAgent(apagon) };

  it("sin agente de espera es exactamente la simulación de la consola (lib/metrics, con copiloto)", () => {
    for (const run of Object.values(runs))
      for (const n of [1, 2, 3, 4, 5, 6]) expect(simulateRoom(run.roomCalls, n, false).wait).toEqual(simulate(run.roomCalls, n, "con_copiloto").wait);
  });

  it("nunca atiende una llamada que un operador libre puede coger", () => {
    for (const run of Object.values(runs))
      for (const n of [1, 2, 3, 4, 5, 6]) {
        const room = simulateRoom(run.roomCalls, n, true);
        const attended = new Set(room.attentions.map((a) => a.callId));
        for (const a of room.attentions) expect(a.freeAt).toBeGreaterThan(a.t);
        // Lo que no atiende el asistente lo coge un operador en el mismo segundo en que llega.
        for (const c of run.roomCalls) if (!attended.has(c.id)) expect(room.wait[c.id]).toBe(0);
      }
  });

  it("con tantos operadores como llamadas no atiende ninguna", () => {
    for (const run of Object.values(runs)) {
      expect(simulateRoom(run.roomCalls, run.roomCalls.length, true).attentions).toEqual([]);
      const r = compareWaiting(run.roomCalls, run.roomCalls.length);
      expect(r.con).toMatchObject({ attendedByAgent: 0, resolvedWithoutOperator: 0, escalated: 0 });
    }
  });

  it("un operador libre siempre la coge antes que el asistente (sala sintética)", () => {
    const room = simulateRoom([mk("a", 0), mk("b", 10), mk("c", 70)], 2, true);
    expect(room.attentions).toEqual([]);
    const one = simulateRoom([mk("a", 0), mk("b", 10), mk("c", 70)], 1, true);
    expect(one.attentions.map((a) => [a.callId, a.freeAt])).toEqual([["b", 60], ["c", 120]]);
  });

  it("el duplicado resuelto no ocupa a un operador y no espera en la cola", () => {
    const calls = [mk("a", 0), dup("b", 10), mk("c", 20)];
    const con = simulateRoom(calls, 1, true);
    expect(con.attentions.find((a) => a.callId === "b")).toMatchObject({ outcome: "agrupada", operatorAt: null, queuePosition: null });
    expect(con.wait.b).toBeNull();
    const r = compareWaiting(calls, 1);
    expect(r.sin.operatorSeconds - r.con.operatorSeconds).toBe(15);
  });

  it("«la ayuda está en camino» solo si un operador ya ha cogido alguna llamada de esa emergencia", () => {
    const lift = { incidentType: "ascensor" as const };
    // a (INC-A) la coge el único operador en T+0; b (INC-B) se queda en cola; c y d son duplicados.
    const calls = [mk("a", 0, { ...lift, incidentId: "INC-A" }), mk("b", 10, { ...lift, incidentId: "INC-B" }), dup("c", 20, { ...lift, incidentId: "INC-B" }), dup("d", 30, { ...lift, incidentId: "INC-A" })];
    const ids = (id: string) => simulateRoom(calls, 1, true).attentions.find((a) => a.callId === id)!.script.lines.map((l) => l.id);
    expect(ids("b")).toEqual(["asistente", "que_ocurre", "calma_espera", "en_cola"]);
    expect(ids("c")).toEqual(["asistente", "que_ocurre", "calma_espera", "ya_avisado"]);
    expect(ids("d")).toEqual(["asistente", "que_ocurre", "calma", "ya_avisado"]);
  });

  it("el duplicado con riesgo vital ya conocido no pasa por delante de una emergencia nueva", () => {
    const calls = [mk("a", 0), mk("b", 10), knownVital("c", 20)];
    const con = simulateRoom(calls, 1, true);
    expect(con.attentions.find((a) => a.callId === "c")).toMatchObject({ outcome: "en_cola", queuePosition: 2, escalation: null });
    expect(con.wait).toEqual(simulateRoom(calls, 1, false).wait);
    expect(con.wait.b).toBe(50);
    expect(con.wait.c).toBe(100);
  });

  it("la escalada pasa la primera de la cola humana, por delante de lo que no es vital", () => {
    const calls = [mk("a", 0), mk("b", 10, { extraction: { severity: 4, risks: [] } }), dup("c", 20, { extraction: { severity: 3, risks: ["inconsciente"] }, newInfo: ["inconsciente"] })];
    const sin = simulateRoom(calls, 1, false);
    expect(sin.wait.b).toBeLessThan(sin.wait.c!);
    const con = simulateRoom(calls, 1, true);
    expect(con.attentions.find((a) => a.callId === "c")).toMatchObject({ outcome: "escalada", queuePosition: 1, operatorAt: 60 });
    expect(con.wait.c).toBe(40);
  });

  it("DANA: E1 (dolor torácico, árabe) espera con los operadores por defecto → escalada y primera de la cola humana", () => {
    for (const n of [1, DEFAULT_OPERATORS]) {
      const r = compareWaiting(runs.dana.roomCalls, n);
      const e1 = r.attentions.find((a) => a.callId === "E1")!;
      expect(e1).toBeDefined();
      expect(e1).toMatchObject({ lang: "ar", outcome: "escalada", queuePosition: 1 });
      expect(e1.escalation!.risks).toContain("dolor_pecho");
      expect(e1.reason).toMatch(/dolor torácico/);
      expect(e1.script.lines.map((l) => l.id).slice(0, 3)).toEqual(["asistente", "que_ocurre", "escalado"]);
      expect(e1.script.text).toContain(WAITING_PHRASES[0].tr.ar);
      expect(r.critical).toBe("E1");
      expect(r.con.critical!.wait).not.toBeNull();
      expect(r.con.critical!.wait!).toBeLessThanOrEqual(r.sin.critical!.wait!);
      expect(e1.operatorAt).toBe(e1.t + r.con.critical!.wait!);
    }
  });

  it("DANA y apagón: los duplicados con riesgo vital ya conocido siguen en cola; G2 («vida» nueva en el garaje) escala", () => {
    const known = ["A2", "A3", "A5", "A6", "F2", "B4", "G4", "J2", "K2"];
    for (const run of Object.values(runs))
      for (const n of [1, DEFAULT_OPERATORS])
        for (const a of compareWaiting(run.roomCalls, n).attentions) {
          if (known.includes(a.callId)) expect(a).toMatchObject({ outcome: "en_cola", escalation: null });
          if (["A4", "B3", "G3", "H3", "J3", "L2"].includes(a.callId)) expect(a.outcome).toBe("escalada");
        }
    const g2 = compareWaiting(runs.dana.roomCalls, 1).attentions.find((a) => a.callId === "G2")!;
    expect(g2).toMatchObject({ outcome: "escalada" });
    expect(g2.reason).toMatch(/^Escala de inmediato a un operador humano: riesgo vital, nuevo para INC-\d+\.$/);
  });

  it("DANA: un duplicado de los semáforos se resuelve sin operador", () => {
    const r = compareWaiting(runs.dana.roomCalls, DEFAULT_OPERATORS);
    const d = r.attentions.find((a) => a.callId === "D2")!;
    expect(d).toMatchObject({ outcome: "agrupada", operatorAt: null, incidentId: runs.dana.incidents.find((i) => i.callIds.includes("D1"))!.id });
    expect(d.script.lines.at(-1)!.id).toBe("ya_avisado");
    expect(r.con.resolvedWithoutOperator).toBeGreaterThan(0);
  });

  it("las zonas grises de los escenarios nunca se resuelven solas", () => {
    for (const run of Object.values(runs))
      for (const n of [1, 2, 3]) {
        const asks = new Set(run.roomCalls.filter((c) => c.decision === "ask").map((c) => c.id));
        expect(asks.size).toBeGreaterThan(0);
        for (const a of compareWaiting(run.roomCalls, n).attentions) if (asks.has(a.callId)) expect(a.outcome).not.toBe("agrupada");
      }
  });

  it("indicadores con y sin agente coherentes y rotulados como simulación", () => {
    for (const run of Object.values(runs))
      for (const n of [1, 2, 3, 4]) {
        const r = compareWaiting(run.roomCalls, n);
        expect(r.simulation).toBe(true);
        expect(r.assumptions.join(" ")).toMatch(/60 s.*15 s/);
        expect(r.sin).toMatchObject({ attendedByAgent: 0, resolvedWithoutOperator: 0, escalated: 0, queued: 0 });
        expect(r.sin.waitedAlone).toBe(r.sin.waited);
        expect(r.con.waitedAlone).toBe(0);
        expect(r.con.attendedByAgent).toBe(r.con.waited);
        expect(r.con.resolvedWithoutOperator + r.con.escalated + r.con.queued).toBe(r.con.attendedByAgent);
        expect(r.sin.operatorSeconds - r.con.operatorSeconds).toBe(15 * r.con.resolvedWithoutOperator);
      }
  });
});

describe("npm run agente con el agente de espera", async () => {
  const run = await runAgent(dana);

  it("por defecto usa los operadores de la franja de sala de la consola", () => {
    const src = readFileSync("components/SimStrip.tsx", "utf8");
    expect(src).toContain(`useState(${DEFAULT_OPERATORS})`);
    expect(run.waiting.operators).toBe(DEFAULT_OPERATORS);
  });

  it("no cambia la agrupación ni las acciones de X05", async () => {
    const other = await runAgent(dana, { operators: 1 });
    expect(other.steps).toEqual(run.steps);
    expect(other.incidents).toEqual(run.incidents);
    expect(other.actions).toEqual(run.actions);
    expect(other.waiting.operators).toBe(1);
  });

  it("traza de texto: atenciones del asistente y resumen con y sin agente, como simulación", () => {
    const text = formatRun(run, "reglas");
    expect(text).toMatch(/asistente de espera/);
    expect(text).toMatch(/ESCALADA/);
    expect(text).toMatch(/agrupada sin operador/);
    expect(text).toMatch(/guion \(árabe\)/);
    expect(text).toMatch(/Agente de espera · SIMULACIÓN/);
    expect(text).toMatch(/Llamada crítica E1/);
  });

  it("JSON: incluye el agente de espera y es determinista", async () => {
    const json = runToJson(run, "reglas");
    expect(json.agenteDeEspera.simulacion).toBe(true);
    expect(json.agenteDeEspera.operadores).toBe(DEFAULT_OPERATORS);
    const e1 = json.agenteDeEspera.atenciones.find((a) => a.llamada === "E1")!;
    expect(e1).toMatchObject({ idioma: "ar", resultado: "escalada", puestoEnColaHumana: 1 });
    expect(json.agenteDeEspera.indicadores.conAgente.escaladas).toBeGreaterThan(0);
    expect(runToJson(await runAgent(dana), "reglas")).toEqual(json);
  });

  it("--operadores: entero de 1 a 50, con mensaje en castellano si no", () => {
    expect(parseOperators(undefined)).toEqual({ ok: true, value: DEFAULT_OPERATORS });
    expect(parseOperators("3")).toEqual({ ok: true, value: 3 });
    for (const bad of ["", "0", "-1", "2.5", "abc", "51", "1e3"]) {
      const r = parseOperators(bad);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/operadores/);
    }
  });
});
