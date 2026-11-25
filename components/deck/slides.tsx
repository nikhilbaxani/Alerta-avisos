"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { findCall, getScenario } from "@/data/scenarios";
import { actionIncidents, RESOURCE_LABELS } from "@/lib/actions";
import type { AgentAction, ResourceService } from "@/lib/actions";
import { RISK_LABELS, SEVERITY_LABELS, TYPE_LABELS } from "@/lib/labels";
import { replayTo } from "@/lib/replay";
import { consoleProposals, reducer } from "@/lib/useConsole";
import Icon from "@/components/Icon";
import type { IconName } from "@/components/Icon";
import { langName, mmss } from "@/components/format";
import LiveConsole from "./LiveConsole";
import QrCode from "./QrCode";
import { CountUp, LogoLockup, at } from "./bits";

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
const listEs = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);

// ═════════════════════════════ 1 · La DANA de Valencia

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
      <text className="cap" x="300" y="552">Cada punto es una llamada; cada círculo, una emergencia.</text>
    </svg>
  );
}

function Hook({ active }: SlideProps) {
  return (
    <>
      <div className="copy">
        <p className="kicker rise" style={at(0)}>Valencia, 29 de octubre de 2024. DANA.</p>
        <p className="big num rise" style={at(1)} aria-label="19.821"><CountUp to={19821} active={active} ms={1800} delay={300} /></p>
        <p className="big-label rise" style={at(2)}>llamadas al 112</p>
        <p className="vs rise" style={at(3)}>para <span className="num">4.770</span> incidentes.</p>
        <p className="ratio rise" style={at(4)}>Unas cuatro llamadas por cada emergencia.</p>
        <p className="src fade" style={at(6)}>Fuente: 112 Comunitat Valenciana y prensa.</p>
      </div>
      <Swarm />
    </>
  );
}

// ═════════════════════════════ 2 · Lo que se satura son las líneas

const LINE_STATS: { num: string; label: string; what: string; who: string }[] = [
  { num: "×4", label: "por cuatro", what: "llamadas al 112 durante el apagón del 28 de abril de 2025", who: "112 autonómicos y prensa" },
  { num: "+10.000", label: "más de 10.000", what: "llamadas perdidas ese mismo día en Cataluña", who: "112 autonómicos y prensa" },
  { num: "43.845", label: "43.845", what: "llamadas en otro idioma al 112 de Andalucía en 2024", who: "Junta de Andalucía" },
  { num: "30 s", label: "unos 30 segundos", what: "aproximadamente para conectar con un intérprete", who: "112 Catalunya" },
];

function Lines() {
  return (
    <>
      <h2 className="h2 rise" style={at(0)}>En una catástrofe, lo que se satura <em>son las líneas.</em></h2>
      <div className="figures">
        {LINE_STATS.map((x, i) => (
          <div key={x.num} className="figure rise" style={at(1 + i)}>
            <p className="num" aria-label={x.label}>{x.num}</p>
            <p className="what">{x.what}</p>
            <p className="who">{x.who}</p>
          </div>
        ))}
      </div>
      <p className="closing rise" style={at(6)}>
        Si seis personas llaman por el mismo coche, son seis líneas ocupadas. Mientras, <em>otra emergencia espera turno.</em>
      </p>
    </>
  );
}

// ═════════════════════════════ 3 · Cómo funciona, con un caso del escenario

const APPROVAL: Record<AgentAction["policy"], string> = {
  automatica: "Sale solo",
  operador: "Lo aprueba el operador",
  coordinador: "Lo aprueba un coordinador",
};

