"use client";

import { useRef, useState } from "react";
import { decide } from "@/lib/cluster";
import { STATIC_EXPORT } from "@/lib/config";
import { snapshot } from "@/lib/engine";
import { extractByKeywords } from "@/lib/keywordExtract";
import type { CallMeta, ConsoleState } from "@/lib/useConsole";
import type { ProcessResult } from "@/lib/types";
import Icon from "./Icon";
import { PLACES } from "./LivePanel";

interface Props {
  s: ConsoleState;
  /** Con IA local la clasifica el modelo; sin ella, palabras clave (modo simulado). */
  localAI: boolean;
  onCall: (c: CallMeta, r: ProcessResult) => void;
}

/**
 * Llamada escrita a mano por el operador: entra en la consola como cualquier otra, se agrupa con el mismo
 * algoritmo y el agente propone las acciones que tocan según su tipo y riesgos (incendio → bomberos, robo → policía…).
 */
export default function ManualCall({ s, localAI, onCall }: Props) {
  const [text, setText] = useState("");
  const [place, setPlace] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const counter = useRef(0);
  const useModel = localAI && !STATIC_EXPORT;

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const transcript = text.trim();
    if (!transcript || busy) return;
    setBusy(true);
    setMsg("");
    try {
      const p = PLACES[place];
      const aml = { lat: p.lat, lng: p.lng, acc: 30 };
      const incidents = s.engine.incidents.map(snapshot);
      let result: ProcessResult;
      if (useModel) {
        const r = await fetch("/api/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript, aml, incidents }),
        });
        result = (await r.json()) as ProcessResult & { error?: string };
        if (!r.ok) throw new Error((result as { error?: string }).error);
      } else {
        const extraction = extractByKeywords(transcript, p.name);
        result = {
          callId: "",
          transcript,
          language: "es",
          extraction,
          decision: decide({ aml, extraction }, incidents),
          engine: { stt: "Texto escrito", llm: "Palabras clave (modo simulado)" },
          timings: { sttMs: 0, llmMs: 0, totalMs: 0 },
        };
      }
      counter.current += 1;
      const id = `T${counter.current}`; // «T» de texto: no choca con los ids de los escenarios (A–M) ni con las de voz (V)
      onCall({ id, t: 0, lang: result.language, phone: "", aml, transcript, live: true }, { ...result, callId: id });
      setText("");
    } catch (err) {
      setMsg(err instanceof Error && err.message ? err.message : "No se pudo procesar la llamada.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="manual">
      <summary><Icon name="plus" size={15} />Escribir una llamada</summary>
      <form onSubmit={send}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="Ej.: Hay un incendio en la calle Larios y sale humo del tercer piso"
          aria-label="Qué dice el llamante"
        />
        <div className="live-row">
          <select value={place} onChange={(e) => setPlace(Number(e.target.value))} aria-label="Ubicación AML de la llamada">
            {PLACES.map((p, i) => <option key={p.name} value={i}>{p.name}</option>)}
          </select>
          <button className="btn btn-dark" type="submit" disabled={busy || !text.trim()}>{busy ? "Analizando…" : "Enviar"}</button>
        </div>
        <p className="note">{useModel ? "La clasifica la IA local." : "Modo simulado: se clasifica por palabras clave (tipo, riesgos y gravedad)."} El agente propone los recursos según el tipo de incidente.</p>
        {msg && <p className="toast" role="status">{msg}</p>}
      </form>
    </details>
  );
}
