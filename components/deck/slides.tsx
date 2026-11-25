"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { getScenario } from "@/data/scenarios";
import Icon from "@/components/Icon";
import type { IconName } from "@/components/Icon";
import LiveConsole from "./LiveConsole";
import QrCode from "./QrCode";
import { CountUp, Frame, LogoLockup, at } from "./bits";

export interface SlideProps {
  active: boolean;
}

export interface SlideDef {
  id: string;
  /** Sección que se ve arriba a la derecha. */
  section: string;
  title: string;
  theme: "dark" | "light";
  tone?: "amber" | "green" | "blue";
  className?: string;
  notes: string;
  Body: (p: SlideProps) => ReactNode;
}

const DANA = "dana-malaga";
const scn = getScenario(DANA);

/**
 * Dirección de la grabadora del público (/llamar, rama feature/llamadas-publico). NEXT_PUBLIC_CALL_URL la fija;
 * si no, se forma con NEXT_PUBLIC_DEMO_URL (para presentar desde localhost) o con esta misma web.
 */
function useCallUrl() {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const fixed = process.env.NEXT_PUBLIC_CALL_URL?.trim();
    if (fixed) {
      setUrl(fixed);
      return;
    }
    const site = process.env.NEXT_PUBLIC_DEMO_URL?.trim() || new URL(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/`, window.location.origin).href;
    setUrl(new URL("llamar", site.endsWith("/") ? site : `${site}/`).href);
  }, []);
  return url;
}

const shortUrl = (u: string) => u.replace(/^https?:\/\//, "").replace(/\/$/, "");

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

// ═════════════════════════════ 2 · El problema: las líneas

const LINE_STATS: { num: string; label: string; what: string; who: string }[] = [
  { num: "×4", label: "por cuatro", what: "llamadas al 112 en el apagón del 28 de abril de 2025", who: "112 autonómicos / prensa" },
  { num: "+10.000", label: "más de 10.000", what: "llamadas perdidas ese día solo en Cataluña", who: "112 autonómicos / prensa" },
  { num: "43.845", label: "43.845", what: "llamadas en idioma extranjero al 112 de Andalucía en 2024", who: "Junta de Andalucía" },
  { num: "~30 s", label: "unos 30 segundos", what: "para conectar con un intérprete humano", who: "112 Catalunya" },
];

function Lines() {
  return (
    <>
      <div className="head">
        <p className="eyebrow rise" style={at(0)}><span className="bar" />Cuando todo falla, todo el mundo llama</p>
        <h2 className="h2 rise" style={at(1)}>El cuello de botella no son los recursos. <em>Son las líneas.</em></h2>
      </div>
      <div className="s-lines">
        {LINE_STATS.map((x, i) => (
          <div key={x.num} className="card stat rise" style={at(2 + i)}>
            <p className="num" aria-label={x.label}>{x.num}</p>
            <p className="what">{x.what}</p>
            <p className="who">{x.who}</p>
          </div>
        ))}
      </div>
      <div className="spacer" />
      <p className="punch rise" style={at(7)}>
        <span className="soft">Seis llamadas por el mismo coche ocupan seis líneas.</span> <u>La del infarto, en árabe, espera.</u>
      </p>
    </>
  );
}

// ═════════════════════════════ 3 · La solución

const PILLARS: { icon: IconName; title: string; text: string }[] = [
  { icon: "merge", title: "Agrupa", text: "Seis llamadas, un incidente. Cuenta la dirección que se dice, no solo dónde está el móvil." },
  { icon: "alert", title: "Prioriza", text: "Si una llamada repetida trae algo nuevo («hay un bebé dentro»), sube la prioridad." },
  { icon: "translate", title: "Traduce", text: "El operador elige la frase en castellano y el llamante la oye en su idioma." },
  { icon: "agent", title: "Actúa", text: "Avisa sola a la distribuidora y al ayuntamiento. SMS, unidades y ES-Alert los aprueba una persona." },
];

function Solution() {
  return (
    <>
      <div className="head">
        <p className="eyebrow rise" style={at(0)}><span className="bar" />La solución · Agente 112</p>
        <h2 className="h2 rise" style={at(1)}>Ordena la avalancha. <em>Decide el operador.</em></h2>
        <p className="lead rise" style={at(2)}>Un agente de IA para la sala del 112: escucha cada llamada, la junta con las de la misma emergencia y prepara el siguiente paso.</p>
      </div>
      <div className="s-pillars">
        {PILLARS.map((p, i) => (
          <div key={p.title} className="card pillar rise" style={at(3 + i)}>
            <span className="ic"><Icon name={p.icon} size={30} /></span>
            <span className="k">{String(i + 1).padStart(2, "0")}</span>
            <h3>{p.title}</h3>
            <p>{p.text}</p>
          </div>
        ))}
      </div>
      <div className="spacer" />
      <div className="guarantees fade" style={at(7)}>
        <span className="chip amber"><Icon name="alert" size={16} />Si duda, pregunta: nunca fusiona sola</span>
        <span className="chip ok"><Icon name="check" size={16} />100 % local · sin nube</span>
        <span className="chip"><Icon name="check" size={16} />Ley de IA: humano en el bucle y registro</span>
      </div>
      <p className="src fade" style={at(8)}>No hemos encontrado ningún 112 en España que agrupe automáticamente las llamadas duplicadas · <b>investigación propia, oct-2026</b></p>
    </>
  );
}

// ═════════════════════════════ 4 · Llama tú (QR para el público)

function CallIn() {
  const url = useCallUrl();
  return (
    <>
      <div className="copy">
        <p className="eyebrow rise" style={at(0)}><span className="bar" />Participa en la demo</p>
        <h2 className="h1 rise" style={at(1)}>Llama tú.</h2>
        <p className="lead rise" style={at(2)}>Graba desde el móvil una emergencia inventada y mírala entrar en la sala mientras te la enseñamos.</p>
        <ol className="steps3">
          <li className="rise" style={at(3)}><span className="k">1</span><div><b>Escanea el código</b><span>Se abre la grabadora en el navegador.</span></div></li>
          <li className="rise" style={at(4)}><span className="k">2</span><div><b>Cuenta qué pasa y dónde</b><span>En tu idioma, hasta 2 minutos.</span></div></li>
          <li className="rise" style={at(5)}><span className="k">3</span><div><b>Llega a la consola</b><span>El operador la ve en su bandeja y decide.</span></div></li>
        </ol>
        <p className="warn fade" style={at(7)}><Icon name="alert" size={18} />Demo de hackathon: no es un servicio de emergencias. En una emergencia real, llama al 112.</p>
      </div>
      <div className="qr-card rise" style={at(2)}>
        {url ? <QrCode text={url} label={`Código QR a ${url}`} /> : <div className="qr-skeleton" />}
        <span className="url">{shortUrl(url)}</span>
        <span className="tag"><Icon name="mic" size={16} />Graba tu llamada</span>
      </div>
    </>
  );
}

// ═════════════════════════════ 5 · La consola en directo

function Live({ active }: SlideProps) {
  const url = useCallUrl();
  const incidents = new Set(scn.calls.map((c) => c.gold)).size;
  return (
    <>
      <div className="s-live-head">
        <div className="head">
          <p className="eyebrow rise" style={at(0)}><span className="bar" />La consola, en directo</p>
          <h2 className="h2 rise" style={at(1)}>{scn.calls.length} avisos. <em>{incidents} emergencias.</em></h2>
        </div>
        <div className="hint fade" style={at(3)}>
          <span className="live-tag"><i />En directo · simulado</span>
          <span>Si la IA duda, decides tú:</span>
          <span><kbd>M</kbd> mismo · <kbd>D</kbd> distinto</span>
        </div>
        <div className="mini-qr fade" style={at(4)}>
          {url ? <QrCode text={url} label={`Código QR para llamar: ${url}`} /> : <div className="qr-skeleton" />}
          <span><b>Llama tú</b>escanea y graba</span>
        </div>
      </div>
      <Frame title="Agente 112 · consola de sala" tag="la misma de la página principal" className="s-live rise" style={at(2)}>
        <LiveConsole active={active} />
      </Frame>
    </>
  );
}

// ═════════════════════════════ 6 · Hoja de ruta (provisional)

const ROADMAP: { when: string; title: string; text: string; done?: boolean }[] = [
  { when: "Hoy · nov 2026", title: "MVP funcionando", text: "Consola en modo simulado, tres escenarios, IA local (Whisper + LLM) y la política del agente en código con tests.", done: true },
  { when: "1.er semestre 2027", title: "Piloto con un contratista", text: "Llamadas reales anonimizadas. Métrica: líneas liberadas y tiempo hasta la llamada crítica." },
  { when: "2.º semestre 2027", title: "Integración y Ley de IA", text: "Telefonía, AML y despacho. Listos para el alto riesgo antes de dic-2027: registro, explicaciones y humano en el bucle." },
  { when: "2028", title: "Primeras salas", text: "A través de los concursos del 112: el pliego andaluz ya puntúa el software que ofrece el licitador." },
];

function Roadmap({ active }: SlideProps) {
  return (
    <>
      <div className="head">
        <p className="eyebrow rise" style={at(0)}><span className="bar" />Hoja de ruta</p>
        <h2 className="h2 rise" style={at(1)}>De la demo a una sala real <em>del 112.</em></h2>
      </div>
      <ol className="road">
        {ROADMAP.map((r, i) => (
          <li key={r.when} className={`step rise ${r.done ? "done" : ""}`} style={at(2 + i)}>
            <span className="dot" aria-hidden="true">{r.done && <Icon name="check" size={16} />}</span>
            <span className="when">{r.when}</span>
            <h3>{r.title}</h3>
            <p>{r.text}</p>
          </li>
        ))}
      </ol>
      <div className="spacer" />
      <div className="s-biz">
        <div className="card rise" style={at(6)}>
          <h3>Cliente</h3>
          <p>El contratista que opera la sala del 112.</p>
        </div>
        <div className="card rise" style={at(7)}>
          <h3>Modelo</h3>
          <p>Licencia por puesto de operador.</p>
        </div>
        <div className="card rise" style={at(8)}>
          <h3>Mercado</h3>
          <p><span className="num"><CountUp to={894930} active={active} delay={900} /></span> emergencias gestionó el 112 de Andalucía en 2025 <span className="who">· Junta de Andalucía</span></p>
        </div>
      </div>
    </>
  );
}

// ═════════════════════════════ 7 · Cierre: logo y eslogan

function Closing() {
  return (
    <>
      <LogoLockup />
      <p className="slogan rise" style={at(6)}>Cuando todos llaman, <em>que nadie se pierda.</em></p>
      <p className="motto fade" style={at(8)}>La IA propone · El operador decide</p>
    </>
  );
}

// ═════════════════════════════ Guion (3 minutos)

export const SLIDES: SlideDef[] = [
  {
    id: "dana", section: "El problema", title: "19.821 llamadas, 4.770 incidentes", theme: "dark", className: "s-hook", Body: Hook,
    notes: "(0:00–0:15) El 29 de octubre de 2024, la DANA de Valencia generó 19.821 llamadas al 112 para 4.770 incidentes: unas cuatro llamadas por cada emergencia. Cada punto es una llamada; cada círculo, una emergencia.",
  },
  {
    id: "lineas", section: "El problema", title: "Son las líneas", theme: "dark", Body: Lines,
    notes: "(0:15–0:35) En el apagón de 2025 las llamadas se multiplicaron por cuatro y en Cataluña se perdieron más de 10.000. Y no todos hablan castellano: 43.845 llamadas en otro idioma en Andalucía, y unos 30 segundos para conseguir un intérprete. Si seis personas llaman por el mismo coche, la del infarto, en árabe, espera.",
  },
  {
    id: "solucion", section: "La solución", title: "Agente 112", theme: "dark", tone: "blue", Body: Solution,
    notes: "(0:35–0:55) Agente 112 ordena esa avalancha. Agrupa las llamadas de la misma emergencia, también por la dirección que se dice; prioriza cuando una repetida trae algo nuevo; traduce la respuesta del operador; y actúa: los avisos informativos salen solos, lo demás lo aprueba una persona. Si duda, pregunta. Todo en local.",
  },
  {
    id: "llama", section: "La demo", title: "Llama tú", theme: "light", className: "s-call", Body: CallIn,
    notes: "(0:55–1:05) Sacad el móvil: escanead y grabad una emergencia inventada, diciendo qué pasa y dónde. Mientras, os enseño la consola. El QR sigue en la esquina de la siguiente diapositiva.",
  },
  {
    id: "demo", section: "La demo", title: "La consola, en directo", theme: "dark", tone: "blue", Body: Live,
    notes: "(1:05–2:20) Arranca sola a ×4 con sonido: suben las líneas liberadas. A4 trae información nueva (un bebé) y sube la prioridad. F1 se pone en ámbar: pulsar D, es otro coche. B2: pulsar M, misma dirección. Los cables caídos avisan solos a la distribuidora. Subir a ×10: llega E1 en árabe; en Traducción, elegir «¿La persona respira?» y reproducirla en árabe. Final: 27 avisos (26 llamadas y una eCall), 7 emergencias.",
  },
  {
    id: "hoja-de-ruta", section: "Siguiente paso", title: "Hoja de ruta", theme: "dark", tone: "green", Body: Roadmap,
    notes: "(2:20–2:45) Hoja de ruta provisional. Hoy, el MVP. En 2027, piloto con un contratista con llamadas reales anonimizadas, integración y conformidad con la Ley de IA antes de diciembre de 2027. En 2028, las primeras salas a través de los concursos. Vendemos al contratista que opera la sala, con licencia por puesto.",
  },
  {
    id: "agente-112", section: "Agente 112", title: "Cuando todos llaman, que nadie se pierda", theme: "light", className: "s-close", Body: Closing,
    notes: "(2:45–3:00) Agente 112. Cuando todos llaman, que nadie se pierda. La IA propone; el operador decide. Gracias. (Al pasar de esta diapositiva se abre la consola.)",
  },
];
