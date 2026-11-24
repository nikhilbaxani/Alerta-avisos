"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import satHi from "@/assets/map/malaga-hi.webp";
import satCtx from "@/assets/map/malaga-contexto.webp";
import { CONTEXT, METERS_PER_UNIT, PLACES, MAP_H, MAP_W, project } from "@/lib/map";
import { rankIncidents } from "@/lib/priority";
import { TYPE_LABELS } from "@/lib/labels";
import type { Incident } from "@/lib/engine";
import type { ConsoleState } from "@/lib/useConsole";
import Icon from "./Icon";
import type { Tab } from "./TopBar";
import { langName, mmss, placeOf, plural, toneOf } from "./format";

const centroid = (i: Incident) => {
  const ps = i.points.map((p) => project(p.lat, p.lng));
  return { x: ps.reduce((a, p) => a + p.x, 0) / ps.length, y: ps.reduce((a, p) => a + p.y, 0) / ps.length };
};

/** Capas del mapa de calles (scripts/build_streets.py): trazados SVG ya proyectados al viewBox de lib/map.ts. */
interface Streets {
  attribution: string;
  sea: string;
  islands: string;
  water: string;
  river: string;
  forest: string;
  park: string;
  airport: string;
  apron: string;
  runway: string;
  taxiway: string;
  rail: string;
  roads: Record<"minor" | "tertiary" | "secondary" | "primary" | "motorway", string>;
  places: { name: string; x: number; y: number; rank: number }[];
}

/** Se carga aparte (≈1–2 MB) y una sola vez; viene dentro de la aplicación, sin red externa. */
let streetsCache: Promise<Streets> | null = null;
const loadStreets = () => (streetsCache ??= import("@/assets/map/streets.json").then((m) => (m.default ?? m) as unknown as Streets));

interface Props {
  s: ConsoleState;
  onSelect: (id: string) => void;
  onFxDone: (key: string) => void;
  onOpen: (tab: Tab) => void;
  pendingActions: Record<string, number>;
  actionCount: Record<string, number>;
  /** Capas encima del mapa (bienvenida). */
  children?: React.ReactNode;
}

/** Zonas rápidas: recuadro [x, y, ancho, alto] en unidades del mapa. */
const PRESETS = [
  { id: "todo", label: "Toda la zona", box: [100, 100, 830, 420] },
  { id: "centro", label: "Centro", box: [400, 110, 220, 140] },
  { id: "campanillas", label: "Campanillas", box: [70, 105, 160, 100] },
] as const;

const MIN_W = 40;
const ROAD_W = { minor: 1, tertiary: 1.4, secondary: 2, primary: 2.6, motorway: 3.2 } as const;

interface View { cx: number; cy: number; w: number }

