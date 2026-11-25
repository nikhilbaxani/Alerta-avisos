"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { findCall } from "@/data/scenarios";
import { RISK_LABELS, SEVERITY_LABELS, TYPE_LABELS } from "@/lib/labels";
import { replayTo } from "@/lib/replay";
import Icon from "@/components/Icon";
import type { IconName } from "@/components/Icon";
import { langName, mmss } from "@/components/format";
import LiveConsole from "./LiveConsole";
import { CountUp, LogoLockup, Mark, at } from "./bits";

export interface SlideProps {
  active: boolean;
}

export interface SlideDef {
  id: string;
  /** Sección que se ve arriba a la derecha. */
  section: string;
  title: string;
  className?: string;
  notes: string;
  Body: (p: SlideProps) => ReactNode;
}

const DANA = "dana-malaga";

/** Raíz de la web (subruta incluida, p. ej. en GitHub Pages). */
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/**
 * Consola a la que salta la presentación al terminar (pasar de la última diapositiva o «Abrir la consola»): la
 * del VPS, donde también entran las llamadas del público. NEXT_PUBLIC_DEMO_CONSOLE_URL la cambia.
 */
export const DEMO_CONSOLE_URL = process.env.NEXT_PUBLIC_DEMO_CONSOLE_URL?.trim() || "https://oracle-exit.tail0093c8.ts.net/";

const v = (o: Record<string, string | number>) => o as CSSProperties;

// ═════════════════════════════ Piezas comunes

/** Número de capítulo en monoespaciada con una línea («01 — El problema»). */
function Chapter({ n, children }: { n: string; children: ReactNode }) {
  return <p className="ch-num rise" style={at(0)}>{n} — {children}</p>;
}

/** Tarjeta «en vivo»: cabecera con punto que late y etiqueta, contenido, y pie en monoespaciada. */
function LiveCard({ title, tag, foot, status, tone = "ok", className = "", style, children }: {
  title: string; tag: string; foot?: string; status?: string; tone?: "ok" | "red" | "amber"; className?: string; style?: CSSProperties; children: ReactNode;
}) {
  return (
    <div className={`live ${className}`} style={style}>
      <div className="live-head"><span className="live-dot" /><b>{title}</b><span className="live-tag">{tag}</span></div>
      {children}
      {(foot || status) && <div className="live-foot"><span>{foot}</span><span className={`st ${tone}`}>{status}</span></div>}
    </div>
  );
}

/** Celdas de cifras: etiqueta en monoespaciada, número grande y unidad. */
function Tiles({ items, className = "" }: { items: { k: string; v: ReactNode; u?: string }[]; className?: string }) {
  return (
    <div className={`tiles ${className}`} style={v({ "--n": items.length })}>
      {items.map((x) => (
        <div key={x.k}><small>{x.k}</small><b>{x.v}</b>{x.u && <em>{x.u}</em>}</div>
      ))}
    </div>
  );
}

// ═════════════════════════════ 1 · El problema: la DANA de Valencia

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Enjambre de llamadas: cada punto es una llamada; al final se juntan, de cuatro en cuatro, en emergencias. */
function Swarm() {
  const groups = useMemo(() => {
    const rnd = mulberry32(112);
    const out: { cx: number; cy: number; gd: number; dots: { x: number; y: number; gx: number; gy: number; d: number }[] }[] = [];
    for (let row = 0; row < 4; row++)
      for (let col = 0; col < 9; col++) {
        const cx = 36 + col * 66 + (rnd() - 0.5) * 14 + (row % 2) * 10;
        const cy = 40 + row * 72 + (rnd() - 0.5) * 12;
        const r = rnd();
        const n = r < 0.2 ? 5 : r < 0.32 ? 3 : 4; // de media, unas 4 llamadas por incidente
        const dots = Array.from({ length: n }, (_, j) => {
          const ang = (j / n) * Math.PI * 2 + rnd() * 1.2;
          const dist = 12 + rnd() * 8;
          const k = (5.5 - dist) / dist;
          const x = cx + Math.cos(ang) * dist;
          const y = cy + Math.sin(ang) * dist;
          return { x, y, gx: (x - cx) * k, gy: (y - cy) * k, d: 0.3 + rnd() * 2.6 };
        });
        out.push({ cx, cy, gd: rnd() * 0.5, dots });
      }
    return out;
  }, []);
  const px = (n: number) => `${n.toFixed(2)}px`;
  return (
    <svg className="swarm" viewBox="0 0 600 300" aria-hidden="true">
      {groups.map((g, i) => (
        <g key={i}>
          {g.dots.map((d, j) => (
            <circle key={`p${j}`} className="pulse" cx={d.x.toFixed(2)} cy={d.y.toFixed(2)} r="4" style={v({ "--d": `${d.d.toFixed(2)}s` })} />
          ))}
          {g.dots.map((d, j) => (
            <circle key={`d${j}`} className="dot" cx={d.x.toFixed(2)} cy={d.y.toFixed(2)} r="4" style={v({ "--d": `${d.d.toFixed(2)}s`, "--gx": px(d.gx), "--gy": px(d.gy) })} />
          ))}
          <circle className="group" cx={g.cx.toFixed(2)} cy={g.cy.toFixed(2)} r="14" style={v({ "--gd": `${g.gd.toFixed(2)}s` })} />
        </g>
      ))}
    </svg>
  );
}

