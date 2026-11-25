"""Genera el índice sin conexión de nombres de vías de Málaga.

Datos © colaboradores de OpenStreetMap, ODbL (https://www.openstreetmap.org/copyright).
Salida: lib/streetNames.ts. Sin --input descarga desde Overpass.
El índice versionado se generó a partir de una descarga por caja (36.63,-4.60,36.80,-4.33)
filtrada por el límite municipal de OSM (relación 340746), sin conexión:
  python3 scripts/build_street_names.py --input streets-raw.json --boundary malaga-poly.json
"""
import argparse
from collections import defaultdict
from itertools import combinations
import json
import math
from pathlib import Path
import sys
import time
import urllib.parse
import urllib.request

# Misma caja que lib/geocode.ts, incluso cuando se usa una descarga municipal.
SOUTH, WEST, NORTH, EAST = 36.65, -4.63, 36.94, -4.29
QUERY = ('[out:json][timeout:120];area["name"="Málaga"]["admin_level"="8"]'
         '["boundary"="administrative"]->.a;way(area.a)["highway"]["name"];out tags center;')
MALAGA_RELATION_ID = 340746
LINK_METERS = 1500
MIRRORS = (
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
)
OUT = Path(__file__).resolve().parent.parent / "lib" / "streetNames.ts"


def elements(payload: dict) -> list:
    ways = payload.get("elements")
    if payload.get("remark") or not isinstance(ways, list) or len(ways) <= 1000:
        raise ValueError("Respuesta de Overpass incompleta o no válida")
    return ways


def fetch() -> list:
    data = urllib.parse.urlencode({"data": QUERY}).encode()
    for attempt in range(6):
        try:
            req = urllib.request.Request(MIRRORS[attempt % len(MIRRORS)], data=data,
                                         headers={"User-Agent": "agente-112-demo"})
            with urllib.request.urlopen(req, timeout=150) as response:
                return elements(json.load(response))
        except (OSError, ValueError) as error:
            print(f"Overpass: {error}", file=sys.stderr)
            if attempt < 5:
                time.sleep(min(5 * 2 ** attempt, 60))
    sys.exit("No se pudo descargar el callejero de Málaga")


def distance(a: tuple, b: tuple) -> float:
    # Aproximación en metros suficiente para agrupar tramos de la misma zona.
    return math.hypot((a[0] - b[0]) * 111_195, (a[1] - b[1]) * 89_120)


def connected(centers: set):
    remaining = set(centers)
    while remaining:
        start = min(remaining)
        remaining.remove(start)
        cluster = [start]
        for point in cluster:
            neighbors = sorted(other for other in remaining if distance(point, other) <= LINK_METERS)
            remaining.difference_update(neighbors)
            cluster.extend(neighbors)
        yield cluster


def boundary_polygons(payload):
    if isinstance(payload, list):
        payload = next((result for result in payload if isinstance(result, dict)
                        and result.get("osm_id") == MALAGA_RELATION_ID), None)
    geometry = payload.get("geojson", payload) if isinstance(payload, dict) else None
    if isinstance(geometry, dict) and geometry.get("coordinates"):
        if geometry.get("type") == "Polygon":
            return [geometry["coordinates"]]
        if geometry.get("type") == "MultiPolygon":
            return geometry["coordinates"]
    raise ValueError("Se esperaba un Polygon/MultiPolygon GeoJSON o el resultado Nominatim de la relación 340746")


def in_ring(lng, lat, ring):
    # GeoJSON almacena [longitud, latitud]. Cuenta los cruces de un rayo al este.
    inside = False
    prev_lng, prev_lat = ring[-1][:2]
    for point in ring:
        x, y = point[:2]
        if (y > lat) != (prev_lat > lat):
            if lng < x + (lat - y) * (prev_lng - x) / (prev_lat - y):
                inside = not inside
        prev_lng, prev_lat = x, y
    return inside


def in_boundary(lng, lat, polygons):
    return any(in_ring(lng, lat, outer) and not any(in_ring(lng, lat, hole) for hole in holes)
               for outer, *holes in polygons)


def index(ways: list, polygons=None):
    points = defaultdict(set)
    for way in ways:
        tags, center = way.get("tags", {}), way.get("center", {})
        name = " ".join(tags.get("name", "").split())
        lat, lng = center.get("lat"), center.get("lon")
        if (way.get("type") == "way" and tags.get("highway") and name
                and lat is not None and lng is not None
                and SOUTH <= lat <= NORTH and WEST <= lng <= EAST
                and (polygons is None or in_boundary(lng, lat, polygons))):
            points[name].add((lat, lng))
    for name, centers in sorted(points.items()):
        for cluster in connected(centers):
            centroid = tuple(sum(axis) / len(cluster) for axis in zip(*cluster))
            half_span = math.ceil(max((distance(a, b) for a, b in combinations(cluster, 2)), default=0) / 2)
            acc = min(1500, max(250, half_span))
            row = (name, *(round(value, 5) for value in centroid), acc)
            # El portal usa la extensión real aunque el mapa limite la precisión a 1500 m.
            yield (*row, half_span) if half_span > acc else row


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--input", type=Path, help="Respuesta de Overpass ya descargada (sin red)")
    parser.add_argument("--boundary", type=Path, metavar="GEOJSON_FILE",
                        help="Recorta por el centro de cada vía con un Polygon/MultiPolygon o polygon_geojson de Nominatim")
    args = parser.parse_args()
    try:
        polygons = boundary_polygons(json.loads(args.boundary.read_text(encoding="utf-8"))) if args.boundary else None
    except (OSError, ValueError) as error:
        parser.error(f"--boundary: {error}")
    ways = elements(json.loads(args.input.read_text(encoding="utf-8"))) if args.input else fetch()
    rows = list(index(ways, polygons))
    if len(rows) <= 1000:
        sys.exit("El callejero generado no contiene suficientes vías")
    with OUT.open("w", encoding="utf-8", newline="\n") as out:
        out.write("// Generado por scripts/build_street_names.py; no editar a mano.\n"
                  "// © colaboradores de OpenStreetMap, ODbL (https://www.openstreetmap.org/copyright).\n"
                  "// [nombre, latitud, longitud, precisión estimada en metros, semiextensión si supera la precisión].\n"
                  "export const STREET_NAMES: readonly (readonly [string, number, number, number, number?])[] = [\n")
        for row in rows:
            out.write("  " + json.dumps(row, ensure_ascii=False, separators=(",", ":")) + ",\n")
        out.write("];\n")
    print(f"{OUT}: {len(rows)} vías, {OUT.stat().st_size} bytes")


if __name__ == "__main__":
    main()
