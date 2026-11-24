"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_MAX_CALL_SECONDS } from "@/lib/publicCall";

const RELAY = (process.env.NEXT_PUBLIC_RELAY_URL ?? "").trim().replace(/\/$/, "");
const parsed = Number(process.env.NEXT_PUBLIC_MAX_CALL_SECONDS);
const MAX = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_CALL_SECONDS;

// idle → recording → uploading (sube el audio) → transcribing (el relay transcribe) → review (la persona lee el texto)
// → submitting («Enviar») → done. Solo «Enviar» hace que la llamada llegue a la bandeja del operador (S14).
type Phase = "idle" | "recording" | "uploading" | "transcribing" | "review" | "submitting" | "done";

// Se espera mientras el relay diga «transcribing» (con mucha gente el STT va en serie): solo se abandona si el relay
// dice failed/expired/404 o si fallan varias consultas seguidas.
const POLL_MAX_FAILS = 8;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** 1 s al principio, luego más espaciado: el estado es barato, pero no hace falta insistir. */
const pollDelay = (n: number) => (n < 6 ? 1000 : n < 16 ? 1500 : 2500);
const GONE = "La llamada ya no está en el servidor (caducó o el servicio se reinició). Vuelve a grabar.";

const clock = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

export default function CallRecorder() {
  const [consent, setConsent] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [secs, setSecs] = useState(0);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [callId, setCallId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [language, setLanguage] = useState("");
  const [waited, setWaited] = useState(0);
  const [ahead, setAhead] = useState(0); // llamadas que se transcriben antes que la mía
  const run = useRef(0); // invalida el sondeo en curso al descartar, reiniciar o desmontar
  const transcriptEl = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => () => {
    run.current++;
    if (timer.current) clearInterval(timer.current);
    if (rec.current && rec.current.state !== "inactive") {
      rec.current.ondataavailable = null;
      rec.current.onstop = null;
      rec.current.stop();
      rec.current.stream.getTracks().forEach((t) => t.stop());
    }
  }, []);

  // Segundos esperando la transcripción (tiempo real, sin porcentaje inventado).
  useEffect(() => {
    if (phase !== "transcribing") return;
    const t0 = Date.now();
    setWaited(0);
    const t = setInterval(() => setWaited(Math.floor((Date.now() - t0) / 1000)), 500);
    return () => clearInterval(t);
  }, [phase]);

  // Al aparecer el texto, el foco pasa a él (lectores de pantalla y teclado).
  useEffect(() => {
    if (phase === "review") transcriptEl.current?.focus();
  }, [phase]);

  const busy = phase === "uploading" || phase === "transcribing" || phase === "review" || phase === "submitting";

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

  const backToIdle = (text?: string) => {
    run.current++;
    setCallId(null);
    setTranscript("");
    setPhase("idle");
    setMsg(text ? { ok: false, text } : null);
  };

  /** Sondea el estado de la llamada hasta que haya texto (o falle). */
  const watch = async (id: string, token: number) => {
    let fails = 0;
    setAhead(0);
    for (let n = 0; run.current === token; n++) {
      await sleep(pollDelay(n));
      if (run.current !== token) return;
      try {
        const res = await fetch(`${RELAY}/llamar/${id}`, { cache: "no-store" });
        if (run.current !== token) return;
        if (res.status === 404) return backToIdle(GONE);
        if (!res.ok) throw new Error(String(res.status));
        const body = await res.json();
        fails = 0;
        if (body.status === "ready" && typeof body.transcript === "string") {
          setTranscript(body.transcript);
          setLanguage(typeof body.language === "string" ? body.language : "");
          setPhase("review");
          return;
        }
        if (body.status === "failed" || body.status === "expired") {
          return backToIdle(typeof body.error === "string" && body.error ? body.error : "No se pudo transcribir la llamada. Vuelve a grabar.");
        }
        if (body.status === "sent") {
          setPhase("done");
          return;
        }
        if (body.status === "transcribing") setAhead(Number.isInteger(body.ahead) && body.ahead > 0 ? body.ahead : 0);
      } catch {
        if (++fails >= POLL_MAX_FAILS) return backToIdle("Se perdió la conexión con el servidor mientras se transcribía. Vuelve a grabar.");
      }
    }
  };

  const upload = async (audio: Blob) => {
    if (audio.size === 0) {
      setPhase("idle");
      setMsg({ ok: false, text: "No se grabó nada de audio. Inténtalo de nuevo." });
      return;
    }
    setPhase("uploading");
    try {
      const form = new FormData();
      form.append("consent", "1");
      form.append("file", audio, "llamada.webm");
      const res = await fetch(`${RELAY}/llamar`, { method: "POST", body: form });
      if (res.status === 202) {
        const body = await res.json().catch(() => null);
        if (typeof body?.id === "string") {
          const token = ++run.current;
          setCallId(body.id);
          setPhase("transcribing");
          void watch(body.id, token);
          return;
        }
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
      setMsg({ ok: false, text: detail || fallback[res.status] || "No se pudo enviar el audio. Inténtalo de nuevo." });
    } catch {
      setMsg({ ok: false, text: "No se pudo conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo." });
    }
    setPhase("idle");
  };

  /** «Enviar»: solo ahora la llamada llega a la bandeja del operador. */
  const submit = async () => {
    if (!callId) return;
    setPhase("submitting");
    setMsg(null);
    try {
      const res = await fetch(`${RELAY}/llamar/${callId}/enviar`, { method: "POST" });
      if (res.ok) {
        setPhase("done");
        return;
      }
      if (res.status === 404 || res.status === 410) return backToIdle(GONE);
      let detail = "";
      try {
        const body = await res.json();
        if (typeof body?.error === "string") detail = body.error;
      } catch { /* sin cuerpo JSON */ }
      if (res.status === 409 || res.status === 502) return backToIdle(detail || "No se pudo procesar la llamada. Vuelve a grabar.");
      setMsg({ ok: false, text: detail || "No se pudo enviar. Inténtalo de nuevo." });
    } catch {
      setMsg({ ok: false, text: "No se pudo conectar con el servidor. Tu llamada sigue aquí: pulsa Enviar de nuevo." });
    }
    setPhase("review");
  };

  /** «Volver a grabar»: se descarta la llamada pendiente (si falla el aviso, el servidor la borra al caducar). */
  const discard = () => {
    const id = callId;
    if (id) void fetch(`${RELAY}/llamar/${id}`, { method: "DELETE" }).catch(() => undefined);
    backToIdle();
  };

  const start = async () => {
    setMsg(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // 64 kbps: 2 min ≈ 1 MB en Opus o AAC (iOS), muy por debajo del límite de 3 MB del relay.
      const mr = new MediaRecorder(stream, { audioBitsPerSecond: 64_000 });
      chunks.current = [];
      mr.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      mr.onstop = () => {
        stopTimer();
        stream.getTracks().forEach((t) => t.stop());
        void upload(new Blob(chunks.current, { type: mr.mimeType || "audio/webm" }));
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

      {/* Tras grabar, la pantalla se queda con lo importante: progreso, texto y botones (sin tener que bajar). */}
      {busy ? null : (
      <section aria-labelledby="how-h" className="call-card">
        <h2 id="how-h">Qué hacer</h2>
        <p>Pulsa Grabar y cuenta una emergencia inventada, como si llamaras al 112. Di <b>dónde estás</b>: calle o barrio de Málaga. Puedes hablar en tu idioma. Pulsa Terminar cuando acabes (máximo {clock(MAX)}). Antes de enviarla verás el texto que hemos entendido y podrás volver a grabar.</p>
      </section>
      )}

      {!busy && (
      <label className="call-consent">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={phase !== "idle" && phase !== "done"} />
        <span>Acepto que mi audio se envíe por HTTPS a los servidores del equipo (el VPS y el ordenador del equipo) para transcribirlo, y que el texto resultante lo procese la IA del equipo para extraer los datos, aunque no llegue a pulsar «Enviar». Ni el audio ni el texto se guardan en disco, y no se recoge mi teléfono ni mi nombre. La llamada solo llega al operador si pulso «Enviar».</span>
      </label>
      )}

      {(phase === "idle" || phase === "recording" || phase === "done") && (
        <div className="call-controls">
          {phase === "recording" ? (
            <button className="btn btn-rec btn-lg" onClick={() => rec.current?.stop()}>Terminar</button>
          ) : (
            <button className="btn btn-dark btn-lg" onClick={start} disabled={!consent}>
              {phase === "done" ? "Grabar otra" : "Grabar"}
            </button>
          )}
          {phase !== "done" && (
            <p className="call-timer" aria-live="off">
              <span className="sr-only">Tiempo grabado </span>{clock(secs)} / {clock(MAX)}
            </p>
          )}
        </div>
      )}

      {/* Región viva: anuncia cada cambio de fase sin repetir el contador de segundos. */}
      <p className="call-state" role="status" aria-live="polite" aria-atomic="true">
        {phase === "recording" && "Grabando… habla cerca del micrófono."}
        {phase === "uploading" && "Enviando el audio para transcribirlo…"}
        {phase === "transcribing" && "Transcribiendo tu llamada…"}
        {phase === "review" && "Transcripción lista. Revísala y pulsa Enviar si es correcta."}
        {phase === "submitting" && "Enviando al operador…"}
        {phase === "done" && "Enviado al operador."}
      </p>

      {(phase === "uploading" || phase === "transcribing") && (
        <section className="call-card" aria-label="Transcripción en curso">
          <progress className="call-progress" aria-label="Transcribiendo la llamada" />
          <p>
            Transcribiendo…{phase === "transcribing" && <> <span className="call-elapsed" aria-hidden="true">{waited} s</span></>}
          </p>
          {phase === "transcribing" && ahead > 0 && (
            <p className="call-ahead">{ahead === 1 ? "Hay 1 llamada por delante de la tuya." : `Hay ${ahead} llamadas por delante de la tuya.`}</p>
          )}
          <p className="note">Suele tardar unos segundos, según lo larga que sea la llamada. Todavía no se ha enviado nada al operador.</p>
        </section>
      )}

      {(phase === "review" || phase === "submitting") && (
        <section aria-labelledby="rev-h" className="call-card call-review">
          <h2 id="rev-h">Esto es lo que hemos entendido</h2>
          <p className="call-transcript" ref={transcriptEl} tabIndex={-1} lang={language || undefined}>{transcript}</p>
          <p className="note">
            Es la transcripción automática de lo que dijiste{language && language !== "es" ? ` (idioma detectado: ${language})` : ""}; no se puede editar, para que el operador reciba exactamente tu llamada.
            Si no se parece a lo que dijiste, pulsa «Volver a grabar». Si recargas o cierras esta página, la llamada se pierde y tendrás que grabarla de nuevo.
          </p>
          <div className="call-controls">
            <button className="btn btn-dark btn-lg" onClick={submit} disabled={phase === "submitting"}>{phase === "submitting" ? "Enviando…" : "Enviar"}</button>
            <button className="btn btn-lg" onClick={discard} disabled={phase === "submitting"}>Volver a grabar</button>
          </div>
        </section>
      )}

      {phase === "done" && (
        <p className="call-ok">Enviado al operador. Tu llamada de prueba está en su bandeja; él decide qué hacer con ella. Gracias por probar el Copiloto 112.</p>
      )}
      {msg && <p className={msg.ok ? "call-ok" : "toast"} role="status">{msg.text}</p>}
    </main>
  );
}