/* Mini animaciones que acompañan a cada cifra del problema. */
function MiniBars() {
  return <span className="mv bars" aria-hidden="true">{[1, 2, 3, 4].map((k) => <i key={k} style={v({ "--k": k })} />)}</span>;
}
function MiniDrops() {
  return <span className="mv drops" aria-hidden="true">{Array.from({ length: 10 }, (_, k) => <i key={k} style={v({ "--k": k })} />)}</span>;
}
function MiniLangs() {
  return <span className="mv langs" aria-hidden="true">{["English", "Deutsch", "Français", "العربية", "Italiano"].map((l, k) => <i key={l} style={v({ "--k": k })}>{l}</i>)}</span>;
}
function MiniTimer() {
  return (
    <svg className="mv timer" viewBox="0 0 44 44" aria-hidden="true">
      <circle className="track" cx="22" cy="22" r="18" />
      <circle className="fill" cx="22" cy="22" r="18" pathLength={1} transform="rotate(-90 22 22)" />
    </svg>
  );
}

function Hook({ active }: SlideProps) {
  const stats: { num: ReactNode; label: string; what: string; who: string; Mv: () => ReactNode }[] = [
    { num: "×4", label: "por cuatro", what: "llamadas al 112 en el apagón del 28 de abril de 2025", who: "112 autonómicos / prensa", Mv: MiniBars },
    { num: <>+<CountUp to={10000} active={active} delay={600} /></>, label: "más de 10.000", what: "llamadas perdidas ese día en Cataluña", who: "112 autonómicos / prensa", Mv: MiniDrops },
    { num: <CountUp to={43845} active={active} delay={700} />, label: "43.845", what: "llamadas en otro idioma al 112 de Andalucía (2024)", who: "Junta de Andalucía", Mv: MiniLangs },
    { num: <>~<CountUp to={30} active={active} ms={1600} delay={800} /> s</>, label: "unos 30 segundos", what: "para conectar con un intérprete", who: "112 Catalunya", Mv: MiniTimer },
  ];
  return (
    <>
      <div className="copy">
        <Chapter n="01">El problema</Chapter>
        <h2 className="h2 rise" style={at(1)}>Cuando todo falla, <em>todo el mundo llama.</em></h2>
        <div className="stats">
          {stats.map((x, i) => (
            <div key={x.label} className="stat rise" style={at(2 + i)}>
              <div className="stat-top"><p className="num" aria-label={x.label}>{x.num}</p><x.Mv /></div>
              <p className="what">{x.what}</p>
              <p className="who">{x.who}</p>
            </div>
          ))}
        </div>
      </div>
      <LiveCard title="Llamadas al 112 · DANA de Valencia, 29-oct-2024" tag="Datos reales" foot="Fuente: 112 Comunitat Valenciana / prensa" status="Saturación" tone="red" className="rise" style={at(2)}>
        <div className="paper">
          <Swarm />
          <span className="paper-cap">Cada punto, una llamada · cada círculo, una emergencia</span>
        </div>
        <Tiles className="big" items={[
          { k: "Llamadas", v: <CountUp to={19821} active={active} ms={1800} delay={400} /> },
          { k: "Incidentes", v: <CountUp to={4770} active={active} ms={1800} delay={500} /> },
          { k: "Por incidente", v: "≈4", u: "llamadas" },
        ]} />
      </LiveCard>
    </>
  );
}

