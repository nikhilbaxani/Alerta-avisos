/**
 * Parque de unidades SIMULADO (X16). Bases, unidades y velocidad son inventadas para la demo: no son
 * los parques, ambulancias ni comisarías reales de Málaga ni sus tiempos de llegada. Puro: sin React,
 * sin servidor y sin red. La unidad solo se asigna cuando el operador aprueba `proponer_recursos`.
 */
import { haversine } from "@/lib/cluster";
import type { ResourceService } from "@/lib/actions";

export type UnitService = ResourceService;
export type UnitStatus = "libre" | "asignada" | "en_camino" | "en_el_lugar";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface UnitBase extends LatLng {
  /** Rótulo para el operador; siempre acaba en «(simulación)». */
  name: string;
}

export interface Unit {
  id: string;
  service: UnitService;
  label: string;
  base: UnitBase;
  status: UnitStatus;
  incidentId: string | null;
  /** Segundo del escenario en que el operador aprobó los recursos. */
  assignedAt: number | null;
  /** Posición actual (en el estado guardado, la de la base o la del momento de asignar). */
  position: LatLng;
  /** Punto del incidente hacia el que va (centro de sus posiciones al asignar). */
  target: LatLng | null;
  /** Metros en línea recta de la base al incidente al asignar. */
  distance: number | null;
  /** Clave de la acción `proponer_recursos` que la asignó. */
  actionKey: string | null;
}

export const SIMULATION_LABEL = "(simulación)";

/** Segundos de escenario entre la aprobación y la salida de la base (estado «asignada»). Simulación. */
export const UNIT_DISPATCH_DELAY_S = 5;
/**
 * Velocidad simulada constante en línea recta, en metros por segundo de escenario. Está acelerada para
 * que el avance se vea en una demo de 3 minutos: no es una estimación de tiempos reales de llegada.
 */
export const UNIT_SPEED_MPS = 50;

export const UNIT_STATUS_LABELS: Record<UnitStatus, string> = {
  libre: "Libre",
  asignada: "Asignada",
  en_camino: "En camino",
  en_el_lugar: "En el lugar",
};

/** `proponer_recursos` usa los mismos cuatro servicios que el parque: la correspondencia es directa. */
export const unitServiceOf = (s: ResourceService): UnitService => s;

const base = (name: string, lat: number, lng: number): UnitBase => ({ name: `${name} ${SIMULATION_LABEL}`, lat, lng });

const BASES = {
  bomberosCentro: base("Parque de bomberos Centro", 36.7205, -4.4365),
  bomberosOeste: base("Parque de bomberos Oeste", 36.7015, -4.4755),
  bomberosEste: base("Parque de bomberos Este", 36.7235, -4.3655),
  samuCentro: base("Base SAMU 061 Centro", 36.7165, -4.4325),
  samuOeste: base("Base SAMU 061 Oeste", 36.7105, -4.5005),
  samuEste: base("Base SAMU 061 Este", 36.7215, -4.3405),
  plCentro: base("Policía local Centro", 36.7135, -4.4455),
  plCampanillas: base("Policía local Campanillas", 36.7285, -4.5395),
  pnCentro: base("Comisaría Centro", 36.7195, -4.4215),
  pnOeste: base("Comisaría Oeste", 36.6905, -4.4605),
} satisfies Record<string, UnitBase>;

const unit = (id: string, service: UnitService, label: string, b: UnitBase): Unit => ({
  id,
  service,
  label,
  base: b,
  status: "libre",
  incidentId: null,
  assignedAt: null,
  position: { lat: b.lat, lng: b.lng },
  target: null,
  distance: null,
  actionKey: null,
});

/** Flota simulada, toda libre en su base. */
export const FLEET: readonly Unit[] = [
  unit("B-1", "bomberos", "Bomberos 1", BASES.bomberosCentro),
  unit("B-2", "bomberos", "Bomberos 2", BASES.bomberosOeste),
  unit("B-3", "bomberos", "Bomberos 3", BASES.bomberosEste),
  unit("S-1", "samu_061", "SAMU 061 1", BASES.samuCentro),
  unit("S-2", "samu_061", "SAMU 061 2", BASES.samuOeste),
  unit("S-3", "samu_061", "SAMU 061 3", BASES.samuEste),
  unit("PL-1", "policia_local", "Policía local 1", BASES.plCentro),
  unit("PL-2", "policia_local", "Policía local 2", BASES.plCampanillas),
  unit("PN-1", "policia_nacional", "Policía Nacional 1", BASES.pnCentro),
  unit("PN-2", "policia_nacional", "Policía Nacional 2", BASES.pnOeste),
];

export const initialUnits = (): Unit[] => FLEET.map((u) => ({ ...u, position: { ...u.position } }));

/** Centro de las posiciones de un incidente. */
export function centerOf(points: readonly LatLng[]): LatLng | null {
  if (!points.length) return null;
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return { lat: mean(points.map((p) => p.lat)), lng: mean(points.map((p) => p.lng)) };
}

/** Unidad libre más cercana del servicio (haversine desde su base) o null si no hay ninguna libre. */
export function nearestFree(units: readonly Unit[], service: UnitService, point: LatLng): { unit: Unit; distance: number } | null {
  let best: { unit: Unit; distance: number } | null = null;
  for (const u of units) {
    if (u.service !== service || u.status !== "libre") continue;
    const distance = haversine(u.base, point);
    if (!best || distance < best.distance) best = { unit: u, distance };
  }
  return best;
}

/** Asigna la unidad al incidente (solo si está libre). */
export function assignUnit(units: readonly Unit[], unitId: string, incidentId: string, target: LatLng, at: number, actionKey: string | null = null): Unit[] {
  return units.map((u) =>
    u.id === unitId && u.status === "libre"
      ? { ...u, status: "asignada", incidentId, assignedAt: at, target: { ...target }, distance: haversine(u.base, target), actionKey }
      : u,
  );
}

/** Estado y posición de la unidad en el segundo `clock`: asignada → en camino → en el lugar. */
export function unitAt(u: Unit, clock: number): Unit {
  if (u.status === "libre" || !u.target || u.assignedAt === null) return u;
  const travelled = Math.max(0, clock - u.assignedAt - UNIT_DISPATCH_DELAY_S) * UNIT_SPEED_MPS;
  const total = u.distance ?? haversine(u.base, u.target);
  if (clock - u.assignedAt < UNIT_DISPATCH_DELAY_S) return { ...u, status: "asignada", position: { lat: u.base.lat, lng: u.base.lng } };
  if (travelled >= total) return { ...u, status: "en_el_lugar", position: { ...u.target } };
  const f = total > 0 ? travelled / total : 1;
  return {
    ...u,
    status: "en_camino",
    position: { lat: u.base.lat + (u.target.lat - u.base.lat) * f, lng: u.base.lng + (u.target.lng - u.base.lng) * f },
  };
}

export const unitsAt = (units: readonly Unit[], clock: number): Unit[] => units.map((u) => unitAt(u, clock));

/** Al solucionar el incidente, sus unidades vuelven a estar libres en su base. */
export function releaseIncident(units: readonly Unit[], incidentId: string): Unit[] {
  return units.map((u) => (u.incidentId === incidentId ? FLEET.find((f) => f.id === u.id) ?? u : u));
}

/** «850 m», «3,4 km». */
export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(1).replace(".", ",")} km`;
}
