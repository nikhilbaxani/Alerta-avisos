import { describe, expect, it } from "vitest";
import { parseJSON, sanitizeExtraction } from "@/lib/sanitize";

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
