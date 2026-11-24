import { expect, it } from "vitest";
import { DUPLICATE_SECONDS, NEW_CALL_SECONDS } from "@/lib/metrics";
import { simulateWaiting } from "@/lib/waiting";
import type { WaitingCall } from "@/lib/waiting";

it("respeta capacidad, zona gris y riesgo vital en 500 salas reproducibles", () => {
  let seed = 0x1122026;
  const pick = (n: number) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return Math.floor(seed / 2 ** 32 * n);
  };
  const decisions = ["merge", "ask", "new"] as const;
  const vital = ["vida", "dolor_pecho", "inconsciente", "sin_respuesta"] as const;
  const languages = ["es", "ar", "zz"];
  for (let room = 0; room < 500; room++) {
    const operators = 1 + pick(6);
    const calls: WaitingCall[] = Array.from({ length: 1 + pick(30) }, (_, i) => ({
      id: `X${i}`, t: pick(24) * 5, type: "medica", lang: languages[pick(languages.length)],
      severity: 1 + pick(5), decision: decisions[pick(decisions.length)], risks: vital.filter(() => pick(8) === 0),
    }));
    const result = simulateWaiting(calls, operators);
    const byId = new Map(calls.map((call) => [call.id, call]));
    expect(result.calls).toHaveLength(calls.length);
    for (const [i, entry] of result.calls.entries()) {
      const call = byId.get(entry.callId)!;
      // Reconstruye ocupación con los intervalos humanos observados. En llegadas simultáneas,
      // solo cuentan las anteriores y las que ya estaban en cola, no las llegadas posteriores.
      const busy = result.calls.slice(0, i).filter((other) => {
        const start = other.humanAt;
        const duration = byId.get(other.callId)!.decision === "merge" ? DUPLICATE_SECONDS : NEW_CALL_SECONDS;
        return start !== null && start <= call.t && call.t < start + duration;
      }).length;
      const context = `sala ${room}, llamada ${call.id}`;
      expect(busy, context).toBeLessThanOrEqual(operators);
      if (busy < operators) {
        expect(entry, context).toMatchObject({ humanAt: call.t, waiting: null });
      } else {
        expect(entry.waiting, context).not.toBeNull();
        if (call.decision === "ask") expect(entry.waiting?.outcome, context).not.toBe("duplicate");
        if (call.severity === 5 || call.risks.length) {
          expect(entry.waiting, context).toMatchObject({ outcome: "escalated",
            reasons: [...call.risks, ...(call.severity === 5 ? ["severity_5"] : [])],
          });
          expect(entry.humanAt, context).toBeGreaterThan(call.t);
        }
      }
    }
  }
});
