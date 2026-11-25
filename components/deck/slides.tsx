"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import animatedLogo from "@/docs/marca/avance-112/avance-112-animado.svg";
import { SCENARIOS, findCall, getScenario } from "@/data/scenarios";
import type { AgentAction } from "@/lib/actions";
import { haversine } from "@/lib/cluster";
import { LANG_NAMES, RISK_LABELS } from "@/lib/labels";
import { PHRASES } from "@/lib/phrases";
import { replayTo } from "@/lib/replay";
import { reducer } from "@/lib/useConsole";
import type { Reply } from "@/lib/useConsole";
import AgentActions from "@/components/AgentActions";
import DecisionBanner from "@/components/DecisionBanner";
import Icon from "@/components/Icon";
import type { IconName } from "@/components/Icon";
import ReplyPanel from "@/components/ReplyPanel";
import { langName, mmss } from "@/components/format";
import LiveConsole from "./LiveConsole";
import QrCode from "./QrCode";
import { CountUp, Frame, ListenButton, ReplayLogo, at, fmt, useElapsed } from "./bits";

export interface SlideProps {
  active: boolean;
}

export interface SlideDef {
  id: string;
  /** Sección que se ve arriba a la derecha (como en el deck de AgroSpace). */
  section: string;
  title: string;
  theme: "dark" | "light";
  tone?: "amber" | "green";
  className?: string;
  notes: string;
  Body: (p: SlideProps) => ReactNode;
}

const DANA = "dana-malaga";
const scn = getScenario(DANA);
const call = (id: string) => findCall(id)!;
const BAND = { ASK: 0.45, MERGE: 0.78 };
const comma = (n: number, d = 2) => n.toFixed(d).replace(".", ",");

// Estado real del escenario al final, con las dos decisiones del operador que pide la evaluación.
let finalCache: ReturnType<typeof replayTo> | null = null;
const finalState = () => (finalCache ??= replayTo(DANA, Infinity, { F1: false, B2: true }));

/** Tarjeta de llamada con el marcado de la cola de la consola (CallQueue), sin ser un botón. */
function CallItem({ id, status, cls, style, text, inline }: { id: string; status: string; cls: string; style?: CSSProperties; text?: string; inline?: boolean }) {
  const c = call(id);
  const foreign = c.lang !== "es";
  const st = <span className={`call-status ${cls}`}>{status}</span>;
  return (
    <li className="call" style={style}>
      <div className="call-row">
        <span className="call-top">
          <span className="call-time">{mmss(c.t)}</span>
          <span className={`lang ${foreign ? "foreign" : ""}`}>{foreign && <Icon name="globe" size={13} />}{langName(c.lang)}</span>
          {inline ? <span className="call-id">{id} · {st}</span> : <span className="call-id">{id}</span>}
        </span>
        <span className="call-text">{text ?? c.mock.summary_es}</span>
        {!inline && st}
      </div>
    </li>
  );
}

// ═════════════════════════════ 1 · Gancho: la DANA de Valencia

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Enjambre de llamadas: cada punto es una llamada; al final se juntan de cuatro en cuatro en emergencias. */
function Swarm() {
  const groups = useMemo(() => {
    const rnd = mulberry32(112);
    const out: { cx: number; cy: number; gd: number; dots: { x: number; y: number; gx: number; gy: number; d: number }[] }[] = [];
    for (let row = 0; row < 6; row++)
      for (let col = 0; col < 8; col++) {
        const cx = 40 + col * 74 + (rnd() - 0.5) * 18 + (row % 2) * 10;
        const cy = 40 + row * 84 + (rnd() - 0.5) * 18;
        const r = rnd();
        const n = r < 0.2 ? 5 : r < 0.32 ? 3 : 4; // de media, unas 4 llamadas por incidente
        const dots = Array.from({ length: n }, (_, j) => {
          const ang = (j / n) * Math.PI * 2 + rnd() * 1.2;
          const dist = 13 + rnd() * 9;
          const k = (6 - dist) / dist;
          const x = cx + Math.cos(ang) * dist;
          const y = cy + Math.sin(ang) * dist;
          return { x, y, gx: (x - cx) * k, gy: (y - cy) * k, d: 0.3 + rnd() * 3 };
        });
        out.push({ cx, cy, gd: rnd() * 0.5, dots });
      }
    return out;
  }, []);
  const px = (n: number) => `${n.toFixed(2)}px`;
  return (
    <svg className="swarm" viewBox="0 0 600 560" aria-hidden="true">
      {groups.map((g, i) => (
        <g key={i}>
          {g.dots.map((d, j) => (
            <circle key={`p${j}`} className="pulse" cx={d.x.toFixed(2)} cy={d.y.toFixed(2)} r="4.2" style={{ "--d": `${d.d.toFixed(2)}s` } as CSSProperties} />
          ))}
          {g.dots.map((d, j) => (
            <circle
              key={`d${j}`}
              className="dot"
              cx={d.x.toFixed(2)}
              cy={d.y.toFixed(2)}
              r="4.2"
              style={{ "--d": `${d.d.toFixed(2)}s`, "--gx": px(d.gx), "--gy": px(d.gy) } as CSSProperties}
            />
          ))}
          <circle className="group" cx={g.cx.toFixed(2)} cy={g.cy.toFixed(2)} r="15" style={{ "--gd": `${g.gd.toFixed(2)}s` } as CSSProperties} />
        </g>
      ))}
      <text className="cap" x="300" y="552">cada punto, una llamada · cada círculo, una emergencia</text>
    </svg>
  );
}

