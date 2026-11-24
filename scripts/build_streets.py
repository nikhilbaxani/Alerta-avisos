"""Genera el mapa de calles vectorial de la bahía de Málaga a partir de OpenStreetMap.

Se ejecuta UNA vez con red; la consola solo usa el archivo generado (sin teselas ni red en tiempo de ejecución).
Datos © colaboradores de OpenStreetMap, ODbL (openstreetmap.org/copyright).

Uso:  python3 scripts/build_streets.py [--cache DIR]
      DIR guarda las respuestas de Overpass (por defecto .cache/osm) para no repetir descargas.
Salida: assets/map/streets.json — trazados SVG ya proyectados (misma proyección equirectangular que lib/map.ts,
        viewBox 0..1000 × 0..623 para la bahía), agrupados por capa para pintarlos con los colores del tema.
"""
import json
import math
import os
import sys
import time
import urllib.parse
import urllib.request

LNG0, LNG1, LAT0, LAT1 = -4.60, -4.24, 36.59, 36.77
MAP_W, MAP_H = 1000, 623
# Entorno (CONTEXT en lib/map.ts) y zona con calles de barrio
B = "36.5,-4.7,36.86,-4.14"
INNER = "36.59,-4.6,36.77,-4.24"
SEA_POINT = (36.62, -4.40)  # en mitad de la bahía
OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "map", "streets.json")
OVERPASS = "https://overpass-api.de/api/interpreter"

QUERIES = {
    "coast": f'way["natural"="coastline"]({B});',
    "major": f'way["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link)$"]({B});',
    "minor": f'way["highway"~"^(residential|unclassified|living_street|pedestrian)$"]({INNER});',
    "water": f'way["natural"="water"]({B});relation["natural"="water"]({B});way["waterway"~"^(river|canal|riverbank)$"]({B});',
    "green": (
        f'way["leisure"~"^(park|golf_course|garden|nature_reserve)$"]({B});relation["leisure"~"^(park|nature_reserve)$"]({B});'
        f'way["landuse"~"^(forest|grass|meadow|recreation_ground|cemetery)$"]({B});way["natural"~"^(wood|scrub)$"]({B});'
        f'relation["natural"~"^(wood|scrub)$"]({B});relation["landuse"="forest"]({B});'
    ),
    "aero": f'way["aeroway"~"^(aerodrome|runway|taxiway|apron)$"]({B});way["railway"="rail"]({B});',
    "place": f'node["place"~"^(city|town|village|suburb|quarter|neighbourhood)$"]({B});',
}


def fetch(name: str, cache: str) -> list:
    path = os.path.join(cache, f"{name}.json")
    if not os.path.exists(path):
        data = urllib.parse.urlencode({"data": f"[out:json][timeout:250];({QUERIES[name]});out geom;"}).encode()
        wait = 10
        for _ in range(12):
            try:
                req = urllib.request.Request(OVERPASS, data=data, headers={"User-Agent": "map-build-script/1.0"})
                with urllib.request.urlopen(req, timeout=280) as r:
                    body = r.read()
                if b'"elements"' in body:
                    with open(path, "wb") as f:
                        f.write(body)
                    break
            except Exception as e:  # Overpass público: saturado a menudo
                print(f"{name}: {e}; reintento en {wait} s", file=sys.stderr)
            time.sleep(wait)
            wait = min(wait * 2, 120)
        else:
            sys.exit(f"No se pudo descargar {name}")
    with open(path) as f:
        return json.load(f)["elements"]


def project(lat: float, lng: float) -> tuple:
    return ((lng - LNG0) / (LNG1 - LNG0) * MAP_W, (LAT1 - lat) / (LAT1 - LAT0) * MAP_H)


def pts(geom: list) -> list:
    return [project(p["lat"], p["lon"]) for p in geom if p]


def simplify(p: list, tol: float) -> list:
    """Douglas-Peucker iterativo."""
    if len(p) < 3:
        return p
    keep = [False] * len(p)
    keep[0] = keep[-1] = True
    stack = [(0, len(p) - 1)]
    while stack:
        a, b = stack.pop()
        (x1, y1), (x2, y2) = p[a], p[b]
        dx, dy = x2 - x1, y2 - y1
        n = math.hypot(dx, dy)
        best, idx = -1.0, -1
        for i in range(a + 1, b):
            # Anillo cerrado (extremos iguales): distancia al punto
            d = abs(dy * (p[i][0] - x1) - dx * (p[i][1] - y1)) / n if n > 1e-9 else math.hypot(p[i][0] - x1, p[i][1] - y1)
            if d > best:
                best, idx = d, i
        if best > tol:
            keep[idx] = True
            stack += [(a, idx), (idx, b)]
    return [q for q, k in zip(p, keep) if k]


