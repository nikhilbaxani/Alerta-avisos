import { describe, expect, it } from "vitest";
import { proposalsFor } from "@/lib/consoleActions";
import { initialState, processCall } from "@/lib/engine";
import { extractByKeywords } from "@/lib/keywordExtract";

const CENTRO = { lat: 36.7213, lng: -4.4214, acc: 30 };

/** Una llamada escrita entra en el motor real y el agente propone según su tipo y riesgos. */
function services(text: string) {
  const extraction = extractByKeywords(text, "Centro de Málaga");
  const call = { id: "T1", t: 0, aml: CENTRO, extraction };
  const { state } = processCall(initialState(), call);
  return proposalsFor(state.incidents, { T1: call }, { T1: "" })
    .filter((p) => p.tool === "proponer_recursos")
    .map((p) => p.destination);
}

describe("llamada escrita a mano (modo simulado, palabras clave)", () => {
  it.each([
    ["Hay un incendio en la calle Larios, sale humo del tercer piso", "incendio", []],
    ["Me acaban de robar el bolso en la plaza de la Merced", "delito", []],
    ["Un hombre con una navaja está amenazando a la gente", "delito", ["violencia"]],
    ["Choque entre dos coches en la avenida de Andalucía, hay un herido", "accidente", ["herido"]],
    ["Mi padre tiene dolor en el pecho", "medica", ["dolor_pecho"]],
    ["Un árbol ha caído y la calle está cortada", "arbol_caido", ["via_bloqueada"]],
    ["El coche se ha quedado en el paso inferior y entra agua", "inundacion_vehiculo", ["agua_subiendo"]],
    ["Se ha ido la luz esta tarde", "otro", ["sin_luz"]],
  ] as const)("«%s» → %s %j", (text, type, risks) => {
    const e = extractByKeywords(text, "Centro de Málaga");
    expect(e.incident_type).toBe(type);
    expect(e.risks).toEqual(expect.arrayContaining([...risks]));
  });

  it("las raíces encajan al principio de palabra: «alarma» no es un arma ni «tarde» es fuego", () => {
    const e = extractByKeywords("Suena la alarma del portal desde esta tarde", "Centro de Málaga");
    expect(e.incident_type).toBe("otro");
    expect(e.risks).not.toContain("violencia");
  });

  it("toma el lugar que dice el llamante y, si no lo dice, el elegido", () => {
    expect(extractByKeywords("Hay fuego en la calle Granada, 12", "Centro de Málaga").location_text).toBe("calle Granada");
    expect(extractByKeywords("Hay fuego", "El Palo").location_text).toBe("El Palo");
  });

  it("la gravedad respeta el suelo por riesgos: atrapados en un incendio → 5", () => {
    expect(extractByKeywords("Incendio en un piso con dos personas atrapadas", "Centro de Málaga")).toMatchObject({ severity: 5, people_at_risk: 2 });
  });

  it("el agente propone los recursos acordes al incidente", () => {
    expect(services("Hay un incendio en la calle Larios")).toEqual(["bomberos"]);
    expect(services("Me han robado la cartera en la plaza")).toEqual(["policia_nacional"]);
    expect(services("Pelea con un herido apuñalado en la calle Carretería")).toEqual(["samu_061", "policia_nacional"]);
    expect(services("Accidente de tráfico con un herido")).toEqual(["samu_061", "policia_local"]);
    expect(services("Mi madre está inconsciente y no reacciona")).toEqual(["samu_061"]);
  });
});