function Hook({ active }: SlideProps) {
  return (
    <>
      <div className="copy">
        <p className="eyebrow rise" style={at(0)}><span className="bar" />29 de octubre de 2024 · DANA de Valencia</p>
        <p className="big num rise" style={at(1)} aria-label="19.821"><CountUp to={19821} active={active} ms={1800} delay={300} /></p>
        <p className="big-label rise" style={at(2)}>llamadas al 112</p>
        <p className="vs rise" style={at(3)}>para <span className="num">4.770</span> incidentes.</p>
        <span className="chip red ratio rise" style={at(4)}>≈ 4 llamadas por cada emergencia</span>
        <p className="src fade" style={at(6)}>Fuente: <b>112 Comunitat Valenciana</b> / prensa</p>
      </div>
      <Swarm />
    </>
  );
}

// ═════════════════════════════ 2 · El apagón

function Blackout({ active }: SlideProps) {
  return (
    <>
      <div className="head">
        <p className="eyebrow rise" style={at(0)}><span className="bar" />28 de abril de 2025 · Apagón</p>
        <h2 className="h2 rise" style={at(1)}>Cuando todo falla, <em>todo el mundo llama</em>.</h2>
      </div>
      <div className="s-stats">
        <div className="card stat rise" style={at(2)}>
          <p className="num">×4</p>
          <p className="what">llamadas al 112: se multiplicaron por cuatro</p>
          <p className="who">112 autonómicos / prensa</p>
        </div>
        <div className="card stat rise" style={at(3)}>
          <p className="num">+<CountUp to={10000} active={active} delay={500} /></p>
          <p className="what">llamadas perdidas en Cataluña</p>
          <p className="who">112 autonómicos / prensa</p>
        </div>
        <div className="card stat rise" style={at(4)}>
          <p className="num"><CountUp to={4385} active={active} delay={650} /></p>
          <p className="what">llamadas: récord en Aragón</p>
          <p className="who">112 autonómicos / prensa</p>
        </div>
      </div>
      <div className="spacer" />
      <p className="punch rise" style={at(6)}>
        <span className="soft">En una catástrofe, el cuello de botella no son los recursos.</span> <u>Son las líneas.</u>
      </p>
    </>
  );
}

// ═════════════════════════════ 3 · Seis llamadas por el mismo coche

