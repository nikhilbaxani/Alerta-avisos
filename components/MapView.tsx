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
import { placeOf, plural, toneOf } from "./format";

const centroid = (i: Incident) => {
  const ps = i.points.map((p) => project(p.lat, p.lng));
  return { x: ps.reduce((a, p) => a + p.x, 0) / ps.length, y: ps.reduce((a, p) => a + p.y, 0) / ps.length };
};

interface Props {
  s: ConsoleState;
  onSelect: (id: string) => void;
  onFxDone: (key: string) => void;
}

/** Zonas rápidas: recuadro [x, y, ancho, alto] en unidades del mapa. */
const PRESETS = [
  { id: "todo", label: "Toda la zona", box: [100, 100, 830, 420] },
  { id: "centro", label: "Centro", box: [400, 110, 220, 140] },
  { id: "campanillas", label: "Campanillas", box: [70, 105, 160, 100] },
] as const;

const MIN_W = 70;

interface View { cx: number; cy: number; w: number }

export default function MapView({ s, onSelect, onFxDone }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 900, h: 560 });
  const [view, setView] = useState<View>({ cx: 510, cy: 320, w: 880 });
  const [preset, setPreset] = useState<string | null>("todo");
  const [hiReady, setHiReady] = useState(false);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  const aspect = size.h / Math.max(1, size.w);
  /** La vista puede moverse por todo el entorno, pero no alejarse más que la bahía completa con margen. */
  const maxW = Math.min(1150, CONTEXT.w, CONTEXT.h / aspect);

  /** Ajusta la vista para que no se salga de la ortofoto de entorno. */
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
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Al cambiar el tamaño, se vuelve a encajar la zona elegida.
  useEffect(() => {
    const p = PRESETS.find((x) => x.id === preset);
    if (p) fitBox(p.box);
    else setView((v) => clamp(v));
  }, [size, preset, fitBox, clamp]);

  // La ortofoto de detalle (2,7 MB) se carga después de pintar la de vista general.
  useEffect(() => {
    const img = new Image();
    img.onload = () => setHiReady(true);
    img.src = satHi.src;
  }, []);

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

  const incidents = s.engine.incidents;
  const byId = new Map(incidents.map((i) => [i.id, i]));
  const rank = new Map(rankIncidents(incidents, s.clock).map((i, n) => [i.id, n + 1]));
  const selected = incidents.find((i) => i.id === s.selected);
  const scaleM = view.w * METERS_PER_UNIT > 12000 ? 2000 : view.w * METERS_PER_UNIT > 5000 ? 1000 : 500;
  const scalePx = scaleM / METERS_PER_UNIT / u;

  const select = (id: string) => {
    if (suppressClick.current) { suppressClick.current = false; return; }
    onSelect(id);
  };

  return (
    <>
    <div className="map-box" ref={box}>
      <svg
        ref={svg}
        className="map"
        viewBox={`${vx} ${vy} ${view.w} ${h}`}
        preserveAspectRatio="xMidYMid meet"
        role="group"
        aria-label="Mapa satelital de la bahía de Málaga con los incidentes abiertos. Arrastra para moverte y usa la rueda o los botones para acercar."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <image href={satCtx.src} x={CONTEXT.x} y={CONTEXT.y} width={CONTEXT.w} height={CONTEXT.h} preserveAspectRatio="none" />
        {hiReady && view.w < 600 && <image href={satHi.src} x={0} y={0} width={MAP_W} height={MAP_H} preserveAspectRatio="none" />}
        {/* Velo para que las marcas destaquen sobre la foto */}
        <rect x={CONTEXT.x} y={CONTEXT.y} width={CONTEXT.w} height={CONTEXT.h} fill="#0b1620" opacity={0.32} />

        {PLACES.map((p) => {
          const { x, y } = project(p.at[1], p.at[0]);
          return (
            <text key={p.name} className="map-place" x={x} y={y} fontSize={13 * u} strokeWidth={3 * u}>
              {p.name}
            </text>
          );
        })}

        {/* Cada llamada unida a su incidente */}
        {s.arrived.map((id) => {
          const call = s.calls[id];
          const inc = byId.get(s.engine.assignment[id]);
          if (!call || !inc) return null;
          const a = project(call.aml.lat, call.aml.lng);
          const b = centroid(inc);
          return <line key={`cl-${id}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#fff" strokeOpacity={0.55} strokeWidth={1.2 * u} />;
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
          return <circle key={`acc${n}`} cx={c.x} cy={c.y} r={Math.max(5 * u, p.acc / METERS_PER_UNIT)} fill="rgba(255,255,255,.08)" stroke="#fff" strokeWidth={1.2 * u} strokeDasharray={`${3 * u} ${3 * u}`} />;
        })}

        {s.arrived.map((id) => {
          const call = s.calls[id];
          if (!call) return null;
          const p = project(call.aml.lat, call.aml.lng);
          return <circle key={id} cx={p.x} cy={p.y} r={3.5 * u} fill="#fff" stroke="#0b1620" strokeWidth={1.2 * u} />;
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
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(i.id); } }}
            >
              {sel && <circle cx={c.x} cy={c.y} r={r + 6 * u} fill="none" stroke="#fff" strokeWidth={2.5 * u} />}
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

      <div className="map-presets" role="group" aria-label="Zona del mapa">
        {PRESETS.map((p) => (
          <button key={p.id} aria-pressed={preset === p.id} onClick={() => setPreset(p.id)}>{p.label}</button>
        ))}
      </div>

      <div className="map-zoom" role="group" aria-label="Zoom">
        <button onClick={() => zoomAt(1 / 1.5)} aria-label="Acercar" title="Acercar"><Icon name="plus" /></button>
        <button onClick={() => zoomAt(1.5)} aria-label="Alejar" title="Alejar"><Icon name="minus" /></button>
      </div>

      <div className="map-foot">
        <span className="map-scale"><i style={{ width: scalePx }} />{scaleM >= 1000 ? `${scaleM / 1000} km` : `${scaleM} m`}</span>
        <span className="map-attr">Ortofoto PNOA © IGN · CC BY 4.0</span>
      </div>
    </div>
    <div className="map-legend" aria-hidden="true">
      <span><i className="lg tone-critical" />Crítico</span>
      <span><i className="lg tone-normal" />Incidente <em>(nº = prioridad)</em></span>
      <span><i className="lg tone-pending" />Necesita tu decisión</span>
      <span><i className="lg call" />Llamada (posición del móvil)</span>
    </div>
    </>
  );
}
