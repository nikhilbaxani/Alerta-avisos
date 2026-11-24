"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { findCall } from "@/data/scenarios";
import type { ConsoleState } from "@/lib/useConsole";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const KEY = "copiloto112.sonido";

export const audioUrl = (id: string) => `${BASE}/audio/${id}.mp3`;

/**
 * Audio de las llamadas del escenario (public/audio/<id>.mp3, sin red).
 * Al entrar una llamada suena si no hay otra sonando (así cada una se oye entera); a ×10 no suena sola.
 * Cada llamada se puede escuchar a mano desde su tarjeta. Los fallos de reproducción se ignoran.
 */
export function useCallAudio(s: ConsoleState) {
  const [enabled, setEnabled] = useState(true);
  const [playing, setPlaying] = useState<string | null>(null);
  const el = useRef<HTMLAudioElement | null>(null);
  const heard = useRef({ epoch: s.epoch, count: 0 });
  const sim = s.mode === "sim";

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === "0") setEnabled(false);
    } catch {
      /* sin almacenamiento: sonido activado */
    }
  }, []);

  const stop = useCallback(() => {
    const a = el.current;
    el.current = null;
    setPlaying(null);
    if (a) {
      a.pause();
      a.src = "";
    }
  }, []);

  const play = useCallback((id: string) => {
    stop();
    const a = new Audio(audioUrl(id));
    el.current = a;
    const done = () => {
      if (el.current === a) {
        el.current = null;
        setPlaying(null);
      }
    };
    a.onended = done;
    a.onerror = done;
    setPlaying(id);
    a.play().catch(done);
  }, [stop]);

  const hasAudio = useCallback((id: string) => sim && !s.live[id] && !!findCall(id), [sim, s.live]);

  // Cambiar de pestaña, reiniciar o cambiar de escenario detiene el audio.
  useEffect(() => {
    stop();
  }, [sim, s.epoch, stop]);

  // Pausa: silencio.
  useEffect(() => {
    if (!s.running) stop();
  }, [s.running, stop]);

  // Llamada nueva: suena si está activado, no va a ×10 y no hay otra sonando.
  useEffect(() => {
    if (!sim) return;
    const n = s.arrived.length;
    const previous = heard.current.epoch === s.epoch ? heard.current.count : 0;
    heard.current = { epoch: s.epoch, count: n };
    if (n <= previous) return;
    const newest = s.arrived[n - 1];
    if (!enabled || !s.running || s.speed >= 10 || el.current || !hasAudio(newest)) return;
    play(newest);
  }, [sim, s.epoch, s.arrived, s.running, s.speed, enabled, hasAudio, play]);

  const toggle = useCallback(() => {
    const next = !enabled;
    setEnabled(next);
    if (!next) stop();
    try {
      localStorage.setItem(KEY, next ? "1" : "0");
    } catch {
      /* sin almacenamiento */
    }
  }, [enabled, stop]);

  return { enabled, toggle, playing, play, stop, hasAudio };
}

export type CallAudio = ReturnType<typeof useCallAudio>;
