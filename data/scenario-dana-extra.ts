import { ecallText } from "@/lib/ecall";
import type { Aml, ECallData, ScenarioCall } from "@/lib/types";

/**
 * Llamadas añadidas al escenario de la DANA en la Fase 7 (X13, X15…). `data/scenario-dana-malaga.ts`
 * está protegido y no se edita: `data/scenarios.ts` une estas llamadas al escenario por orden de `t`.
 * Todos los datos son ficticios (simulación).
 *
 *  EC1  eCall manual del propio coche de A (paso inferior de la A-357, Campanillas), justo después
 *       del primer testigo (A1, t=8). Sin voz: solo datos del vehículo. gold "A".
 */

/** Misma base y misma fórmula que el escenario protegido (BASE A). */
const BASE_A = { lat: 36.716, lng: -4.548 };
function nearA(dx: number, dy: number, acc: number): Aml {
  const lat = BASE_A.lat + dy / 111_320;
  const lng = BASE_A.lng + dx / (111_320 * Math.cos((BASE_A.lat * Math.PI) / 180));
  return { lat: +lat.toFixed(6), lng: +lng.toFixed(6), acc };
}

const ec1Aml = nearA(-15, -10, 10);
const ec1Data: ECallData = { activation: "manual", occupants: 3, heading: 225, vehicle: "Turismo" };

export const danaExtra: ScenarioCall[] = [
  {
    id: "EC1",
    t: 14,
    channel: "ecall",
    ecall: ec1Data,
    lang: "es",
    phone: "+34 7•• ••• 051",
    gold: "A",
    aml: ec1Aml,
    transcript: ecallText(ec1Data, ec1Aml),
    // Extracción de referencia escrita a partir de los datos del vehículo, no de una voz (DECISIONES X13).
    mock: {
      language: "es",
      translation_es: null,
      summary_es: "eCall manual de un turismo detenido en el paso inferior de la A-357 con 3 ocupantes; sin voz.",
      incident_type: "inundacion_vehiculo",
      location_text: "Paso inferior A-357, Campanillas",
      keywords: ["eCall", "coche", "paso inferior", "A-357", "ocupantes"],
      risks: [],
      people_at_risk: 3,
      severity: 4,
    },
  },
];
