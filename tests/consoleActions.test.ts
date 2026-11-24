import { describe, expect, it } from "vitest";
import { scenario as dana } from "@/data/scenario-dana-malaga";
import { scenarioApagon } from "@/data/scenario-apagon-malaga";
import { addProposals, approve, discard, dispatch } from "@/lib/actions";
import type { AgentAction } from "@/lib/actions";
import { proposalsFor } from "@/lib/consoleActions";
import { confirmDifferent, confirmSame, initialState, processCall } from "@/lib/engine";
import type { EngineCall, EngineState } from "@/lib/engine";
import type { ScenarioCall } from "@/lib/types";

/** Reproduce un escenario con el motor real; el operador acierta en la zona gris (según gold). */
function run(calls: ScenarioCall[], upTo?: string) {
  const sorted = [...calls].sort((a, b) => a.t - b.t);
  const byId: Record<string, EngineCall> = Object.fromEntries(sorted.map((c) => [c.id, { id: c.id, t: c.t, aml: c.aml, extraction: c.mock }]));
  const phones = Object.fromEntries(sorted.map((c) => [c.id, c.phone]));
  let state: EngineState = initialState();
  for (const c of sorted) {
    const r = processCall(state, byId[c.id]);
    state = r.state;
    if (r.decision.action === "ask" && c.id !== upTo) {
      const prov = state.assignment[c.id];
      const linked = state.incidents.find((i) => i.id === prov)!.linkedTo!;
      const same = sorted.find((x) => x.id === state.incidents.find((i) => i.id === linked)!.callIds[0])!.gold === c.gold;
      state = same ? confirmSame(state, prov, byId) : confirmDifferent(state, prov);
    }
    if (c.id === upTo) break;
  }
  const proposals = proposalsFor(state.incidents, byId, phones);
  return { state, proposals, ...addProposals([], proposals, 100) };
}

const of = (list: { incidentId: string; tool: string }[], state: EngineState, callId: string) => list.filter((a) => a.incidentId === state.assignment[callId]);

describe("la consola usa el agente de acciones de X05", () => {
  const { state, proposals, actions } = run(dana.calls);

  it("cables en el suelo (C3) → aviso a la distribuidora, enviado solo al añadirlo", () => {
    const dis = of(actions, state, "C3").find((a) => a.tool === "avisar_distribuidora") as AgentAction;
    expect(dis.policy).toBe("automatica");
    expect(dis.status).toBe("enviada");
    expect(dis.receipt?.reference).toMatch(/^DIS-/);
  });

  it("infarto en árabe (E1) → SMS en árabe y SAMU, ambos esperan al operador", () => {
    const e = of(actions, state, "E1") as AgentAction[];
    const sms = e.find((a) => a.tool === "sms_al_llamante")!;
    expect(sms.tool === "sms_al_llamante" && sms.args.idioma).toBe("ar");
    expect(sms.status).toBe("propuesta");
    expect(e.some((a) => a.tool === "proponer_recursos" && a.args.servicio === "samu_061" && a.status === "propuesta")).toBe(true);
  });

  it("el teléfono enmascarado llega al SMS", () => {
    const sms = of(actions, state, "E1").find((a) => a.tool === "sms_al_llamante") as AgentAction;
    expect(sms.tool === "sms_al_llamante" && sms.args.telefono).toBe("+34 6•• ••• 158");
  });

  it("un incidente pendiente de decisión (ámbar) no recibe acciones", () => {
    const r = run(dana.calls, "F1");
    const prov = r.state.incidents.find((i) => i.provisional)!;
    expect(prov).toBeDefined();
    expect(r.proposals.some((p) => p.incidentId === prov.id)).toBe(false);
  });

  it("volver a planificar con el mismo estado no añade nada", () => {
    expect(addProposals(actions, proposals, 200).added).toHaveLength(0);
  });

  it("aprobar y enviar, y descartar: el operador puede, una acción enviada no se deshace", () => {
    const pend = actions.filter((a) => a.status === "propuesta");
    const [first, second] = pend;
    const ok = approve(actions, first.key, "operador", 150);
    expect(ok.ok).toBe(true);
    const sent = dispatch((ok as { actions: AgentAction[] }).actions, first.key, 150);
    expect(sent.ok && sent.action.status).toBe("enviada");
    const dropped = discard(actions, second.key, "operador", 160);
    expect(dropped.ok && dropped.action.status).toBe("descartada");
    const again = discard((sent as { actions: AgentAction[] }).actions, first.key, "operador", 170);
    expect(again.ok).toBe(false);
  });

  it("dos coches atrapados cerca (A y F) → un ES-Alert de zona que solo aprueba un coordinador", () => {
    const es = actions.filter((x) => x.tool === "proponer_es_alert") as AgentAction[];
    expect(es).toHaveLength(1);
    expect(es[0].policy).toBe("coordinador");
    expect(es[0].status).toBe("propuesta");
    expect(es[0].incidentId).toMatch(/^ZONA-/);
    expect(es[0].tool === "proponer_es_alert" && es[0].args.incidentes).toEqual(expect.arrayContaining([state.assignment.A1, state.assignment.F1]));
    // un operador no puede aprobarlo
    expect(approve(actions, es[0].key, "operador", 120).ok).toBe(false);
  });

  it("semáforos → aviso automático al ayuntamiento; B3 «no contesta» → devolver la llamada al operador", () => {
    expect(of(actions, state, "D1").some((x) => x.tool === "aviso_ayuntamiento" && (x as AgentAction).status === "enviada")).toBe(true);
    const back = of(actions, state, "B1").find((x) => x.tool === "devolver_llamada") as AgentAction;
    expect(back.policy).toBe("operador");
    expect(back.status).toBe("propuesta");
  });

  it("apagón: persona vulnerable sin luz → reposición prioritaria", () => {
    const a = run(scenarioApagon.calls);
    expect(of(a.actions, a.state, "J1").some((x) => x.tool === "avisar_distribuidora")).toBe(true);
  });
});
