"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_MAX_CALL_SECONDS } from "@/lib/publicCall";

const RELAY = (process.env.NEXT_PUBLIC_RELAY_URL ?? "").trim().replace(/\/$/, "");
const parsed = Number(process.env.NEXT_PUBLIC_MAX_CALL_SECONDS);
const MAX = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_CALL_SECONDS;

type Phase = "idle" | "recording" | "sending" | "done";

const clock = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

export default function CallRecorder() {
  const [consent, setConsent] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [secs, setSecs] = useState(0);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
    if (rec.current && rec.current.state !== "inactive") {
      rec.current.ondataavailable = null;
      rec.current.onstop = null;
      rec.current.stop();
      rec.current.stream.getTracks().forEach((t) => t.stop());
    }
  }, []);

  if (!RELAY) {
    return (
      <main className="call-page">
        <h1>Llamada de prueba al Copiloto 112</h1>
        <p className="call-notice" role="note"><b>Demo de hackathon. No es un servicio de emergencias. En una emergencia real, llama al 112.</b></p>
        <p>La grabación no está disponible en esta versión.</p>
      </main>
    );
  }

  const stopTimer = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  const send = async (audio: Blob) => {
    if (audio.size === 0) {
      setPhase("idle");
      setMsg({ ok: false, text: "No se grabó nada de audio. Inténtalo de nuevo." });
      return;
    }
    setPhase("sending");
    try {
      const form = new FormData();
      form.append("consent", "1");
      form.append("file", audio, "llamada.webm");
      const res = await fetch(`${RELAY}/llamar`, { method: "POST", body: form });
      if (res.status === 202) {
        setPhase("done");
        setMsg({ ok: true, text: "Enviada. Si el audio se procesa bien, el operador la verá en la consola en unos segundos." });
        return;
      }
      let detail = "";
      try {
        const body = await res.json();
        if (typeof body?.error === "string") detail = body.error;
      } catch { /* sin cuerpo JSON */ }
      const fallback: Record<number, string> = {
        413: "El audio es demasiado grande.",
        429: "Has hecho demasiadas llamadas seguidas. Espera unos minutos.",
        503: "El servicio está saturado. Inténtalo de nuevo en un momento.",
      };
      setMsg({ ok: false, text: detail || fallback[res.status] || "No se pudo enviar la llamada. Inténtalo de nuevo." });
    } catch {
      setMsg({ ok: false, text: "No se pudo conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo." });
    }
    setPhase("idle");
  };

  const start = async () => {
    setMsg(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunks.current = [];
      mr.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      mr.onstop = () => {
        stopTimer();
        stream.getTracks().forEach((t) => t.stop());
        void send(new Blob(chunks.current, { type: mr.mimeType || "audio/webm" }));
      };
      mr.start();
      rec.current = mr;
      setSecs(0);
      setPhase("recording");
      const t0 = Date.now();
      timer.current = setInterval(() => {
        const n = Math.floor((Date.now() - t0) / 1000);
        setSecs(Math.min(n, MAX));
        if (n >= MAX && mr.state !== "inactive") mr.stop(); // corte automático y envío
      }, 250);
    } catch {
      setMsg({ ok: false, text: "No se pudo acceder al micrófono. Revisa los permisos del navegador." });
    }
  };

  return (
    <main className="call-page">
      <h1>Llamada de prueba al Copiloto 112</h1>
      <p className="call-notice" role="note"><b>Demo de hackathon. No es un servicio de emergencias. En una emergencia real, llama al 112.</b></p>

      <section aria-labelledby="how-h" className="call-card">
        <h2 id="how-h">Qué hacer</h2>
        <p>Pulsa Grabar y cuenta una emergencia inventada, como si llamaras al 112. Di <b>dónde estás</b>: calle o barrio de Málaga. Puedes hablar en tu idioma. Pulsa Terminar y enviar cuando acabes (máximo {clock(MAX)}).</p>
      </section>

      <label className="call-consent">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={phase !== "idle" && phase !== "done"} />
        <span>Acepto que mi audio se envíe al servidor del equipo solo para transcribirlo. No se guarda y no se recoge mi teléfono ni mi nombre.</span>
      </label>

      <div className="call-controls">
        {phase === "recording" ? (
          <button className="btn btn-rec btn-lg" onClick={() => rec.current?.stop()}>Terminar y enviar</button>
        ) : (
          <button className="btn btn-dark btn-lg" onClick={start} disabled={!consent || phase === "sending"}>
            {phase === "sending" ? "Enviando…" : phase === "done" ? "Grabar otra" : "Grabar"}
          </button>
        )}
        <p className="call-timer" aria-live="off">
          <span className="sr-only">Tiempo grabado </span>{clock(secs)} / {clock(MAX)}
        </p>
      </div>
      {phase === "recording" && <p className="note" role="status">Grabando… habla cerca del micrófono.</p>}
      {msg && <p className={msg.ok ? "call-ok" : "toast"} role="status">{msg.text}</p>}
    </main>
  );
}
