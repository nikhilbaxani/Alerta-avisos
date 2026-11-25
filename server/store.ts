import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isPublicCallEvent, type PublicCallEvent } from "../lib/publicCall";

export type Outcome = "pending" | "accepted" | "discarded";
interface Entry { call: PublicCallEvent; outcome: Outcome }
interface Stored { version: 1; counter: number; calls: Entry[] }
const errorCode = (e: unknown) => (e as NodeJS.ErrnoException)?.code;
const missing = (e: unknown) => errorCode(e) === "ENOENT";
const isCounter = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/** Un único escritor por volumen. Las operaciones síncronas se serializan en el bucle del relay. */
export function openStore(dir: string, log: (message: string) => void, cap = 500) {
  const file = join(dir, "calls.json");
  let state: Stored = { version: 1, counter: 0, calls: [] };
  let health: "ok" | "failing" = "ok";
  let text = "";
  let loadedCounter: unknown;
  try {
    text = readFileSync(file, "utf8");
    const raw = JSON.parse(text) as Partial<Stored> | null;
    loadedCounter = raw?.counter;
    if (!raw || raw.version !== 1 || !isCounter(raw.counter) || !Array.isArray(raw.calls)) throw new Error();
    const ids = new Set<string>();
    const calls = raw.calls.filter((entry) => {
      if (!entry || !isPublicCallEvent(entry.call) || ids.has(entry.call.id) ||
          (entry.outcome !== "pending" && entry.outcome !== "accepted" && entry.outcome !== "discarded")) return false;
      ids.add(entry.call.id);
      return true;
    });
    state = { version: 1, counter: raw.counter, calls };
  } catch (e) {
    if (!missing(e)) {
      // Solo se rescata la cabecera, no un campo que aparezca dentro de una llamada truncada.
      const headerCounter = Number(/^\s*\{\s*(?:"version"\s*:\s*1\s*,\s*)?"counter"\s*:\s*(0|[1-9]\d*)\s*(?:[,}]|$)/.exec(text)?.[1]);
      state.counter = isCounter(loadedCounter) ? loadedCounter
        : isCounter(headerCounter) ? headerCounter : Math.floor(Date.now() / 1000);
      try { renameSync(file, `${file}.corrupt-${Date.now()}`); } catch { health = "failing"; }
      log("[relay] no se pudo leer el archivo de llamadas; se inicia sin historial");
    }
  }

  function save(next: Stored, allowVolatile = false) {
    const temp = join(dir, `.calls-${randomBytes(12).toString("hex")}.tmp`);
    try {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      writeFileSync(temp, JSON.stringify(next), { flag: "wx", mode: 0o600 });
      renameSync(temp, file);
      health = "ok";
    } catch (e) {
      try { unlinkSync(temp); } catch { /* No se llegó a crear, o no es accesible. */ }
      health = "failing";
      log(errorCode(e) ?? "UNKNOWN");
      if (!allowVolatile) throw e;
    }
    state = next;
  }

  return {
    get health() { return health; },
    get counter() { return state.counter; },
    get calls() { return state.calls; },
    hasRoom(reserved: number) { return state.calls.filter((entry) => entry.outcome === "pending").length + reserved < cap; },
    publish(call: PublicCallEvent, counter: number) {
      const calls = [...state.calls, { call, outcome: "pending" as const }];
      while (calls.length > cap) {
        const discarded = calls.findIndex((entry) => entry.outcome === "discarded");
        const index = discarded >= 0 ? discarded : calls.findIndex((entry) => entry.outcome === "accepted");
        if (index < 0) throw new Error("Store full");
        calls.splice(index, 1);
      }
      save({ version: 1, counter, calls }, true);
    },
    acknowledge(id: string, outcome: Exclude<Outcome, "pending">) {
      const entry = state.calls.find((stored) => stored.call.id === id);
      if (entry?.outcome === "pending") {
        save({ ...state, calls: state.calls.map((stored) => stored === entry ? { ...stored, outcome } : stored) }, true);
      }
      return entry;
    },
    clear() {
      // También elimina cuarentena y temporales huérfanos: pueden contener transcripciones.
      let files: string[];
      try { files = readdirSync(dir); } catch (e) { if (!missing(e)) throw e; files = []; }
      for (const name of files) {
        if (/^(?:calls\.json\.corrupt-\d+|\.calls-[0-9a-f]{24}\.tmp)$/.test(name)) unlinkSync(join(dir, name));
      }
      const removed = state.calls.length;
      save({ ...state, calls: [] });
      return removed;
    },
  };
}