function SixCalls({ active }: SlideProps) {
  const wait = useElapsed(active);
  const e1 = call("E1");
  const six = scn.calls.filter((c) => c.gold === "A").map((c) => c.id);
  return (
    <>
      <div className="head">
        <p className="eyebrow rise" style={at(0)}><span className="bar" />El problema, dentro de la sala</p>
        <h2 className="h2 rise" style={at(1)}>Seis llamadas por el mismo coche. <em>Una, en árabe, por un infarto.</em></h2>
      </div>
      <div className="s-six">
        <div className="left">
          <Frame title="Llamadas entrantes · sin copiloto · escenario ficticio" tag={`${six.length} líneas ocupadas`} className="rise" style={at(2)}>
            <ul className="calls">
              {six.map((id, i) => (
                <CallItem key={id} id={id} inline style={at(i)} cls="busy" status={i === 0 ? "ocupa una línea" : "ocupa otra línea"} />
              ))}
            </ul>
          </Frame>
        </div>
        <div className="right">
          <div className="card waiting rise" style={at(3)}>
            <div className="top">
              <span className="ring" aria-hidden="true"><Icon name="phone" size={20} /></span>
              <span><b>E1 · Árabe</b><br />{e1.mock.location_text}</span>
              <span className="timer" aria-label={`En espera ${mmss(wait)}`}>{mmss(wait)}</span>
            </div>
            <p className="ar" lang="ar" dir="rtl">{e1.transcript}</p>
            <p className="es">{e1.mock.summary_es}</p>
          </div>
          <div className="row rise" style={at(4)}>
            <ListenButton id="A1" label="Escuchar A1" active={active} />
            <ListenButton id="E1" label="Escuchar E1, en árabe" active={active} />
          </div>
          <div className="facts">
            <div className="fact rise" style={at(5)}>
              <span className="num">{fmt(43845)}</span>
              <span className="body">llamadas en idioma extranjero al 112 de Andalucía en 2024 <span className="src">· Junta de Andalucía</span></span>
            </div>
            <div className="fact rise" style={at(6)}>
              <span className="num">~30 s</span>
              <span className="body">para conectar con un intérprete humano <span className="src">· 112 Catalunya</span></span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ═════════════════════════════ 4 · Revelación

function Reveal({ active }: SlideProps) {
  return (
    <>
      <ReplayLogo className="logo" src={animatedLogo.src} active={active} alt="Avance 112. La IA propone. El operador decide." />
      <p className="lead rise" style={at(4)}>Un agente de IA para las salas del 112 en catástrofes: ordena la avalancha de llamadas para que la crítica no espere.</p>
      <div className="chips rise" style={at(5)}>
        <span className="chip">Agrupa</span>
        <span className="chip">Detecta lo nuevo</span>
        <span className="chip">Traduce</span>
      </div>
      <p className="meta fade" style={at(7)}>100 % local · sin nube · castellano, AML y Ley de IA</p>
    </>
  );
}

// ═════════════════════════════ 5 · Qué hace

function ThreeThings() {
  const s = finalState();
  const inc = (id: string) => s.engine.assignment[id];
  const a4 = s.engine.incidents.find((i) => i.alerts.some((a) => a.callId === "A4"));
  const a4risks = a4?.alerts.find((a) => a.callId === "A4")?.risks ?? [];
  const far = haversine(call("B1").aml, call("B2").aml);
  const respira = PHRASES.find((p) => p.id === "respira")!;
  return (
    <>
      <div className="head">
        <p className="eyebrow rise" style={at(0)}><span className="bar" />Cómo funciona</p>
        <h2 className="h2 rise" style={at(1)}>Agrupa, detecta lo nuevo y traduce. <em>A la vez.</em></h2>
      </div>
      <div className="s-three">
        <div className="card col rise" style={at(2)}>
          <span className="k">01</span>
          <h3>Agrupa</h3>
          <p className="body">Las llamadas sobre la misma emergencia se juntan. Cuenta la dirección que se menciona, no solo dónde está el móvil.</p>
          <div className="ui">
            <ul className="mini calls">
              <CallItem id="A2" cls="dup" status={`Repetida · agrupada en ${inc("A2")}`} />
              <CallItem id="B2" cls="dup" status={`A ${comma(far / 1000, 1)} km, misma dirección · ${inc("B2")}`} />
            </ul>
          </div>
        </div>
        <div className="card col rise" style={at(3)}>
          <span className="k">02</span>
          <h3>Detecta lo nuevo</h3>
          <p className="body">Una llamada repetida no se descarta: se compara con lo que ya se sabe. Si trae algo nuevo, sube la prioridad.</p>
          <div className="ui">
            <div className="mini">
              <ul className="calls"><CallItem id="A4" cls="dup" status={`Repetida · agrupada en ${inc("A4")}`} /></ul>
              <div className="newinfo"><Icon name="alert" size={16} />Información nueva: {a4risks.map((r) => RISK_LABELS[r]).join(", ")} · sube la prioridad</div>
            </div>
          </div>
        </div>
        <div className="card col rise" style={at(4)}>
          <span className="k">03</span>
          <h3>Traduce</h3>
          <p className="body">El operador responde en castellano con frases rápidas y el llamante lo oye en su idioma.</p>
          <div className="ui">
            <div className="mini">
              <ul className="calls"><CallItem id="E1" cls="new" status={`Emergencia nueva · ${inc("E1")}`} /></ul>
              <div className="reply">
                <small>Responder en árabe · «{respira.es}»</small>
                <span className="ar" lang="ar" dir="rtl">{respira.tr.ar}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="pipeline fade" style={at(6)}>
        <span className="chip mono">audio</span><span className="arrow">→</span>
        <span className="chip mono">Whisper</span><span className="arrow">→</span>
        <span className="chip mono">extracción con LLM local</span><span className="arrow">→</span>
        <span className="chip mono">agrupación determinista</span><span className="arrow">→</span>
        <span className="chip mono">prioridad</span>
        <span className="chip ok" style={{ marginLeft: "auto" }}>Todo en esta máquina · sin nube</span>
      </div>
    </>
  );
}

// ═════════════════════════════ 6 · La consola en directo

function Live({ active }: SlideProps) {
  const incidents = new Set(scn.calls.map((c) => c.gold)).size;
  return (
    <>
      <div className="s-live-head">
        <div className="head">
          <p className="eyebrow rise" style={at(0)}><span className="bar" />La consola, en directo</p>
          <h2 className="h2 rise" style={at(1)}>{scn.calls.length} llamadas. <em>{incidents} emergencias.</em></h2>
        </div>
        <div className="hint fade" style={at(3)}>
          <span className="live-tag"><i />En directo · simulado</span>
          <span>Cuando la IA dude, decides tú: <kbd>M</kbd> mismo · <kbd>D</kbd> distinto</span>
        </div>
      </div>
      <Frame title="Avance 112 · consola de sala" tag="la misma de la página principal" className="s-live rise" style={at(2)}>
        <LiveConsole active={active} />
      </Frame>
    </>
  );
}

// ═════════════════════════════ 7 · Zona gris

function GrayZoneDecision({ active, onAgain }: SlideProps & { onAgain: () => void }) {
  // Estado real de la consola justo después de entrar F1 (segundo coche, a unos cientos de metros del primero).
  const [s, dispatch] = useReducer(reducer, undefined, () => replayTo(DANA, call("F1").t));
  const last = [...s.audit].reverse().find((a) => a.kind === "operador_mismo" || a.kind === "operador_distinto");
  const decide = (incidentId: string, same: boolean) => dispatch({ type: "decide", incidentId, same });
  if (!last) return active ? <DecisionBanner s={s} onDecide={decide} /> : null;
  const same = last.kind === "operador_mismo";
  return (
    <div className="outcome" role="status">
      <h3><Icon name="check" size={18} />{same ? `Mismo incidente: agrupada en ${last.incidentId}` : "Incidente distinto: dos coches, dos rescates"}</h3>
      <p>{same ? "Si te has equivocado, «Separar» lo deshace. Todo queda en el registro de decisiones." : `${last.incidentId} sigue abierto con su propia prioridad: nadie se queda sin rescate porque la IA lo diera por repetido.`}</p>
      <button type="button" className="btn btn-sm" onClick={onAgain}><Icon name="restart" size={15} />Volver a preguntar</button>
    </div>
  );
}

function GrayZone({ active }: SlideProps) {
  const [round, setRound] = useState(0);
  // Puntuaciones reales del escenario: una de cada zona y las dos que preguntan.
  const pins = useMemo(() => {
    const s = replayTo(DANA);
    return (["G1", "B2", "F1", "A2"] as const).map((id, i) => {
      const d = s.recs[id].result!.decision;
      return { id, score: d.score, action: d.action, row: i % 2 };
    });
  }, []);
  const label = { new: "nuevo", ask: "pregunta", merge: "agrupa" } as const;
  return (
    <>
      <div className="head">
        <p className="eyebrow rise" style={at(0)}><span className="bar" />Zona gris</p>
        <h2 className="h2 rise" style={at(1)}>Cuando duda, <em>pregunta</em>. Decide el operador.</h2>
      </div>
      <div className="s-gray">
        <div className="left">
          <div className="scale rise" style={at(2)}>
            <div className="track" role="img" aria-label="Puntuación de parecido: por debajo de 0,45 incidente nuevo; entre 0,45 y 0,78 pregunta al operador; desde 0,78 agrupa">
              <div className="z-new">Incidente nuevo</div>
              <div className="z-ask">Pregunta</div>
              <div className="z-merge">Agrupa</div>
            </div>
            <div className="axis mono" aria-hidden="true">
              <span style={{ left: "0%", transform: "none" }}>0</span>
              <span style={{ left: `${BAND.ASK * 100}%` }}>{comma(BAND.ASK)}</span>
              <span style={{ left: `${BAND.MERGE * 100}%` }}>{comma(BAND.MERGE)}</span>
              <span style={{ left: "100%", transform: "translateX(-100%)" }}>1</span>
            </div>
            <div className="pins">
              {pins.map((p, i) => (
                <div key={p.id} className={`pin ${p.action}`} style={{ left: `${p.score * 100}%`, "--row": p.row, ...at(i) } as CSSProperties}>
                  <b title={label[p.action]}>{p.id} · {comma(p.score)}</b>
                </div>
              ))}
            </div>
          </div>
          <ul className="rules rise" style={at(3)}>
            <li><b>≥ {comma(BAND.MERGE)}</b>Agrupa sola, y se deshace con «Separar».</li>
            <li><b>{comma(BAND.ASK)} – {comma(BAND.MERGE)}</b>No fusiona: abre un incidente provisional en ámbar y te pregunta.</li>
            <li><b>&lt; {comma(BAND.ASK)}</b>Emergencia nueva.</li>
          </ul>
          <p className="body rise" style={at(4)}>La zona gris nunca se convierte en fusión automática, tampoco con el modelo local: solo opina. En la evaluación del escenario, <b style={{ color: "var(--d-ink)" }}>0 fusiones incorrectas</b>.</p>
        </div>
        <div className="right">
          <Frame title="Avance 112 · decisión del operador" tag="pieza real de la consola" className="rise" style={at(3)}>
            <GrayZoneDecision key={round} active={active} onAgain={() => setRound((r) => r + 1)} />
          </Frame>
          <p className="src fade" style={at(6)}>Pruébalo: botones o teclas <b>M</b> y <b>D</b>. F1 es otra mujer atrapada en otro coche: si la IA la diera por repetida, nadie iría a por ella.</p>
        </div>
      </div>
    </>
  );
}

// ═════════════════════════════ 8 · El agente actúa

const RUNGS: { policy: "automatica" | "operador" | "coordinador"; cls: string; icon: IconName; title: string; text: string }[] = [
  { policy: "automatica", cls: "auto", icon: "bolt", title: "Sale solo", text: "Avisos informativos a organismos: la distribuidora eléctrica y el ayuntamiento." },
  { policy: "operador", cls: "op", icon: "people", title: "Lo aprueba el operador", text: "Recursos, SMS en el idioma del llamante y devolver la llamada." },
  { policy: "coordinador", cls: "coord", icon: "alert", title: "Lo aprueba un coordinador", text: "ES-Alert a la población de una zona. Siempre una persona." },
];

function Agent() {
  const [s, dispatch] = useReducer(reducer, undefined, finalState);
  const counts = (p: string) => s.actions.filter((a) => a.policy === p && (p !== "automatica" || a.status === "enviada")).length;
  const shown = [
    s.actions.find((a) => a.tool === "avisar_distribuidora" && a.args.canal === "averias"),
    s.actions.find((a) => a.tool === "sms_al_llamante" && a.args.idioma === "ar"),
    s.actions.find((a) => a.tool === "proponer_es_alert"),
  ].filter(Boolean) as AgentAction[];
  return (
    <>
      <div className="head">
        <p className="eyebrow rise" style={at(0)}><span className="bar" />El agente actúa</p>
        <h2 className="h2 rise" style={at(1)}>Informar sale solo. <em>Decidir, nunca.</em></h2>
      </div>
      <div className="s-agent">
        <div className="ladder">
          {RUNGS.map((r, i) => (
            <div key={r.policy} className={`card rung ${r.cls} rise`} style={at(2 + i)}>
              <span className="ic"><Icon name={r.icon} size={26} /></span>
              <div><h3>{r.title}</h3><p>{r.text}</p></div>
              <span className="count num" title="Acciones de este tipo en el escenario">{counts(r.policy)}</span>
            </div>
          ))}
          <p className="policy-note rise" style={at(6)}>
            <Icon name="check" size={20} />
            <span>La política es código con tests (<code>lib/actions.ts</code>): ni el modelo ni el texto de una llamada pueden cambiarla. Las cifras son las acciones del escenario completo.</span>
          </p>
        </div>
        <Frame title="Avance 112 · acciones del agente" tag="pieza real de la consola" className="rise" style={at(3)}>
          <AgentActions
            actions={shown}
            provisional={false}
            onApprove={(key) => dispatch({ type: "actionApprove", key })}
            onDiscard={(key) => dispatch({ type: "actionDiscard", key })}
          />
        </Frame>
      </div>
    </>
  );
}

// ═════════════════════════════ 9 · Traduce

const LANGS = [...new Set(SCENARIOS.flatMap((x) => x.calls.map((c) => c.lang)))].map((l) => LANG_NAMES[l] ?? l);

function Translate({ active }: SlideProps) {
  const e1 = call("E1");
  const [replies, setReplies] = useState<Reply[]>([]);
  const phraseLangs = Object.keys(PHRASES[0].tr).length;
  useEffect(() => {
    if (!active && typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }, [active]);
  return (
    <>
      <div className="head">
        <p className="eyebrow rise" style={at(0)}><span className="bar" />Traduce</p>
        <h2 className="h2 rise" style={at(1)}>Nadie espera a un intérprete.</h2>
      </div>
      <div className="s-tr">
        <div className="left">
          <div className="card bubble rise" style={at(2)}>
            <div className="who"><Icon name="globe" size={16} />E1 · Árabe · {e1.mock.location_text}<span style={{ marginLeft: "auto" }}><ListenButton id="E1" label="Escuchar la llamada" active={active} /></span></div>
            <p className="ar" lang="ar" dir="rtl">{e1.transcript}</p>
          </div>
          <div className="card bubble es rise" style={at(3)}>
            <div className="who">Lo que lee el operador</div>
            <p>{e1.mock.translation_es}</p>
          </div>
          <div className="vs-row">
            <div className="card rise" style={at(4)}>
              <span className="num">~30 s</span>
              <span className="body">hoy, para conectar con un intérprete humano <span className="src">· 112 Catalunya</span></span>
            </div>
            <div className="card rise" style={at(5)}>
              <span className="num" style={{ color: "var(--d-ok)" }}>{phraseLangs} idiomas</span>
              <span className="body">con frases rápidas ya traducidas que se dicen en voz alta, sin esperar a nadie</span>
            </div>
          </div>
        </div>
        <Frame title="Avance 112 · responder al llamante" tag="pieza real de la consola" className="rise" style={at(3)}>
          <ReplyPanel incidentId="INC-05" langs={["ar"]} clock={e1.t} localAI={false} replies={replies} onReply={(r) => setReplies((xs) => [...xs, r])} />
        </Frame>
      </div>
      <div className="marquee fade" style={at(7)} aria-hidden="true">
        <div className="track">
          {[...LANGS, ...LANGS, ...LANGS, ...LANGS].map((l, i) => <span key={i}>{l}</span>)}
        </div>
      </div>
    </>
  );
}

// ═════════════════════════════ 10 · Por qué nosotros

const DIFS = [
  ["Información nueva en duplicados", "Una llamada repetida no se tira: si trae algo nuevo («hay un bebé dentro»), sube la prioridad."],
  ["Agrupa por la dirección que se menciona", "La posición del móvil no es la del incidente: cuenta la hija que llama desde otro barrio."],
  ["Zona gris visible", "Cuando duda, no fusiona: pregunta. Así no se pierde a una persona."],
  ["Respuesta traducida", "El operador responde en castellano y el llamante lo oye en su idioma."],
  ["100 % local", "Datos de salud y localización sin nube; también funciona sin red, sin GPU y sin claves."],
] as const;

function Why() {
  return (
    <>
      <div className="head">
        <p className="eyebrow rise" style={at(0)}><span className="bar" />Por qué Avance 112</p>
        <h2 className="h2 rise" style={at(1)}>Cinco cosas que nadie más hace <em>a la vez</em>.</h2>
      </div>
      <div className="s-why">
        <ol className="difs">
          {DIFS.map(([h, p], i) => (
            <li key={h} className="dif rise" style={at(2 + i)}>
              <span className="k">{String(i + 1).padStart(2, "0")}</span>
              <div><h3>{h}</h3><p>{p}</p></div>
            </li>
          ))}
        </ol>
        <div className="side">
          <div className="card rise" style={at(4)}>
            <h3>La competencia</h3>
            <p><b>Prepared, Carbyne y Motorola</b> traducen, pero son de nube y de EE. UU. y no agrupan duplicados. <b>Surge Desk</b> fusiona duplicados, pero no detecta información nueva, no agrupa por la dirección mencionada ni traduce la respuesta.</p>
          </div>
          <div className="card rise" style={at(5)}>
            <h3>Ley de IA</h3>
            <p>Clasificar llamadas de emergencia es <b>alto riesgo</b> (obligaciones desde dic-2027). Por diseño: humano en el bucle, cada decisión explicada y un registro exportable.</p>
          </div>
        </div>
      </div>
    </>
  );
}

// ═════════════════════════════ 11 · Mercado y siguiente paso

function Market({ active }: SlideProps) {
  return (
    <>
      <div className="head">
        <p className="eyebrow rise" style={at(0)}><span className="bar" />Mercado y siguiente paso</p>
        <h2 className="h2 rise" style={at(1)}>Se lo vendemos a <em>quien opera la sala</em>.</h2>
      </div>
      <div className="s-market">
        <div className="card stat rise" style={at(2)}>
          <p className="num"><CountUp to={894930} active={active} delay={400} /></p>
          <p className="what">emergencias gestionadas por el 112 de Andalucía en 2025</p>
          <p className="who">Junta de Andalucía</p>
        </div>
        <div className="card stat rise" style={at(3)}>
          <p className="num"><CountUp to={43845} active={active} delay={550} /></p>
          <p className="what">llamadas en idioma extranjero al 112 de Andalucía en 2024</p>
          <p className="who">Junta de Andalucía</p>
        </div>
        <div className="card stat rise" style={at(4)}>
          <p className="num"><CountUp to={362822} active={active} delay={700} /></p>
          <p className="what">residentes extranjeros en la provincia de Málaga</p>
          <p className="who">INE</p>
        </div>
      </div>
      <div className="s-plan">
        <div className="card rise" style={at(5)}>
          <h3>Vía de venta</h3>
          <p>El pliego del 112 de Andalucía <span>(CONTR 2026/109830)</span> puntúa las aplicaciones software que ofrezca el licitador. <span>Vendemos al contratista que concursa: una aplicación puntuable que le ayuda a cumplir en los picos.</span></p>
        </div>
        <div className="card rise" style={at(6)}>
          <h3>Modelo y siguiente paso</h3>
          <p>Licencia por puesto de operador.</p>
          <div className="steps">
            <span className="chip">Piloto con un contratista</span>
            <span className="chip">Llamadas reales anonimizadas</span>
            <span className="chip ok">Métrica: líneas liberadas y tiempo hasta la llamada crítica</span>
          </div>
        </div>
      </div>
    </>
  );
}

// ═════════════════════════════ 12 · Cierre con QR

/** Dirección pública de la consola: NEXT_PUBLIC_DEMO_URL si está definida; si no, esta misma web. */
function useDemoUrl() {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const fixed = process.env.NEXT_PUBLIC_DEMO_URL?.trim();
    setUrl(fixed || new URL(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/`, window.location.origin).href);
  }, []);
  return url;
}

function Closing({ active }: SlideProps) {
  const url = useDemoUrl();
  return (
    <>
      <div className="copy">
        <ReplayLogo className="logo" src={animatedLogo.src} active={active} alt="Avance 112. La IA propone. El operador decide." />
        <h2 className="h1 rise" style={at(2)}>Escanea y pruébalo.</h2>
        <p className="lead rise" style={at(3)}>La consola funciona en el navegador, en modo simulado: sin instalar nada, sin GPU y sin claves.</p>
        <p className="next fade" style={at(5)}><Icon name="chevron" size={20} />Pasa de diapositiva para abrir la consola.</p>
      </div>
      <div className="qr-card rise" style={at(3)}>
        {url ? <QrCode text={url} label={`Código QR a ${url}`} /> : <div className="qr-skeleton" />}
        <span className="url">{url.replace(/^https?:\/\//, "").replace(/\/$/, "")}</span>
        <span className="tag">La IA propone. El operador decide.</span>
      </div>
    </>
  );
}

// ═════════════════════════════ Guion

export const SLIDES: SlideDef[] = [
  {
    id: "dana", section: "El problema", title: "19.821 llamadas, 4.770 incidentes", theme: "dark", className: "s-hook", Body: Hook,
    notes: "El 29 de octubre de 2024, la DANA de Valencia generó 19.821 llamadas al 112 para 4.770 incidentes: unas cuatro llamadas por incidente. Cada punto es una llamada; cada círculo, una emergencia.",
  },
  {
    id: "apagon", section: "El problema", title: "El apagón", theme: "dark", Body: Blackout,
    notes: "En el apagón del 28 de abril de 2025 las llamadas se multiplicaron por cuatro y en Cataluña se perdieron más de 10.000. En una catástrofe el cuello de botella no son los recursos: son las líneas.",
  },
  {
    id: "seis", section: "El problema", title: "Seis llamadas por el mismo coche", theme: "dark", Body: SixCalls,
    notes: "Si seis personas llaman por el mismo coche atrapado, cada minuto con la sexta es un minuto que no se dedica a la única llamada en árabe sobre un infarto. (Opcional: pulsar Escuchar E1.)",
  },
  {
    id: "avance", section: "La solución", title: "Avance 112", theme: "light", className: "s-reveal", Body: Reveal,
    notes: "Por eso hemos creado Avance 112: la IA propone y el operador decide. Agrupa, detecta lo nuevo y traduce, todo en local.",
  },
  {
    id: "como", section: "La solución", title: "Agrupa, detecta lo nuevo y traduce", theme: "dark", Body: ThreeThings,
    notes: "Tres cosas a la vez. Agrupa, también por la dirección que se menciona: la hija que llama desde otro barrio. Detecta lo nuevo: A4 dice que hay un bebé y sube la prioridad. Y traduce la respuesta del operador.",
  },
  {
    id: "demo", section: "La demo", title: "La consola, en directo", theme: "dark", Body: Live,
    notes: "Arranca sola a ×4 con sonido. Sube las líneas liberadas. F1 se pone en ámbar: pulsar D (es otro coche). B2: pulsar M (misma dirección). Subir a ×10 para terminar: 27 avisos (26 llamadas y una eCall), 7 emergencias.",
  },
  {
    id: "zona-gris", section: "La demo", title: "Zona gris", theme: "dark", tone: "amber", Body: GrayZone,
    notes: "Por encima de 0,78 se fusiona y es reversible; entre 0,45 y 0,78 no fusiona: pregunta. F1 está en 0,69: otra mujer en otro coche. La decisión no se deja a la IA. Pulsar D.",
  },
  {
    id: "agente", section: "La demo", title: "El agente actúa", theme: "dark", tone: "green", Body: Agent,
    notes: "Los cables en el suelo avisan solos a la distribuidora: es informativo. El SMS en árabe a E1 lo aprueba el operador (pulsar Aprobar y enviar). El ES-Alert, siempre un coordinador.",
  },
  {
    id: "traduce", section: "La demo", title: "Nadie espera a un intérprete", theme: "dark", Body: Translate,
    notes: "E1 en árabe: se oye la llamada y el operador lee la traducción. Elegir «¿La persona respira?» y pulsar Reproducir al llamante: se dice en árabe.",
  },
  {
    id: "por-que", section: "Por qué nosotros", title: "Cinco cosas a la vez", theme: "dark", Body: Why,
    notes: "100 % local (datos de salud y localización), castellano y AML, y Ley de IA por diseño: humano en el bucle y cada decisión explicada.",
  },
  {
    id: "mercado", section: "Por qué nosotros", title: "Mercado y siguiente paso", theme: "dark", tone: "green", Body: Market,
    notes: "Vía de venta: el pliego andaluz puntúa las aplicaciones software del licitador, así que vendemos al contratista que concursa. Licencia por puesto. Siguiente paso: piloto con llamadas reales anonimizadas.",
  },
  {
    id: "pruebalo", section: "Pruébalo", title: "Escanea y pruébalo", theme: "light", className: "s-qr", Body: Closing,
    notes: "Escanead el QR y probadlo. Al pasar de esta diapositiva se abre la consola. Gracias.",
  },
];