/** El coche atrapado del escenario de la DANA, tal como queda en la consola: sus avisos, la emergencia y lo que propone el agente. */
function useCase() {
  return useMemo(() => {
    let s = replayTo(DANA, Infinity, { F1: false, B2: true });
    s = reducer(s, { type: "plan", proposals: consoleProposals(s) });
    const inc = s.engine.incidents.find((i) => i.callIds.includes("A1"))!;
    const news = new Map(inc.alerts.map((a) => [a.callId, a.risks]));
    const calls = inc.callIds.map((id) => {
      const c = findCall(id)!;
      const risks = news.get(id);
      // Lo nuevo, con las palabras del llamante si la frase lo separa («…; hay un bebé dentro»); si no, el riesgo.
      const said = c.mock.summary_es.includes(";") ? c.mock.summary_es.split(";").pop()!.trim().replace(/\.$/, "") : null;
      return { id, t: c.t, ecall: c.channel === "ecall", lang: c.channel === "ecall" ? "eCall" : langName(c.lang), news: risks?.length ? said ?? RISK_LABELS[risks[0]].toLowerCase() : null };
    });
    const mine = s.actions.filter((a) => actionIncidents(a).includes(inc.id));
    const arg = (a: AgentAction, k: string) => (a.args as unknown as Record<string, unknown>)[k];
    const res = mine.filter((a) => a.tool === "proponer_recursos");
    const sms = mine.filter((a) => a.tool === "sms_al_llamante");
    const zone = mine.find((a) => a.tool === "proponer_es_alert");
    const steps: { icon: IconName; what: string; who: string }[] = [];
    if (res.length) steps.push({ icon: "truck", what: listEs(res.map((a) => RESOURCE_LABELS[arg(a, "servicio") as ResourceService])), who: APPROVAL[res[0].policy] });
    if (sms.length) steps.push({ icon: "message", what: `SMS en ${listEs([...new Set(sms.map((a) => langName(String(arg(a, "idioma"))).toLowerCase()))])}`, who: APPROVAL[sms[0].policy] });
    if (zone) steps.push({ icon: "alert", what: `ES-Alert en ${String((arg(zone, "zona") as { nombre?: string } | undefined)?.nombre ?? "la zona")}`, who: APPROVAL[zone.policy] });
    return { inc, calls, steps };
  }, []);
}

// Geometría del esquema (px del lienzo): columnas de avisos, emergencia y acciones, unidas por curvas.
const FLOW = { w: 1408, h: 500, callsEnd: 340, incStart: 500, incEnd: 880, acts: 990, callH: 52, callGap: 12, actH: 92, actGap: 20 };
const curve = (x0: number, y0: number, x1: number, y1: number) => {
  const mx = (x0 + x1) / 2;
  return `M${x0} ${y0} C${mx} ${y0}, ${mx} ${y1}, ${x1} ${y1}`;
};

