import { expect, test } from "vitest";
import { hasIdentifiedLanguage, langName } from "@/components/format";

test("labels unidentified languages without offering a language-specific reply", () => {
  for (const code of ["und", ""]) {
    expect(langName(code)).toBe("Idioma no detectado");
    expect(hasIdentifiedLanguage(code)).toBe(false);
  }
  expect(langName("ar")).toBe("Árabe");
  expect(hasIdentifiedLanguage("ar")).toBe(true);
});
