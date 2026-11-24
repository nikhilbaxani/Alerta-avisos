import { describe, expect, it } from "vitest";
import { scenarioApagon } from "@/data/scenario-apagon-malaga";
import { scenario as dana } from "@/data/scenario-dana-malaga";
import { parseJSON, sanitizeExtraction, severityFloor } from "@/lib/sanitize";

describe("severityFloor (gravedad mínima por riesgos)", () => {
  it.each([...dana.calls, ...scenarioApagon.calls].map((c) => [c.id, c.mock] as const))(
    "la mock de %s no queda por debajo de su suelo",
    (_id, mock) => {
      expect(mock.severity).toBeGreaterThanOrEqual(severityFloor(mock.risks, mock.incident_type));
    },
  );

  it("sigue la escala del prompt", () => {
    expect(severityFloor(["dolor_pecho"], "medica")).toBe(5);
    expect(severityFloor(["atrapados"], "inundacion_vehiculo")).toBe(5);
    expect(severityFloor(["atrapados"], "incendio")).toBe(5);
    expect(severityFloor(["sin_respuesta", "agua_subiendo"], "inundacion_vivienda")).toBe(5);
    expect(severityFloor(["mayor", "agua_subiendo"], "inundacion_vivienda")).toBe(4);
    expect(severityFloor(["cables_electricos"], "arbol_caido")).toBe(4);
    expect(severityFloor([], "incendio")).toBe(4);
    expect(severityFloor(["vida"], "otro")).toBe(4);
    expect(severityFloor([], "arbol_caido")).toBe(3);
    expect(severityFloor([], "garaje_inundado")).toBe(3);
    expect(severityFloor(["sin_luz"], "otro")).toBe(2);
    expect(severityFloor([], "semaforos")).toBe(2);
    expect(severityFloor([], "otro")).toBe(1);
  });

  it("atrapados en un ascensor no es gravedad 5 (por eso recibe el tipo)", () => {
    expect(severityFloor(["atrapados", "sin_luz"], "ascensor")).toBe(3);
    expect(severityFloor(["atrapados", "sin_luz", "inconsciente"], "ascensor")).toBe(4);
    // Si además entra el agua, sí es riesgo vital inmediato.
    expect(severityFloor(["atrapados", "agua_subiendo"], "ascensor")).toBe(5);
  });

  it("una extracción del LLM con riesgo vital y gravedad 1 sube al suelo", () => {
    const e = sanitizeExtraction({ incident_type: "otro", risks: ["vida"], severity: 1 });
    expect(e.severity).toBe(4);
    const a = sanitizeExtraction({ incident_type: "inundacion_vehiculo", risks: ["vida", "atrapados", "agua_subiendo"], severity: 1 });
    expect(a.severity).toBe(5);
  });

  it("no baja una gravedad que ya está por encima del suelo", () => {
    expect(sanitizeExtraction({ incident_type: "semaforos", risks: ["sin_luz"], severity: 4 }).severity).toBe(4);
  });
});

describe("parseJSON", () => {
  it("acepta JSON limpio", () => expect(parseJSON('{"a":1}')).toEqual({ a: 1 }));
  it("quita ```json", () => expect(parseJSON('```json\n{"a":1}\n```')).toEqual({ a: 1 }));
  it("ignora basura alrededor", () => expect(parseJSON('Claro: {"a":{"b":2}} ¡listo!')).toEqual({ a: { b: 2 } }));
  it("falla sin JSON", () => expect(() => parseJSON("nada")).toThrow());
});

describe("sanitizeExtraction", () => {
  it("filtra vocabularios y rangos", () => {
    const e = sanitizeExtraction({
      language: "AR-SA", translation_es: " hola ", summary_es: "x", incident_type: "ovni",
      location_text: "c/ A", keywords: ["a", 3, " ", "b"], risks: ["vida", "vida", "magia"],
      people_at_risk: 99, severity: 9,
    });
    expect(e.language).toBe("ar");
    expect(e.incident_type).toBe("otro");
    expect(e.risks).toEqual(["vida"]);
    expect(e.keywords).toEqual(["a", "b"]);
    expect(e.severity).toBe(5);
    expect(e.people_at_risk).toBe(50);
    expect(e.translation_es).toBe("hola");
  });
  it("castellano nunca lleva traducción y la basura da valores seguros", () => {
    expect(sanitizeExtraction({ language: "es", translation_es: "x" }).translation_es).toBeNull();
    const e = sanitizeExtraction(null, "en");
    expect(e.language).toBe("en");
    expect(e.severity).toBe(3);
    expect(e.risks).toEqual([]);
  });
});
