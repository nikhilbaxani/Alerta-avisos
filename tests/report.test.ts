import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";

const cli = (...args: string[]) => spawnSync(process.execPath, ["--import", "tsx", "scripts/agente.ts", ...args], { encoding: "utf8" });

it("imprime el mismo parte Markdown que guarda y exporta sus datos en el JSON de la traza", () => {
  const dir = mkdtempSync(join(tmpdir(), "agente-parte-test-"));
  try {
    const md = join(dir, "parte.md");
    const json = join(dir, "traza.json");
    const result = cli("--parte", md, "--json", json);
    expect([result.status, result.stderr]).toEqual([0, ""]);
    expect(readdirSync(dir).sort()).toEqual(["parte.md", "traza.json"]);
    const report = readFileSync(md, "utf8");
    expect(result.stdout.endsWith(report)).toBe(true);
    expect(report).toContain("# Parte de situación · SIMULACIÓN");
    expect(report).toContain("Operadores: 2 · En espera: 22 con guion. De las llamadas en espera, 13 se escalaron y 7 se agruparon como duplicados sin operador.");
    expect(report).toContain("26 llamadas → 7 incidentes · 19 líneas liberadas por agrupación.");
    expect(report).toContain("Sin coordinador simulado: ES-Alert requiere aprobación de un coordinador humano.");
    const audit = JSON.parse(readFileSync(json, "utf8"));
    expect(audit.parte).toMatchObject({ simulacion: true, llamadas: 26, incidentes: 7, lineasLiberadas: 19, coordinadorSimulado: false,
      acciones: { propuesta: 1, aprobada: 0, enviada: audit.acciones.length - 1, descartada: 0 },
      espera: { atendidas: audit.espera.atendidas, escaladas: audit.espera.escaladas },
    });
    expect(audit.parte.prioridades).toHaveLength(7);
    const priorities: { id: string; prioridad: number; motivos: string[] }[] = audit.parte.prioridades;
    expect(priorities.map((p) => p.prioridad)).toEqual(priorities.map((p) => p.prioridad).sort((a, b) => b - a));
    const e1 = audit.pasos.find((p: { llamada: string }) => p.llamada === "E1").incidente;
    expect(priorities.find((p) => p.id === e1)?.motivos).toContain("dolor torácico");
    expect(audit.parte.zonas.reduce((sum: number, z: { incidentes: number }) => sum + z.incidentes, 0)).toBe(7);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it("--parte exige un destino y no imprime ni guarda un parte ante entrada rechazada", () => {
  for (const args of [["--parte"], ["--parte="], ["--parte", "--live"]]) {
    const result = cli(...args);
    expect([result.status, result.stdout, result.stderr]).toEqual([1, "", "Falta el archivo de --parte (p. ej. --parte archivo.md).\n"]);
  }
});

it("la ayuda incluye --parte y mantiene --json para la traza", () => {
  const result = cli("--help");
  expect([result.status, result.stderr]).toEqual([0, ""]);
  expect(result.stdout).toContain("--parte archivo.md: guarda el parte de situación en Markdown.");
  expect(result.stdout).toContain("--json archivo: guarda la traza y el parte en JSON.");
});
