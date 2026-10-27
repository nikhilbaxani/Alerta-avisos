/** Proyección equirectangular de la bahía de Málaga (MEMORIA §12). Sin teselas. */
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

const pt = ([lng, lat]: LL) => {
  const p = project(lat, lng);
  return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
};
export const path = (pts: LL[]) => pts.map(pt).join(" ");

export const COAST: LL[] = [
  [-4.53, 36.59], [-4.495, 36.615], [-4.475, 36.635], [-4.445, 36.665], [-4.435, 36.698],
  [-4.418, 36.71], [-4.408, 36.718], [-4.395, 36.719], [-4.365, 36.718], [-4.31, 36.716],
  [-4.28, 36.715], [-4.24, 36.725],
];
export const RIVERS: { name: string; pts: LL[] }[] = [
  { name: "Guadalhorce", pts: [[-4.6, 36.7], [-4.53, 36.695], [-4.49, 36.685], [-4.445, 36.665]] },
  { name: "Campanillas", pts: [[-4.56, 36.75], [-4.535, 36.7]] },
  { name: "Guadalmedina", pts: [[-4.43, 36.77], [-4.423, 36.712]] },
];
export const PLACES: { name: string; at: LL }[] = [
  { name: "Málaga centro", at: [-4.425, 36.738] },
  { name: "Campanillas", at: [-4.545, 36.742] },
  { name: "Torremolinos", at: [-4.56, 36.628] },
  { name: "Aeropuerto", at: [-4.49, 36.672] },
  { name: "Rincón de la Victoria", at: [-4.335, 36.737] },
  { name: "El Palo", at: [-4.37, 36.735] },
];
/** Metros por unidad del viewBox (para la barra de escala). */
export const METERS_PER_UNIT = ((LNG1 - LNG0) * 111_320 * Math.cos((36.7 * Math.PI) / 180)) / MAP_W;