def num(v: float) -> str:
    s = f"{v:.1f}".rstrip("0").rstrip(".")
    if s.startswith("0."):
        s = s[1:]
    elif s.startswith("-0."):
        s = "-" + s[2:]
    return "0" if s in ("", "-0", "-") else s


def encode(p: list, close: bool = False) -> str:
    """Trazado SVG con coordenadas relativas redondeadas a 0,1 unidades (≈3 m)."""
    q = [(round(x, 1), round(y, 1)) for x, y in p]
    out = [f"M{num(q[0][0])} {num(q[0][1])}"]
    rel = []
    for (x0, y0), (x1, y1) in zip(q, q[1:]):
        dx, dy = round(x1 - x0, 1), round(y1 - y0, 1)
        if dx == 0 and dy == 0:
            continue
        rel.append(f"{num(dx)} {num(dy)}".replace(" -", "-"))
    if rel:
        out.append("l" + " ".join(rel).replace(" -", "-"))
    if close:
        out.append("z")
    return "".join(out)


def join_rings(ways: list) -> list:
    """Une tramos por sus extremos (anillos de multipolígonos y líneas de costa)."""
    chains = [list(w) for w in ways if len(w) >= 2]
    merged = True
    while merged:
        merged = False
        for i in range(len(chains)):
            a = chains[i]
            if a[0] == a[-1]:
                continue
            for j in range(len(chains)):
                if i == j:
                    continue
                b = chains[j]
                if a[-1] == b[0]:
                    a += b[1:]
                elif a[-1] == b[-1]:
                    a += b[::-1][1:]
                elif a[0] == b[-1]:
                    a[:0] = b[:-1]
                elif a[0] == b[0]:
                    a[:0] = b[::-1][:-1]
                else:
                    continue
                chains.pop(j)
                merged = True
                break
            if merged:
                break
    return chains


def raw(geom: list) -> list:
    return [(p["lat"], p["lon"]) for p in geom if p]


def area_rings(elements: list, match) -> list:
    """Anillos (lista de puntos proyectados) de ways cerrados y multipolígonos que cumplen `match(tags)`."""
    rings = []
    for e in elements:
        tags = e.get("tags", {})
        if not match(tags):
            continue
        if e["type"] == "way" and e.get("geometry"):
            g = raw(e["geometry"])
            if len(g) > 3 and g[0] == g[-1]:
                rings.append(g)
        elif e["type"] == "relation":
            for ring in join_rings([raw(m["geometry"]) for m in e.get("members", []) if m.get("geometry")]):
                if len(ring) > 3 and ring[0] == ring[-1]:
                    rings.append(ring)
    return [[project(a, b) for a, b in r] for r in rings]


def poly_area(p: list) -> float:
    return abs(sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(p, p[1:] + p[:1]))) / 2


def paths(rings: list, tol: float, min_area: float = 0.0, close: bool = True) -> str:
    out = []
    for r in rings:
        if close and min_area and poly_area(r) < min_area:
            continue
        s = simplify(r, tol)
        if len(s) >= (3 if close else 2):
            out.append(encode(s, close))
    return "".join(out)


def inside(pt: tuple, poly: list) -> bool:
    x, y = pt
    c = False
    for (x0, y0), (x1, y1) in zip(poly, poly[1:] + poly[:1]):
        if (y0 > y) != (y1 > y) and x < (x1 - x0) * (y - y0) / (y1 - y0) + x0:
            c = not c
    return c


def sea_polygon(coast: list) -> tuple:
    """Mar = costa principal cerrada por fuera del entorno; los anillos cerrados son islas o diques (tierra)."""
    chains = join_rings([raw(e["geometry"]) for e in coast if e.get("geometry")])
    islands = [[project(a, b) for a, b in c] for c in chains if c[0] == c[-1]]
    open_ = sorted((c for c in chains if c[0] != c[-1]), key=len, reverse=True)
    main = [project(a, b) for a, b in open_[0]]
    if len(open_) > 1:
        print(f"Aviso: {len(open_) - 1} tramos de costa sueltos ignorados", file=sys.stderr)
    # Caja exterior holgada alrededor del entorno
    x0, y0 = project(36.95, -4.8)
    x1, y1 = project(36.4, -4.04)
    corners = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]  # sentido horario en pantalla

    def snap(p):
        """Proyecta un extremo de la costa sobre el borde de la caja (índice de lado y punto)."""
        d = [(abs(p[1] - y0), 0, (p[0], y0)), (abs(p[0] - x1), 1, (x1, p[1])), (abs(p[1] - y1), 2, (p[0], y1)), (abs(p[0] - x0), 3, (x0, p[1]))]
        return min(d)[1:]

    se, pe = snap(main[-1])
    ss, ps = snap(main[0])
    sea_pt = project(*SEA_POINT)
    for step in (1, -1):
        ring = main + [pe]
        side = se
        while side != ss:
            side = (side + step) % 4
            ring.append(corners[side] if step == 1 else corners[(side + 1) % 4])
        ring.append(ps)
        if inside(sea_pt, ring):
            return ring, islands
    sys.exit("No se pudo cerrar el polígono del mar")


