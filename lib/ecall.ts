/**
 * eCall (X13): aviso automático o manual de un vehículo con datos estructurados y sin voz.
 *
 * Puro y sin red. Nada de lo que pasa por aquí es texto de una persona: el texto legible que se enseña
 * en la consola (`ecallText`) se genera solo a partir de los datos del vehículo. Una eCall nunca pasa
 * por la transcripción (STT) ni por el LLM: se usa su extracción de referencia (`mock`), escrita a
 * partir de esos datos (DECISIONES X13).
 */
import type { Aml, CallChannel, ECallData } from "@/lib/types";

export const isEcall = (c: { channel?: CallChannel } | undefined | null): boolean => c?.channel === "ecall";

const POINTS = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"] as const;
const POINT_NAMES: Record<(typeof POINTS)[number], string> = {
  N: "norte",
  NE: "nordeste",
  E: "este",
  SE: "sudeste",
  S: "sur",
  SO: "sudoeste",
  O: "oeste",
  NO: "noroeste",
};

/** Rumbo en grados → punto cardinal de 8 («N», «SO»…); acepta cualquier número finito. */
export function headingPoint(deg: number): (typeof POINTS)[number] {
  const d = ((deg % 360) + 360) % 360;
  return POINTS[Math.round(d / 45) % 8];
}

/** «sur (180°)» */
export function headingLabel(deg: number): string {
  const d = Math.round(((deg % 360) + 360) % 360);
  return `${POINT_NAMES[headingPoint(deg)]} (${d}°)`;
}

export const activationLabel = (a: ECallData["activation"]): string => (a === "automatic" ? "automática" : "manual");

/** «36,71600, -4,54800 · ±10 m» */
export function positionLabel(aml: Aml): string {
  const f = (n: number) => n.toFixed(5).replace(".", ",");
  return `${f(aml.lat)}, ${f(aml.lng)} · ±${Math.round(aml.acc)} m`;
}

/** Líneas de datos para la consola (rótulo y valor, en castellano). */
export function ecallFields(data: ECallData, aml: Aml): { label: string; value: string }[] {
  return [
    { label: "Activación", value: activationLabel(data.activation) },
    { label: "Ocupantes", value: String(data.occupants) },
    { label: "Dirección de marcha", value: headingLabel(data.heading) },
    { label: "Vehículo", value: data.vehicle },
    { label: "Posición", value: positionLabel(aml) },
  ];
}

/** Representación legible de los datos (hace de `transcript`: no hay voz que transcribir). */
export function ecallText(data: ECallData, aml: Aml): string {
  const occ = `${data.occupants} ${data.occupants === 1 ? "ocupante" : "ocupantes"}`;
  return `eCall ${activationLabel(data.activation)} · ${data.vehicle} · ${occ} · rumbo ${headingLabel(data.heading)} · posición ${positionLabel(aml)}. Mensaje de datos del vehículo, sin voz.`;
}