// ═════════════════════════════ 2 · Presentación: el logo y qué es

function Intro() {
  return (
    <>
      <LogoLockup />
      <p className="what-pill rise" style={at(7)}>Dashboard agéntico para el 112</p>
      <p className="summary rise" style={at(8)}>Escucha cada llamada, junta las que hablan de la misma emergencia, sube lo urgente y prepara los avisos. El operador decide.</p>
    </>
  );
}

// ═════════════════════════════ 3 · El sistema actual

const REGIONS = ["AND", "ARA", "AST", "BAL", "CAN", "CNT", "CYL", "CLM", "CAT", "VAL", "EXT", "GAL", "MAD", "MUR", "NAV", "PVA", "RIO", "CEU", "MEL"];

const TODAY: { name: string; what: string; state: "ok" | "part" | "no"; label: string }[] = [
  { name: "Sistema de despacho (CAD / NG112)", what: "Registra la emergencia y envía los recursos", state: "ok", label: "Existe" },
  { name: "AML y eCall", what: "Localizan el móvil y el coche accidentado", state: "ok", label: "Existe" },
  { name: "ES-Alert", what: "Avisa a la población de una zona", state: "ok", label: "Existe" },
  { name: "Otros idiomas", what: "Intérprete humano por teléfono", state: "part", label: "~30 s" },
  { name: "Llamadas repetidas", what: "Nadie las junta ni las ordena", state: "no", label: "Sin cubrir" },
];
const MARK: Record<"ok" | "part" | "no", IconName> = { ok: "check", part: "clock", no: "close" };

function Today() {
  return (
    <>
      <div className="copy">
        <Chapter n="02">El sistema actual</Chapter>
        <h2 className="h2 rise" style={at(1)}>Cada comunidad, su 112. <em>Muchos, gestionados por empresas.</em></h2>
        <p className="lead rise" style={at(2)}>Las salas trabajan con un sistema de despacho que registra, localiza y envía recursos. No hemos encontrado ninguno que junte las llamadas repetidas.</p>
        <div className="regions rise" style={at(3)}>
          {REGIONS.map((r, i) => <span key={r} className={r === "AND" ? "here" : ""} style={v({ "--k": i })}>{r}</span>)}
        </div>
        <p className="regions-cap fade" style={at(5)}>Un 112 por comunidad y ciudad autónoma</p>
      </div>
      <LiveCard title="El software de una sala del 112, hoy" tag="Esquema" foot="Fuentes: Protección Civil · 112 Catalunya · propia" status="Falta una pieza" tone="red" className="rise" style={at(2)}>
        <ul className="today">
          {TODAY.map((t, i) => (
            <li key={t.name} className={t.state} style={at(4 + i)}>
              <span className="mk"><Icon name={MARK[t.state]} size={14} /></span>
              <div><b>{t.name}</b><p>{t.what}</p></div>
              <em>{t.label}</em>
            </li>
          ))}
        </ul>
        <div className="plus" style={at(10)}>
          <Mark size={30} />
          <p><b>Agente 112</b> se suma al sistema de despacho: no lo sustituye.</p>
        </div>
      </LiveCard>
    </>
  );
}

// ═════════════════════════════ 3 · Objetivo, con un caso del escenario

/** El coche atrapado del escenario de la DANA, tal como queda en la consola. */
function useCase() {
  return useMemo(() => {
    const s = replayTo(DANA, Infinity, { F1: false, B2: true });
    const inc = s.engine.incidents.find((i) => i.callIds.includes("A1"))!;
    const news = new Set(inc.alerts.map((a) => a.callId));
    const calls = inc.callIds.map((id) => {
      const c = findCall(id)!;
      return { id, t: c.t, ecall: c.channel === "ecall", lang: c.channel === "ecall" ? "eCall" : langName(c.lang), hot: news.has(id) };
    });
    return { inc, calls };
  }, []);
}

// Geometría del esquema dentro de la tarjeta (px): avisos a la izquierda, emergencia a la derecha.
const CONV = { w: 600, h: 300, pillW: 200, pillH: 32, gap: 6, incX: 290 };

