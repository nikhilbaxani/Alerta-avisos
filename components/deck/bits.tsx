"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

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

/** Símbolo de Agente 112 (tres llamadas que convergen; arco ámbar: decisión humana; centro rojo: la persona). */
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
 * Logo de Agente 112: el símbolo y el nombre en texto (la fuente de la web, sin recursos externos).
 * La entrada (llamadas que llegan, anillo, arco ámbar y la persona) se repite cada vez que la diapositiva
 * se activa, porque las animaciones cuelgan de `.slide.is-active` (deck.css).
 */
export function LogoLockup({ className = "" }: { className?: string }) {
  const nodes = [
    { cy: 14, cx: 6, o: 0.45, link: "M10 16 L22 25" },
    { cy: 32, cx: 4, o: 0.7, link: "M9 32 L20 32" },
    { cy: 50, cx: 6, o: 0.45, link: "M10 48 L22 39" },
  ];
  return (
    <div className={`lockup ${className}`} role="img" aria-label="Agente 112">
      <svg className="lockup-mark" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        {nodes.map((n, i) => (
          <g key={n.cy} style={{ "--d": `${(i * 0.12).toFixed(2)}s` } as CSSProperties}>
            <circle className="lk-dot" cx={n.cx} cy={n.cy} r="3.2" fillOpacity={n.o} />
            <path className="lk-link" d={n.link} pathLength={1} />
          </g>
        ))}
        <circle className="lk-ring" cx="38" cy="32" r="16" pathLength={1} transform="rotate(-90 38 32)" />
        <path className="lk-arc" d="M38 16 A16 16 0 0 1 54 32" pathLength={1} />
        <circle className="lk-person" cx="38" cy="32" r="4.5" />
      </svg>
      <span className="lockup-name" aria-hidden="true">Agente <b>112</b></span>
    </div>
  );
}
