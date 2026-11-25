import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isPublicCallEvent, type PublicCallEvent } from "../lib/publicCall";

export type Outcome = "pending" | "accepted" | "discarded";
interface Entry { call: PublicCallEvent; outcome: Outcome }
interface Stored { version: 1; counter: number; calls: Entry[] }
const missing = (e: unknown) => (e as NodeJS.ErrnoException)?.code === "ENOENT";

/** Un único escritor por volumen. Las operaciones síncronas se serializan en el bucle del relay. */
export function openStore(dir: string, log: (message: string) => void, cap = 500) {
  const file = join(dir, "calls.json");
  let state: Stored = { version: 1, counter: 0, calls: [] };
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as Partial<Stored> | null;
    if (!raw || raw.version !== 1 || typeof raw.counter !== "number" || !Number.isSafeInteger(raw.counter) || raw.counter < 0 || !Array.isArray(raw.calls)) throw new Error();
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
      try { renameSync(file, `${file}.corrupt-${Date.now()}`); } catch { /* El directorio también puede ser inaccesible. */ }
      log("[relay] no se pudo leer el archivo de llamadas; se inicia sin historial");
    }
  }

  function save(next: Stored) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const temp = join(dir, `.calls-${randomBytes(12).toString("hex")}.tmp`);
    try {
      writeFileSync(temp, JSON.stringify(next), { flag: "wx", mode: 0o600 });
      renameSync(temp, file);
    } catch (e) {
      try { unlinkSync(temp); } catch { /* No se llegó a crear, o no es accesible. */ }
      throw e;
    }
    state = next;
  }

  return {
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
      save({ version: 1, counter, calls });
    },
    acknowledge(id: string, outcome: Exclude<Outcome, "pending">) {
      const entry = state.calls.find((stored) => stored.call.id === id);
      if (entry?.outcome === "pending") {
        save({ ...state, calls: state.calls.map((stored) => stored === entry ? { ...stored, outcome } : stored) });
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
      try { unlinkSync(file); } catch (e) { if (!missing(e)) throw e; }
      const removed = state.calls.length;
      state = { ...state, calls: [] };
      return removed;
    },
  };
}
