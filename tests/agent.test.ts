import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { getScenario } from "@/data/scenarios";
import { APPROVAL_DELAY_S, formatRun, runAgent, runToJson, summarize } from "@/lib/agent";
import type { AgentRun } from "@/lib/agent";
import { approve, dispatch } from "@/lib/actions";
import { PHRASES } from "@/lib/phrases";

const dana = getScenario("dana-malaga");
const apagon = getScenario("apagon-malaga");
const tOf = (id: string) => [...dana.calls, ...apagon.calls].find((c) => c.id === id)!.t;
const incOf = (run: AgentRun, callId: string) => run.incidents.find((i) => i.callIds.includes(callId))!.id;
const actionsOf = (run: AgentRun, callId: string) => run.actions.filter((a) => a.incidentId === incOf(run, callId));

describe("npm run agente: escenario DANA (operador simulado)", async () => {
  const run = await runAgent(dana);

  it("E1 escala en árabe con la sala por defecto y la traza distingue aviso y atención", () => {
    const e1 = run.waiting.calls.find((c) => c.callId === "E1")!;
    expect(run.waiting.operators).toBe(2);
    expect(e1.waiting).toMatchObject({ outcome: "escalated", reasons: ["vida", "dolor_pecho", "severity_5"], script: [
      "أنا المساعد الآلي لخدمة الطوارئ 112.", "ماذا حدث؟", "هل يمكنك أن تخبرني بالعنوان الدقيق؟",
    ] });
    expect(e1.humanAt).toBeGreaterThan(e1.arrival);
    expect(formatRun(run, "reglas")).toContain("Espera E1 · escalada inmediata a T+01:42");
    expect(runToJson(run, "reglas").espera.llamadas.find((c) => c.llamada === "E1")).toMatchObject({ resultado: "escalada", operadorEn: e1.humanAt });
  });

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

  it("A y F: un borrador geolocalizado, sin texto de llamadas ni aprobación simulada", () => {
    const alerts = run.actions.filter((a) => a.tool === "proponer_es_alert");
    expect(alerts).toEqual([expect.objectContaining({ proposedAt: tOf("F1"), policy: "coordinador", status: "propuesta", approval: null, receipt: null,
      evidence: { type: "inundacion_vehiculo", risks: ["atrapados"], callIds: ["A1", "F1"] },
      args: { zona: { lat: expect.any(Number), lng: expect.any(Number), radio_m: expect.any(Number) }, texto: "Vehículos atrapados por inundación en la zona. Evite circular por pasos inundados." },
    })]);
    const [{ key }] = alerts;
    expect(approve(run.actions, key, "operador", 150)).toEqual({ ok: false, error: "Esta acción la aprueba un coordinador" });
    expect(dispatch(run.actions, key, 150)).toEqual({ ok: false, error: "Solo se envían acciones aprobadas; esta está propuesta" });
    expect(approve(run.actions, key, "coordinador", 150)).toMatchObject({ ok: true, action: { status: "aprobada", approval: { by: "coordinador", at: 150 }, receipt: null } });
    expect(alerts[0]).toMatchObject({ status: "propuesta", approval: null, receipt: null });
  });

  it("D (semáforos): aviso municipal automático y sin duplicar despacho policial", () => {
    const actions = actionsOf(run, "D1");
    expect(actions.filter((a) => a.tool === "aviso_ayuntamiento")).toEqual([expect.objectContaining({
      status: "enviada", approval: { by: "automatica", at: tOf("D1") }, receipt: { service: "Ayuntamiento (simulado)", reference: expect.stringMatching(/^AYT-/), simulated: true, at: tOf("D1"), detail: expect.any(String) },
      args: { motivo: "semaforos", posicion: { lat: expect.any(Number), lng: expect.any(Number) } },
    })]);
    expect(actions.some((a) => a.destination === "policia_local")).toBe(false);
  });

  it("B3 (sin respuesta): devuelve la llamada tras aprobación del operador", () => {
    expect(actionsOf(run, "B3").filter((a) => a.tool === "devolver_llamada")).toEqual([expect.objectContaining({
      destination: "B3", args: { llamada: "B3", telefono: dana.calls.find((c) => c.id === "B3")!.phone },
      proposedAt: tOf("B3"), policy: "operador", status: "enviada", approval: { by: "operador", at: tOf("B3") + APPROVAL_DELAY_S },
      receipt: expect.objectContaining({ reference: expect.stringMatching(/^TEL-/), simulated: true }),
    })]);
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

  it("las automáticas no esperan; las de operador se aprueban unos segundos después", () => {
    for (const a of run.actions) {
      if (a.policy === "coordinador") continue; // La regla de coordinador tiene su propia prueba.
      expect(a.status).toBe("enviada");
      if (a.policy === "automatica") expect(a.approval).toEqual({ by: "automatica", at: a.proposedAt });
      else expect(a.approval).toEqual({ by: "operador", at: a.proposedAt + APPROVAL_DELAY_S });
    }
    const s = summarize(run);
    expect(s.prepared).toBe(run.actions.length);
    expect(s.automatic).toBe(run.actions.filter((a) => a.policy === "automatica").length);
    expect(s.approved + s.automatic + s.discarded + s.pending).toBe(s.prepared);
    expect(run.actions.filter((a) => a.approval?.by === "automatica").map((a) => a.tool)).toEqual([
      "aviso_ayuntamiento", "aviso_ayuntamiento", "avisar_distribuidora", "avisar_distribuidora",
    ]);
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

describe("CLI de espera", () => {
  const cli = (...args: string[]) => spawnSync(process.execPath, ["--import", "tsx", "scripts/agente.ts", ...args], { encoding: "utf8" });

  it.each([{ args: [] }, { args: ["--escenario", "apagon"] }])("mantiene el escenario y acepta más operadores ($args)", ({ args }) => {
    const result = cli(...args, "--operadores=30");
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain(args.length ? "16 llamadas → 6 incidentes" : "26 llamadas → 7 incidentes");
    expect(result.stdout).toContain("  Espera (30 operadores): 0 atendidas por el asistente · 0 duplicados sin operador · 0 escaladas");
  });

  it.each([["--operadores"], ["--operadores=0"], ["--operadores=1.5"], ["--operadores=-2"], ["--operadores=NaN"], ["--operadores=9007199254740992"]])("rechaza un número inválido (%s)", (arg) => {
    const result = cli(arg);
    expect([result.status, result.stdout, result.stderr]).toEqual([1, "", "--operadores requiere un número entero positivo (p. ej. --operadores 2).\n"]);
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
