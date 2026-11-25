"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { consoleReducer, PUBLIC_RELAY_URL } from "@/lib/consoleMode";
import { snapshot } from "@/lib/engine";
import { acceptEvent, addEvent, clearInbox, discardEvent, emptyInbox, handleAckEvent, loadHandled, markLoaded, prepareAcceptedCall, receiveAccepted, saveHandled } from "@/lib/inbox";
import type { PublicCallEvent } from "@/lib/publicCall";
import type { InboxState } from "@/lib/inbox";
import { RISK_LABELS, TYPE_LABELS } from "@/lib/labels";
import type { ProcessResult } from "@/lib/types";
import type { CallMeta, ConsoleState } from "@/lib/useConsole";
import CallQRCode from "./CallQRCode";
import Icon from "./Icon";
import { langName } from "./format";

const TOKEN_KEY = "copiloto112.operatorToken";

type Conn = "connecting" | "open" | "down";
type Act = { type: "event" | "handled" | "accepted"; raw: unknown } | { type: "cleared" } | { type: "accept" | "discard"; id: string } | { type: "load"; ids: string[] };

function reducer(s: InboxState, a: Act): InboxState {
  if (a.type === "cleared") return clearInbox(s);
  if (a.type === "accepted") return receiveAccepted(s, a.raw).state;
  if (a.type === "event") return addEvent(s, a.raw);
  if (a.type === "handled") return handleAckEvent(s, a.raw);
  if (a.type === "load") return markLoaded(s, a.ids);
  if (a.type === "discard") return discardEvent(s, a.id);
  return a.type === "accept" ? acceptEvent(s, a.id).state : s;
}

const CONN_TEXT: Record<Conn, string> = { open: "Conectado", connecting: "Reconectando…", down: "Sin conexión" };

interface Props {
  s: ConsoleState;
  visible?: boolean;
  onLive: (c: CallMeta, r: ProcessResult) => void;
}

/** Bandeja de llamadas del público: nada entra en el motor hasta que el operador pulsa «Aceptar» (S6). */
export default function Inbox({ s, visible = true, onLive }: Props) {
  const [inbox, dispatch] = useReducer(reducer, emptyInbox);
  const [token, setToken] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [conn, setConn] = useState<Conn>("connecting");
  const ref = useRef({ s, inbox, onLive });
  ref.current = { s, inbox, onLive };
  const integrate = useCallback((ev: PublicCallEvent) => {
    const current = ref.current;
    const live = current.s.mode === "live" ? current.s : current.s.saved.live;
    const prepared = prepareAcceptedCall(ev, live?.live ?? {}, live?.engine.incidents.map(snapshot) ?? [], live?.clock ?? 0);
    if (!prepared) return;
    const { meta, result } = prepared;
    // Un lote SSE puede llegar antes de que React renderice: cada llamada ve las anteriores del lote.
    current.s = consoleReducer(current.s, { type: "live", call: meta, result });
    current.onLive(meta, result);
  }, []);

  // La lista local también evita volver a ofrecer una llamada si el acuse al relay no llegó.
  useEffect(() => {
    if (!PUBLIC_RELAY_URL) return;
    try {
      dispatch({ type: "load", ids: loadHandled(localStorage, PUBLIC_RELAY_URL) });
    } catch {
      /* sin almacenamiento */
    }
  }, []);

  useEffect(() => {
    if (!PUBLIC_RELAY_URL || inbox.seen.length === 0) return;
    try {
      saveHandled(localStorage, PUBLIC_RELAY_URL, inbox.seen);
    } catch {
      /* sin almacenamiento */
    }
  }, [inbox.seen]);

  // Token: #op=<token> (el fragmento no llega a los registros de Vercel). Se acepta también ?op= por compatibilidad.
  // Se guarda en localStorage y se quita de la URL.
  useEffect(() => {
    if (!PUBLIC_RELAY_URL) return;
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
    if (!PUBLIC_RELAY_URL || !token) return;
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let delay = 2000;
    let failures = 0;
    let stopped = false;
    const connect = () => {
      if (stopped) return;
      setConn("connecting");
      const src = new EventSource(`${PUBLIC_RELAY_URL}/events?token=${encodeURIComponent(token)}`);
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
      const receive = (type: "event" | "handled") => (e: Event) => {
        try {
          dispatch({ type, raw: JSON.parse((e as MessageEvent<string>).data) });
        } catch {
          /* evento mal formado: se ignora */
        }
      };
      src.addEventListener("call", receive("event"));
      src.addEventListener("handled", receive("handled"));
      src.addEventListener("accepted", (e) => {
        let raw: unknown;
        try { raw = JSON.parse((e as MessageEvent<string>).data); } catch { return; }
        const { accepted } = receiveAccepted(ref.current.inbox, raw);
        if (!accepted) return;
        dispatch({ type: "accepted", raw });
        integrate(accepted);
      });
      src.addEventListener("cleared", () => dispatch({ type: "cleared" }));
    };
    connect();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      es?.close();
    };
  }, [token, integrate]);

  const acknowledge = useCallback(async (id: string, outcome: "accepted" | "discarded") => {
    if (!PUBLIC_RELAY_URL || !token) return;
    try {
      await fetch(`${PUBLIC_RELAY_URL}/events/ack`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ id, outcome }),
      });
    } catch {
      /* Un acuse fallido no bloquea la decisión ni la lista local. */
    }
  }, [token]);

  const accept = useCallback(
    (id: string) => {
      const { s: cs, inbox: ib } = ref.current;
      const ev = ib.pending.find((e) => e.id === id);
      if (cs.mode !== "live" || !ev) return;
      integrate(ev);
      dispatch({ type: "accept", id });
      void acknowledge(id, "accepted");
    },
    [integrate, acknowledge],
  );

  if (!PUBLIC_RELAY_URL) return null; // S8: sin relay, la consola es la de siempre

  return (
    <section className="inbox" hidden={!visible} aria-labelledby="inbox-h">
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
                <p className="inbox-text" dir="auto">{ev.transcript}</p>
                {ev.extraction.translation_es && <p className="inbox-text note"><b>ES:</b> {ev.extraction.translation_es}</p>}
                {ev.translation_en && <p className="inbox-text note"><b>EN:</b> {ev.translation_en}</p>}
                <div className="inbox-actions">
                  <button className="btn btn-dark btn-sm" onClick={() => accept(ev.id)} aria-label={`Aceptar llamada ${ev.id}`}>Aceptar</button>
                  <button className="btn btn-sm" onClick={() => { dispatch({ type: "discard", id: ev.id }); void acknowledge(ev.id, "discarded"); }} aria-label={`Descartar llamada ${ev.id}`}>Descartar</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
