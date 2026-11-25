"""Genera el índice sin conexión de nombres de vías del entorno de Málaga.

Datos © colaboradores de OpenStreetMap, ODbL (https://www.openstreetmap.org/copyright).
Uso: python3 scripts/build_street_names.py [--input RESPUESTA_OVERPASS.json]
Salida: lib/streetNames.ts. Sin --input descarga una vez desde Overpass.
"""
import argparse
from collections import defaultdict
import json
import math
from pathlib import Path
import sys
import time
import urllib.parse
import urllib.request

SOUTH, WEST, NORTH, EAST = 36.63, -4.60, 36.80, -4.33
QUERY = f'[out:json][timeout:120];way["highway"]["name"]({SOUTH},{WEST},{NORTH},{EAST});out tags center;'
MIRRORS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
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


def index(ways: list):
    points = defaultdict(set)
    for way in ways:
        tags, center = way.get("tags", {}), way.get("center", {})
        name = " ".join(tags.get("name", "").split())
        lat, lng = center.get("lat"), center.get("lon")
        if (way.get("type") == "way" and tags.get("highway") and name
                and lat is not None and lng is not None
                and SOUTH <= lat <= NORTH and WEST <= lng <= EAST):
            points[name].add((lat, lng))
    for name, centers in sorted(points.items()):
        clusters = []
        for point in sorted(centers):
            # Evita que una cadena de tramos una dos vías homónimas lejanas.
            for cluster in clusters:
                if all(distance(point, other) <= 1500 for other in cluster):
                    cluster.append(point)
                    break
            else:
                clusters.append([point])
        for cluster in clusters:
            centroid = tuple(sum(axis) / len(cluster) for axis in zip(*cluster))
            radius = max(distance(centroid, point) for point in cluster)
            # Incertidumbre mínima de calle, ampliada con la dispersión de los tramos.
            acc = max(250, math.ceil(radius / 50) * 50)
            yield (name, *(round(value, 5) for value in centroid), acc)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, help="Respuesta Overpass ya descargada (sin red)")
    args = parser.parse_args()
    ways = elements(json.loads(args.input.read_text(encoding="utf-8"))) if args.input else fetch()
    rows = list(index(ways))
    if len(rows) <= 1000:
        sys.exit("El callejero generado no contiene suficientes vías")
    with OUT.open("w", encoding="utf-8", newline="\n") as out:
        out.write("// Generado por scripts/build_street_names.py; no editar a mano.\n"
                  "// © colaboradores de OpenStreetMap, ODbL (https://www.openstreetmap.org/copyright).\n"
                  "// [nombre, latitud, longitud, precisión estimada en metros].\n"
                  "export const STREET_NAMES: readonly (readonly [string, number, number, number])[] = [\n")
        for row in rows:
            out.write("  " + json.dumps(row, ensure_ascii=False, separators=(",", ":")) + ",\n")
        out.write("];\n")
    print(f"{OUT}: {len(rows)} vías, {OUT.stat().st_size} bytes")


if __name__ == "__main__":
    main()
