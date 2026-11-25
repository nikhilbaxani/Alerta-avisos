import { expect, it, vi } from "vitest";
import { consoleReducer, initialConsoleState } from "@/lib/consoleMode";
import { extractByRules } from "@/lib/rules";
import { publicEventToCall } from "@/lib/inbox";
import { snapshot } from "@/lib/engine";
import type { ConsoleState } from "@/lib/consoleMode";

import { restoreLiveSession, serializeLiveSession } from "@/lib/liveSession";

it("S31: adopta y guarda la primera época aun sin llamadas", () => {
  const state = consoleReducer(live(), { type: "relayEpoch", epoch: "first" });
  expect(state.arrived).toEqual([]);
  expect(restoreLiveSession(serializeLiveSession(state)).relayEpoch).toBe("first");
});

it.each([undefined, "old"])("S31: cambia de época (%s) solo en directo y conserva el replay", (epoch) => {
  const before = accept(epoch ? consoleReducer(live(), { type: "relayEpoch", epoch }) : live(), "P1");
  const restored = restoreLiveSession(serializeLiveSession(before));
  const sim = consoleReducer(consoleReducer(restored, { type: "mode", mode: "sim" }), { type: "tick", dt: 30 });
  const reset = consoleReducer(sim, { type: "relayEpoch", epoch: "new" });
  expect({ ...reset, saved: sim.saved }).toEqual(sim);
  const empty = consoleReducer(reset, { type: "mode", mode: "live" });
  expect(empty).toMatchObject({ relayEpoch: "new", arrived: [], calls: {}, audit: [], engine: { incidents: [], decisions: {} } });
  const replay = accept(empty, "P2");
  expect(replay.arrived).toEqual(["P2"]);
  expect(consoleReducer(replay, { type: "relayEpoch", epoch: "new" })).toBe(replay);
});

const relay = "https://relay.test";
const live = () => consoleReducer(initialConsoleState(), { type: "mode", mode: "live" });
function accept(s: ConsoleState, id: string, target?: string) {
  const transcript = "Hay un coche atrapado en el agua";
  const { meta, result } = publicEventToCall({
    id, transcript, language: "es", receivedAt: "2026-11-24T19:00:00Z", durationS: 5,
    translation_en: null, timings: { sttMs: 20, totalMs: 30 },
    ...extractByRules({ transcript, language: "es", translation_en: null }),
  }, s.engine.incidents.map(snapshot), s.clock);
  result.decision = { ...result.decision, action: target ? "ask" : "new", incidentId: target };
  return consoleReducer(s, { type: "live", call: meta, result });
}

it("S21: restablece la sesión y su decisión ya tomada sin resolver otra pregunta ámbar ni repetir efectos", async () => {
  const { restoreLiveSession, serializeLiveSession } = await import("@/lib/liveSession");
  let s = accept(accept(live(), "P1"), "P2", "INC-01");
  s = consoleReducer(s, { type: "decide", incidentId: "INC-02", same: true });
  for (const fx of s.fx) s = consoleReducer(s, { type: "fxDone", key: fx.key });
  s = consoleReducer(s, { type: "liveTick", dt: 6 });
  s = consoleReducer(s, { type: "resolve", incidentId: "INC-01" });
  s = accept(accept(s, "P3"), "P4", "INC-03");
  const restored = restoreLiveSession(serializeLiveSession(s));
  expect(restored).toEqual(s);
  expect(restored.engine.incidents.find((i) => i.id === "INC-04")).toMatchObject({ provisional: true, linkedTo: "INC-03" });
  expect(restored.archived[0].incident.callIds).toEqual(["P1", "P2"]);
  expect(restored.fx).toEqual([]);
  expect(restored.actions).toEqual([]);
  expect(consoleReducer(restored, { type: "actionApprove", key: "test" })).toBe(restored);
  expect(consoleReducer(restored, { type: "plan", proposals: [] })).toBe(restored);
});

it("S21: solo guarda el directo, conserva ambas selecciones de pestaña y el reset vacía la copia", async () => {
  const { restoreLiveSession, serializeLiveSession } = await import("@/lib/liveSession");
  const s = accept(live(), "P1");
  const sim = consoleReducer(consoleReducer(s, { type: "mode", mode: "sim" }), { type: "tick", dt: 30 });
  expect(sim.arrived.length).toBeGreaterThan(0);
  const restored = restoreLiveSession(serializeLiveSession(sim));
  expect(restored).toEqual({ ...initialConsoleState(), saved: { live: sim.saved.live } });
  const switched = consoleReducer(restored, { type: "mode", mode: "live" });
  expect(switched.arrived).toEqual(["P1"]);
  const reset = restoreLiveSession(serializeLiveSession(consoleReducer(switched, { type: "reset" })));
  expect(reset).toEqual(live());
  expect(consoleReducer(reset, { type: "mode", mode: "sim" }).arrived).toEqual([]);
});

it("S21: ignora formatos corruptos, ajenos y de otras versiones", async () => {
  const { liveSessionKey, loadLiveSession, restoreLiveSession, serializeLiveSession } = await import("@/lib/liveSession");
  const serialized = serializeLiveSession(accept(live(), "P1"));
  for (const raw of ["{", "[]", '{"version":0,"mode":"live"}', serialized.replace('"transcript":', '"other":')]) {
    expect(restoreLiveSession(raw)).toEqual(initialConsoleState());
  }
  const store = { getItem: vi.fn(() => null) };
  expect(loadLiveSession(store, relay)).toEqual(initialConsoleState());
  expect(store.getItem).toHaveBeenCalledWith(liveSessionKey(relay));
  expect(liveSessionKey(relay)).not.toBe(liveSessionKey("/relay"));
});

it("S21: conserva hasta 300 llamadas guardadas, descartando primero las solucionadas más antiguas", async () => {
  const { restoreLiveSession, serializeLiveSession } = await import("@/lib/liveSession");
  let s = accept(live(), "P1");
  for (let n = 2; n <= 301; n++) {
    s = accept(s, `P${n}`);
    if (n < 4) s = consoleReducer(s, { type: "resolve", incidentId: `INC-0${n}` });
  }
  const restored = restoreLiveSession(serializeLiveSession(s));
  expect(s.arrived).toHaveLength(301);
  expect(restored.arrived).toEqual(s.arrived.filter((id) => id !== "P2"));
  expect(restored.engine.assignment.P2).toBeUndefined();
  expect(restored.archived.map((a) => a.incident.id)).toEqual(["INC-03"]);
  expect(restored.engine.nextId).toBe(s.engine.nextId);
});

it("S21: la cuota agotada no cambia la sesión en memoria ni repite el aviso", async () => {
  const { saveLiveSession } = await import("@/lib/liveSession");
  const s = accept(live(), "P1");
  const store = { setItem: vi.fn(() => { throw new DOMException("cuota", "QuotaExceededError"); }) };
  const warn = vi.fn();
  const report = { warned: false, warn };
  saveLiveSession(store, relay, s, report);
  saveLiveSession(store, relay, s, report);
  expect(warn).toHaveBeenCalledTimes(1);
  expect(s.arrived).toEqual(["P1"]);
});