function Convergence() {
  const { inc, calls } = useCase();
  const top = (CONV.h - (calls.length * CONV.pillH + (calls.length - 1) * CONV.gap)) / 2;
  const y = (i: number) => top + i * (CONV.pillH + CONV.gap) + CONV.pillH / 2;
  const mx = (CONV.pillW + CONV.incX) / 2;
  return (
    <div className="conv">
      <svg className="links" viewBox={`0 0 ${CONV.w} ${CONV.h}`} aria-hidden="true">
        {calls.map((c, i) => (
          <path key={c.id} className={`ln ${c.hot ? "hot" : ""}`} pathLength={1} style={at(6 + i)}
            d={`M${CONV.pillW} ${y(i)} C${mx} ${y(i)}, ${mx} ${CONV.h / 2}, ${CONV.incX} ${CONV.h / 2}`} />
        ))}
      </svg>
      <ol className="pills" style={v({ "--top": `${top}px` })}>
        {calls.map((c, i) => (
          <li key={c.id} className={`pill rise ${c.hot ? "hot" : ""}`} style={at(3 + i)}>
            <Icon name={c.ecall ? "car" : "phone"} size={14} />
            <span className="t">{mmss(c.t)}</span>
            <span className="l">{c.lang}</span>
            {c.hot && <span className="new">nuevo</span>}
          </li>
        ))}
      </ol>
      <div className="inc-wrap">
      <div className="inc rise" style={at(13)}>
        <span className="rank">1</span>
        <p className="ttl">{TYPE_LABELS[inc.type]}</p>
        <p className="where">{inc.locations[0]}</p>
        <p className="meta"><span className="sev">{SEVERITY_LABELS[inc.severity]}</span>{calls.length} avisos · {RISK_LABELS.menor.toLowerCase()}</p>
      </div>
      </div>
    </div>
  );
}

const GOALS: { k: string; t: string }[] = [
  { k: "Liberar líneas", t: "Las llamadas repetidas se juntan y no ocupan a otro operador." },
  { k: "Llegar antes a lo crítico", t: "Lo urgente sube arriba aunque entre tarde o en otro idioma." },
  { k: "Sin quitar el control", t: "La IA propone; el operador decide y todo queda registrado." },
];

function Goal() {
  const { calls } = useCase();
  return (
    <>
      <div className="copy">
        <Chapter n="03">Nuestro objetivo</Chapter>
        <h2 className="h2 rise" style={at(1)}>Que ninguna emergencia espere <em>detrás de una llamada repetida.</em></h2>
        <ol className="goals">
          {GOALS.map((g, i) => (
            <li key={g.k} className="rise" style={at(2 + i)}>
              <span className="gn">{String(i + 1).padStart(2, "0")}</span>
              <div><b>{g.k}</b><p>{g.t}</p></div>
            </li>
          ))}
        </ol>
      </div>
      <LiveCard title="Un caso del escenario · DANA en Málaga" tag="Simulación" foot="Paso inferior de la A-357" status="Agrupado" tone="ok" className="rise" style={at(2)}>
        <div className="paper"><Convergence /></div>
        <Tiles items={[
          { k: "Avisos", v: String(calls.length) },
          { k: "Emergencias", v: "1" },
          { k: "Líneas liberadas", v: String(calls.length - 1) },
        ]} />
      </LiveCard>
    </>
  );
}

// ═════════════════════════════ 4 · Propuesta de valor

function ArtGroup() {
  const dots = [[30, 26], [22, 62], [40, 96], [70, 18], [64, 104]];
  return (
    <svg className="art-group" viewBox="0 0 220 120" aria-hidden="true">
      {dots.map(([x, y], i) => (
        <circle key={i} className="gd" cx={x} cy={y} r="6" style={v({ "--tx": `${150 - x}px`, "--ty": `${60 - y}px`, "--k": i })} />
      ))}
      <circle className="gring" cx="150" cy="60" r="22" />
      <circle className="gcore" cx="150" cy="60" r="6" />
    </svg>
  );
}

function ArtPriority() {
  return (
    <div className="art-prio">
      <div className="mini-call"><Icon name="phone" size={13} />02:43 · «hay un bebé dentro»</div>
      <div className="prio-row">
        <span className="prio-from">Alta</span>
        <Icon name="arrow" size={16} />
        <span className="prio-to">Crítica</span>
      </div>
    </div>
  );
}

