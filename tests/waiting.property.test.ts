import { expect, it } from "vitest";
import { DUPLICATE_SECONDS, NEW_CALL_SECONDS } from "@/lib/metrics";
import type { RiskTag } from "@/lib/types";
import { simulateRoom } from "@/lib/waiting";
import type { WaitingCall } from "@/lib/waiting";

const vital: RiskTag[] = ["vida", "dolor_pecho", "inconsciente", "sin_respuesta"];

function* rooms() {
  let seed = 0x112;
  const choose = (n: number) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return Math.floor(seed / 2 ** 32 * n);
  };
  for (let i = 0; i < 500; i++) {
    const operators = 1 + choose(6);
    const length = 2 + choose(28);
    let t = 0;
    const calls: WaitingCall[] = [];
    for (let j = 0; j < length; j++) {
      t += choose(i % 2 === 0 ? 10 : 80);
      const decision = j === 0 ? "new" : (["new", "ask", "merge"] as const)[choose(3)];
      const severity = ([1, 2, 3, 4, 5] as const)[choose(5)];
      const risks = choose(2) ? [vital[choose(vital.length)]] : [];
      const known = decision === "merge" ? (choose(2) ? { risks, severity } : { risks: [], severity: 1 }) : null;
      calls.push({ id: `${i}-${j}`, t, first: decision !== "merge", decision, lang: "es", extraction: { severity, risks },
        incidentId: decision === "merge" ? `INC-${i}-0` : `INC-${i}-${j}`, newInfo: [], intoProvisional: false,
        incidentType: "otro", incidentRisks: risks, known });
    }
    yield { calls, operators, room: simulateRoom(calls, operators, true) };
  }
}

it("e: 500 seeded rooms never use the assistant while an operator can take the call", () => {
  let attended = 0;
  for (const { calls, operators, room } of rooms()) {
    // Reconstruct operator occupancy from observed starts and the declared service durations.
    const intervals = calls.flatMap((c) => {
      const wait = room.wait[c.id];
      if (wait === null) return [];
      const start = c.t + wait;
      return [{ start, end: start + (c.first ? NEW_CALL_SECONDS : DUPLICATE_SECONDS) }];
    });
    expect(room.operatorSeconds).toBe(intervals.reduce((sum, x) => sum + x.end - x.start, 0));
    const byId = new Map(room.attentions.map((a) => [a.callId, a]));
    for (const c of calls) {
      const a = byId.get(c.id);
      if (a) {
        attended++;
        const occupied = intervals.filter(({ start, end }) => start <= c.t && c.t < end);
        expect(occupied).toHaveLength(operators);
        expect(a.freeAt).toBe(Math.min(...occupied.map((x) => x.end)));
        expect(a.freeAt).toBeGreaterThan(c.t);
      } else expect(room.wait[c.id]).toBe(0);
    }
  }
  expect(attended).toBeGreaterThan(500);
});

it("e: 500 seeded rooms leave every grey-zone call to a human", () => {
  let asks = 0;
  for (const { calls, room } of rooms()) {
    for (const c of calls.filter((x) => x.decision === "ask")) {
      expect(room.wait[c.id]).not.toBeNull();
      const a = room.attentions.find((x) => x.callId === c.id);
      if (!a) continue;
      asks++;
      expect(a.decision).toBe("ask");
      expect(a.outcome).not.toBe("agrupada");
      expect(a.operatorAt).toBe(c.t + room.wait[c.id]!);
    }
  }
  expect(asks).toBeGreaterThan(100);
});

it("e: 500 seeded rooms escalate every waiting vital-risk or severity-5 call", () => {
  let checked = 0;
  const breaches: string[] = [];
  for (const { calls, room } of rooms()) {
    for (const a of room.attentions) {
      const { extraction } = calls.find((c) => c.id === a.callId)!;
      const risks = vital.filter((r) => extraction.risks.includes(r));
      const severity5 = extraction.severity === 5;
      if (!risks.length && !severity5) continue;
      checked++;
      const escalation = { risks, severity5 };
      if (a.outcome !== "escalada" || !a.escalation || a.escalation.severity5 !== escalation.severity5 ||
          a.escalation.risks.length !== risks.length || !risks.every((r) => a.escalation?.risks.includes(r)) ||
          a.operatorAt === null || !a.script.lines.some((l) => l.id === "escalado")) breaches.push(`${a.callId}: ${a.outcome}`);
    }
  }
  expect(checked).toBeGreaterThan(100);
  expect(breaches.slice(0, 8), `${breaches.length} of ${checked} vital waiting calls violated escalation`).toEqual([]);
});
