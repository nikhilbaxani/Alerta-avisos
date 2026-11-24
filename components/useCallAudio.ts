"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { findCall } from "@/data/scenarios";
import type { ConsoleState } from "@/lib/useConsole";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const audioUrl = (id: string) => `${BASE}/audio/${id}.mp3`;

/**
 * Audio de las llamadas del escenario (public/audio/<id>.mp3, sin red).
 * Nunca suena solo: únicamente cuando el operador pulsa «Escuchar» en una llamada. Los fallos de reproducción se ignoran.
 */
export function useCallAudio(s: ConsoleState) {
  const [playing, setPlaying] = useState<string | null>(null);
  const el = useRef<HTMLAudioElement | null>(null);

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

  const hasAudio = useCallback((id: string) => !s.live[id] && !!findCall(id), [s.live]);

  // Reinicio o cambio de escenario: silencio.
  useEffect(() => {
    stop();
  }, [s.epoch, stop]);

  return { playing, play, stop, hasAudio };
}

export type CallAudio = ReturnType<typeof useCallAudio>;