export default function MapView({ s, onSelect, onFxDone, onOpen, pendingActions, actionCount, children }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 900, h: 560 });
  const [view, setView] = useState<View>({ cx: 510, cy: 320, w: 880 });
  const [preset, setPreset] = useState<string | null>("todo");
  const [layer, setLayer] = useState<"streets" | "sat">("streets");
  const [streets, setStreets] = useState<Streets | null>(null);
  const [hiReady, setHiReady] = useState(false);
  const [closed, setClosed] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  const aspect = size.h / Math.max(1, size.w);
  /** La vista puede moverse por todo el entorno, pero no alejarse más que la bahía completa con margen. */
  const maxW = Math.min(1150, CONTEXT.w, CONTEXT.h / aspect);

  /** Ajusta la vista para que no se salga del entorno dibujado. */
  const clamp = useCallback((v: View): View => {
    const w = Math.max(MIN_W, Math.min(maxW, v.w));
    const h = w * aspect;
    const cx = Math.max(CONTEXT.x + w / 2, Math.min(CONTEXT.x + CONTEXT.w - w / 2, v.cx));
    const cy = Math.max(CONTEXT.y + h / 2, Math.min(CONTEXT.y + CONTEXT.h - h / 2, v.cy));
    return { cx, cy, w };
  }, [aspect, maxW]);

  const fitBox = useCallback(([x, y, bw, bh]: readonly number[]) => {
    setView(clamp({ cx: x + bw / 2, cy: y + bh / 2, w: Math.max(bw, bh / aspect) }));
  }, [aspect, clamp]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      if (e.contentRect.width > 0 && e.contentRect.height > 0) setSize({ w: e.contentRect.width, h: e.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Al cambiar el tamaño, se vuelve a encajar la zona elegida.
  useEffect(() => {
    const p = PRESETS.find((x) => x.id === preset);
    if (p) fitBox(p.box);
    else setView((v) => clamp(v));
  }, [size, preset, fitBox, clamp]);

  useEffect(() => {
    let alive = true;
    loadStreets().then((d) => alive && setStreets(d)).catch(() => alive && setLayer("sat"));
    return () => { alive = false; };
  }, []);

  // La ortofoto de detalle (2,7 MB) solo se pide si se elige la vista satélite.
  useEffect(() => {
    if (layer !== "sat" || hiReady) return;
    const img = new Image();
    img.onload = () => setHiReady(true);
    img.src = satHi.src;
  }, [layer, hiReady]);

  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  useEffect(() => {
    const timers = s.fx.map((f) => setTimeout(() => onFxDone(f.key), reduce ? 0 : 1000));
    return () => timers.forEach(clearTimeout);
  }, [s.fx, onFxDone, reduce]);

  const toMap = (clientX: number, clientY: number) => {
    const m = svg.current?.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };

  const zoomAt = useCallback((factor: number, at?: { x: number; y: number }) => {
    setPreset(null);
    setView((v) => {
      const w = Math.max(MIN_W, Math.min(maxW, v.w * factor));
      const f = w / v.w;
      const p = at ?? { x: v.cx, y: v.cy };
      return clamp({ cx: p.x + (v.cx - p.x) * f, cy: p.y + (v.cy - p.y) * f, w });
    });
  }, [clamp, maxW]);

  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = toMap(e.clientX, e.clientY);
      zoomAt(e.deltaY > 0 ? 1.2 : 1 / 1.2, p ?? undefined);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    suppressClick.current = false;
    drag.current = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    if (!d.moved) svg.current?.setPointerCapture(e.pointerId);
    d.moved = true;
    const upp = view.w / size.w;
    setPreset(null);
    setView(clamp({ cx: d.cx - dx * upp, cy: d.cy - dy * upp, w: view.w }));
  };
  const onPointerUp = () => {
    suppressClick.current = !!drag.current?.moved;
    drag.current = null;
  };

  const h = view.w * aspect;
  const vx = view.cx - view.w / 2;
  const vy = view.cy - h / 2;
  /** Unidades del mapa por píxel de pantalla: marcas y textos mantienen su tamaño al acercar. */
  const u = view.w / Math.max(1, size.w);
  /** Las calles engordan un poco al acercar, como en un mapa de navegación. */
  const zf = Math.max(0.75, Math.min(3, Math.sqrt(700 / view.w)));
  const minorOpacity = Math.max(0, Math.min(1, (560 - view.w) / 260));
  const showTertiary = view.w < 1000;

  const incidents = s.engine.incidents;
  const byId = new Map(incidents.map((i) => [i.id, i]));
  const ranked = rankIncidents(incidents, s.clock);
  const rank = new Map(ranked.map((i, n) => [i.id, n + 1]));
  const selected = incidents.find((i) => i.id === s.selected);
  const scaleM = view.w * METERS_PER_UNIT > 12000 ? 2000 : view.w * METERS_PER_UNIT > 5000 ? 1000 : view.w * METERS_PER_UNIT > 2000 ? 500 : 200;
  const scalePx = scaleM / METERS_PER_UNIT / u;

  const select = (id: string) => {
    if (suppressClick.current) { suppressClick.current = false; return; }
    setClosed(null);
    onSelect(id);
  };

  // Rótulos: los de referencia siempre; los de OSM según el zoom y sin pisarse (en píxeles de pantalla).
  const labels: { name: string; x: number; y: number; size: number; minor: boolean }[] = [];
  {
    const taken: { x0: number; y0: number; x1: number; y1: number }[] = [];
    const tryAdd = (name: string, x: number, y: number, fs: number, minor: boolean) => {
      const sx = (x - vx) / u, sy = (y - vy) / u;
      if (sx < -50 || sy < -20 || sx > size.w + 50 || sy > size.h + 20) return;
      const w = name.length * fs * 0.56 + 10;
      const r = { x0: sx - w / 2, y0: sy - fs, x1: sx + w / 2, y1: sy + 6 };
      if (taken.some((t) => r.x0 < t.x1 && r.x1 > t.x0 && r.y0 < t.y1 && r.y1 > t.y0)) return;
      taken.push(r);
      labels.push({ name, x, y, size: fs, minor });
    };
    for (const p of PLACES) {
      const { x, y } = project(p.at[1], p.at[0]);
      tryAdd(p.name, x, y, 13.5, false);
    }
    const norm = (t: string) => t.toLowerCase();
    const curated = PLACES.map((p) => norm(p.name));
    if (streets && layer === "streets") {
      for (const p of streets.places) {
        // «Málaga» ya está como «Málaga centro»: no repetir rótulos de referencia
        if (curated.some((c) => c.includes(norm(p.name)) || norm(p.name).includes(c))) continue;
        const limit = p.rank <= 1 ? 2000 : p.rank === 2 ? 700 : p.rank <= 4 ? 380 : 170;
        if (view.w > limit) continue;
        tryAdd(p.name, p.x, p.y, p.rank <= 2 ? 13 : 11.5, p.rank > 2);
      }
    }
  }

  // Ficha emergente junto al incidente seleccionado (como la tarjeta de llamada de un mapa de despacho).
  let popup: React.ReactNode = null;
  if (selected && closed !== selected.id) {
    const c = centroid(selected);
    const px = (c.x - vx) / u;
    const py = (c.y - vy) / u;
    if (px > 0 && py > 0 && px < size.w && py < size.h) {
      const n = rank.get(selected.id) ?? 0;
      const tone = toneOf(selected);
      const langs = [...new Set(selected.callIds.map((id) => s.calls[id]?.extraction.language ?? "es"))].filter((l) => l !== "es");
      const firstT = Math.min(...selected.callIds.map((id) => s.calls[id]?.t ?? s.clock));
      const pw = Math.min(330, size.w - 24);
      const left = Math.max(12, Math.min(size.w - pw - 12, px - pw / 2));
      const pos: React.CSSProperties = py > size.h * 0.52 ? { left, bottom: size.h - py + 30, width: pw } : { left, top: py + 30, width: pw };
      const todo = pendingActions[selected.id] ?? 0;
      const acts = actionCount[selected.id] ?? 0;
      popup = (
        <div className="popup" style={pos} role="dialog" aria-label={`Ficha de ${selected.id}`}>
          <button className="popup-close" onClick={() => setClosed(selected.id)} aria-label="Cerrar ficha"><Icon name="close" size={16} /></button>
          <div className="popup-top">
            <h3>{TYPE_LABELS[selected.type]}</h3>
            <span className={`pill ${tone === "critical" ? "red" : tone === "pending" ? "amber" : "accent"}`} title="Tiempo desde la primera llamada">{mmss(Math.max(0, s.clock - firstT))}</span>
          </div>
          <span className="popup-sub">{selected.id} · prioridad {n} · {plural(selected.callIds.length, "llamada", "llamadas")}{langs.length ? ` · ${langs.map(langName).join(", ")}` : ""}</span>
          {placeOf(selected) && <span className="popup-place">{placeOf(selected)}</span>}
          <p className="popup-summary">{selected.summary}</p>
          {selected.provisional && <p className="decision-note">Pendiente de tu decisión: ¿es {selected.linkedTo}?</p>}
          <div className="popup-actions">
            <button className="btn btn-out" onClick={() => onOpen("incidents")}>Abrir ficha</button>
            {langs.length > 0 && <button className="btn btn-out" onClick={() => onOpen("translate")}>Responder</button>}
            {acts > 0 && (
              <button className={`btn ${todo ? "btn-amber" : "btn-out"}`} onClick={() => onOpen("actions")}>
                {todo ? `Aprobar acciones (${todo})` : `Acciones (${acts})`}
              </button>
            )}
          </div>
        </div>
      );
    }
  }

  const road = (cls: keyof typeof ROAD_W, casing = false) => (
    <path
      className={casing ? "m-casing" : `m-road m-${cls}`}
      d={streets!.roads[cls]}
      strokeWidth={ROAD_W[cls] * zf + (casing ? 1.6 : 0)}
      vectorEffect="non-scaling-stroke"
    />
  );
  const sat = layer === "sat" || !streets;

  return (
    <div className="map-wrap">
    <div className="map-box" ref={box}>
      <svg
        ref={svg}
        className={`map ${sat ? "sat" : ""}`}
        viewBox={`${vx} ${vy} ${view.w} ${h}`}
        preserveAspectRatio="xMidYMid meet"
        role="group"
        aria-label={`Mapa ${sat ? "satelital" : "de calles"} de la bahía de Málaga con los incidentes abiertos. Arrastra para moverte y usa la rueda o los botones para acercar.`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {sat ? (
          layer === "sat" && (
            <>
              <image href={satCtx.src} x={CONTEXT.x} y={CONTEXT.y} width={CONTEXT.w} height={CONTEXT.h} preserveAspectRatio="none" />
              {hiReady && view.w < 600 && <image href={satHi.src} x={0} y={0} width={MAP_W} height={MAP_H} preserveAspectRatio="none" />}
              {/* Velo para que las marcas destaquen sobre la foto */}
              <rect x={CONTEXT.x} y={CONTEXT.y} width={CONTEXT.w} height={CONTEXT.h} fill="#0b1620" opacity={0.32} />
            </>
          )
        ) : (
          <g aria-hidden="true">
            <path className="m-forest" d={streets.forest} />
            <path className="m-park" d={streets.park} />
            <path className="m-airport" d={streets.airport} />
            <path className="m-apron" d={streets.apron} />
            <path className="m-water" d={streets.water} />
            <path className="m-river" d={streets.river} strokeWidth={1.4 * zf} vectorEffect="non-scaling-stroke" />
            <path className="m-sea" d={streets.sea} fillRule="evenodd" />
            <path className="m-land" d={streets.islands} />
            <path className="m-runway" d={streets.taxiway} strokeWidth={0.35} />
            <path className="m-runway" d={streets.runway} strokeWidth={1.4} />
            <path className="m-rail" d={streets.rail} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
            {minorOpacity > 0 && <g opacity={minorOpacity}>{road("minor")}</g>}
            {showTertiary && road("tertiary")}
            {road("secondary", true)}
            {road("secondary")}
            {road("primary", true)}
            {road("primary")}
            {road("motorway", true)}
            {road("motorway")}
          </g>
        )}

        {labels.map((l) => (
          <text key={l.name + l.x} className={`map-place ${l.minor ? "minor" : ""}`} x={l.x} y={l.y} fontSize={l.size * u} strokeWidth={3 * u}>
            {l.name}
          </text>
        ))}

        {/* Cada llamada unida a su incidente */}
        {s.arrived.map((id) => {
          const call = s.calls[id];
          const inc = byId.get(s.engine.assignment[id]);
          if (!call || !inc) return null;
          const a = project(call.aml.lat, call.aml.lng);
          const b = centroid(inc);
          return <line key={`cl-${id}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={sat ? "#fff" : "var(--map-link)"} strokeOpacity={sat ? 0.55 : 1} strokeWidth={1.2 * u} />;
        })}

        {/* Zona gris: enlace con el incidente candidato */}
        {incidents.filter((i) => i.provisional && i.linkedTo && byId.get(i.linkedTo)).map((i) => {
          const a = centroid(i);
          const b = centroid(byId.get(i.linkedTo!)!);
          return <line key={`l-${i.id}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--amber)" strokeWidth={3 * u} strokeDasharray={`${7 * u} ${5 * u}`} />;
        })}

        {/* Precisión de la posición AML del incidente seleccionado */}
        {selected?.points.map((p, n) => {
          const c = project(p.lat, p.lng);
          return <circle key={`acc${n}`} cx={c.x} cy={c.y} r={Math.max(5 * u, p.acc / METERS_PER_UNIT)} fill="var(--accent-bg)" stroke="var(--accent)" strokeWidth={1.2 * u} strokeDasharray={`${3 * u} ${3 * u}`} />;
        })}

        {s.arrived.map((id) => {
          const call = s.calls[id];
          if (!call) return null;
          const p = project(call.aml.lat, call.aml.lng);
          return <circle key={id} cx={p.x} cy={p.y} r={3.5 * u} fill={sat ? "#fff" : "var(--map-dot)"} stroke={sat ? "#0b1620" : "var(--map-dot-line)"} strokeWidth={1.2 * u} />;
        })}

        {incidents.map((i) => {
          const c = centroid(i);
          const r = (12 + Math.min(i.callIds.length, 8) * 1.4) * u;
          const tone = toneOf(i);
          const sel = i.id === s.selected;
          const n = rank.get(i.id) ?? 0;
          return (
            <g
              key={i.id}
              className={`marker tone-${tone} ${sel ? "is-sel" : ""}`}
              onClick={() => select(i.id)}
              role="button"
              tabIndex={0}
              aria-label={`${i.id}, prioridad ${n}: ${TYPE_LABELS[i.type]}, ${plural(i.callIds.length, "llamada", "llamadas")}`}
              aria-pressed={sel}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setClosed(null); onSelect(i.id); } }}
            >
              {sel && <circle className="halo" cx={c.x} cy={c.y} r={r + 12 * u} />}
              {sel && <circle className="sel-ring" cx={c.x} cy={c.y} r={r + 6 * u} strokeWidth={2.5 * u} />}
              <circle className="ring" cx={c.x} cy={c.y} r={r} strokeWidth={2.5 * u} strokeDasharray={tone === "pending" ? `${5 * u} ${3 * u}` : undefined} />
              <text className="marker-n" x={c.x} y={c.y} fontSize={13 * u} dy="0.35em">{n}</text>
              {(view.w < 420 || sel) && <text className="marker-id" x={c.x} y={c.y + r + 14 * u} fontSize={12 * u} strokeWidth={3 * u}>{i.id}</text>}
              <title>{`${i.id} · ${TYPE_LABELS[i.type]} · ${placeOf(i)}`}</title>
            </g>
          );
        })}

        {!reduce && s.fx.map((f) => {
          const call = s.calls[f.callId];
          const inc = byId.get(f.incidentId);
          if (!call || !inc) return null;
          const from = project(call.aml.lat, call.aml.lng);
          const to = centroid(inc);
          return (
            <circle key={f.key} r={7 * u} fill="var(--amber)" stroke="#fff" strokeWidth={2 * u}>
              <animate attributeName="cx" from={from.x} to={to.x} dur="0.8s" fill="freeze" calcMode="spline" keySplines=".4 0 .2 1" keyTimes="0;1" />
              <animate attributeName="cy" from={from.y} to={to.y} dur="0.8s" fill="freeze" calcMode="spline" keySplines=".4 0 .2 1" keyTimes="0;1" />
              <animate attributeName="opacity" from="1" to="0.2" dur="0.8s" fill="freeze" />
            </circle>
          );
        })}
      </svg>

      {!streets && layer === "streets" && <span className="map-loading">Cargando mapa…</span>}

      <div className="map-presets map-float" role="group" aria-label="Zona del mapa">
        {PRESETS.map((p) => (
          <button key={p.id} aria-pressed={preset === p.id} onClick={() => setPreset(p.id)}>{p.label}</button>
        ))}
      </div>

      <div className="map-layers map-float" role="group" aria-label="Tipo de mapa">
        <button aria-pressed={layer === "streets"} onClick={() => setLayer("streets")} disabled={!streets}>Mapa</button>
        <button aria-pressed={layer === "sat"} onClick={() => setLayer("sat")}>Satélite</button>
      </div>

      <div className="map-zoom map-float" role="group" aria-label="Zoom">
        <button onClick={() => zoomAt(1 / 1.5)} aria-label="Acercar" title="Acercar"><Icon name="plus" /></button>
        <button onClick={() => zoomAt(1.5)} aria-label="Alejar" title="Alejar"><Icon name="minus" /></button>
      </div>

      <div className="map-foot">
        <span className="map-scale"><i style={{ width: scalePx }} />{scaleM >= 1000 ? `${scaleM / 1000} km` : `${scaleM} m`}</span>
        <span className="map-attr">{sat ? "Ortofoto PNOA © IGN · CC BY 4.0" : "© colaboradores de OpenStreetMap"}</span>
      </div>

      {children}
    </div>
    {popup}
    <div className="map-legend map-float" aria-hidden="true">
      <span><i className="lg tone-critical" />Crítico</span>
      <span><i className="lg tone-normal" />Incidente <em>(nº = prioridad)</em></span>
      <span><i className="lg tone-pending" />Necesita tu decisión</span>
      <span><i className="lg call" />Llamada</span>
    </div>
    </div>
  );
}
