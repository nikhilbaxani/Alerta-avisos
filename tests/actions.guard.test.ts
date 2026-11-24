import { expect, it } from "vitest";
import { addProposals, approve, dispatch, planRules, proposalsFromModel } from "@/lib/actions";
import type { AgentAction, PlanCall, PlanInput } from "@/lib/actions";
import type { Aml } from "@/lib/types";

const point = (lat: number): Aml => ({ lat, lng: -4.4, acc: 20 });
const incident = (n: number, lat: number): PlanInput => {
  const aml = point(lat);
  const call: PlanCall = { id: `X${n}`, lang: "es", phone: null, risks: ["atrapados"], aml };
  return { incidentId: `INC-0${n}`, type: "inundacion_vehiculo", risks: ["atrapados"], severity: 4,
    people: 1, points: [aml], calls: [call], provisional: false };
};
const first = incident(1, 36.7);
const second = incident(2, 36.704);
const alerts = (input: PlanInput) => planRules(input).filter((p) => p.tool === "proponer_es_alert");
const alert = () => alerts({ ...first, nearby: [second] })[0];

it("una política automática en la propuesta no autoriza ES-Alert", () => {
  const p = { ...alert(), policy: "automatica" } as const;
  const pending = { ...p, policy: "coordinador", status: "propuesta", proposedAt: 10, approval: null, receipt: null, discarded: null };
  expect(addProposals([], [p], 10)).toEqual({ actions: [pending], added: [pending] });
});

it("la política del objeto no permite que un operador apruebe ES-Alert", () => {
  const [pending] = addProposals([], [alert()], 10).actions;
  const forged: AgentAction = { ...pending, policy: "operador" };
  expect(approve([forged], forged.key, "operador", 11)).toEqual({ ok: false, error: "Esta acción la aprueba un coordinador" });
  expect(forged).toMatchObject({ status: "propuesta", approval: null, receipt: null });
});

it("el envío rechaza la aprobación de operador pero admite la del coordinador", () => {
  const [pending] = addProposals([], [alert()], 10).actions;
  const forged: AgentAction = { ...pending, status: "aprobada", approval: { by: "operador", at: 11 } };
  expect(dispatch([forged], forged.key, 12)).toEqual({ ok: false, error: "Esta acción la aprueba un coordinador" });
  expect(forged).toMatchObject({ status: "aprobada", approval: { by: "operador", at: 11 }, receipt: null });
  const approved = approve([pending], pending.key, "coordinador", 11);
  if (!approved.ok) throw new Error(approved.error);
  expect(dispatch(approved.actions, pending.key, 12)).toMatchObject({ ok: true, action: {
    status: "enviada", approval: { by: "coordinador", at: 11 }, receipt: { service: "ES-Alert (simulado)", simulated: true, at: 12 },
  } });
});

it("un aviso municipal propuesto por la IA sigue necesitando al operador", () => {
  const { proposals: [p] } = proposalsFromModel([{ name: "aviso_ayuntamiento", arguments: { motivo: "semaforos" } }], { ...first, type: "semaforos" });
  expect(addProposals([], [p], 10).added).toEqual([expect.objectContaining({ policy: "operador", status: "propuesta", approval: null, receipt: null })]);
});

it("no toma la posición AML de otra llamada como evidencia de atrapamiento", () => {
  const withoutAml: PlanCall = { id: "X3", lang: "es", phone: null, risks: ["atrapados"] };
  const located: PlanCall = { ...first.calls[0], risks: [], aml: first.points[0] };
  expect(alerts({ ...first, calls: [withoutAml, located], nearby: [second] })).toEqual([]);
});

it("una llamada anterior sin AML no desplaza la ubicación de la llamada atrapada", () => {
  const withoutAml: PlanCall = { id: "X3", lang: "es", phone: null, risks: [] };
  expect(alerts({ ...first, calls: [withoutAml, ...first.calls], nearby: [second] })).toEqual([alert()]);
});

it("no propone ES-Alert para incidentes a más de 500 m", () => {
  expect(alerts({ ...first, nearby: [incident(2, 36.7046)] })).toEqual([]);
});

it("no propone ES-Alert si algún incidente es provisional", () => {
  expect(alerts({ ...first, nearby: [{ ...second, provisional: true }] })).toEqual([]);
  expect(alerts({ ...first, provisional: true, nearby: [second] })).toEqual([]);
});

it("no propone ES-Alert con un solo incidente", () => {
  expect(alerts(first)).toEqual([]);
});

it("replanificar desde el otro incidente no duplica el borrador", () => {
  const { actions, added } = addProposals([], [alert()], 10);
  expect(added).toHaveLength(1);
  const reversed = alerts({ ...second, nearby: [first] });
  expect(reversed).toEqual([alert()]);
  expect(addProposals(actions, reversed, 11)).toEqual({ actions, added: [] });
});
