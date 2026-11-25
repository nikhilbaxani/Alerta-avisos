import { describe, expect, it } from "vitest";
import {
  ACTION_POLICY,
  SYSTEM_TOOLS,
  addProposals,
  approve,
  approveBatch,
  dispatch,
  duplicateBatch,
  duplicateText,
  newInfoByCall,
  planDuplicateSms,
  planRules,
  proposalsFromModel,
  toolDefinitions,
  traceOf,
} from "@/lib/actions";
import type { AgentAction, PlanCall, PlanInput, ToolArgs } from "@/lib/actions";
import { runAgent } from "@/lib/agent";
import { getScenario } from "@/data/scenarios";
import { buildAuditLog } from "@/lib/audit";
import { DUPLICATE_PHRASES, PHRASES } from "@/lib/phrases";
import { replayTo } from "@/lib/replay";
import { consoleProposals, reducer } from "@/lib/useConsole";
import type { ConsoleState } from "@/lib/useConsole";
import type { RiskTag } from "@/lib/types";

const RISKS: RiskTag[] = ["vida", "atrapados", "agua_subiendo"];
const call = (id: string, lang: string, phone: string | null, risks: RiskTag[] = RISKS, channel?: "ecall"): PlanCall =>
  channel ? { id, lang, phone, risks, channel } : { id, lang, phone, risks };

/** El coche de A (DANA): A1 abre, EC1 es la eCall, A4 trae «menor», A6 es el mismo teléfono que A2. */
const carA = (over: Partial<PlanInput> = {}): PlanInput => ({
  incidentId: "INC-01",
  type: "inundacion_vehiculo",
  risks: [...RISKS, "menor"],
  severity: 5,
  people: 3,
  points: [{ lat: 36.7, lng: -4.45, acc: 15 }],
  calls: [
    call("A1", "es", "+34 6•• ••• 412"),
    call("EC1", "es", "+34 7•• ••• 051", [], "ecall"),
    call("A2", "en", "+44 7••• ••• 318"),
    call("A3", "de", "+49 15• ••• 2207"),
    call("A4", "es", "+34 6•• ••• 519", [...RISKS, "menor"]),
    call("A5", "es", "+34 6•• ••• 883"),
    call("A6", "en", "+44 7••• ••• 318"),
  ],
  provisional: false,
  ...over,
});

/** Registro con los bomberos de A ya aprobados y enviados por el operador. */
function withResources(input: PlanInput, status: "propuesta" | "enviada" = "enviada"): AgentAction[] {
  const bomberos = planRules(input).filter((p) => p.tool === "proponer_recursos" && p.destination === "bomberos");
  let actions = addProposals([], bomberos, 10).actions;
  if (status === "enviada") {
    const ok = approve(actions, bomberos[0].key, "operador", 12);
    if (!ok.ok) throw new Error(ok.error);
    const sent = dispatch(ok.actions, bomberos[0].key, 12);
    if (!sent.ok) throw new Error(sent.error);
    actions = sent.actions;
  }
  return actions;
}
const argsOf = (a: { args: unknown }) => a.args as ToolArgs["sms_duplicado"];

describe("sms_duplicado: política (tabla en código)", () => {
  it("la aprueba el operador: va al ciudadano, nunca es automática", () => {
    expect(ACTION_POLICY.sms_duplicado).toBe("operador");
    for (const p of planDuplicateSms(carA(), withResources(carA()))) expect(p.policy).toBe("operador");
  });

  it("no se ofrece al modelo y lo que proponga el modelo se descarta (no puede volverse automática)", () => {
    expect(SYSTEM_TOOLS).toContain("sms_duplicado");
    expect(toolDefinitions(carA()).map((d) => d.function.name)).not.toContain("sms_duplicado");
    const r = proposalsFromModel([{ name: "sms_duplicado", arguments: { llamada: "A2", politica: "automatica" } }], carA());
    expect(r.proposals).toEqual([]);
    expect(r.issues[0]).toMatchObject({ tool: "sms_duplicado", outcome: "descartada" });
  });

  it("las reglas por incidente no lo proponen: depende del registro de acciones", () => {
    expect(planRules(carA()).some((p) => p.tool === "sms_duplicado")).toBe(false);
  });

  it("frase nueva aparte, en castellano y en en/de/fr/ar/it, y sin tocar las de PHRASES", () => {
    expect(DUPLICATE_PHRASES[0].es).toBe("Ya hemos recibido su aviso; la ayuda está en camino. Si hay algo nuevo, vuelva a llamar.");
    for (const l of ["en", "de", "fr", "ar", "it"]) expect(duplicateText(l)).toBeTruthy();
    expect(duplicateText("xx")).toBeNull();
    expect(PHRASES.some((p) => p.id === "duplicado_en_camino")).toBe(false);
  });
});

