import type { IncidentType, RiskTag } from "@/lib/types";

const KEEP_PHONE_AVAILABLE = "Mantenga el teléfono disponible por si el 112 le devuelve la llamada.";
const FOLLOW_EMERGENCY_SERVICES = "Aléjese del peligro y siga las indicaciones de los servicios de emergencia.";

type AdviceRule = { risk: RiskTag; instruction: string };
type AdviceEntry = { base: readonly [string, string?]; risks?: readonly AdviceRule[] };

// Guía local para el operador. Ninguna frase pasa al plan de envíos ni se genera a partir de texto libre.
const ADVICE: Record<IncidentType, AdviceEntry> = {
  inundacion_vehiculo: {
    base: ["No entre a pie ni en vehículo en zonas inundadas.", "No cruce pasos inferiores inundados."],
    risks: [{ risk: "agua_subiendo", instruction: "Si el agua sube y sigue dentro del vehículo, suba al techo si puede hacerlo sin meterse en la corriente." }],
  },
  inundacion_vivienda: {
    base: ["Suba a una planta alta sin atravesar el agua.", "No baje a sótanos ni garajes."],
  },
  garaje_inundado: {
    base: ["Si está dentro del garaje, salga a pie hacia una planta superior, sin usar el vehículo ni el ascensor, si puede hacerlo sin atravesar la corriente.", "No baje al garaje ni intente sacar el vehículo."],
  },
  arbol_caido: { base: ["Manténgase lejos del árbol y de las ramas inestables.", "No intente retirar el árbol ni corte el tráfico por su cuenta."] },
  semaforos: { base: ["Si conduce, reduzca la velocidad y siga la señalización y las indicaciones de los agentes.", "No entre en el cruce si no puede hacerlo con seguridad."] },
  medica: {
    base: ["Siga las indicaciones del personal sanitario."],
    risks: [{ risk: "inconsciente", instruction: "Si puede acercarse sin peligro, compruebe si la persona respira con normalidad e informe de inmediato al 112." }],
  },
  incendio: { base: ["Salga por una ruta segura sin atravesar humo ni usar el ascensor.", "Si no puede salir, cierre la puerta y comunique al 112 dónde se encuentra."] },
  accidente: { base: ["No se exponga al tráfico para acercarse al accidente.", "No mueva a una persona herida salvo que exista peligro inmediato."] },
  ascensor: { base: ["Use el botón de alarma del ascensor.", "No fuerce las puertas ni intente salir por su cuenta."] },
  delito: { base: ["Si puede hacerlo sin exponerse, vaya a un lugar seguro.", "No se enfrente a nadie ni persiga a quien se aleje."] },
  otro: { base: [FOLLOW_EMERGENCY_SERVICES] },
};

const ELECTRICAL_RISK = "No toque cables caídos ni objetos en contacto con ellos.";

/** Dos a cuatro instrucciones fijas, con el riesgo inmediato antes de las indicaciones generales. */
export function adviceFor({ type, risks }: { type: IncidentType; risks: readonly RiskTag[] }): string[] {
  const entry = ADVICE[type] ?? ADVICE.otro;
  const [first, second] = entry.base;
  const electrical = risks.includes("cables_electricos") ? ELECTRICAL_RISK : undefined;
  const specific = entry.risks?.find(({ risk }) => risks.includes(risk))?.instruction;
  const secondary = electrical && specific ? undefined : second;
  return [electrical, first, specific, secondary, KEEP_PHONE_AVAILABLE].filter((line): line is string => line !== undefined);
}
