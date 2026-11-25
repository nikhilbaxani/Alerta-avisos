"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { findCall } from "@/data/scenarios";
import { isEcall } from "@/lib/ecall";
import type { ConsoleState } from "@/lib/useConsole";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const audioUrl = (id: string) => `${BASE}/audio/${id}.mp3`;

/** Solo se reproduce bajo demanda y en simulación; las eCall no tienen audio. */
export function useCallAudio(s: ConsoleState) {
  const [playing, setPlaying] = useState<string | null>(null);
  const el = useRef<HTMLAudioElement | null>(null);
  const sim = s.mode === "sim";

  const stop = useCallback(() => {
    const a = el.current;
    el.current = null;
    setPlaying(null);
    if (a) {
      a.pause();
      a.src = "";
    }
  }, []);

  const hasAudio = useCallback((id: string) => {
    const c = sim && !s.live[id] ? findCall(id) : undefined;
    return !!c && !isEcall(c);
  }, [sim, s.live]);

  const play = useCallback((id: string) => {
    if (!hasAudio(id)) return;
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
  }, [hasAudio, stop]);

  // Cambiar de pestaña, reiniciar o cambiar de escenario detiene el audio.
  useEffect(() => {
    stop();
  }, [sim, s.epoch, stop]);

  return { playing, play, stop, hasAudio };
}

export type CallAudio = ReturnType<typeof useCallAudio>;