function ArtListen() {
  return (
    <div className="art-listen">
      <span className="eq" aria-hidden="true"><i /><i /><i /><i /><i /></span>
      <p className="txt">«Hay un coche atrapado en el paso inferior…»</p>
    </div>
  );
}

function ArtTypes() {
  const rows: [string, string][] = [["Robo", "Policía Nacional"], ["Incendio", "Bomberos"], ["Herido", "SAMU 061"]];
  return (
    <ul className="art-types">
      {rows.map(([t, svc], i) => (
        <li key={t} style={at(i)}><span className="t">{t}</span><Icon name="arrow" size={13} /><b>{svc}</b></li>
      ))}
    </ul>
  );
}

const AGENT: { title: string; text: string; Art: () => ReactNode }[] = [
  { title: "Escucha", text: "Pasa cada llamada a texto en el propio ordenador de la sala.", Art: ArtListen },
  { title: "Entiende y agrupa", text: "Saca qué pasa, dónde y quién corre peligro, y la junta con su emergencia.", Art: ArtGroup },
  { title: "Prioriza", text: "Un dato nuevo sube la emergencia. Si duda, pregunta al operador.", Art: ArtPriority },
  { title: "Propone acciones", text: "Según el tipo de emergencia. Lo que solo informa sale solo; lo demás lo aprueba una persona.", Art: ArtTypes },
];

function AgentFlow() {
  return (
    <>
      <Chapter n="04">Cómo lo hacemos</Chapter>
      <h2 className="h2 rise" style={at(1)}>Un agente que escucha, ordena <em>y propone.</em></h2>
      <div className="pieces steps">
        {AGENT.map((p, i) => (
          <article key={p.title} className="piece rise" style={at(2 + i)}>
            <span className="piece-n">Paso {i + 1}</span>
            <div className="piece-art"><p.Art /></div>
            <h3>{p.title}</h3>
            <p>{p.text}</p>
          </article>
        ))}
      </div>
      <div className="stack fade" style={at(7)}>
        <span>Todo en el ordenador de la sala, sin nube:</span>
        <ul className="tags">
          <li>Whisper · voz a texto</li>
          <li>Modelo de lenguaje local</li>
          <li>Reglas en código</li>
        </ul>
      </div>
    </>
  );
}

// ═════════════════════════════ 5 · La consola en directo

function Live({ active }: SlideProps) {
  return (
    <>
      <div className="live-title">
        <Chapter n="05">Demo</Chapter>
        <h2 className="h3 rise" style={at(1)}>Así lo ve el operador.</h2>
        <p className="live-sub rise" style={at(2)}>Junta las llamadas repetidas, sube lo urgente y prepara los avisos. El operador decide.</p>
      </div>
      <div className="screen rise" style={at(2)}>
        <LiveConsole active={active} />
      </div>
    </>
  );
}

// ═════════════════════════════ 6 · Clientes: las empresas que ya operan el 112

const CHAIN = ["Comunidad autónoma", "Concurso público", "Empresa que opera el 112", "Agente 112"];

function Clients({ active }: SlideProps) {
  return (
    <>
      <div className="copy">
        <Chapter n="06">Clientes</Chapter>
        <h2 className="h2 rise" style={at(1)}>Vendemos a las empresas <em>que ya operan el 112.</em></h2>
        <p className="lead rise" style={at(2)}>Cada comunidad adjudica su sala por concurso. La empresa que la gestiona añade Agente 112 a sus puestos.</p>
      </div>
      <LiveCard title="Cómo se vende" tag="SaaS" foot="Fuente: Junta de Andalucía" status="Escalable a cualquier 112" tone="ok" className="rise" style={at(2)}>
        <ol className="chain">
          {CHAIN.map((c, i) => (
            <li key={c} className={i === CHAIN.length - 1 ? "us" : ""} style={at(5 + i)}>{c}</li>
          ))}
        </ol>
        <p className="saas"><b>Suscripción por puesto de operador</b>, instalada en la propia sala.</p>
        <Tiles className="big" items={[
          { k: "Emergencias · 112 Andalucía 2025", v: <CountUp to={894930} active={active} delay={600} /> },
          { k: "Modelo", v: "SaaS", u: "por puesto" },
        ]} />
      </LiveCard>
    </>
  );
}

// ═════════════════════════════ 7 · Hoja de ruta (provisional)

