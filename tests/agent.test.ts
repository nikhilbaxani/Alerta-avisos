import { describe, expect, it } from "vitest";
import { getScenario } from "@/data/scenarios";
import { APPROVAL_DELAY_S, formatRun, runAgent, runToJson, summarize } from "@/lib/agent";
import type { AgentRun } from "@/lib/agent";
import { PHRASES } from "@/lib/phrases";

const dana = getScenario("dana-malaga");
const apagon = getScenario("apagon-malaga");
const tOf = (id: string) => [...dana.calls, ...apagon.calls].find((c) => c.id === id)!.t;
const incOf = (run: AgentRun, callId: string) => run.incidents.find((i) => i.callIds.includes(callId))!.id;
const actionsOf = (run: AgentRun, callId: string) => run.actions.filter((a) => a.incidentId === incOf(run, callId));

describe("npm run agente: escenario DANA (operador simulado)", async () => {
  const run = await runAgent(dana);

  it("la agrupación es la del motor real y la zona gris la decide el operador simulado", () => {
    expect(run.incidents).toHaveLength(7);
    expect(run.steps.filter((s) => s.operator !== null).map((s) => [s.callId, s.operator])).toEqual([
      ["F1", "distinto"],
      ["B2", "mismo"],
    ]);
    expect(run.incidents.some((i) => i.provisional)).toBe(false);
  });

  it("INC de A (coche + bebé tras A4) → bomberos y SAMU, aprobados por el operador", () => {
    const res = actionsOf(run, "A1").filter((a) => a.tool === "proponer_recursos");
    expect(res.map((a) => a.destination)).toEqual(["bomberos", "samu_061"]);
    const [bomberos, samu] = res;
    expect(bomberos).toMatchObject({ proposedAt: tOf("A1"), evidence: { callIds: ["A1"] } });
    expect(samu).toMatchObject({ proposedAt: tOf("A4"), evidence: { callIds: ["A4"], risks: ["menor"] } });
    for (const a of res) {
      expect(a.status).toBe("enviada");
      expect(a.approval).toEqual({ by: "operador", at: a.proposedAt + APPROVAL_DELAY_S });
      expect(a.receipt?.simulated).toBe(true);
    }
  });

  it("C3 (cables) → aviso automático a la distribuidora en el momento", () => {
    const d = actionsOf(run, "C3").find((a) => a.tool === "avisar_distribuidora")!;
    expect(d).toMatchObject({
      destination: "averias",
      status: "enviada",
      proposedAt: tOf("C3"),
      approval: { by: "automatica", at: tOf("C3") },
      evidence: { callIds: ["C3"] },
    });
  });

  it("E1 (árabe) → SMS en árabe con la frase pretraducida", () => {
    const sms = actionsOf(run, "E1").filter((a) => a.tool === "sms_al_llamante");
    expect(sms).toHaveLength(1);
    const ar = PHRASES.find((p) => p.id === "calma")!.tr.ar;
    expect(sms[0]).toMatchObject({ destination: "E1", status: "enviada", args: { idioma: "ar", texto: ar } });
  });

  it("ningún SMS a quien habla castellano y ninguna acción repetida", () => {
    const lang = Object.fromEntries(dana.calls.map((c) => [c.id, c.mock.language]));
    for (const a of run.actions) if (a.tool === "sms_al_llamante") expect(lang[a.destination]).not.toBe("es");
    const keys = run.actions.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("las automáticas no esperan; las de operador se aprueban unos segundos después; las de coordinador quedan pendientes", () => {
    for (const a of run.actions) {
      if (a.policy === "coordinador") {
        expect(a.status).toBe("propuesta");
        expect(a.approval).toBeNull();
        continue;
      }
      expect(a.status).toBe("enviada");
      if (a.policy === "automatica") expect(a.approval).toEqual({ by: "automatica", at: a.proposedAt });
      else if (a.tool === "sms_duplicado" && a.args.revisar.length === 0) expect(a.approval).toEqual({ by: "operador", at: a.proposedAt + APPROVAL_DELAY_S, batch: true });
      else expect(a.approval).toEqual({ by: "operador", at: a.proposedAt + APPROVAL_DELAY_S });
    }
    const s = summarize(run);
    expect(s.prepared).toBe(run.actions.length);
    expect(s.automatic).toBe(run.actions.filter((a) => a.policy === "automatica").length);
    expect(s.approved + s.automatic + s.discarded + s.pending).toBe(s.prepared);
    // C3 cables y E1 sin luz con persona mayor (distribuidora, X05); D semáforos y C árbol caído (ayuntamiento, X07).
    expect(run.actions.filter((a) => a.policy === "automatica").map((a) => a.tool).sort()).toEqual(["avisar_distribuidora", "avisar_distribuidora", "aviso_ayuntamiento", "aviso_ayuntamiento"]);
    expect([s.pending, s.pendingCoordinator]).toEqual([1, 1]); // el ES-Alert de A y F
  });

  it("es determinista y la traza JSON está rotulada como simulación", async () => {
    const again = await runAgent(dana);
    expect(runToJson(again, "reglas")).toEqual(runToJson(run, "reglas"));
    const json = runToJson(run, "reglas");
    expect(json.simulacion).toBe(true);
    expect(json.acciones).toHaveLength(run.actions.length);
    expect(JSON.stringify(json)).toMatch(/simulaci/i);
  });

  it("la traza de texto sigue percepción → razonamiento → herramienta → aprobación → resultado", () => {
    const text = formatRun(run, "reglas deterministas");
    expect(text).toMatch(/SIMULACIÓN/);
    for (const w of ["percepción", "razonamiento", "herramienta", "aprobación", "resultado"]) expect(text).toContain(w);
    expect(text).toMatch(/T\+02:43 +A4/);
    expect(text).toMatch(/Acciones preparadas: \d+/);
  });
});

describe("npm run agente: escenario apagón", async () => {
  const run = await runAgent(apagon);

  it("ascensores y personas vulnerables sin luz → aviso automático de reposición prioritaria", () => {
    for (const id of ["H1", "J1", "K1", "M1"]) {
      expect(actionsOf(run, id).find((a) => a.tool === "avisar_distribuidora")).toMatchObject({
        destination: "reposicion_prioritaria",
        status: "enviada",
        approval: { by: "automatica" },
      });
    }
    expect(actionsOf(run, "I1").filter((a) => a.tool === "avisar_distribuidora")).toEqual([]);
  });

  it("sin acciones repetidas y la misma agrupación que el eval", () => {
    expect(run.incidents).toHaveLength(6);
    const keys = run.actions.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
