import { describe, expect, it } from "vitest";
import {
  FLEET,
  UNIT_DISPATCH_DELAY_S,
  UNIT_SPEED_MPS,
  assignUnit,
  formatDistance,
  initialUnits,
  nearestFree,
  releaseIncident,
  unitAt,
} from "@/lib/units";
import { haversine } from "@/lib/cluster";
import { ACTION_POLICY, RESOURCE_SERVICES } from "@/lib/actions";
import { MAP_H, MAP_W, project } from "@/lib/map";
import { replayTo } from "@/lib/replay";
import { actionUnit, consoleProposals, consoleUnits, reducer } from "@/lib/useConsole";
import type { ConsoleState } from "@/lib/useConsole";

const A = { lat: 36.716, lng: -4.548 }; // Campanillas (incidente A de la DANA)

describe("parque simulado", () => {
  it("cubre los cuatro servicios de proponer_recursos, con bases en el mapa rotuladas como simulación", () => {
    for (const s of RESOURCE_SERVICES) expect(FLEET.filter((u) => u.service === s).length).toBeGreaterThanOrEqual(1);
    expect(new Set(FLEET.map((u) => u.id)).size).toBe(FLEET.length);
    for (const u of FLEET) {
      expect(u.base.name).toMatch(/\(simulación\)$/);
      expect(u.status).toBe("libre");
      const p = project(u.base.lat, u.base.lng);
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(MAP_W);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(MAP_H);
    }
  });

  it("la política de recursos no cambia: la aprueba el operador", () => {
    expect(ACTION_POLICY.proponer_recursos).toBe("operador");
  });

  it("formatea distancias en castellano", () => {
    expect(formatDistance(3420)).toBe("3,4 km");
    expect(formatDistance(847)).toBe("850 m");
  });
});

describe("asignación", () => {
  it("elige la unidad libre más cercana del servicio (haversine)", () => {
    const near = nearestFree(initialUnits(), "bomberos", A)!;
    const others = FLEET.filter((u) => u.service === "bomberos").map((u) => haversine(u.base, A));
    expect(near.distance).toBe(Math.min(...others));
    expect(near.unit.id).toBe("B-2");
  });

  it("si la más cercana está ocupada, la siguiente; si no hay libres, null", () => {
    let units = initialUnits();
    units = assignUnit(units, "B-2", "INC-01", A, 10);
    expect(nearestFree(units, "bomberos", A)!.unit.id).not.toBe("B-2");
    for (const u of units.filter((x) => x.service === "bomberos")) units = assignUnit(units, u.id, "INC-01", A, 10);
    expect(nearestFree(units, "bomberos", A)).toBeNull();
    expect(nearestFree(units, "samu_061", A)).not.toBeNull();
  });

  it("asignar una unidad ocupada no la cambia", () => {
    const once = assignUnit(initialUnits(), "B-2", "INC-01", A, 10);
    const twice = assignUnit(once, "B-2", "INC-02", { lat: 36.7, lng: -4.4 }, 20);
    expect(twice.find((u) => u.id === "B-2")!.incidentId).toBe("INC-01");
  });

  it("avanza con el reloj: asignada → en camino → en el lugar", () => {
    const u = assignUnit(initialUnits(), "B-2", "INC-01", A, 100).find((x) => x.id === "B-2")!;
    expect(unitAt(u, 101).status).toBe("asignada");
    expect(unitAt(u, 101).position).toEqual({ lat: u.base.lat, lng: u.base.lng });
    const travel = u.distance! / UNIT_SPEED_MPS;
    const mid = unitAt(u, 100 + UNIT_DISPATCH_DELAY_S + travel / 2);
    expect(mid.status).toBe("en_camino");
    expect(haversine(mid.position, A)).toBeCloseTo(u.distance! / 2, -1);
    const end = unitAt(u, 100 + UNIT_DISPATCH_DELAY_S + travel + 1);
    expect(end.status).toBe("en_el_lugar");
    expect(end.position).toEqual(A);
  });

  it("al solucionar el incidente sus unidades vuelven a libres y a su base; las demás no cambian", () => {
    let units = assignUnit(initialUnits(), "B-2", "INC-01", A, 10);
    units = assignUnit(units, "S-1", "INC-02", A, 10);
    units = releaseIncident(units, "INC-01");
    const b2 = units.find((u) => u.id === "B-2")!;
    expect(b2).toMatchObject({ status: "libre", incidentId: null, target: null, assignedAt: null });
    expect(b2.position).toEqual({ lat: b2.base.lat, lng: b2.base.lng });
    expect(units.find((u) => u.id === "S-1")!.incidentId).toBe("INC-02");
  });
});