const PHASES: { when: string; t: string; d: string; now?: boolean }[] = [
  { when: "Ahora", t: "Contacto en Málaga y Andalucía", d: "Con las empresas que gestionan el 112.", now: true },
  { when: "2027", t: "Piloto en una sala", d: "Con llamadas reales anonimizadas y conforme a la Ley de IA." },
  { when: "2027–2028", t: "Más empresas", d: "Agilizar las salas del 112 de otras comunidades." },
  { when: "Después", t: "Expansión", d: "Toda España, Europa y otros números de emergencia." },
];

const NUMBERS: { n: string; who: string }[] = [
  { n: "061", who: "Urgencias sanitarias" },
  { n: "080", who: "Bomberos" },
  { n: "091", who: "Policía Nacional" },
  { n: "062", who: "Guardia Civil" },
  { n: "092", who: "Policía Local" },
];

const RINGS = [
  { r: 58, label: "Andalucía" },
  { r: 96, label: "España" },
  { r: 132, label: "Europa" },
];

function Roadmap() {
  return (
    <>
      <div className="copy">
        <Chapter n="07">Hoja de ruta</Chapter>
        <h2 className="h2 rise" style={at(1)}>De Málaga <em>a todo el 112.</em></h2>
        <ol className="phases">
          {PHASES.map((p, i) => (
            <li key={p.t} className={`rise ${p.now ? "now" : ""}`} style={at(2 + i)}>
              <span className="pdot" />
              <span className="when">{p.when}</span>
              <div><b>{p.t}</b><p>{p.d}</p></div>
            </li>
          ))}
        </ol>
        <p className="later fade" style={at(7)}>Y en el producto: RCP guiada en el idioma del llamante y modo pico.</p>
      </div>
      <LiveCard title="Expansión" tag="Plan" foot="Hoja de ruta provisional" status="En marcha" tone="ok" className="rise" style={at(2)}>
        <div className="paper expand">
          <svg className="rings" viewBox="0 0 300 300" aria-hidden="true">
            <circle className="radar" cx="150" cy="150" r="132" />
            {RINGS.map((g, i) => (
              <g key={g.label}>
                <circle className="ring" cx="150" cy="150" r={g.r} pathLength={1} style={at(4 + i * 2)} />
                <text className="rl" x="150" y={150 - g.r - 6} style={at(5 + i * 2)}>{g.label}</text>
              </g>
            ))}
            <circle className="core" cx="150" cy="150" r="9" />
            <text className="rl core-l" x="150" y="182">Málaga</text>
          </svg>
          <div className="numbers">
            <p>Otros números de emergencia</p>
            <ul>
              {NUMBERS.map((x, i) => (
                <li key={x.n} className="rise" style={at(8 + i)}><b>{x.n}</b>{x.who}</li>
              ))}
            </ul>
          </div>
        </div>
        <Tiles items={[
          { k: "Primer mercado", v: "Andalucía" },
          { k: "Modelo", v: "SaaS", u: "por puesto" },
          { k: "Después", v: "112 +", u: "otros números" },
        ]} />
      </LiveCard>
    </>
  );
}

// ═════════════════════════════ 9 · Cierre: logo, eslogan y QR

