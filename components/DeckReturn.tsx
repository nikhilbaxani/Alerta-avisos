"use client";

import { useEffect, useState } from "react";
import Icon from "./Icon";

const KEY = "avance112.presentacion";

/** La presentación apunta desde qué diapositiva (1…n) se fue a la consola, para poder volver a ella. */
export function markDeckReturn(slide: number) {
  try {
    sessionStorage.setItem(KEY, String(slide));
  } catch {
    /* sin almacenamiento: no habrá botón de vuelta */
  }
}

/** Botón flotante en la consola para volver a la presentación, solo si se llegó desde ella. */
export default function DeckReturn() {
  const [slide, setSlide] = useState<number | null>(null);

  useEffect(() => {
    try {
      const n = parseInt(sessionStorage.getItem(KEY) ?? "", 10);
      if (n >= 1) setSlide(n);
    } catch {
      /* sin almacenamiento */
    }
  }, []);

  if (!slide) return null;
  const hide = () => {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* sin almacenamiento */
    }
    setSlide(null);
  };

  return (
    <nav className="deck-return" aria-label="Presentación">
      {/* Enlace normal: la presentación lee «#n» al cargar y así vuelve a la diapositiva de la que se salió. */}
      <a href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/presentacion#${slide}`} className="btn btn-dark">
        <Icon name="chevron" className="flip-x" />Volver a la presentación
      </a>
      <button type="button" className="btn btn-icon btn-ghost" onClick={hide} aria-label="Ocultar el botón de vuelta" title="Ocultar">
        <Icon name="close" />
      </button>
    </nav>
  );
}
