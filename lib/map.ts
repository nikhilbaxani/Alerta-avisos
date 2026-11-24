/**
 * Proyección equirectangular de la bahía de Málaga (MEMORIA §12).
 * La ortofoto de detalle `assets/map/malaga-hi.webp` (PNOA, IGN) cubre exactamente este recuadro: lon −4,60…−4,24,
 * lat 36,59…36,77, así que ocupa el viewBox 0..MAP_W × 0..MAP_H. Sin teselas ni red en tiempo de ejecución.
 */
export const MAP_W = 1000;
export const MAP_H = 623;
const LNG0 = -4.6;
const LNG1 = -4.24;
const LAT0 = 36.59;
const LAT1 = 36.77;

export type LL = [lng: number, lat: number];

export function project(lat: number, lng: number): { x: number; y: number } {
  return {
    x: ((lng - LNG0) / (LNG1 - LNG0)) * MAP_W,
    y: ((LAT1 - lat) / (LAT1 - LAT0)) * MAP_H,
  };
}

/** Vista general (assets/map/malaga-contexto.webp): entorno más amplio con la bahía incrustada, para no ver bordes al alejar. */
export const CONTEXT = (() => {
  const a = project(36.86, -4.7);
  const b = project(36.5, -4.14);
  return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
})();

/** Rótulos de referencia sobre la ortofoto. */
export const PLACES: { name: string; at: LL }[] = [
  { name: "Málaga centro", at: [-4.421, 36.727] },
  { name: "Campanillas", at: [-4.548, 36.733] },
  { name: "Torremolinos", at: [-4.5, 36.627] },
  { name: "Aeropuerto", at: [-4.492, 36.676] },
  { name: "El Palo", at: [-4.362, 36.727] },
  { name: "Rincón de la Victoria", at: [-4.276, 36.723] },
];

/** Metros por unidad del viewBox (para la barra de escala). */
export const METERS_PER_UNIT = ((LNG1 - LNG0) * 111_320 * Math.cos((36.7 * Math.PI) / 180)) / MAP_W;
