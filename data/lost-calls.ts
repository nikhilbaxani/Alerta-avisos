import type { Aml, LostCall } from "@/lib/types";

/**
 * Llamadas perdidas de los escenarios (X15): se colgaron antes de que las atendiera un operador.
 * SIMULACIÓN: todos los datos son ficticios. No son llamadas del motor (no tienen `gold`, transcripción
 * ni extracción) y no cambian `npm run eval` ni `npm run eval:apagon`; `data/scenarios.ts` las une a
 * cada escenario en `Scenario.lost`. Solo se sabe lo que da la red (teléfono y AML) y, a veces, una
 * frase breve antes de colgar. Lo que debe salir de cada una (`lib/lostCalls.ts`):
 *
 * DANA
 *  P1  t=58   francés, teléfono nuevo, AML encima del paso inferior de A → probable duplicado de A (SMS de duplicado en francés cuando A tenga recursos)
 *  P3  t=120  castellano, teléfono nuevo, lejos de todo (Churriana)        → desconocida: devolver la llamada
 *  P4  t=170  inglés, teléfono nuevo, lejos de todo (El Palo alto)          → desconocida: devolver la llamada
 *  P2  t=180  castellano, mismo teléfono que A4                             → probable duplicado de A por teléfono (el SMS va a A4)
 *  P5  t=205  castellano, teléfono nuevo, AML en la casa de B               → probable duplicado de B
 * Apagón
 *  P6  t=130  castellano, teléfono nuevo, AML en la residencia de K          → probable duplicado de K
 *  P7  t=150  castellano, teléfono nuevo, lejos de todo                      → desconocida: devolver la llamada
 */

/** Misma fórmula que los escenarios: desplaza `dx` metros al este y `dy` al norte. */
function near(base: { lat: number; lng: number }, dx: number, dy: number, acc: number): Aml {
  const lat = base.lat + dy / 111_320;
  const lng = base.lng + dx / (111_320 * Math.cos((base.lat * Math.PI) / 180));
  return { lat: +lat.toFixed(6), lng: +lng.toFixed(6), acc };
}

/** Bases copiadas de los escenarios (el de la DANA está protegido y no exporta las suyas). */
const DANA_A = { lat: 36.716, lng: -4.548 };
const DANA_B = { lat: 36.7155, lng: -4.429 };
const APAGON_K = { lat: 36.7165, lng: -4.4745 };

export const danaLost: LostCall[] = [
  {
    id: "P1",
    t: 58,
    lang: "fr",
    phone: "+33 6 •• •• •• 77",
    aml: near(DANA_A, 30, -20, 60),
    fragment: "Allô ? Il y a une voiture coincée dans l'eau sous le pont, je…",
    fragment_es: "¿Diga? Hay un coche atrapado en el agua debajo del puente, yo…",
  },
  { id: "P3", t: 120, lang: "es", phone: "+34 6•• ••• 731", aml: { lat: 36.668, lng: -4.492, acc: 80 } },
  {
    id: "P4",
    t: 170,
    lang: "en",
    phone: "+44 7••• ••• 482",
    aml: { lat: 36.735, lng: -4.36, acc: 50 },
    fragment: "Hello? The water is coming into the house, please…",
    fragment_es: "¿Hola? El agua está entrando en la casa, por favor…",
  },
  { id: "P2", t: 180, lang: "es", phone: "+34 6•• ••• 519", aml: near(DANA_A, 55, -80, 30) },
  {
    id: "P5",
    t: 205,
    lang: "es",
    phone: "+34 6•• ••• 590",
    aml: near(DANA_B, -20, 15, 25),
    fragment: "Es por la señora de la planta baja, la del…",
    fragment_es: "Es por la señora de la planta baja, la del…",
  },
];

export const apagonLost: LostCall[] = [
  {
    id: "P6",
    t: 130,
    lang: "es",
    phone: "+34 6•• ••• 357",
    aml: near(APAGON_K, 40, -30, 40),
    fragment: "Soy auxiliar de la residencia, se nos ha…",
    fragment_es: "Soy auxiliar de la residencia, se nos ha…",
  },
  { id: "P7", t: 150, lang: "es", phone: "+34 6•• ••• 612", aml: { lat: 36.7, lng: -4.5, acc: 60 } },
];
