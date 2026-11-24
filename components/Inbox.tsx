"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { snapshot } from "@/lib/engine";
import { acceptEvent, addEvent, discardEvent, emptyInbox, publicEventToCall } from "@/lib/inbox";
import type { InboxState } from "@/lib/inbox";
import { RISK_LABELS, TYPE_LABELS } from "@/lib/labels";
import type { ProcessResult } from "@/lib/types";
import type { CallMeta, ConsoleState } from "@/lib/useConsole";
import CallQRCode from "./CallQRCode";
import Icon from "./Icon";
import { langName } from "./format";

const RELAY = (process.env.NEXT_PUBLIC_RELAY_URL ?? "").trim().replace(/\/$/, "");
const TOKEN_KEY = "copiloto112.operatorToken";

type Conn = "connecting" | "open" | "down";
type Act = { type: "event"; raw: unknown } | { type: "accept" | "discard"; id: string };

function reducer(s: InboxState, a: Act): InboxState {
  if (a.type === "event") return addEvent(s, a.raw);
  if (a.type === "discard") return discardEvent(s, a.id);
  return acceptEvent(s, a.id).state;
}

const CONN_TEXT: Record<Conn, string> = { open: "Conectado", connecting: "Reconectando…", down: "Sin conexión" };

interface Props {
  s: ConsoleState;
  onLive: (c: CallMeta, r: ProcessResult) => void;
}

/** Bandeja de llamadas del público: nada entra en el motor hasta que el operador pulsa «Aceptar» (S6). */
export default function Inbox({ s, onLive }: Props) {
  const [inbox, dispatch] = useReducer(reducer, emptyInbox);
  const [token, setToken] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [conn, setConn] = useState<Conn>("connecting");
  const ref = useRef({ s, inbox });
  ref.current = { s, inbox };

  // Token: ?op= (se guarda y se quita de la URL) o localStorage.
  useEffect(() => {
    if (!RELAY) return;
    try {
      const url = new URL(window.location.href);
      const fromUrl = url.searchParams.get("op");
      if (fromUrl) {
        localStorage.setItem(TOKEN_KEY, fromUrl);
        url.searchParams.delete("op");
        window.history.replaceState(null, "", url.pathname + url.search + url.hash);
        setToken(fromUrl);
        return;
      }
      setToken(localStorage.getItem(TOKEN_KEY) || "");
    } catch {
      setToken("");
    }
  }, []);

  useEffect(() => {
    if (!RELAY || !token) return;
    setConn("connecting");
    const es = new EventSource(`${RELAY}/events?token=${encodeURIComponent(token)}`);
    es.onopen = () => setConn("open");
    es.onerror = () => setConn(es.readyState === EventSource.CLOSED ? "down" : "connecting");
    es.addEventListener("call", (e) => {
      try {
        dispatch({ type: "event", raw: JSON.parse((e as MessageEvent<string>).data) });
      } catch {
        /* evento mal formado: se ignora */
      }
    });
    return () => es.close();
  }, [token]);

  const accept = useCallback(
    (id: string) => {
      const { s: cs, inbox: ib } = ref.current;
      const ev = ib.pending.find((e) => e.id === id);
      if (!ev) return;
      const { meta, result } = publicEventToCall(ev, cs.engine.incidents.map(snapshot), cs.clock);
      onLive(meta, result);
      dispatch({ type: "accept", id });
    },
    [onLive],
  );

  if (!RELAY) return null; // S8: sin relay, la consola es la de siempre

  return (
    <section className="inbox" aria-labelledby="inbox-h">
      <div className="inbox-head">
        <h3 id="inbox-h"><Icon name="phone" size={16} />Llamadas del público</h3>
        <span className={`conn conn-${conn}`} role="status">{token ? CONN_TEXT[conn] : "Sin token"}</span>
      </div>
      <CallQRCode />
      {token === "" && (
        <form
          className="inbox-token"
          onSubmit={(e) => {
            e.preventDefault();
            const v = draft.trim();
            if (!v) return;
            try { localStorage.setItem(TOKEN_KEY, v); } catch { /* sin almacenamiento */ }
            setToken(v);
          }}
        >
          <label htmlFor="op-token" className="note">Token del operador</label>
          <div className="live-row">
            <input id="op-token" type="password" autoComplete="off" value={draft} onChange={(e) => setDraft(e.target.value)} />
            <button className="btn" type="submit">Conectar</button>
          </div>
        </form>
      )}
      {inbox.pending.length === 0 ? (
        <p className="note inbox-empty">Sin llamadas pendientes. Las que llegan por el QR esperan aquí a que las aceptes.</p>
      ) : (
        <ul className="inbox-list">
          {[...inbox.pending].reverse().map((ev) => {
            const hh = new Date(ev.receivedAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
            return (
              <li key={ev.id} className="inbox-item">
                <div className="call-top">
                  <span className="call-time">{hh}</span>
                  <span className="lang">{langName(ev.language)}</span>
                  <span className="call-id">{ev.id} · {Math.round(ev.durationS)} s</span>
                </div>
                <p className="inbox-type">{TYPE_LABELS[ev.extraction.incident_type]}</p>
                {ev.location.known ? (
                  <p className="inbox-place">{ev.location.place}</p>
                ) : (
                  <p className="inbox-warn"><Icon name="alert" size={14} />Ubicación no reconocida</p>
                )}
                {ev.extraction.risks.length > 0 && (
                  <p className="inbox-risks">{ev.extraction.risks.map((r) => RISK_LABELS[r]).join(" · ")}</p>
                )}
                <p className="inbox-text">{ev.transcript}</p>
                {ev.translation_en && <p className="inbox-text note"><b>EN:</b> {ev.translation_en}</p>}
                <div className="inbox-actions">
                  <button className="btn btn-dark btn-sm" onClick={() => accept(ev.id)} aria-label={`Aceptar llamada ${ev.id}`}>Aceptar</button>
                  <button className="btn btn-sm" onClick={() => dispatch({ type: "discard", id: ev.id })} aria-label={`Descartar llamada ${ev.id}`}>Descartar</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
