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
  const [editing, setEditing] = useState(false);
  const [conn, setConn] = useState<Conn>("connecting");
  const ref = useRef({ s, inbox });
  ref.current = { s, inbox };

  // Token: #op=<token> (el fragmento no llega a los registros de Vercel). Se acepta también ?op= por compatibilidad.
  // Se guarda en localStorage y se quita de la URL.
  useEffect(() => {
    if (!RELAY) return;
    try {
      const url = new URL(window.location.href);
      const fromHash = new URLSearchParams(url.hash.replace(/^#/, "")).get("op");
      const fromQuery = url.searchParams.get("op");
      const fromUrl = fromHash || fromQuery;
      if (fromUrl) {
        localStorage.setItem(TOKEN_KEY, fromUrl);
        url.searchParams.delete("op");
        const h = new URLSearchParams(url.hash.replace(/^#/, ""));
        h.delete("op");
        const rest = h.toString();
        window.history.replaceState(null, "", url.pathname + url.search + (rest ? `#${rest}` : ""));
        setToken(fromUrl);
        return;
      }
      setToken(localStorage.getItem(TOKEN_KEY) || "");
    } catch {
      setToken("");
    }
  }, []);

  // SSE con reconexión: si el navegador cierra el EventSource (p. ej. 401 o caída del VPS) se recrea con espera 2 s → 15 s.
  useEffect(() => {
    if (!RELAY || !token) return;
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let delay = 2000;
    let failures = 0;
    let stopped = false;
    const connect = () => {
      if (stopped) return;
      setConn("connecting");
      const src = new EventSource(`${RELAY}/events?token=${encodeURIComponent(token)}`);
      es = src;
      src.onopen = () => {
        delay = 2000;
        failures = 0;
        setConn("open");
      };
      src.onerror = () => {
        if (src.readyState !== EventSource.CLOSED) return setConn("connecting"); // el navegador reintenta solo
        src.close();
        failures += 1;
        setConn(failures >= 3 ? "down" : "connecting");
        timer = setTimeout(connect, delay);
        delay = Math.min(delay * 2, 15_000);
      };
      src.addEventListener("call", (e) => {
        try {
          dispatch({ type: "event", raw: JSON.parse((e as MessageEvent<string>).data) });
        } catch {
          /* evento mal formado: se ignora */
        }
      });
    };
    connect();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      es?.close();
    };
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
      {token && (
        <button type="button" className="btn btn-sm" onClick={() => { setDraft(""); setEditing((v) => !v); }} aria-expanded={editing}>
          Cambiar token
        </button>
      )}
      {(token === "" || editing) && (
        <form
          className="inbox-token"
          onSubmit={(e) => {
            e.preventDefault();
            const v = draft.trim();
            if (!v) return;
            try { localStorage.setItem(TOKEN_KEY, v); } catch { /* sin almacenamiento */ }
            setToken(v);
            setEditing(false);
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
