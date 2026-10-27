import type {
  Aml,
  Candidate,
  Decision,
  Extraction,
  IncidentSnapshot,
  IncidentType,
  RiskTag,
} from "@/lib/types";

export const MERGE_THRESHOLD = 0.78;
export const ASK_THRESHOLD = 0.45;
export const WEIGHTS = { spatial: 0.45, type: 0.3, text: 0.25 } as const;
/** Distancia a la que el componente geográfico llega a 0. */
export const GEO_RADIUS_M = 800;
export const LOC_FACTOR = 0.9;
const FLOOD_FAMILY: IncidentType[] = ["inundacion_vehiculo", "inundacion_vivienda", "garaje_inundado"];
/** Riesgos que, si aparecen en un duplicado, son información nueva. */
export const NEW_INFO_RISKS: RiskTag[] = [
  "menor",
  "sin_respuesta",
  "inconsciente",
  "herido",
  "cables_electricos",
  "atrapados",
  "dolor_pecho",
];

const STOPWORDS = new Set([
  "de", "del", "la", "el", "los", "las", "en", "y", "a", "al", "un", "una", "con", "por", "para",
  "calle", "avenida", "av", "paseo", "plaza", "cerca", "junto", "numero",
]);

export function haversine(a: Pick<Aml, "lat" | "lng">, b: Pick<Aml, "lat" | "lng">): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Minúsculas, sin tildes ni signos, sin palabras vacías y con raíz de 6 letras. */
export function tokens(items: string | string[]): Set<string> {
  const text = Array.isArray(items) ? items.join(" ") : items;
  const out = new Set<string>();
  const words = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/);
  for (const w of words) {
    if (!w || STOPWORDS.has(w)) continue;
    out.add(w.slice(0, 6));
  }
  return out;
}

/** |A∩B| / min(|A|,|B|); 0 si alguno está vacío. */
export function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n / Math.min(a.size, b.size);
}

function typeScore(a: IncidentType, b: IncidentType): number {
  if (a === b) return 1;
  if (FLOOD_FAMILY.includes(a) && FLOOD_FAMILY.includes(b)) return 0.4;
  return 0;
}

export interface CallInput {
  aml: Aml;
  extraction: Pick<Extraction, "incident_type" | "location_text" | "keywords">;
}

export function scoreCandidates(call: CallInput, incidents: IncidentSnapshot[]): Candidate[] {
  const callKw = tokens(call.extraction.keywords);
  const callLoc = tokens(call.extraction.location_text);
  const out: Candidate[] = [];
  for (const inc of incidents) {
    const s_t = typeScore(call.extraction.incident_type, inc.type);
    const distance = inc.points.length
      ? Math.min(...inc.points.map((p) => haversine(call.aml, p)))
      : Infinity;
    const dEff = Math.max(0, distance - call.aml.acc / 2);
    const geo = Number.isFinite(distance) ? Math.max(0, 1 - dEff / GEO_RADIUS_M) : 0;
    const incLoc = tokens(inc.locations?.length ? inc.locations : inc.keywords);
    const loc = overlap(callLoc, incLoc) * LOC_FACTOR;
    const s_d = Math.max(geo, loc);
    const s_x = overlap(callKw, tokens(inc.keywords));
    const score =
      s_t === 0 ? 0 : WEIGHTS.spatial * s_d + WEIGHTS.type * s_t + WEIGHTS.text * s_x;
    out.push({
      incidentId: inc.id,
      score: +score.toFixed(4),
      distance: Number.isFinite(distance) ? Math.round(distance) : -1,
      parts: { spatial: +s_d.toFixed(4), type: s_t, text: +s_x.toFixed(4) },
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

function sharedKeywords(call: CallInput, inc: IncidentSnapshot): string[] {
  const incTok = tokens([...inc.keywords, ...(inc.locations ?? [])]);
  return call.extraction.keywords.filter((k) => {
    const t = [...tokens(k)];
    return t.length > 0 && t.every((x) => incTok.has(x));
  });
}

const fmtScore = (n: number) => n.toFixed(2).replace(".", ",");

export function decide(call: CallInput, incidents: IncidentSnapshot[]): Decision {
  const candidates = scoreCandidates(call, incidents);
  const best = candidates[0];
  if (!best || best.score < ASK_THRESHOLD) {
    return {
      action: "new",
      score: best?.score ?? 0,
      candidates,
      reason: best
        ? `Ningún incidente abierto se parece lo bastante (mejor: ${best.incidentId}, ${fmtScore(best.score)}). Incidente nuevo.`
        : "Primer incidente de esta zona. Incidente nuevo.",
    };
  }
  const inc = incidents.find((i) => i.id === best.incidentId)!;
  const sameType = best.parts.type === 1 ? "mismo tipo" : best.parts.type > 0 ? "tipo de la misma familia" : "tipo distinto";
  const shared = sharedKeywords(call, inc);
  const where =
    best.distance >= 0 ? `A ${best.distance} m de ${inc.id}` : `Sobre ${inc.id}`;
  const addr = best.parts.spatial > 0 && best.distance > GEO_RADIUS_M ? ", misma dirección mencionada" : "";
  const coinc = shared.length ? `, coinciden: ${shared.slice(0, 4).join(", ")}` : "";
  const base = `${where}, ${sameType}${addr}${coinc}`;
  if (best.score >= MERGE_THRESHOLD) {
    return { action: "merge", incidentId: inc.id, score: best.score, candidates, reason: base };
  }
  return {
    action: "ask",
    incidentId: inc.id,
    score: best.score,
    candidates,
    reason: `${base}. Puntuación ${fmtScore(best.score)}: puede ser el mismo incidente u otro distinto. Decide el operador.`,
  };
}

/** Riesgos de la llamada que el incidente aún no tenía y que merecen aviso. */
export function newInfo(callRisks: RiskTag[], incidentRisks: RiskTag[]): RiskTag[] {
  return callRisks.filter((r) => NEW_INFO_RISKS.includes(r) && !incidentRisks.includes(r));
}
