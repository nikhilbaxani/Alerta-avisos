"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import satHi from "@/assets/map/malaga-hi.webp";
import satCtx from "@/assets/map/malaga-contexto.webp";
import { CONTEXT, METERS_PER_UNIT, PLACES, MAP_H, MAP_W, project } from "@/lib/map";
import { rankIncidents } from "@/lib/priority";
import { TYPE_LABELS } from "@/lib/labels";
import type { Incident } from "@/lib/engine";
import type { ConsoleState } from "@/lib/useConsole";
import { SIMULATION_LABEL, UNIT_STATUS_LABELS } from "@/lib/units";
import type { Unit, UnitService } from "@/lib/units";
import type { Hazard, HazardKind, UnitHazardWarning } from "@/lib/hazards";
import { RESOURCE_LABELS } from "@/lib/actions";
import Icon from "./Icon";
import ResolveButton from "./ResolveButton";
import { resolveBlocker } from "@/lib/engine";
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

/** Se carga aparte (≈1,5 MB) y una sola vez; viene dentro de la aplicación, sin red externa. */
let streetsCache: Promise<Streets> | null = null;
const loadStreets = () => (streetsCache ??= import("@/assets/map/streets.json").then((m) => (m.default ?? m) as unknown as Streets));

export type FocusBox = "detail" | "translate" | "actions" | "lost";

interface Props {
  s: ConsoleState;
  onSelect: (id: string) => void;
  onFxDone: (key: string) => void;
  /** Sin ella la ficha del mapa no lleva botones a otras cajas (p. ej. en la presentación). */
  onFocus?: (box: FocusBox) => void;
  pendingActions: Record<string, number>;
  onResolve?: (id: string) => void;
  /** Unidades simuladas con su estado en `s.clock` (X16); sin ellas no se pinta la capa. */
  units?: Unit[];
  /** Peligros en la vía (X17, simulación); sin ellos no se pinta la capa. Los resueltos no se pintan. */
  hazards?: Hazard[];
  /** Avisos «la unidad pasaría por un peligro» (X17): marcan el peligro y la unidad afectados. */
  hazardWarnings?: UnitHazardWarning[];
  /** Capas encima del mapa (bienvenida). */
  children?: React.ReactNode;
}

/** Sigla del servicio dentro del icono de la unidad. */
const UNIT_ABBR: Record<UnitService, string> = { bomberos: "B", samu_061: "S", policia_local: "PL", policia_nacional: "PN" };

/** Dibujo dentro del triángulo de peligro (en píxeles de pantalla, centrado en 0,0). */
const HAZARD_GLYPH: Record<HazardKind, React.ReactNode> = {
  agua_en_via: <path className="hz-water" d="M-5.5 1.5q1.4-1.6 2.75 0t2.75 0 2.75 0 2.75 0M-5.5 5q1.4-1.6 2.75 0t2.75 0 2.75 0 2.75 0" />,
  via_cortada: <path className="hz-bang" d="M0-4.5v5.5M0 4.2v.1" />,
  cables_electricos: <path className="hz-bolt" d="M1-5-3.2 1h3L-1 6l4.2-6h-3z" />,
};

/** Zonas rápidas: recuadro [x, y, ancho, alto] en unidades del mapa. */
const PRESETS = [
  { id: "todo", label: "Toda la zona", box: [100, 100, 830, 420] },
  { id: "centro", label: "Centro", box: [400, 110, 220, 140] },
  { id: "campanillas", label: "Campanillas", box: [70, 105, 160, 100] },
] as const;

const MIN_W = 40;
const ROAD_W = { minor: 1, tertiary: 1.4, secondary: 2, primary: 2.6, motorway: 3.2 } as const;

interface View { cx: number; cy: number; w: number }
interface Size { w: number; h: number }

const sameView = (a: View, b: View) => a.cx === b.cx && a.cy === b.cy && a.w === b.w;
const viewBox = (v: View, size: Size) => {
  const h = v.w * (size.h / Math.max(1, size.w));
  return { x: v.cx - v.w / 2, y: v.cy - h / 2, w: v.w, h };
};

