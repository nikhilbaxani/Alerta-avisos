"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_MAX_CALL_SECONDS } from "@/lib/publicCall";
import s from "./llamar.module.css";

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
const DELIVERY_FAILED = "No hemos podido entregar tu llamada al operador. Vuelve a grabarla.";
const RECEIPT_POLL_MS = 10 * 60_000;

const clock = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

const Icon = ({ d, children }: { d?: string; children?: React.ReactNode }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {d ? <path d={d} /> : children}
  </svg>
);
const Alert = () => <Icon><path d="M12 3 2.5 20h19L12 3Z" /><path d="M12 10v4.5M12 17.6v.1" /></Icon>;

/** Nombre del idioma detectado en castellano («árabe»); si el navegador no lo conoce, el código ISO. */
function languageName(code: string): string {
  try {
    return new Intl.DisplayNames(["es"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

const NOTICE = "Demo de hackathon. No es un servicio de emergencias. En una emergencia real, llama al 112.";
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className={s.page}>
      <div className={s.shell}>
        <div className={s.top}>
          <p className={s.brand}>Agente <span>112</span></p>
          <span className={s.chip}>Demo</span>
        </div>
        <p className={s.notice} role="note">
          <Alert />
          <b>{NOTICE}</b>
        </p>
        <h1 className={s.title}>Llamada de prueba al Agente 112</h1>
        {children}
      </div>
    </main>
  );
}

export default function CallRecorder() {
  const [consent, setConsent] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [secs, setSecs] = useState(0);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [deliveryFailed, setDeliveryFailed] = useState(false);
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

  const recording = phase === "recording";
  const busy = phase === "uploading" || phase === "transcribing" || phase === "review" || phase === "submitting";

  if (!RELAY) {
    return (
      <Shell>
        <p className={s.card}>La grabación no está disponible en esta versión.</p>
      </Shell>
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

  /** Vigila el recibo sin cambiarlo por errores transitorios de conexión. */
  const watchReceipt = async (id: string, token: number) => {
    const deadline = Date.now() + RECEIPT_POLL_MS;
    const active = () => run.current === token && Date.now() < deadline;
    for (let n = 0; active(); n++) {
      await sleep(Math.min(pollDelay(n), deadline - Date.now()));
      if (!active()) return;
      try {
        const res = await fetch(`${RELAY}/llamar/${id}`, { cache: "no-store" });
        if (!active()) return;
        if (res.status === 404) return setDeliveryFailed(true);
        if (!res.ok) continue;
        const body = await res.json();
        if (!active()) return;
        if (body?.status === "sent") return;
        if (body?.status === "failed" || body?.status === "expired") return setDeliveryFailed(true);
      } catch { /* El recibo no cambia si falla la conexión. */ }
    }
  };

  /** «Enviar»: confirma la llamada; el relay la publica al terminar de procesarla. */
  const submit = async () => {
    if (!callId) return;
    setPhase("submitting");
    setMsg(null);
    const token = ++run.current;
    try {
      const res = await fetch(`${RELAY}/llamar/${callId}/enviar`, { method: "POST" });
      const body = await res.json().catch(() => null);
      if (run.current !== token) return;
      if (res.ok && (body?.status === "publishing" || body?.status === "sent")) {
        setPhase("done");
        if (body.status === "publishing") void watchReceipt(callId, token);
        return;
      }
      if (res.status === 404 || res.status === 410) return backToIdle(GONE);
      const detail = typeof body?.error === "string" ? body.error : "";
      if (res.status === 409 || res.status === 502) return backToIdle(detail || "No se pudo procesar la llamada. Vuelve a grabar.");
      setMsg({ ok: false, text: detail || "No se pudo enviar. Inténtalo de nuevo." });
    } catch {
      if (run.current !== token) return;
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
    run.current++;
    setDeliveryFailed(false);
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

  const status =
    phase === "recording" ? "Grabando… habla cerca del micrófono."
    : phase === "uploading" ? "Enviando el audio para transcribirlo…"
    : phase === "transcribing" ? "Transcribiendo tu llamada…"
    : phase === "review" ? "Transcripción lista. Revísala y pulsa Enviar si es correcta."
    : phase === "submitting" ? "Enviando al operador…"
    : phase === "done" && !deliveryFailed ? "Envío confirmado." : "";

  return (
    <Shell>
      {msg && (
        <p className={s.error} role="alert">
          <Alert />
          <span>{msg.text}</span>
        </p>
      )}

      {/* Tras grabar, la pantalla se queda con lo importante: progreso, texto y botones (sin tener que bajar). */}
      {busy || recording || phase === "done" ? null : (
      <section aria-labelledby="how-h" className={s.card}>
        <h2 id="how-h" className={s.h2}>Qué hacer</h2>
        <ol className={s.steps}>
          <li><span>Pulsa <b>Grabar</b> y cuenta una emergencia inventada, como si llamaras al 112.</span></li>
          <li><span>Di <b>dónde estás</b>: calle o barrio de Málaga. Puedes hablar en tu idioma.</span></li>
          <li><span>Pulsa <b>Terminar</b> cuando acabes (máximo {clock(MAX)}). Antes de enviarla verás el texto que hemos entendido y podrás volver a grabar.</span></li>
        </ol>
      </section>
      )}


      {!busy && !recording && phase !== "done" && (
      <label className={s.consent}>
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>Acepto que mi audio se envíe por HTTPS a los servidores del equipo (el VPS y el ordenador del equipo) para transcribirlo, y que el texto resultante lo procese la IA del equipo para extraer los datos, aunque no llegue a pulsar «Enviar». Ni el audio ni el texto se guardan en disco, y no se recoge mi teléfono ni mi nombre. La llamada solo llega al operador si pulso «Enviar».</span>
      </label>
      )}

      {phase === "idle" && (
        <div className={s.rec}>
          <button className={s.recBtn} onClick={start} disabled={!consent} aria-describedby="rec-hint">
            <Icon><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></Icon>
            Grabar
          </button>
          <p className={s.hint} id="rec-hint">{consent ? "Listo: pulsa para empezar." : "Marca la casilla para poder grabar."}</p>
        </div>
      )}

      {recording && (
        <div className={s.rec}>
          <div className={s.live}>
            <span className={s.badge}><span className={s.dot} aria-hidden="true" />GRABANDO</span>
            <p className={s.timer} aria-live="off"><span className={s.sr}>Tiempo grabado </span>{clock(secs)} <small>/ {clock(MAX)}</small></p>
          </div>
          <div className={s.meter} aria-hidden="true"><i style={{ transform: `scaleX(${Math.min(1, secs / MAX)})` }} /></div>
          <button className={s.recBtn} data-live="true" onClick={() => rec.current?.stop()}>
            <Icon><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" /></Icon>
            Terminar
          </button>
        </div>
      )}

      {/* Región viva: anuncia cada cambio de fase sin repetir el contador de segundos. */}
      <p className={s.state} data-phase={phase} role="status" aria-live="polite" aria-atomic="true">
        {recording && <span className={s.dot} aria-hidden="true" />}
        {phase === "done" && !deliveryFailed && <Icon><circle cx="12" cy="12" r="10" /><path d="m7.5 12.5 3 3 6-7" /></Icon>}
        {status}
      </p>

      {(phase === "uploading" || phase === "transcribing") && (
        <section className={s.card} aria-label="Transcripción en curso">
          <div className={s.bar} aria-hidden="true"><i /></div>
          <progress className={s.sr} aria-label="Transcribiendo la llamada" />
          <div className={s.wait}>
            <p className={s.h2}>Transcribiendo…</p>
            {phase === "transcribing" && <span className={s.elapsed} aria-hidden="true">{waited} s</span>}
          </div>
          <p className={s.ahead}>
            {phase === "transcribing" && ahead > 0 ? (ahead === 1 ? "Hay 1 llamada por delante de la tuya." : `Hay ${ahead} llamadas por delante de la tuya.`) : null}
          </p>
          <p className={s.note}>Suele tardar unos segundos, según lo larga que sea la llamada. Todavía no se ha enviado nada al operador.</p>
        </section>
      )}

      {(phase === "review" || phase === "submitting") && (
        <section aria-labelledby="rev-h" className={`${s.card} ${s.review}`}>
          <h2 id="rev-h" className={s.h2}>Esto es lo que hemos entendido</h2>
          {language && <span className={s.lang}>Idioma detectado: {language === "es" ? "castellano" : languageName(language)}</span>}
          <p className={s.transcript} ref={transcriptEl} tabIndex={-1} lang={language && language !== "es" ? language : undefined} dir="auto">{transcript}</p>
          <p className={s.note}>
            Es la transcripción automática de lo que dijiste; no se puede editar, para que el operador reciba exactamente tu llamada.
            Si no se parece a lo que dijiste, pulsa «Volver a grabar». Si recargas o cierras esta página, la llamada se pierde y tendrás que grabarla de nuevo.
          </p>
          <div className={s.actions}>
            <button className={`${s.btn} ${s.primary}`} onClick={submit} disabled={phase === "submitting"}>{phase === "submitting" ? "Enviando…" : "Enviar"}</button>
            <button className={`${s.btn} ${s.secondary}`} onClick={discard} disabled={phase === "submitting"}>Volver a grabar</button>
          </div>
        </section>
      )}

      {phase === "done" && (deliveryFailed ? (
        <p className={s.error} role="alert"><Alert /><span>{DELIVERY_FAILED}</span></p>
      ) : (
        <p className={s.ok}>Tu llamada de prueba va a la bandeja del operador en unos instantes; quien la atienda decide qué hacer con ella. Gracias por probar el Agente 112.</p>
      ))}


      {phase === "done" && (
        <div className={s.actions}>
          <button className={`${s.btn} ${s.primary}`} onClick={start} disabled={!consent}>Grabar otra</button>
        </div>
      )}
    </Shell>
  );
}