function Closing() {
  return (
    <>
      <div className="brand-block">
        <LogoLockup />
        <p className="slogan rise" style={at(6)}>Para que nadie se quede esperando al otro lado.</p>
      </div>
      <aside className="call-qr rise" style={at(8)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${BASE}/qr-llamar-tarjeta.png`} width={1080} height={1350} alt="Tarjeta con el código QR para grabar una llamada de prueba al 112" />
        <p>Este QR lleva a una simulación de llamada al 112.</p>
      </aside>
    </>
  );
}

// ═════════════════════════════ Guion (3 minutos)

export const SLIDES: SlideDef[] = [
  {
    id: "dana", section: "El problema", title: "Cuando todo falla, todo el mundo llama", className: "s-split", Body: Hook,
    notes: "(0:00–0:25) El 29 de octubre de 2024, la DANA de Valencia generó 19.821 llamadas al 112 para 4.770 incidentes: unas cuatro llamadas por cada emergencia. En el apagón de 2025 las llamadas se multiplicaron por cuatro y en Cataluña se perdieron más de 10.000. Además, 43.845 llamadas en otro idioma solo en Andalucía, y unos 30 segundos para conseguir un intérprete. Lo que se satura son las líneas: si seis personas llaman por el mismo coche, otra emergencia espera turno.",
  },
  {
    id: "sistema-actual", section: "El sistema actual", title: "Cada comunidad, su 112", className: "s-split", Body: Today,
    notes: "(0:35–0:50) Hoy cada comunidad autónoma gestiona su 112 y muchas salas las operan empresas que ganan el concurso. Trabajan con un sistema de despacho (CAD o NG112) que registra, localiza con AML y eCall y despacha recursos, y con ES-Alert para avisar a la población. La traducción es un intérprete humano, unos 30 segundos. No hemos encontrado ningún 112 en España que junte las llamadas repetidas (investigación propia, oct. 2026). Agente 112 se suma a ese sistema, no lo sustituye.",
  },
  {
    id: "logo", section: "Agente 112", title: "Agente 112", className: "s-logo", Body: Intro,
    notes: "(0:25–0:35) Por eso hemos creado Agente 112: un dashboard agéntico para las salas del 112. Escucha cada llamada, junta las que hablan de la misma emergencia, sube lo urgente y prepara los avisos. El operador decide.",
  },
  {
    id: "objetivo", section: "Objetivo", title: "Que ninguna emergencia espere", className: "s-split", Body: Goal,
    notes: "(0:35–0:50) Nuestro objetivo: que ninguna emergencia espere detrás de una llamada repetida. En el escenario, siete avisos del mismo coche (una eCall y llamadas en distintos idiomas) acaban en una sola emergencia: seis líneas liberadas. Y cuando alguien dice que hay un bebé dentro, sube la prioridad. La IA propone; el operador decide.",
  },
  {
    id: "como", section: "Cómo lo hacemos", title: "Un agente que escucha, ordena y propone", className: "s-center", Body: AgentFlow,
    notes: "(0:50–1:05) Cómo lo conseguimos: el agente escucha cada llamada y la pasa a texto en el ordenador de la sala (Whisper), un modelo de lenguaje local saca qué pasa, dónde y quién corre peligro, y unas reglas en código la juntan con su emergencia. Si llega un dato nuevo sube la prioridad; si duda, pregunta. Después propone acciones según el tipo: robo, Policía Nacional; incendio, Bomberos; herido, SAMU 061. Lo que solo informa sale solo; lo demás lo aprueba una persona.",
  },
  {
    id: "demo", section: "Demo", title: "Así lo ve el operador", className: "s-live", Body: Live,
    notes: "(1:05–2:15) Arranca sola a ×4 con sonido: suben las líneas liberadas. A4 trae información nueva y sube la prioridad. F1 se pone en ámbar: pulsar D, es otro coche. B2: pulsar M, misma dirección. A la derecha, las acciones que propone el agente según cada emergencia: bomberos para el coche atrapado, aviso a la compañía eléctrica por los cables (sale solo), SAMU para la emergencia médica. Aprobar una con el botón.",
  },
  {
    id: "clientes", section: "Clientes", title: "Vendemos a las empresas que ya operan el 112", className: "s-split", Body: Clients,
    notes: "(2:15–2:30) Nuestros clientes son las empresas que ya operan el 112: cada comunidad adjudica su sala por concurso y el pliego andaluz ya puntúa el software que aporta el licitador. Lo vendemos como suscripción por puesto de operador, instalado en la propia sala. Solo Andalucía gestionó 894.930 emergencias en 2025.",
  },
  {
    id: "hoja-de-ruta", section: "Hoja de ruta", title: "De Málaga a todo el 112", className: "s-split", Body: Roadmap,
    notes: "(2:35–2:50) Hoja de ruta provisional. Ahora: contacto con las empresas que gestionan el 112 en Málaga y Andalucía. En 2027, piloto en una sala con llamadas reales anonimizadas y conforme a la Ley de IA. Después, más empresas para agilizar las salas de otras comunidades, y expansión a toda España, Europa y otros números de emergencia: 061, 080, 091, 062 y 092.",
  },
  {
    id: "agente-112", section: "Agente 112", title: "Para que nadie se quede esperando al otro lado", className: "s-close", Body: Closing,
    notes: "(2:50–3:00) Agente 112: para que nadie se quede esperando al otro lado. El QR lleva a una simulación de llamada al 112: grabad un aviso y lo veréis entrar en la consola. Gracias. (Al pasar de esta diapositiva se abre la consola del VPS.)",
  },
];