describe("consola (DANA)", () => {
  const at = (t: number): ConsoleState => replayTo("dana-malaga", t, { F1: false, B2: true });
  const key = (s: ConsoleState) => `${s.engine.assignment.A1}|proponer_recursos|bomberos`;
  const tick = (s: ConsoleState, dt: number) => reducer(s, { type: "tick", dt });

  it("antes de aprobar no se asigna nada, pero la propuesta indica la unidad libre más cercana", () => {
    const s = at(40);
    const act = s.actions.find((x) => x.key === key(s))!;
    expect(act.status).toBe("propuesta");
    expect(consoleUnits(s).every((u) => u.status === "libre")).toBe(true);
    const info = actionUnit(s, act)!;
    expect(info.kind).toBe("propuesta");
    expect(info.unit!.id).toBe("B-2");
    expect(info.text).toMatch(/^Unidad libre más cercana: B-2 a \d+,\d km \(simulación\)$/);
  });

  it("aprobar los bomberos de INC-01 asigna B-2, lo registra y la unidad avanza hacia A", () => {
    let s = at(40);
    const inc = s.engine.assignment.A1;
    s = reducer(s, { type: "actionApprove", key: key(s) });
    expect(s.unitAssignments[key(s)]).toMatchObject({ unitId: "B-2", incidentId: inc, service: "bomberos" });
    expect(s.audit.at(-1)!.detail).toMatch(/Unidad asignada: B-2 a \d+,\d km \(simulación\)\./);
    const b2 = () => consoleUnits(s).find((u) => u.id === "B-2")!;
    expect(b2()).toMatchObject({ status: "asignada", incidentId: inc });
    s = tick(s, UNIT_DISPATCH_DELAY_S + 10);
    expect(b2().status).toBe("en_camino");
    expect(actionUnit(s, s.actions.find((x) => x.key === key(s))!)!.text).toMatch(/^Unidad asignada: B-2 a .* · en camino \(simulación\)$/);
    s = tick(s, 1000);
    // El reloj se para al final del escenario; con el reloj de prueba se adelanta a mano.
    s = { ...s, clock: s.clock + 1000 };
    expect(b2().status).toBe("en_el_lugar");
    // Volver a planificar no reasigna ni duplica.
    s = reducer(s, { type: "plan", proposals: consoleProposals(s) });
    expect(consoleUnits(s).filter((u) => u.incidentId === inc)).toHaveLength(1);
  });

  it("al solucionar INC-01 la unidad vuelve a libre", () => {
    let s = at(40);
    const inc = s.engine.assignment.A1;
    s = reducer(s, { type: "actionApprove", key: key(s) });
    s = reducer(s, { type: "resolve", incidentId: inc });
    const b2 = consoleUnits(s).find((u) => u.id === "B-2")!;
    expect(b2).toMatchObject({ status: "libre", incidentId: null });
  });

  it("sin bomberos libres, la propuesta y la aprobación lo dicen", () => {
    let s = at(40);
    const busy = s.units.map((u) => (u.service === "bomberos" ? { ...u, status: "asignada" as const, incidentId: "OTRO" } : u));
    s = { ...s, units: busy };
    const act = s.actions.find((x) => x.key === key(s))!;
    expect(actionUnit(s, act)).toMatchObject({ kind: "sin_libre", text: "Sin unidades libres de Bomberos (simulación)" });
    s = reducer(s, { type: "actionApprove", key: key(s) });
    expect(s.unitAssignments[key(s)].unitId).toBeNull();
    expect(s.audit.at(-1)!.detail).toContain("No hay unidad libre de Bomberos (simulación).");
    expect(actionUnit(s, s.actions.find((x) => x.key === key(s))!)!.kind).toBe("sin_libre");
  });

  it("descartar no asigna unidad", () => {
    let s = at(40);
    s = reducer(s, { type: "actionDiscard", key: key(s) });
    expect(Object.keys(s.unitAssignments)).toHaveLength(0);
    expect(consoleUnits(s).every((u) => u.status === "libre")).toBe(true);
    expect(actionUnit(s, s.actions.find((x) => x.key === key(s))!)).toBeNull();
  });
});
