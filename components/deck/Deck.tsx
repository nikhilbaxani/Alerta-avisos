"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { markDeckReturn } from "@/components/DeckReturn";
import Icon from "@/components/Icon";
import { STATIC_EXPORT } from "@/lib/config";
import { Mark } from "./bits";
import { SLIDES } from "./slides";

const W = 1600;
const H = 900;
/** Página principal. Enlace normal, sin prefetch: en la exportación estática con subruta, Next pide «/<subruta>.txt», que no existe. */
const HOME = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/`;

/**
 * Presentación interactiva anexa a la consola (/presentacion). Flechas, espacio o los botones para avanzar;
 * F pantalla completa; N notas del orador. La dirección guarda la diapositiva (#3). Al pasar de la última
 * (la del QR) se vuelve a la página principal.
 */
export default function Deck() {
  const router = useRouter();
  const n = SLIDES.length;
  const [i, setI] = useState(0);
  const [k, setK] = useState(0);
  const [notes, setNotes] = useState(false);
  const [mounted, setMounted] = useState<Set<number>>(() => new Set([0, 1]));
  const iRef = useRef(0);
  const touch = useRef<{ x: number; y: number } | null>(null);

  const go = useCallback(
    (to: number) => {
      if (to >= n) {
        markDeckReturn(n);
        if (STATIC_EXPORT) window.location.assign(HOME);
        else router.push("/");
        return;
      }
      const t = Math.max(0, Math.min(n - 1, to));
      iRef.current = t;
      setI(t);
    },
    [n, router],
  );
  const next = useCallback(() => go(iRef.current + 1), [go]);
  const prev = useCallback(() => go(iRef.current - 1), [go]);

  // Diapositiva inicial desde la dirección (#3) y escala del lienzo.
  useEffect(() => {
    const h = parseInt(window.location.hash.slice(1), 10);
    if (h >= 1 && h <= n) go(h - 1);
    const fit = () => setK(Math.min(window.innerWidth / W, window.innerHeight / H));
    fit();
    window.addEventListener("resize", fit);
    const onHash = () => {
      const x = parseInt(window.location.hash.slice(1), 10);
      if (x >= 1 && x <= n && x - 1 !== iRef.current) go(x - 1);
    };
    window.addEventListener("hashchange", onHash);
    return () => {
      window.removeEventListener("resize", fit);
      window.removeEventListener("hashchange", onHash);
    };
  }, [n, go]);

  // Monta la actual y sus vecinas (y conserva las ya vistas, para no perder su estado). Al montar no se toca
  // la dirección: el efecto anterior aún está leyendo «#n» y la sobrescribiría con «#1».
  const synced = useRef(false);
  useEffect(() => {
    if (synced.current) window.history.replaceState(null, "", `#${i + 1}`);
    synced.current = true;
    setMounted((m) => {
      const want = [i - 1, i, i + 1].filter((x) => x >= 0 && x < n && !m.has(x));
      return want.length ? new Set([...m, ...want]) : m;
    });
  }, [i, n]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, select, [contenteditable='true'], dialog") || document.querySelector("dialog[open]")) return;
      const onControl = !!el?.closest("button, a, summary, [role='button']");
      switch (e.key) {
        case "ArrowRight":
        case "PageDown":
          next();
          break;
        case "ArrowLeft":
        case "PageUp":
          prev();
          break;
        case " ":
        case "Enter":
          if (onControl) return;
          if (e.shiftKey) prev();
          else next();
          break;
        case "Home":
          go(0);
          break;
        case "End":
          go(n - 1);
          break;
        case "f":
        case "F":
          if (document.fullscreenElement) void document.exitFullscreen();
          else void document.documentElement.requestFullscreen?.().catch(() => undefined);
          break;
        case "n":
        case "N":
          setNotes((v) => !v);
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, go, n]);

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touch.current = (e.target as HTMLElement).closest("[data-noswipe], .map, .frame-body") ? null : { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touch.current;
    touch.current = null;
    if (!s) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) next();
      else prev();
    }
  };

  const cur = SLIDES[i];
  const last = i === n - 1;

  return (
    <div className="deck" data-ready={k > 0 ? "1" : "0"} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className={`deck-stage ${cur.theme === "light" ? "is-light" : ""}`} style={{ "--k": k || 1 } as React.CSSProperties}>
        {SLIDES.map((S, idx) => {
          const active = idx === i;
          const cls = ["slide", S.theme, S.tone ?? "", S.className ?? "", active ? "is-active" : "", idx < i ? "is-before" : ""].filter(Boolean).join(" ");
          return (
            <section key={S.id} className={cls} aria-roledescription="diapositiva" aria-label={`${idx + 1} de ${n}: ${S.title}`} aria-hidden={!active} inert={!active}>
              {mounted.has(idx) && <S.Body active={active} />}
            </section>
          );
        })}

        <header className="chrome">
          <a href={HOME} className="brandmark" aria-label="Avance 112: ir a la consola" onClick={() => markDeckReturn(iRef.current + 1)}>
            <Mark size={34} />
            <span>Avance <b>112</b></span>
          </a>
          <span className="section">{cur.section}</span>
          <span className="count" aria-live="polite">{String(i + 1).padStart(2, "0")} / {String(n).padStart(2, "0")}</span>
          <a href={HOME} className="exit" aria-label="Salir a la consola" title="Salir a la consola" onClick={() => markDeckReturn(iRef.current + 1)}><Icon name="close" size={18} /></a>
        </header>

        <footer className="foot">
          <span className="keys" aria-hidden="true"><kbd>←</kbd><kbd>→</kbd> avanzar · <kbd>F</kbd> pantalla completa · <kbd>N</kbd> notas</span>
          <nav className="prog" aria-label="Diapositivas">
            {SLIDES.map((S, idx) => (
              <button
                key={S.id}
                type="button"
                className={idx === i ? "cur" : idx < i ? "done" : ""}
                onClick={() => go(idx)}
                aria-label={`Ir a la diapositiva ${idx + 1}: ${S.title}`}
                aria-current={idx === i ? "step" : undefined}
              />
            ))}
          </nav>
          <div className="nav">
            <button type="button" className="nav-btn" onClick={prev} disabled={i === 0} aria-label="Diapositiva anterior">
              <Icon name="chevron" size={18} className="flip" />
            </button>
            {last ? (
              <button type="button" className="nav-btn go" onClick={next}>Abrir la consola<Icon name="chevron" size={18} /></button>
            ) : (
              <button type="button" className="nav-btn" onClick={next} aria-label="Diapositiva siguiente"><Icon name="chevron" size={18} /></button>
            )}
          </div>
        </footer>
      </div>

      {notes && (
        <aside className="notes" aria-label="Notas del orador">
          <h2>{String(i + 1).padStart(2, "0")} · {cur.title}</h2>
          <p>{cur.notes}</p>
        </aside>
      )}
      <p className="rotate">Gira el móvil para ver la presentación más grande.</p>
    </div>
  );
}
