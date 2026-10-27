"use client";

import { useRef, useState } from "react";
import { snapshot } from "@/lib/engine";
import type { ConsoleState } from "@/lib/useConsole";
import type { CallMeta } from "@/lib/useConsole";
import type { ProcessResult } from "@/lib/types";

const PLACES = [
  { name: "Centro de Málaga", lat: 36.7213, lng: -4.4214 },
  { name: "Campanillas", lat: 36.716, lng: -4.548 },
  { name: "Torremolinos", lat: 36.623, lng: -4.499 },
  { name: "El Palo", lat: 36.7195, lng: -4.363 },
  { name: "Rincón de la Victoria", lat: 36.716, lng: -4.278 },
];

type Phase = "idle" | "recording" | "working";

export default function LivePanel({ s, sttUp, onCall }: { s: ConsoleState; sttUp: boolean; onCall: (c: CallMeta, r: ProcessResult) => void }) {
  const [place, setPlace] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [msg, setMsg] = useState("");
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const counter = useRef(0);

  const start = async () => {
    setMsg("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunks.current = [];
      mr.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        void send(new Blob(chunks.current, { type: mr.mimeType || "audio/webm" }));
      };
      mr.start();
      rec.current = mr;
      setPhase("recording");
    } catch {
      setMsg("No se pudo acceder al micrófono.");
    }
  };

  const send = async (audio: Blob) => {
    setPhase("working");
    try {
      const form = new FormData();
      form.append("file", audio, "live.webm");
      const t = await fetch("/api/transcribe", { method: "POST", body: form });
      const td = await t.json();
      if (!t.ok) throw new Error(td.error);
      const p = PLACES[place];
      const aml = { lat: p.lat, lng: p.lng, acc: 30 };
      const r = await fetch("/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: td.text, aml, incidents: s.engine.incidents.map(snapshot) }),
      });
      const result = (await r.json()) as ProcessResult & { error?: string };
      if (!r.ok) throw new Error(result.error);
      counter.current += 1;
      const id = `L${counter.current}`;
      onCall({ id, t: 0, lang: result.language, phone: "En directo", aml, transcript: td.text, live: true }, { ...result, callId: id });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "No se pudo procesar la llamada.");
    } finally {
      setPhase("idle");
    }
  };

  return (
    <section className="live" aria-label="Llamada en directo">
      <div className="live-row">
        <select value={place} onChange={(e) => setPlace(Number(e.target.value))} aria-label="Ubicación AML de la llamada" disabled={!sttUp || phase !== "idle"}>
          {PLACES.map((p, i) => <option key={p.name} value={i}>{p.name}</option>)}
        </select>
        {phase === "recording" ? (
          <button className="btn primary" onClick={() => rec.current?.stop()}>Terminar y enviar</button>
        ) : (
          <button className="btn" onClick={start} disabled={!sttUp || phase === "working"}>
            {phase === "working" ? "Procesando…" : "Llamada en directo"}
          </button>
        )}
      </div>
      {!sttUp && <p className="note">Necesita Whisper local (STT_BASE_URL).</p>}
      {msg && <p className="toast" role="status">{msg}</p>}
    </section>
  );
}