ROAD_CLASS = {
    "motorway": "motorway", "motorway_link": "motorway", "trunk": "motorway", "trunk_link": "motorway",
    "primary": "primary", "primary_link": "primary",
    "secondary": "secondary", "secondary_link": "secondary",
    "tertiary": "tertiary", "tertiary_link": "tertiary",
    "residential": "minor", "unclassified": "minor", "living_street": "minor", "pedestrian": "minor",
}
ROAD_TOL = {"motorway": 0.12, "primary": 0.12, "secondary": 0.15, "tertiary": 0.18, "minor": 0.22}


def lines(elements: list, match, tol: float) -> str:
    return "".join(
        encode(s) for e in elements
        if e["type"] == "way" and e.get("geometry") and match(e.get("tags", {}))
        for s in [simplify(pts(e["geometry"]), tol)] if len(s) >= 2
    )


def main() -> None:
    cache = sys.argv[sys.argv.index("--cache") + 1] if "--cache" in sys.argv else os.path.join(os.path.dirname(__file__), "..", ".cache", "osm")
    os.makedirs(cache, exist_ok=True)
    d = {k: fetch(k, cache) for k in QUERIES}

    sea, islands = sea_polygon(d["coast"])
    out = {
        "attribution": "© colaboradores de OpenStreetMap (ODbL)",
        "sea": encode(simplify(sea, 0.15), close=True),
        "islands": paths(islands, 0.1, min_area=0.02),
    }
    water_tags = lambda t: t.get("natural") == "water" or t.get("waterway") == "riverbank"
    out["water"] = paths(area_rings(d["water"], water_tags), 0.12, min_area=0.05)
    out["river"] = lines(d["water"], lambda t: t.get("waterway") in ("river", "canal"), 0.15)
    forest = lambda t: t.get("landuse") == "forest" or t.get("natural") in ("wood", "scrub") or t.get("leisure") == "nature_reserve"
    out["forest"] = paths(area_rings(d["green"], forest), 0.2, min_area=0.3)
    out["park"] = paths(area_rings(d["green"], lambda t: not forest(t)), 0.12, min_area=0.04)
    out["airport"] = paths(area_rings(d["aero"], lambda t: t.get("aeroway") in ("aerodrome",)), 0.15)
    out["apron"] = paths(area_rings(d["aero"], lambda t: t.get("aeroway") == "apron"), 0.1)
    out["runway"] = lines(d["aero"], lambda t: t.get("aeroway") == "runway", 0.05)
    out["taxiway"] = lines(d["aero"], lambda t: t.get("aeroway") == "taxiway", 0.1)
    out["rail"] = lines(d["aero"], lambda t: t.get("railway") == "rail" and t.get("service") is None, 0.15)
    roads = d["major"] + d["minor"]
    out["roads"] = {
        cls: lines(roads, lambda t, c=cls: ROAD_CLASS.get(t.get("highway")) == c and t.get("area") != "yes", ROAD_TOL[cls])
        for cls in ("minor", "tertiary", "secondary", "primary", "motorway")
    }
    rank = {"city": 0, "town": 1, "village": 2, "suburb": 3, "quarter": 4, "neighbourhood": 5}
    places = []
    for e in d["place"]:
        t = e.get("tags", {})
        name = t.get("name:es") or t.get("name")
        if not name or t.get("place") not in rank:
            continue
        x, y = project(e["lat"], e["lon"])
        places.append({"name": name, "x": round(x, 1), "y": round(y, 1), "rank": rank[t["place"]]})
    out["places"] = sorted(places, key=lambda p: p["rank"])

    with open(OUT, "w") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    sizes = {k: len(v) if isinstance(v, str) else len(json.dumps(v)) for k, v in out.items()}
    print(f"{OUT}: {os.path.getsize(OUT) / 1e6:.2f} MB", sizes)


if __name__ == "__main__":
    main()