describe("sms_duplicado: cuándo y a quién", () => {
  it("nada sin recursos aprobados o enviados (una propuesta de recursos no basta)", () => {
    expect(planDuplicateSms(carA(), [])).toEqual([]);
    expect(planDuplicateSms(carA(), withResources(carA(), "propuesta"))).toEqual([]);
  });

  it("nada en un incidente provisional (ámbar)", () => {
    expect(planDuplicateSms(carA({ provisional: true }), withResources(carA()))).toEqual([]);
  });

  it("a los duplicados en su idioma con la frase pretraducida; no a quien abrió el incidente ni a la eCall", () => {
    const ps = planDuplicateSms(carA(), withResources(carA()));
    expect(ps.map((p) => p.destination)).toEqual(["A2", "A3", "A4", "A5"]);
    const a2 = argsOf(ps[0]);
    expect(a2).toMatchObject({ idioma: "en", telefono: "+44 7••• ••• 318", texto: DUPLICATE_PHRASES[0].tr.en, texto_es: DUPLICATE_PHRASES[0].es, revisar: [] });
    expect(argsOf(ps[1]).texto).toBe(DUPLICATE_PHRASES[0].tr.de);
    expect(ps[0].reason).toContain("Bomberos");
  });

  it("una vez por teléfono: A6 (mismo teléfono que A2) no recibe otro, y quien llama de nuevo desde el teléfono del que abrió tampoco", () => {
    const input = carA({ calls: [...carA().calls, call("A7", "es", "+34 6•• ••• 412")] });
    const ps = planDuplicateSms(input, withResources(input));
    expect(ps.filter((p) => argsOf(p).telefono === "+44 7••• ••• 318").map((p) => p.destination)).toEqual(["A2"]);
    expect(ps.some((p) => p.destination === "A7" || p.destination === "A6")).toBe(false);
  });

  it("una vez por teléfono también entre incidentes y al volver a planificar", () => {
    const res = withResources(carA());
    const first = addProposals(res, planDuplicateSms(carA(), res), 20).actions;
    expect(planDuplicateSms(carA(), first)).toEqual([]);
    const other = carA({ incidentId: "INC-09" });
    const all = addProposals(first, planRules(other).filter((p) => p.destination === "bomberos"), 21).actions;
    const ok = approve(all, "INC-09|proponer_recursos|bomberos", "operador", 22);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(planDuplicateSms(other, ok.actions)).toEqual([]);
  });

  it("quien trajo información nueva (riesgo nuevo o «no responde») queda marcado y fuera del lote", () => {
    expect(newInfoByCall(carA()).A4).toEqual(["menor"]);
    expect(newInfoByCall(carA()).A5).toEqual([]);
    const withNoAnswer = carA({ calls: [...carA().calls, call("A8", "fr", "+33 6 •• •• •• 41", [...RISKS, "sin_respuesta"]), call("A9", "it", "+39 3•• ••• 5528", [...RISKS, "sin_respuesta"])] });
    const info = newInfoByCall(withNoAnswer);
    expect(info.A8).toEqual(["sin_respuesta"]);
    // «No responde» se marca siempre, aunque ya lo dijera otra llamada.
    expect(info.A9).toEqual(["sin_respuesta"]);
    const ps = planDuplicateSms(withNoAnswer, withResources(withNoAnswer));
    const a4 = ps.find((p) => p.destination === "A4")!;
    expect(argsOf(a4).revisar).toEqual(["menor"]);
    expect(a4.reason).toContain("no entra en «Aprobar todos»");
    expect(a4.evidence.risks).toEqual(["menor"]);
    const actions = addProposals(withResources(withNoAnswer), ps, 30).actions;
    expect(duplicateBatch(actions, "INC-01").map((a) => a.destination)).toEqual(["A2", "A3", "A5"]);
  });
});

