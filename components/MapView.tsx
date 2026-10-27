"use client";

import { useEffect, useState } from "react";
import { COAST, METERS_PER_UNIT, PLACES, RIVERS, MAP_H, MAP_W, path, project } from "@/lib/map";
import type { Incident } from "@/lib/engine";
import type { ConsoleState } from "@/lib/useConsole";

const centroid = (i: Incident) => {
  const ps = i.points.map((p) => project(p.lat, p.lng));
  return { x: ps.reduce((a, p) => a + p.x, 0) / ps.length, y: ps.reduce((a, p) => a + p.y, 0) / ps.length };
};

interface Props {
  s: ConsoleState;
  onSelect: (id: string) => void;
  onFxDone: (key: string) => void;
}

const VIEWS = {
  bahia: { label: "Bahía", box: [60, 110, 900, 540] },
  centro: { label: "Centro", box: [400, 120, 240, 160] },
  campanillas: { label: "Campanillas", box: [90, 130, 150, 100] },
} as const;
type ViewKey = keyof typeof VIEWS;

export default function MapView({ s, onSelect, onFxDone }: Props) {
  const [view, setView] = useState<ViewKey>("bahia");
  const [vx, vy, vw, vh] = VIEWS[view].box;
  /** Factor para que textos y marcas mantengan su tamaño en pantalla al ampliar. */
  const k = vw / 900;
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  useEffect(() => {
    const timers = s.fx.map((f) => setTimeout(() => onFxDone(f.key), reduce ? 0 : 1000));
    return () => timers.forEach(clearTimeout);
  }, [s.fx, onFxDone, reduce]);

  const incidents = s.engine.incidents;
  const byId = new Map(incidents.map((i) => [i.id, i]));
  const selected = incidents.find((i) => i.id === s.selected);
  const scaleLen = 1000 / METERS_PER_UNIT;

  return (
    <div className="map-box">
    <div className="map-tools" role="group" aria-label="Zona del mapa">
      {(Object.keys(VIEWS) as ViewKey[]).map((v) => (
        <button key={v} className="btn" aria-pressed={view === v} onClick={() => setView(v)}>{VIEWS[v].label}</button>
      ))}
    </div>
    <svg className="map" viewBox={`${vx} ${vy} ${vw} ${vh}`} role="img" aria-label="Mapa de la bahía de Málaga con los incidentes abiertos" preserveAspectRatio="xMidYMid meet">
      <rect x={-200} y={-200} width={MAP_W + 400} height={MAP_H + 400} fill="var(--paper)" />
      {[...Array(9)].map((_, k) => (
        <line key={`v${k}`} x1={(k + 1) * 100} x2={(k + 1) * 100} y1={0} y2={MAP_H} stroke="var(--grid)" strokeWidth={1} opacity={0.6} />
      ))}
      {[...Array(5)].map((_, k) => (
        <line key={`h${k}`} y1={(k + 1) * 100} y2={(k + 1) * 100} x1={0} x2={MAP_W} stroke="var(--grid)" strokeWidth={1} opacity={0.6} />
      ))}
      <polygon points={`${path(COAST)} ${MAP_W + 200},${project(36.725, -4.24).y} ${MAP_W + 200},${MAP_H + 300} ${project(36.59, -4.53).x - 420},${MAP_H + 300}`} fill="var(--water-bg)" />
      <polyline points={path(COAST)} fill="none" stroke="var(--water)" strokeWidth={3 * k} />
      {RIVERS.map((r) => (
        <polyline key={r.name} points={path(r.pts)} fill="none" stroke="var(--water)" strokeWidth={2.5 * k} strokeLinecap="round" opacity={0.85} />
      ))}
      {PLACES.map((p) => {
        const { x, y } = project(p.at[1], p.at[0]);
        return (
          <text key={p.name} x={x} y={y} fontSize={16 * k} fill="var(--ink-soft)" textAnchor="middle">
            {p.name}
          </text>
        );
      })}

      {/* Enlaces de incidentes provisionales */}
      {incidents.filter((i) => i.provisional && i.linkedTo && byId.get(i.linkedTo)).map((i) => {
        const a = centroid(i);
        const b = centroid(byId.get(i.linkedTo!)!);
        return <line key={`l-${i.id}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--amber)" strokeWidth={3 * k} strokeDasharray={`${6 * k} ${5 * k}`} />;
      })}

      {/* Precisión AML del incidente seleccionado */}
      {selected?.points.map((p, k) => {
        const c = project(p.lat, p.lng);
        return <circle key={`acc${k}`} cx={c.x} cy={c.y} r={Math.max(4 * k, p.acc / METERS_PER_UNIT)} fill="none" stroke="var(--ink)" strokeWidth={1} strokeDasharray="2 3" opacity={0.6} />;
      })}

      {incidents.map((i) => {
        const c = centroid(i);
        const r = (12 + Math.min(i.callIds.length, 8) * 2.6) * k;
        const vital = i.severity >= 5 || i.risks.includes("vida");
        const stroke = i.provisional ? "var(--amber)" : vital ? "var(--red)" : "var(--ink)";
        const sel = i.id === s.selected;
        return (
          <g key={i.id} onClick={() => onSelect(i.id)} style={{ cursor: "pointer" }} role="button" tabIndex={0} aria-label={`${i.id}, ${i.callIds.length} llamadas`}
             onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(i.id); } }}>
            <circle className="ring" cx={c.x} cy={c.y} r={r} fill={i.provisional ? "rgba(242,169,0,.25)" : vital ? "rgba(198,31,43,.14)" : "rgba(21,34,46,.10)"}
              stroke={stroke} strokeWidth={(sel ? 5 : 3) * k} strokeDasharray={i.provisional ? `${7 * k} ${5 * k}` : undefined} />
            <text x={c.x} y={c.y - r - 5 * k} fontSize={15 * k} fontWeight={700} textAnchor="middle" fill="var(--ink)" stroke="var(--paper)" strokeWidth={3 * k} paintOrder="stroke">
              {i.id}
            </text>
          </g>
        );
      })}

      {s.arrived.map((id) => {
        const call = s.calls[id];
        if (!call) return null;
        const p = project(call.aml.lat, call.aml.lng);
        return <circle key={id} cx={p.x} cy={p.y} r={4.5 * k} fill="var(--ink)" stroke="var(--paper)" strokeWidth={1.5 * k} />;
      })}

      {!reduce && s.fx.map((f) => {
        const call = s.calls[f.callId];
        const inc = byId.get(f.incidentId);
        if (!call || !inc) return null;
        const from = project(call.aml.lat, call.aml.lng);
        const to = centroid(inc);
        return (
          <circle key={f.key} r={7 * k} fill="var(--red)" stroke="var(--paper)" strokeWidth={2 * k}>
            <animate attributeName="cx" from={from.x} to={to.x} dur="0.8s" fill="freeze" calcMode="spline" keySplines=".4 0 .2 1" keyTimes="0;1" />
            <animate attributeName="cy" from={from.y} to={to.y} dur="0.8s" fill="freeze" calcMode="spline" keySplines=".4 0 .2 1" keyTimes="0;1" />
            <animate attributeName="opacity" from="1" to="0.2" dur="0.8s" fill="freeze" />
          </circle>
        );
      })}

      <g transform={`translate(${vx + vw - scaleLen - 16 * k}, ${vy + vh - 16 * k})`}>
        <line x1={0} x2={scaleLen} y1={0} y2={0} stroke="var(--ink)" strokeWidth={3 * k} />
        <text x={scaleLen / 2} y={-6 * k} fontSize={14 * k} textAnchor="middle" fill="var(--ink)">1 km</text>
      </g>
    </svg>
    </div>
  );
}

