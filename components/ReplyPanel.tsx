"use client";

import { useState } from "react";
import { LANG_NAMES } from "@/lib/labels";
import { PHRASES, SPEECH_LOCALE } from "@/lib/phrases";
import type { Reply } from "@/lib/useConsole";

interface Props {
  incidentId: string;
  langs: string[];
  clock: number;
  localAI: boolean;
  replies: Reply[];
  onReply: (r: Reply) => void;
}

function speak(text: string, lang: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = SPEECH_LOCALE[lang] ?? lang;
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(lang));
  if (voice) u.voice = voice;
  window.speechSynthesis.speak(u);
  return true;
}

export default function ReplyPanel({ incidentId, langs, clock, localAI, replies, onReply }: Props) {
  const foreign = langs.filter((l) => l !== "es");
  const [pick, setPick] = useState<string | null>(null);
  const [phraseId, setPhraseId] = useState<string | null>(null);
  const [free, setFree] = useState("");
  const [msg, setMsg] = useState("");
  const [freeOut, setFreeOut] = useState<{ es: string; tr: string } | null>(null);
  const lang = pick && foreign.includes(pick) ? pick : foreign[0];

  if (!lang) {
    return (
      <section className="reply" aria-label="Respuesta al llamante">
        <h3>Responder al llamante</h3>
        <p className="note">Los llamantes de este incidente hablan castellano: no hace falta traducir.</p>
      </section>
    );
  }

  const phrase = PHRASES.find((p) => p.id === phraseId);
  const current = freeOut ?? (phrase ? { es: phrase.es, tr: phrase.tr[lang] ?? "" } : null);
  const mine = replies.filter((r) => r.incidentId === incidentId).slice(-2);

  const play = () => {
    if (!current) return;
    const ok = speak(current.tr, lang);
    setMsg(ok ? "" : "Este navegador no tiene síntesis de voz.");
    onReply({ incidentId, t: clock, lang, es: current.es, tr: current.tr });
  };

  const translateFree = async () => {
    setMsg("");
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: free, lang }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPhraseId(null);
      setFreeOut({ es: free.trim(), tr: data.text });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "No se pudo traducir");
    }
  };

  return (
    <section className="reply" aria-label="Respuesta al llamante">
      <h3>Responder al llamante en {LANG_NAMES[lang] ?? lang}</h3>
      {foreign.length > 1 && (
        <div className="chips" role="group" aria-label="Idioma del llamante">
          {foreign.map((l) => (
            <button key={l} className="btn" aria-pressed={l === lang} onClick={() => { setPick(l); setFreeOut(null); }}>
              {LANG_NAMES[l] ?? l}
            </button>
          ))}
        </div>
      )}
      <div className="phrases">
        {PHRASES.map((p) => (
          <button key={p.id} className="phrase" aria-pressed={!freeOut && p.id === phraseId} onClick={() => { setPhraseId(p.id); setFreeOut(null); setMsg(""); }}>
            <span>{p.es}</span>
          </button>
        ))}
      </div>
      <form className="free" onSubmit={(e) => { e.preventDefault(); if (free.trim() && localAI) void translateFree(); }}>
        <input value={free} onChange={(e) => setFree(e.target.value)} placeholder="Texto libre en castellano" aria-label="Texto libre en castellano" disabled={!localAI} />
        <button className="btn" type="submit" disabled={!localAI || !free.trim()}>Traducir</button>
      </form>
      {!localAI && <p className="note">La traducción libre necesita el modelo local.</p>}
      {current && (
        <>
          <div className="said" lang={lang} dir={lang === "ar" ? "rtl" : "ltr"}>{current.tr}</div>
          <button className="btn primary" onClick={play}>Reproducir al llamante</button>
        </>
      )}
      {msg && <p className="toast" role="status">{msg}</p>}
      {mine.length > 0 && (
        <p className="note">Enviado: {mine.map((r) => `«${r.es}»`).join(" · ")}</p>
      )}
    </section>
  );
}
