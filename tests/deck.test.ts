import { describe, expect, it } from "vitest";
import { encodeQr, qrPath } from "@/lib/qr";
import { replayTo } from "@/lib/replay";

/** Lee los 15 bits de formato de la primera copia (junto al buscador de arriba a la izquierda). */
function formatBits(m: boolean[][]): number {
  const at = (x: number, y: number) => (m[y][x] ? 1 : 0);
  const bits: number[] = [0, 1, 2, 3, 4, 5].map((i) => at(8, i));
  bits.push(at(8, 7), at(8, 8), at(7, 8));
  for (let i = 9; i < 15; i++) bits.push(at(14 - i, 8));
  return bits.reduce((acc, b, i) => acc | (b << i), 0);
}

describe("QR (lib/qr.ts)", () => {
  it("elige la versión más pequeña en la que cabe la URL", () => {
    expect(encodeQr("http://localhost:3000/").length).toBe(25); // versión 2
    expect(encodeQr("https://example.github.io/Alerta-avisos/").length).toBe(29); // versión 3
  });

  it("dibuja los tres buscadores y deja el módulo oscuro fijo", () => {
    const m = encodeQr("https://example.github.io/Alerta-avisos/");
    const n = m.length;
    for (const [x0, y0] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
      for (let i = 0; i < 7; i++) {
        expect(m[y0][x0 + i]).toBe(true);
        expect(m[y0 + 6][x0 + i]).toBe(true);
      }
      expect(m[y0 + 1][x0 + 1]).toBe(false);
      expect(m[y0 + 3][x0 + 3]).toBe(true);
    }
    expect(m[n - 8][8]).toBe(true);
  });

  it("escribe un formato válido: corrección M y BCH correcto", () => {
    const fb = formatBits(encodeQr("https://example.github.io/Alerta-avisos/", "M")) ^ 0x5412;
    const data = fb >>> 10;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    expect(fb & 0x3ff).toBe(rem & 0x3ff);
    expect(data >>> 3).toBe(0); // M = 00
  });

  it("es determinista y el trazado incluye la zona libre", () => {
    const a = encodeQr("https://example.org/");
    expect(encodeQr("https://example.org/")).toEqual(a);
    const { d, size } = qrPath(a, 4);
    expect(size).toBe(a.length + 8);
    expect(d.startsWith("M4 4h1v1h-1z")).toBe(true);
  });
});

describe("Reproducción del escenario para la presentación (lib/replay.ts)", () => {
  it("al entrar F1, la zona gris pregunta por INC-01 y no fusiona", () => {
    const s = replayTo("dana-malaga", 128);
    const prov = s.engine.incidents.filter((i) => i.provisional);
    expect(prov).toHaveLength(1);
    expect(prov[0].callIds[0]).toBe("F1");
    expect(prov[0].linkedTo).toBe("INC-01");
  });

  it("con las decisiones del operador, 26 llamadas quedan en 7 emergencias", () => {
    const s = replayTo("dana-malaga", Infinity, { F1: false, B2: true });
    expect(s.arrived).toHaveLength(26);
    expect(s.engine.incidents).toHaveLength(7);
    expect(s.engine.incidents.some((i) => i.provisional)).toBe(false);
  });

  it("sin decisiones, la zona gris sigue esperando al operador", () => {
    const s = replayTo("dana-malaga");
    expect(s.engine.incidents.filter((i) => i.provisional).map((i) => i.callIds[0]).sort()).toEqual(["B2", "F1"]);
  });

  it("solo se envían solos los avisos informativos; el ES-Alert espera a un coordinador", () => {
    const s = replayTo("dana-malaga", Infinity, { F1: false, B2: true });
    for (const a of s.actions.filter((x) => x.status === "enviada")) expect(a.policy).toBe("automatica");
    const es = s.actions.find((a) => a.tool === "proponer_es_alert");
    expect(es?.status).toBe("propuesta");
    expect(es?.policy).toBe("coordinador");
  });
});
