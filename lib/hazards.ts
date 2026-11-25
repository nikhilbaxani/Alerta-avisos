/**
 * Peligros en la vía (X17, SIMULACIÓN): conocimiento cruzado entre incidentes. Puro: sin React, sin
 * servidor y sin red. Solo lee campos ESTRUCTURADOS de la extracción (`incident_type`, `risks` y, para
 * elegir entre dos rótulos fijos, `keywords`) y la posición AML; nunca la transcripción ni el texto libre.
 * Solo avisa al operador: no cambia rutas, no asigna ni envía nada.
 */
import type { Aml, Extraction } from "@/lib/types";
import type { LatLng, Unit } from "@/lib/units";
import { SIMULATION_LABEL, formatDistance } from "@/lib/units";

export type HazardKind = "agua_en_via" | "via_cortada" | "cables_electricos";

export interface Hazard {
  /** `${incidentId}|${kind}`. */
  id: string;
  /** Incidente que lo ha revelado. */
  incidentId: string;
  /** Llamada con la posición más precisa de las que lo indican (de ahí sale `position`). */
  callId: string;
  callIds: string[];
  kind: HazardKind;
  /** Rótulo en castellano, sin artículo: «paso inferior inundado», «vía cortada»… */
  label: string;
  /** Con artículo, para frases: «el paso inferior inundado». */
  phrase: string;
  position: LatLng;
  /** Su incidente está solucionado: ya no avisa. */
  resolved: boolean;
}

export interface HazardIncident {
  id: string;
  callIds: readonly string[];
  resolved?: boolean;
}

export interface HazardCall {
  id: string;
  aml: Aml;
  extraction: Pick<Extraction, "incident_type" | "risks" | "keywords">;
}

export interface UnitHazardWarning {
  unitId: string;
  hazardId: string;
  /** Incidente al que va la unidad. */
  incidentId: string;
  /** Incidente que ha revelado el peligro (siempre otro distinto del destino). */
  hazardIncidentId: string;
  kind: HazardKind;
  /** Metros del peligro al tramo que le queda a la unidad (línea recta). */
  distance: number;
  /** Texto en castellano listo para pintar. */
  text: string;
}

/** Umbral por defecto (metros) entre el peligro y el tramo que le queda a la unidad. Ver DECISIONES (X17). */
export const HAZARD_THRESHOLD_M = 400;

export const HAZARD_KIND_LABELS: Record<HazardKind, string> = {
  agua_en_via: "Agua en la vía",
  via_cortada: "Vía cortada",
  cables_electricos: "Cables eléctricos en el suelo",
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

const UNDERPASS = ["paso inferior", "tunel", "subterraneo"];
const isUnderpass = (keywords: readonly string[]) => keywords.some((k) => UNDERPASS.some((u) => norm(k).includes(u)));

/** Peligros en la vía que indica una llamada, con su rótulo. Solo campos estructurados. */
export function callHazards(e: HazardCall["extraction"]): { kind: HazardKind; label: string; phrase: string }[] {
  const out: { kind: HazardKind; label: string; phrase: string }[] = [];
  const risks = new Set(e.risks);
  // «Agua subiendo» solo es peligro en la vía si el incidente es un vehículo atrapado por el agua (está en
  // una calzada); en una vivienda o un garaje el agua no corta el paso de las unidades.
  if (risks.has("agua_subiendo") && e.incident_type === "inundacion_vehiculo") {
    out.push(
      isUnderpass(e.keywords)
        ? { kind: "agua_en_via", label: "paso inferior inundado", phrase: "el paso inferior inundado" }
        : { kind: "agua_en_via", label: "vía inundada", phrase: "la vía inundada" },
    );
  }
  if (e.incident_type === "arbol_caido") out.push({ kind: "via_cortada", label: "árbol caído en la vía", phrase: "el árbol caído en la vía" });
  else if (risks.has("via_bloqueada")) out.push({ kind: "via_cortada", label: "vía cortada", phrase: "la vía cortada" });
  if (risks.has("cables_electricos")) out.push({ kind: "cables_electricos", label: "cables eléctricos en el suelo", phrase: "los cables eléctricos en el suelo" });
  return out;
}

/**
 * Peligros en la vía de los incidentes (abiertos y solucionados), uno por incidente y tipo. Posición:
 * la AML más precisa de las llamadas que lo indican. Rótulo: el de esa misma llamada.
 */
export function hazardsFrom(incidents: readonly HazardIncident[], calls: Readonly<Record<string, HazardCall>>): Hazard[] {
  const out: Hazard[] = [];
  for (const inc of incidents) {
    const found = new Map<HazardKind, { call: HazardCall; label: string; phrase: string; callIds: string[] }>();
    for (const id of inc.callIds) {
      const call = calls[id];
      if (!call) continue;
      for (const h of callHazards(call.extraction)) {
        const prev = found.get(h.kind);
        if (!prev) found.set(h.kind, { call, label: h.label, phrase: h.phrase, callIds: [id] });
        else {
          prev.callIds.push(id);
          if (call.aml.acc < prev.call.aml.acc) Object.assign(prev, { call, label: h.label, phrase: h.phrase });
        }
      }
    }
    for (const [kind, f] of found) {
      out.push({
        id: `${inc.id}|${kind}`,
        incidentId: inc.id,
        callId: f.call.id,
        callIds: f.callIds,
        kind,
        label: f.label,
        phrase: f.phrase,
        position: { lat: f.call.aml.lat, lng: f.call.aml.lng },
        resolved: !!inc.resolved,
      });
    }
  }
  return out;
}

/** Distancia en metros de `p` al segmento `a`–`b` (proyección local equirrectangular, suficiente a escala de ciudad). */
export function distanceToSegment(p: LatLng, a: LatLng, b: LatLng): number {
  const R = 6371000;
  const k = Math.cos((p.lat * Math.PI) / 180);
  const xy = (q: LatLng) => ({ x: ((q.lng - p.lng) * Math.PI * R * k) / 180, y: ((q.lat - p.lat) * Math.PI * R) / 180 });
  const A = xy(a);
  const B = xy(b);
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(A.x * dx + A.y * dy) / len2));
  return Math.hypot(A.x + t * dx, A.y + t * dy);
}

/**
 * Avisos al operador: la unidad que va hacia un incidente pasaría (en línea recta, por el tramo que le
 * queda) a menos de `threshold` metros de un peligro de OTRO incidente sin solucionar. Los peligros del
 * propio incidente de destino no avisan (son el destino). Recibe las unidades ya en su posición actual
 * (`unitsAt`). No decide nada: solo texto.
 */
export function unitHazardWarnings(units: readonly Unit[], hazards: readonly Hazard[], threshold = HAZARD_THRESHOLD_M): UnitHazardWarning[] {
  const out: UnitHazardWarning[] = [];
  for (const u of units) {
    if (!u.incidentId || !u.target || u.status === "libre" || u.status === "en_el_lugar") continue;
    for (const h of hazards) {
      if (h.resolved || h.incidentId === u.incidentId) continue;
      const distance = distanceToSegment(h.position, u.position, u.target);
      if (distance > threshold) continue;
      out.push({
        unitId: u.id,
        hazardId: h.id,
        incidentId: u.incidentId,
        hazardIncidentId: h.incidentId,
        kind: h.kind,
        distance,
        text: `La unidad ${u.id} pasaría por ${h.phrase} de ${h.incidentId}: a ${formatDistance(distance)} de su trayecto en línea recta ${SIMULATION_LABEL}`,
      });
    }
  }
  return out.sort((a, b) => a.unitId.localeCompare(b.unitId) || a.distance - b.distance);
}