const norm = (t: string) => t.toLowerCase();
const CURATED = PLACES.map((p) => ({ name: p.name, n: norm(p.name), ...project(p.at[1], p.at[0]) }));

/**
 * Fondo del mapa (calles o satélite) y rótulos. Va en su propio SVG y memorizado: solo se repinta cuando
 * cambia la vista asentada o el tipo de mapa, nunca con cada llamada que entra ni durante el arrastre.
 */
const BaseMap = memo(function BaseMap({ view, size, streets, sat, hiReady }: { view: View; size: Size; streets: Streets | null; sat: boolean; hiReady: boolean }) {
  const vb = viewBox(view, size);
  const u = view.w / Math.max(1, size.w);
  // Grosor de calle por escalones (no en continuo)
  const zf = Math.round(Math.max(0.75, Math.min(3, Math.sqrt(700 / view.w))) * 4) / 4;
  const minorOpacity = Math.round(Math.max(0, Math.min(1, (560 - view.w) / 260)) * 4) / 4;

  const labels: { name: string; x: number; y: number; size: number; minor: boolean }[] = [];
  const taken: { x0: number; y0: number; x1: number; y1: number }[] = [];
  const tryAdd = (name: string, x: number, y: number, fs: number, minor: boolean) => {
    const sx = (x - vb.x) / u, sy = (y - vb.y) / u;
    if (sx < -50 || sy < -20 || sx > size.w + 50 || sy > size.h + 20) return;
    const w = name.length * fs * 0.56 + 10;
    const r = { x0: sx - w / 2, y0: sy - fs, x1: sx + w / 2, y1: sy + 6 };
    if (taken.some((t) => r.x0 < t.x1 && r.x1 > t.x0 && r.y0 < t.y1 && r.y1 > t.y0)) return;
    taken.push(r);
    labels.push({ name, x, y, size: fs, minor });
  };
  for (const p of CURATED) tryAdd(p.name, p.x, p.y, 13.5, false);
  if (streets && !sat) {
    for (const p of streets.places) {
      const limit = p.rank <= 1 ? 2000 : p.rank === 2 ? 700 : p.rank <= 4 ? 380 : 170;
      if (view.w > limit) continue;
      // «Málaga» ya está como «Málaga centro»: no repetir rótulos de referencia
      if (CURATED.some((c) => c.n.includes(norm(p.name)) || norm(p.name).includes(c.n))) continue;
      tryAdd(p.name, p.x, p.y, p.rank <= 2 ? 13 : 11.5, p.rank > 2);
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

  return (
    <svg className={`map-base ${sat ? "sat" : ""}`} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {sat ? (
        <>
          <image href={satCtx.src} x={CONTEXT.x} y={CONTEXT.y} width={CONTEXT.w} height={CONTEXT.h} preserveAspectRatio="none" />
          {hiReady && view.w < 600 && <image href={satHi.src} x={0} y={0} width={MAP_W} height={MAP_H} preserveAspectRatio="none" />}
          {/* Velo para que las marcas destaquen sobre la foto */}
          <rect x={CONTEXT.x} y={CONTEXT.y} width={CONTEXT.w} height={CONTEXT.h} fill="#0b1620" opacity={0.32} />
        </>
      ) : streets && (
        <>
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
          {view.w < 1000 && road("tertiary")}
          {road("secondary", true)}
          {road("secondary")}
          {road("primary", true)}
          {road("primary")}
          {road("motorway", true)}
          {road("motorway")}
        </>
      )}
      {labels.map((l) => (
        <text key={l.name + l.x} className={`map-place ${l.minor ? "minor" : ""}`} x={l.x} y={l.y} fontSize={l.size * u} strokeWidth={3.5 * u}>
          {l.name}
        </text>
      ))}
    </svg>
  );
});

export default function MapView({ s, onSelect, onFxDone, onFocus, pendingActions, onResolve, units, hazards, hazardWarnings, children }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState<Size>({ w: 900, h: 560 });
  const [view, setView] = useState<View>({ cx: 510, cy: 320, w: 880 });
  const [preset, setPreset] = useState<string | null>("todo");
  const [layer, setLayer] = useState<"streets" | "sat">("streets");
  const [streets, setStreets] = useState<Streets | null>(null);
  const [hiReady, setHiReady] = useState(false);
  const [closed, setClosed] = useState<string | null>(null);
  // Al asignar una unidad al incidente seleccionado, su ficha se cierra para dejar ver la unidad y su
  // trayecto (y el aviso de peligro, X17). Se vuelve a abrir con un clic en el incidente.
  const sentTo = units?.filter((un) => un.incidentId && un.incidentId === s.selected).map((un) => un.id).join(",") ?? "";
  const lastSent = useRef({ sel: s.selected, ids: sentTo });
  useEffect(() => {
    const prev = lastSent.current;
    lastSent.current = { sel: s.selected, ids: sentTo };
    if (!s.selected || prev.sel !== s.selected) return;
    const before = prev.ids.split(",");
    if (sentTo.split(",").some((id) => id && !before.includes(id))) setClosed(s.selected);
  }, [sentTo, s.selected]);
  /** Vista pintada en pantalla, última vista asentada y vista provisional durante un gesto. */
  const rendered = useRef(view);
  const committed = useRef(view);
  const pending = useRef<View | null>(null);
  const wheelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drag = useRef<{ x: number; y: number; base: View; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const sizeRef = useRef(size);
  sizeRef.current = size;

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

  /** Durante un gesto solo se mueve la imagen ya pintada (transformación CSS en la GPU): no se repinta nada. */
  const preview = useCallback((v: View) => {
    pending.current = v;
    const el = stage.current;
    if (!el) return;
    const sz = sizeRef.current;
    const a = viewBox(rendered.current, sz);
    const b = viewBox(v, sz);
    const u = a.w / sz.w;
    const u2 = b.w / sz.w;
    el.style.transform = `translate(${(a.x - b.x) / u2}px, ${(a.y - b.y) / u2}px) scale(${u / u2})`;
    box.current?.classList.add("is-moving");
  }, []);

  /** Asienta la vista: se repinta una sola vez. */
  const commit = useCallback((v: View) => {
    pending.current = null;
    committed.current = v;
    if (sameView(v, rendered.current)) {
      if (stage.current) stage.current.style.transform = "";
      box.current?.classList.remove("is-moving");
    }
    setView(v);
  }, []);

  useLayoutEffect(() => {
    rendered.current = view;
    if (pending.current) return; // sigue un gesto: se mantiene la transformación hasta que termine
    if (stage.current) stage.current.style.transform = "";
    box.current?.classList.remove("is-moving");
  }, [view]);

  const fitBox = useCallback(([x, y, bw, bh]: readonly number[]) => {
    commit(clamp({ cx: x + bw / 2, cy: y + bh / 2, w: Math.max(bw, bh / aspect) }));
  }, [aspect, clamp, commit]);

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
    else commit(clamp(committed.current));
  }, [size, preset, fitBox, clamp, commit]);

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

  const zoomFrom = useCallback((v: View, factor: number, at?: { x: number; y: number }) => {
    const w = Math.max(MIN_W, Math.min(maxW, v.w * factor));
    const f = w / v.w;
    const p = at ?? { x: v.cx, y: v.cy };
    return clamp({ cx: p.x + (v.cx - p.x) * f, cy: p.y + (v.cy - p.y) * f, w });
  }, [clamp, maxW]);

  const zoomButton = (factor: number) => {
    setPreset(null);
    commit(zoomFrom(pending.current ?? committed.current, factor));
  };

  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setPreset(null);
      const base = pending.current ?? committed.current;
      // Punto del mapa bajo el cursor según la vista que se está viendo (incluida la provisional)
      const r = box.current!.getBoundingClientRect();
      const b = viewBox(base, sizeRef.current);
      const upp = b.w / sizeRef.current.w;
      const at = { x: b.x + (e.clientX - r.left) * upp, y: b.y + (e.clientY - r.top) * upp };
      preview(zoomFrom(base, e.deltaY > 0 ? 1.2 : 1 / 1.2, at));
      if (wheelTimer.current) clearTimeout(wheelTimer.current);
      wheelTimer.current = setTimeout(() => pending.current && commit(pending.current), 160);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomFrom, preview, commit]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    suppressClick.current = false;
    drag.current = { x: e.clientX, y: e.clientY, base: pending.current ?? committed.current, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    if (!d.moved) {
      svg.current?.setPointerCapture(e.pointerId);
      setPreset(null);
    }
    d.moved = true;
    const upp = d.base.w / sizeRef.current.w;
    preview(clamp({ cx: d.base.cx - dx * upp, cy: d.base.cy - dy * upp, w: d.base.w }));
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    suppressClick.current = !!d?.moved;
    if (d?.moved && pending.current) commit(pending.current);
  };

  const vb = viewBox(view, size);
  /** Unidades del mapa por píxel de pantalla: marcas y textos mantienen su tamaño al acercar. */
  const u = view.w / Math.max(1, size.w);

  const incidents = s.engine.incidents;
  const warnedUnits = new Map<string, string>();
  for (const w of hazardWarnings ?? []) if (!warnedUnits.has(w.unitId)) warnedUnits.set(w.unitId, w.text);
  const byId = new Map(incidents.map((i) => [i.id, i]));
  const rank = new Map(rankIncidents(incidents, s.clock).map((i, n) => [i.id, n + 1]));
  const selected = incidents.find((i) => i.id === s.selected);
  const scaleM = view.w * METERS_PER_UNIT > 12000 ? 2000 : view.w * METERS_PER_UNIT > 5000 ? 1000 : view.w * METERS_PER_UNIT > 2000 ? 500 : 200;
  const scalePx = scaleM / METERS_PER_UNIT / u;
  const sat = layer === "sat" || !streets;

  /** Desplazamiento (px) del rótulo centrado de un peligro para que no se corte en el borde del mapa. */
  const tagShift = (tag: string, x: number) => {
    const half = tag.length * 3.2;
    const px = (x - vb.x) / u;
    if (px - half < 8) return 8 + half - px;
    if (px + half > size.w - 8) return size.w - 8 - half - px;
    return 0;
  };

  const select = (id: string) => {
    if (suppressClick.current) { suppressClick.current = false; return; }
    setClosed(null);
    onSelect(id);
  };

  // Ficha emergente junto al incidente seleccionado (como la tarjeta de llamada de un mapa de despacho).
  let popup: React.ReactNode = null;
  if (selected && closed !== selected.id) {
    const c = centroid(selected);
    const px = (c.x - vb.x) / u;
    const py = (c.y - vb.y) / u;
    if (px > 0 && py > 0 && px < size.w && py < size.h) {
      const n = rank.get(selected.id) ?? 0;
      const tone = toneOf(selected);
      const langs = [...new Set(selected.callIds.map((id) => s.calls[id]?.extraction.language ?? "es"))].filter((l) => l !== "es");
      const firstT = Math.min(...selected.callIds.map((id) => s.calls[id]?.t ?? s.clock));
      const pw = Math.min(320, size.w - 24);
      const left = Math.max(12, Math.min(size.w - pw - 12, px - pw / 2));
      const pos: React.CSSProperties = py > size.h * 0.52 ? { left, bottom: size.h - py + 30, width: pw } : { left, top: py + 30, width: pw };
      const todo = pendingActions[selected.id] ?? 0;
      popup = (
        <div className={`popup ${size.h < 420 ? "compact" : ""}`} style={pos} role="dialog" aria-label={`Ficha de ${selected.id}`}>
          <button className="popup-close" onClick={() => setClosed(selected.id)} aria-label="Cerrar ficha"><Icon name="close" size={16} /></button>
          <div className="popup-top">
            <h3>{TYPE_LABELS[selected.type]}</h3>
            <span className={`pill tone-${tone}`} title="Tiempo desde la primera llamada">{mmss(Math.max(0, s.clock - firstT))}</span>
          </div>
          <span className="popup-sub">{selected.id} · prioridad {n} · {plural(selected.callIds.length, "llamada", "llamadas")}{langs.length ? ` · ${langs.map(langName).join(", ")}` : ""}</span>
          {placeOf(selected) && <span className="popup-place">{placeOf(selected)}</span>}
          {/* El resumen está en la ficha de la derecha: aquí solo lo justo para no tapar el mapa. */}
          {selected.provisional && <p className="decision-note">Pendiente de tu decisión: ¿es {selected.linkedTo}?</p>}
          {onFocus && (
            <div className="popup-actions">
              <button className="btn btn-out btn-sm" onClick={() => onFocus("detail")}>Ficha</button>
              {langs.length > 0 && <button className="btn btn-out btn-sm" onClick={() => onFocus("translate")} title="Abre «Responder» en la ficha">Responder</button>}
              {todo > 0 && <button className="btn btn-amber btn-sm" onClick={() => onFocus("actions")}>Aprobar ({todo})</button>}
            </div>
          )}
          {onResolve && <div className="popup-resolve"><ResolveButton incidentId={selected.id} blocker={resolveBlocker(s.engine, selected.id)} onResolve={onResolve} small /></div>}
        </div>
      );
    }
  }

  return (
    <div className="map-wrap">
    <div className="map-box" ref={box}>
      <div className="map-stage" ref={stage}>
        <BaseMap view={view} size={size} streets={streets} sat={sat} hiReady={hiReady} />
        <svg
          ref={svg}
          className={`map ${sat ? "sat" : ""}`}
          viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
          preserveAspectRatio="xMidYMid meet"
          role="group"
          aria-label={`Mapa ${sat ? "satelital" : "de calles"} de la bahía de Málaga con los incidentes abiertos. Arrastra para moverte y usa la rueda o los botones para acercar.`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {/* Cada llamada unida a su incidente */}
          {s.arrived.map((id) => {
            const call = s.calls[id];
            const inc = byId.get(s.engine.assignment[id]);
            if (!call || !inc) return null;
            const a = project(call.aml.lat, call.aml.lng);
            const b = centroid(inc);
            const mine = inc.id === s.selected;
            return (
              <line key={`cl-${id}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={mine ? "var(--accent)" : sat ? "#fff" : "var(--map-link)"}
                strokeOpacity={mine ? 1 : s.selected ? 0.35 : sat ? 0.55 : 1}
                strokeWidth={(mine ? 2.2 : 1.2) * u} />
            );
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
            const mine = !!s.selected && s.engine.assignment[id] === s.selected;
            return <circle key={id} cx={p.x} cy={p.y} r={(mine ? 4.5 : 3.5) * u} fill={mine ? "var(--accent)" : sat ? "#fff" : "var(--map-dot)"} stroke={sat ? "#0b1620" : "var(--map-dot-line)"} strokeWidth={1.2 * u} />;
          })}

          {/* X16: unidades simuladas. Debajo de los incidentes para no taparlos; las libres, pequeñas y atenuadas. */}
          {units && (
            <g className="units" aria-label={`Unidades ${SIMULATION_LABEL}`}>
              {units.filter((un) => un.incidentId && un.target).map((un) => {
                const a = project(un.position.lat, un.position.lng);
                const b = project(un.target!.lat, un.target!.lng);
                return <line key={`ul-${un.id}`} data-unit-line={un.id} className={`unit-line st-${un.status}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={2 * u} strokeDasharray={`${6 * u} ${4 * u}`} />;
              })}
              {[...units].sort((a, b) => Number(a.status !== "libre") - Number(b.status !== "libre")).map((un) => {
                const p = project(un.position.lat, un.position.lng);
                const free = un.status === "libre";
                const abbr = UNIT_ABBR[un.service];
                const h = (free ? 11 : 17) * u;
                const w = (free ? 11 : abbr.length > 1 ? 24 : 18) * u;
                const status = UNIT_STATUS_LABELS[un.status].toLowerCase();
                const warn = warnedUnits.get(un.id);
                const desc = `${un.id}, ${RESOURCE_LABELS[un.service]}: ${status}${un.incidentId ? ` hacia ${un.incidentId}` : ""}. ${free ? un.base.name : `Base: ${un.base.name}`}${warn ? `. ${warn}` : ""}`;
                return (
                  <g
                    key={un.id}
                    className={`unit st-${un.status} svc-${un.service}`}
                    data-unit={un.id}
                    data-status={un.status}
                    data-incident={un.incidentId ?? undefined}
                    data-hazard-warning={warnedUnits.has(un.id) ? "true" : undefined}
                    style={{ transform: `translate(${p.x}px, ${p.y}px)` }}
                    role="img"
                    aria-label={desc}
                  >
                    <title>{desc}</title>
                    <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={3 * u} strokeWidth={(free ? 1 : 1.6) * u} />
                    {warn && <path className="unit-warn" d={`M${w / 2} ${-h / 2 - 9 * u}l${6 * u} ${10 * u}h${-12 * u}z`} strokeWidth={1.2 * u} />}
                    {!free && <text className="unit-abbr" fontSize={10.5 * u} dy="0.36em">{abbr}</text>}
                    {!free && (
                      <text className="unit-tag" x={w / 2 + 4 * u} fontSize={11 * u} strokeWidth={3 * u} dy="0.35em">{`${un.id} · ${status}`}</text>
                    )}
                  </g>
                );
              })}
            </g>
          )}

          {/* Los más prioritarios encima y el seleccionado arriba del todo, para que no los tape uno menos urgente */}
          {[...incidents].sort((a, b) => (a.id === s.selected ? 1 : 0) - (b.id === s.selected ? 1 : 0) || (rank.get(b.id) ?? 0) - (rank.get(a.id) ?? 0)).map((i) => {
            const c = centroid(i);
            const r = (12 + Math.min(i.callIds.length, 8) * 1.4) * u;
            const tone = toneOf(i);
            const sel = i.id === s.selected;
            const n = rank.get(i.id) ?? 0;
            const todo = pendingActions[i.id] ?? 0;
            return (
              <g
                key={i.id}
                className={`marker tone-${tone} ${sel ? "is-sel" : ""}`}
                onClick={() => select(i.id)}
                role="button"
                tabIndex={0}
                aria-label={`${i.id}, prioridad ${n}: ${TYPE_LABELS[i.type]}, ${plural(i.callIds.length, "llamada", "llamadas")}${todo ? `, ${todo} ${todo === 1 ? "acción" : "acciones"} por aprobar` : ""}`}
                aria-pressed={sel}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setClosed(null); onSelect(i.id); } }}
              >
                {sel && <circle className="halo" cx={c.x} cy={c.y} r={r + 12 * u} />}
                {sel && <circle className="sel-ring" cx={c.x} cy={c.y} r={r + 6 * u} strokeWidth={2.5 * u} />}
                <circle className="ring" cx={c.x} cy={c.y} r={r} strokeWidth={2.5 * u} strokeDasharray={tone === "pending" ? `${5 * u} ${3 * u}` : undefined} />
                <text className="marker-n" x={c.x} y={c.y} fontSize={13 * u} dy="0.35em">{n}</text>
                {/* Distintivo ámbar: acciones del agente que esperan tu aprobación */}
                {todo > 0 && (
                  <g className="marker-todo">
                    <rect x={c.x + r * 0.55} y={c.y - r - 7 * u} width={(todo > 9 ? 26 : 20) * u} height={16 * u} rx={8 * u} strokeWidth={1.5 * u} />
                    <text x={c.x + r * 0.55 + (todo > 9 ? 13 : 10) * u} y={c.y - r + 1 * u} fontSize={11 * u} dy="0.35em">{todo}</text>
                  </g>
                )}
                {(view.w < 420 || sel) && <text className="marker-id" x={c.x} y={c.y + r + 14 * u} fontSize={12 * u} strokeWidth={3 * u}>{i.id}</text>}
                <title>{`${i.id} · ${TYPE_LABELS[i.type]} · ${placeOf(i)}`}</title>
              </g>
            );
          })}

          {/* X17: peligros en la vía (simulación). Triángulo de aviso, encima de los incidentes; si cae sobre
              el anillo de su propio incidente, se aparta a su borde izquierdo para no tapar el número. */}
          {hazards && (
            <g className="hazards" aria-label={`Peligros en la vía ${SIMULATION_LABEL}`}>
              {hazards.filter((h) => !h.resolved).map((h) => {
                let p = project(h.position.lat, h.position.lng);
                const inc = byId.get(h.incidentId);
                if (inc) {
                  const c = centroid(inc);
                  const r = (12 + Math.min(inc.callIds.length, 8) * 1.4) * u;
                  if (Math.hypot(p.x - c.x, p.y - c.y) < r + 10 * u) {
                    const same = hazards.filter((o) => !o.resolved && o.incidentId === h.incidentId);
                    const a = Math.PI * (1 - 0.3 * (same.indexOf(h) - (same.length - 1) / 2));
                    p = { x: c.x + Math.cos(a) * (r + 9 * u), y: c.y + Math.sin(a) * (r + 9 * u) };
                  }
                }
                const warned = hazardWarnings?.filter((w) => w.hazardId === h.id) ?? [];
                const desc = `Peligro en la vía ${SIMULATION_LABEL}: ${h.label} de ${h.incidentId}${warned.length ? `. Aviso: ${warned.map((w) => `${w.unitId} pasaría a ${Math.round(w.distance)} m`).join(", ")}` : ""}`;
                return (
                  <g
                    key={h.id}
                    className={`hazard k-${h.kind} ${warned.length ? "is-warned" : ""}`}
                    data-hazard={h.id}
                    data-kind={h.kind}
                    data-incident={h.incidentId}
                    data-warned={warned.length ? "true" : undefined}
                    transform={`translate(${p.x} ${p.y}) scale(${u})`}
                    role="img"
                    aria-label={desc}
                  >
                    <title>{desc}</title>
                    {warned.length > 0 && <circle className="hz-halo" r={17} />}
                    <path className="hz-tri" d="M0-10.5 10.5 8H-10.5z" strokeWidth={warned.length ? 2.6 : 2} />
                    {HAZARD_GLYPH[h.kind]}
                    {warned.length > 0 && (
                      <text className="hz-tag" x={tagShift(`Peligro: ${h.label} · ${h.incidentId}`, p.x)} y={-21} fontSize={11} strokeWidth={3}>{`Peligro: ${h.label} · ${h.incidentId}`}</text>
                    )}
                  </g>
                );
              })}
            </g>
          )}

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
      </div>

      {!streets && layer === "streets" && <span className="map-loading">Cargando mapa…</span>}

      <div className="map-presets map-float" role="group" aria-label="Zona del mapa">
        {PRESETS.map((p) => (
          <button key={p.id} aria-pressed={preset === p.id} onClick={() => setPreset(p.id)}>{p.label}</button>
        ))}
      </div>

      <div className="map-layers map-float" role="group" aria-label="Tipo de mapa">
        <button aria-pressed={!sat} onClick={() => setLayer("streets")} disabled={!streets}>Mapa</button>
        <button aria-pressed={sat} onClick={() => setLayer("sat")}>Satélite</button>
      </div>

      <div className="map-zoom map-float" role="group" aria-label="Zoom">
        <button onClick={() => zoomButton(1 / 1.5)} aria-label="Acercar" title="Acercar"><Icon name="plus" /></button>
        <button onClick={() => zoomButton(1.5)} aria-label="Alejar" title="Alejar"><Icon name="minus" /></button>
      </div>

      <div className="map-foot">
        <span className="map-scale"><i style={{ width: scalePx }} />{scaleM >= 1000 ? `${scaleM / 1000} km` : `${scaleM} m`}</span>
        <span className="map-attr">{sat ? "Ortofoto PNOA © IGN · CC BY 4.0" : "© colaboradores de OpenStreetMap"}</span>
      </div>

      {children}
    </div>
    {popup}
    <div className="map-legend map-float" aria-hidden="true">
      <span className="lg-group" title="El número de cada emergencia es su puesto en la lista de prioridad"><i className="lg tone-critical" />Riesgo vital<i className="lg tone-serious" />Grave<i className="lg tone-normal" />Leve</span>
      <span><i className="lg tone-pending" />Decidir</span>
      <span><i className="lg todo">2</i>Por aprobar</span>
      <span><i className="lg call" />Llamada</span>
      {units && <span><i className="lg unit">B</i>Unidad</span>}
      {hazards && hazards.some((h) => !h.resolved) && <span><i className="lg hazard" />Peligro en la vía</span>}
      {(units || hazards) && <em>Unidades y peligros: simulación</em>}
    </div>
    </div>
  );
}