describe("sms_duplicado: aprobar en lote", () => {
  const setup = () => {
    const res = withResources(carA());
    return addProposals(res, planDuplicateSms(carA(), res), 30).actions;
  };

  it("«Aprobar todos» aprueba el lote (marcado como lote) y deja lo que trae información nueva sin aprobar", () => {
    const r = approveBatch(setup(), "INC-01", "operador", 40);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.approved.map((a) => a.destination)).toEqual(["A2", "A3", "A5"]);
    for (const a of r.approved) expect(a).toMatchObject({ status: "aprobada", approval: { by: "operador", at: 40, batch: true } });
    expect(r.actions.find((a) => a.destination === "A4")).toMatchObject({ status: "propuesta", approval: null });
    // Queda en la traza como aprobación en lote.
    expect(traceOf(r.approved[0]).aprobacion).toEqual({ por: "operador", en: 40, lote: true });
    // Lo que trae información nueva se aprueba aparte, a la vista del operador.
    expect(approve(r.actions, "INC-01|sms_duplicado|A4", "operador", 41).ok).toBe(true);
  });

  it("no hay lote dos veces, ni en otro incidente; un coordinador también puede aprobarlo", () => {
    const r = approveBatch(setup(), "INC-01", "operador", 40);
    expect(r.ok && approveBatch(r.actions, "INC-01", "operador", 41).ok).toBe(false);
    expect(approveBatch(setup(), "INC-02", "operador", 40).ok).toBe(false);
    expect(approveBatch(setup(), "INC-01", "coordinador", 40).ok).toBe(true);
  });
});

describe("sms_duplicado: consola y agente (DANA)", () => {
  /** La consola al final de la DANA, con el operador decidiendo la zona gris como `gold`. */
  const atEnd = (): ConsoleState => replayTo("dana-malaga", Infinity, { F1: false, B2: true });
  const incOf = (s: ConsoleState, callId: string) => s.engine.assignment[callId];
  const plan = (s: ConsoleState) => reducer(s, { type: "plan", proposals: consoleProposals(s) });

  it("tras aprobar los bomberos de A, la consola propone el lote y «Aprobar todos» lo envía con registro", () => {
    let s = atEnd();
    const a = incOf(s, "A1");
    expect(s.actions.some((x) => x.tool === "sms_duplicado")).toBe(false);
    s = reducer(s, { type: "actionApprove", key: `${a}|proponer_recursos|bomberos` });
    s = plan(s);
    const dups = s.actions.filter((x) => x.tool === "sms_duplicado" && x.incidentId === a);
    // ni EC1 ni A6; P1 es la llamada perdida de X15 junto a A (asociada por la posición).
    expect(dups.map((x) => x.destination)).toEqual(["A2", "A3", "A4", "A5", "P1"]);
    s = reducer(s, { type: "actionApproveBatch", incidentId: a });
    const after = s.actions.filter((x) => x.tool === "sms_duplicado" && x.incidentId === a);
    expect(after.filter((x) => x.status === "enviada").map((x) => x.destination)).toEqual(["A2", "A3", "A5"]);
    expect(after.find((x) => x.destination === "A4")!.status).toBe("propuesta");
    expect(after.find((x) => x.destination === "P1")!.status).toBe("propuesta"); // por posición: fuera del lote
    for (const x of after.filter((y) => y.status === "enviada")) expect(x.receipt?.reference).toMatch(/^DUP-[0-9A-F]{6}$/);
    const log = buildAuditLog(s, "Modo simulado");
    expect(log.accionesAgente.filter((t) => t.herramienta.nombre === "sms_duplicado" && t.aprobacion?.lote)).toHaveLength(3);
    expect(log.eventos.filter((e) => e.detail.includes("en lote"))).toHaveLength(3);
    // Volver a planificar no repite nada.
    expect(plan(s).actions).toHaveLength(s.actions.length);
  });

  it("npm run agente: lo muestra en la traza, una vez por teléfono, sin eCall y siempre aprobado por el operador", async () => {
    const run = await runAgent(getScenario("dana-malaga"));
    const dups = run.actions.filter((a) => a.tool === "sms_duplicado");
    expect(dups.length).toBeGreaterThan(0);
    expect(dups.some((a) => argsOf(a).llamada === "EC1")).toBe(false);
    const phones = dups.map((a) => argsOf(a).telefono);
    expect(new Set(phones).size).toBe(phones.length);
    for (const a of dups) expect(a.approval?.by).toBe("operador");
    expect(dups.filter((a) => a.incidentId === run.steps.find((s) => s.callId === "A1")!.incidentId).map((a) => a.destination)).toEqual(["A2", "P1", "A3", "A4", "A5"]); // P1: llamada perdida (X15)
    const keys = run.steps.flatMap((s) => s.added);
    for (const a of dups) expect(keys).toContain(a.key);
  });
});
