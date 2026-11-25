"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { audioUrl } from "@/components/useCallAudio";
import Icon from "@/components/Icon";

/** Miles con punto, como en castellano escrito («4.770», no «4770»). */
export const fmt = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** Índice de entrada escalonada para `.rise` / `.fade`. */
export const at = (i: number) => ({ "--i": i }) as CSSProperties;

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Cuenta de 0 a `to` cada vez que la diapositiva se activa. */
export function CountUp({ to, active, ms = 1500, delay = 0 }: { to: number; active: boolean; ms?: number; delay?: number }) {
  const [v, setV] = useState(to);
  useEffect(() => {
    if (!active) return;
    if (reducedMotion()) {
      setV(to);
      return;
    }
    setV(0);
    let raf = 0;
    let start = 0;
    const step = (now: number) => {
      if (!start) start = now + delay;
      const p = Math.min(1, Math.max(0, (now - start) / ms));
      setV(to * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [active, to, ms, delay]);
  return <>{fmt(v)}</>;
}

/** Cronómetro que arranca al activar la diapositiva (la llamada que espera). */
export function useElapsed(active: boolean) {
  const [s, setS] = useState(0);
  useEffect(() => {
    if (!active) return;
    setS(0);
    const t0 = Date.now();
    const id = setInterval(() => setS(Math.floor((Date.now() - t0) / 1000)), 250);
    return () => clearInterval(id);
  }, [active]);
  return s;
}

/** Ventana de la consola: piezas reales de la interfaz dentro de la presentación. */
export function Frame({ title, tag, className = "", style, children }: { title: string; tag?: string; className?: string; style?: CSSProperties; children: ReactNode }) {
  return (
    <div className={`frame ${className}`} style={style}>
      <div className="frame-bar" aria-hidden="true">
        <span className="dots"><i /><i /><i /></span>
        {title}
        {tag && <span className="tag">{tag}</span>}
      </div>
      <div className="frame-body">{children}</div>
    </div>
  );
}

// Un solo audio para toda la presentación: al empezar uno, se para el anterior.
let current: { el: HTMLAudioElement; stop: () => void } | null = null;

/** Botón para escuchar una llamada del escenario (public/audio/<id>.mp3, sin red). Se calla al salir de la diapositiva. */
export function ListenButton({ id, label, active }: { id: string; label: string; active: boolean }) {
  const [on, setOn] = useState(false);
  const mine = useRef<HTMLAudioElement | null>(null);

  const stop = () => {
    const a = mine.current;
    mine.current = null;
    setOn(false);
    if (a) {
      a.pause();
      a.src = "";
    }
    if (current?.el === a) current = null;
  };

  useEffect(() => {
    if (!active && mine.current) stop();
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => stop(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = () => {
    if (on) return stop();
    current?.stop();
    const a = new Audio(audioUrl(id));
    mine.current = a;
    current = { el: a, stop };
    a.onended = stop;
    a.onerror = stop;
    setOn(true);
    a.play().catch(stop);
  };

  return (
    <button type="button" className={`dbtn ${on ? "playing" : ""}`} onClick={toggle} aria-pressed={on}>
      {on ? <span className="eq" aria-hidden="true"><i /><i /><i /></span> : <Icon name="play" size={16} />}
      {on ? "Sonando…" : label}
    </button>
  );
}

/** Símbolo de Avance 112 (tres llamadas que convergen; arco ámbar: decisión humana; centro rojo: la persona). */
export function Mark({ size = 30, ink = "currentColor" }: { size?: number; ink?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <circle cx="6" cy="14" r="3.2" fill={ink} opacity=".45" />
      <circle cx="4" cy="32" r="3.2" fill={ink} opacity=".7" />
      <circle cx="6" cy="50" r="3.2" fill={ink} opacity=".45" />
      <path d="M10 16 L22 25 M9 32 L20 32 M10 48 L22 39" stroke={ink} strokeWidth="2.4" strokeLinecap="round" opacity=".55" />
      <circle cx="38" cy="32" r="16" fill="none" stroke={ink} strokeWidth="6" />
      <path d="M38 16 A16 16 0 0 1 54 32" fill="none" stroke="#F2A900" strokeWidth="6" />
      <circle cx="38" cy="32" r="4.5" fill="#E8414C" />
    </svg>
  );
}

/**
 * Logo animado que vuelve a hacer su entrada cada vez que se activa la diapositiva. Un SVG dentro de
 * <img> no reinicia su animación si el navegador ya lo tiene en memoria, así que se sirve como blob nuevo.
 */
export function ReplayLogo({ src, active, alt, className }: { src: string; active: boolean; alt: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const text = useRef<string | null>(null);
  useEffect(() => {
    if (!active) return;
    let gone = false;
    let made: string | null = null;
    (async () => {
      try {
        if (text.current === null) text.current = await (await fetch(src)).text();
        if (gone) return;
        made = URL.createObjectURL(new Blob([text.current], { type: "image/svg+xml" }));
        setUrl(made);
      } catch {
        if (!gone) setUrl(src);
      }
    })();
    return () => {
      gone = true;
      if (made) setTimeout(() => URL.revokeObjectURL(made!), 1000);
    };
  }, [active, src]);
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img className={className} src={url} alt={alt} width={1100} height={300} /> : <div className={className} role="img" aria-label={alt} />;
}