function HowItWorks() {
  const { inc, calls, steps } = useCase();
  const mid = FLOW.h / 2;
  const callY = (i: number) => (FLOW.h - (calls.length * FLOW.callH + (calls.length - 1) * FLOW.callGap)) / 2 + i * (FLOW.callH + FLOW.callGap) + FLOW.callH / 2;
  const actY = (j: number) => (FLOW.h - (steps.length * FLOW.actH + (steps.length - 1) * FLOW.actGap)) / 2 + j * (FLOW.actH + FLOW.actGap) + FLOW.actH / 2;
  return (
    <>
      <h2 className="h2 rise" style={at(0)}>{calls.length} avisos del mismo coche, <em>una sola emergencia.</em></h2>
      <div className="flow-cap fade" style={at(1)}>
        <span>Lo que entra</span>
        <span>Lo que ve el operador</span>
        <span>Lo que prepara el agente</span>
      </div>
      <div className="flow">
        <svg className="links" viewBox={`0 0 ${FLOW.w} ${FLOW.h}`} aria-hidden="true">
          {calls.map((c, i) => (
            <path key={c.id} className={`ln ${c.news ? "hot" : ""}`} d={curve(FLOW.callsEnd, callY(i), FLOW.incStart, mid)} pathLength={1} style={at(5 + i)} />
          ))}
          {steps.map((x, j) => (
            <path key={x.what} className="ln" d={curve(FLOW.incEnd, mid, FLOW.acts, actY(j))} pathLength={1} style={at(14 + j)} />
          ))}
        </svg>
        <ol className="calls-col">
          {calls.map((c, i) => (
            <li key={c.id} className={`call-pill rise ${c.news ? "hot" : ""}`} style={at(1 + i)}>
              <Icon name={c.ecall ? "car" : "phone"} size={17} />
              <span className="t">{mmss(c.t)}</span>
              <span className="l">{c.lang}</span>
              {c.news && <span className="new">{c.news}</span>}
            </li>
          ))}
        </ol>
        <div className="incident rise" style={at(12)}>
          <span className="rank">1</span>
          <p className="ttl">{TYPE_LABELS[inc.type]}</p>
          <p className="where">{inc.locations[0]}</p>
          <p className="meta"><span className="sev">{SEVERITY_LABELS[inc.severity]}</span>{calls.length} avisos · {inc.people} personas</p>
        </div>
        <ul className="acts-col">
          {steps.map((x, j) => (
            <li key={x.what} className="act rise" style={at(15 + j)}>
              <span className="ic"><Icon name={x.icon} size={20} /></span>
              <div><b>{x.what}</b><span>{x.who}</span></div>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

// ═════════════════════════════ 4 · La consola en directo

function Live({ active }: SlideProps) {
  return (
    <>
      <div className="live-head rise" style={at(0)}>
        <h2 className="h3">Así lo ve el operador.</h2>
        <p>{scn.calls.length} avisos del escenario de la DANA en Málaga, a velocidad real o acelerada.</p>
      </div>
      <div className="screen rise" style={at(1)}>
        <LiveConsole active={active} />
      </div>
    </>
  );
}

// ═════════════════════════════ 5 · Tecnología: todo dentro de la sala

const PIPE: { icon: IconName; name: string; role: string }[] = [
  { icon: "phone", name: "Llamada", role: "voz, eCall y posición AML" },
  { icon: "mic", name: "Whisper", role: "pasa la voz a texto" },
  { icon: "agent", name: "Qwen 2.5 · Ollama", role: "entiende qué pasa y dónde" },
  { icon: "merge", name: "Reglas propias", role: "agrupan y proponen" },
  { icon: "people", name: "Operador", role: "decide y aprueba" },
];

function PipeNode({ n, i }: { n: (typeof PIPE)[number]; i: number }) {
  return (
    <div className="node rise" style={at(i)}>
      <span className="ic"><Icon name={n.icon} size={30} /></span>
      <p className="nm">{n.name}</p>
      <p className="rl">{n.role}</p>
    </div>
  );
}

function Tech() {
  return (
    <>
      <h2 className="h2 rise" style={at(0)}>Todo ocurre <em>dentro de la sala.</em></h2>
      <div className="spacer" />
      <div className="pipe">
        <PipeNode n={PIPE[0]} i={1} />
        <span className="arrow fade" style={at(2)} />
        <div className="local fade" style={at(2)}>
          <span className="local-label">En un ordenador de la sala, sin nube</span>
          <PipeNode n={PIPE[1]} i={3} />
          <span className="arrow" />
          <PipeNode n={PIPE[2]} i={4} />
          <span className="arrow" />
          <PipeNode n={PIPE[3]} i={5} />
        </div>
        <span className="arrow fade" style={at(6)} />
        <PipeNode n={PIPE[4]} i={7} />
      </div>
      <div className="spacer" />
    </>
  );
}

// ═════════════════════════════ 6 · Negocio y hoja de ruta (provisional)

const BIZ: { k: string; v: string }[] = [
  { k: "Cliente", v: "Empresas que gestionan el 112" },
  { k: "Modelo", v: "Licencia por puesto de operador" },
  { k: "Escala", v: "Cualquier 112 de España, y después de Europa" },
];

const ROADMAP: { when: string; what: string; done?: boolean }[] = [
  { when: "Hoy", what: "Prototipo funcionando", done: true },
  { when: "Inicio 2027", what: "Piloto con un contratista" },
  { when: "Fin 2027", what: "Integración y Ley de IA" },
  { when: "2028", what: "Primeras salas" },
];

function Business() {
  return (
    <>
      <h2 className="h2 rise" style={at(0)}>Cómo llega <em>a las salas del 112.</em></h2>
      <div className="biz-wrap">
      <div className="biz">
        {BIZ.map((b, i) => (
          <div key={b.k} className="rise" style={at(1 + i)}>
            <p className="k">{b.k}</p>
            <p className="v">{b.v}</p>
          </div>
        ))}
      </div>
      <ol className="road">
        {ROADMAP.map((r, i) => (
          <li key={r.when} className={`rise ${r.done ? "done" : ""}`} style={at(5 + i)}>
            <span className="when">{r.when}</span>
            <span className="what">{r.what}</span>
          </li>
        ))}
      </ol>
      </div>
    </>
  );
}

// ═════════════════════════════ 7 · Cierre: logo, eslogan y QR

function Closing() {
  const url = useCallUrl();
  return (
    <>
      <div className="brand-block">
        <LogoLockup />
        <p className="slogan rise" style={at(6)}>Para que nadie se quede esperando al otro lado.</p>
      </div>
      <aside className="call-qr rise" style={at(8)}>
        {url ? <QrCode text={url} label={`Código QR para grabar una llamada: ${url}`} /> : <div className="qr-skeleton" />}
        <div>
          <p className="q-title">Llama tú</p>
          <p>Graba un aviso inventado desde el móvil y míralo entrar en la consola.</p>
          <p className="q-url">{shortUrl(url)}</p>
          <p className="q-warn">Es una demo: en una emergencia real, llama al 112.</p>
        </div>
      </aside>
    </>
  );
}

// ═════════════════════════════ Guion (3 minutos)

export const SLIDES: SlideDef[] = [
  {
    id: "dana", section: "El problema", title: "19.821 llamadas, 4.770 incidentes", className: "s-hook", Body: Hook,
    notes: "(0:00–0:15) El 29 de octubre de 2024, la DANA de Valencia generó 19.821 llamadas al 112 para 4.770 incidentes: unas cuatro llamadas por cada emergencia.",
  },
  {
    id: "lineas", section: "El problema", title: "Lo que se satura son las líneas", className: "s-lines", Body: Lines,
    notes: "(0:15–0:35) En el apagón de 2025 las llamadas se multiplicaron por cuatro y en Cataluña se perdieron más de 10.000. Además, 43.845 llamadas en otro idioma solo en Andalucía, y unos 30 segundos para conseguir un intérprete. Si seis personas llaman por el mismo coche, son seis líneas ocupadas mientras otra emergencia espera.",
  },
  {
    id: "como-funciona", section: "La solución", title: "Cómo funciona", Body: HowItWorks,
    notes: "(0:35–0:55) Un caso del escenario: siete avisos del mismo coche (una eCall y llamadas en castellano, inglés y alemán) acaban en una sola emergencia. Cuando alguien dice que hay un bebé dentro, sube la prioridad. El agente prepara bomberos y SAMU, SMS en el idioma de cada llamante y un ES-Alert; lo aprueba una persona. Los avisos que solo informan, como el de la compañía eléctrica, salen solos. Si duda, no junta: pregunta. No hemos encontrado ningún 112 en España que ya agrupe las llamadas repetidas (investigación propia, oct. 2026).",
  },
  {
    id: "demo", section: "Demo", title: "Así lo ve el operador", className: "s-live", Body: Live,
    notes: "(0:55–2:10) Arranca sola a ×4 con sonido: suben las líneas liberadas. A4 trae información nueva y sube la prioridad. F1 se pone en ámbar: pulsar D, es otro coche. B2: pulsar M, misma dirección. Los cables caídos avisan solos a la compañía eléctrica. Subir a ×10: llega E1 en árabe; en Traducción, elegir «¿La persona respira?» y reproducirla.",
  },
  {
    id: "tecnologia", section: "Tecnología", title: "Todo ocurre dentro de la sala", Body: Tech,
    notes: "(2:10–2:25) Whisper pasa la voz a texto y Qwen 2.5 con Ollama entiende qué pasa y dónde, los dos en local: ningún dato de salud ni de localización sale de la sala. Funciona en un portátil con una GPU de 8 GB. La agrupación y lo que el agente puede hacer solo están en reglas programadas y probadas, no en el modelo. Lee la posición AML y la eCall y propone ES-Alert.",
  },
  {
    id: "negocio", section: "Negocio", title: "Cómo llega a las salas del 112", Body: Business,
    notes: "(2:25–2:45) Vendemos a las empresas que gestionan las salas del 112 por concurso: el pliego andaluz ya puntúa el software que ofrece el licitador. Licencia por puesto de operador. Solo el 112 de Andalucía gestionó 894.930 emergencias en 2025 (Junta de Andalucía). Hoja de ruta provisional: piloto en 2027 con llamadas reales anonimizadas, integración y Ley de IA (obligaciones desde diciembre de 2027) y primeras salas en 2028.",
  },
  {
    id: "agente-112", section: "Agente 112", title: "Para que nadie se quede esperando al otro lado", className: "s-close", Body: Closing,
    notes: "(2:45–3:00) Agente 112: para que nadie se quede esperando al otro lado. Si queréis, escanead el QR y grabad un aviso: lo veréis entrar en la consola. Gracias. (Al pasar de esta diapositiva se abre la consola.)",
  },
];
