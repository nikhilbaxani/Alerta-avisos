import { expect, it } from "vitest";
import { adviceFor } from "@/lib/advice";
import { INCIDENT_TYPES, RISK_TAGS } from "@/lib/types";

it("S24: indica salir del garaje a pie hacia una planta alta", () => {
  const evacuation = "Si está dentro del garaje, salga a pie hacia una planta superior, sin usar el vehículo ni el ascensor, si puede hacerlo sin atravesar la corriente.";
  expect(adviceFor({ type: "garaje_inundado", risks: ["cables_electricos"] })).toContain(evacuation);
  expect(adviceFor({ type: "garaje_inundado", risks: [] })).toContain(evacuation);
});

it("S24: prioriza los cables sin perder el consejo de subir al techo", () => {
  expect(adviceFor({ type: "inundacion_vehiculo", risks: ["agua_subiendo", "cables_electricos"] })).toEqual([
    "No toque cables caídos ni objetos en contacto con ellos.",
    "No entre a pie ni en vehículo en zonas inundadas.",
    "Si el agua sube y sigue dentro del vehículo, suba al techo si puede hacerlo sin meterse en la corriente.",
    "Mantenga el teléfono disponible por si el 112 le devuelve la llamada.",
  ]);
});

it("S24: conserva de dos a cuatro líneas para cada tipo y riesgo individual", () => {
  for (const type of INCIDENT_TYPES) for (const risk of RISK_TAGS) {
    const advice = adviceFor({ type, risks: [risk] });
    expect(advice.length, `${type}/${risk}`).toBeGreaterThanOrEqual(2);
    expect(advice.length, `${type}/${risk}`).toBeLessThanOrEqual(4);
  }
});

it("S24: llamar al 112 es compatible con dejar el teléfono disponible para su devolución", () => {
  expect(adviceFor({ type: "incendio", risks: [] })).toEqual([
    "Salga por una ruta segura sin atravesar humo ni usar el ascensor.",
    "Si no puede salir, cierre la puerta y comunique al 112 dónde se encuentra.",
    "Mantenga el teléfono disponible por si el 112 le devuelve la llamada.",
  ]);
});
