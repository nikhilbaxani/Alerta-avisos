"""Descarga la ortofoto PNOA del IGN para la bahía de Málaga y genera las imágenes del mapa.

Se ejecuta UNA vez con red; la consola solo usa los archivos generados (sin teselas en tiempo de ejecución).
Fuente: PNOA máxima actualidad © Instituto Geográfico Nacional, CC BY 4.0 (scne.es).

Uso:  python3 scripts/build_satellite.py
Salida: assets/map/malaga-hi.webp (6000 px, detalle de la bahía) y
        assets/map/malaga-contexto.webp (vista general: entorno más amplio, CONTEXT_BBOX, con la bahía
        incrustada para que no se vean costuras ni bordes al alejar)

La proyección es la misma que `lib/map.ts` (equirectangular, lon -4.60…-4.24, lat 36.59…36.77),
así que la imagen ocupa exactamente el viewBox 0..1000 × 0..623.
"""
import io
import os
import sys
import urllib.request

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

LNG0, LNG1, LAT0, LAT1 = -4.60, -4.24, 36.59, 36.77
W, H = 6000, 3738
# Entorno: debe coincidir con CONTEXT en lib/map.ts
CONTEXT_BBOX = (-4.70, -4.14, 36.50, 36.86)
CONTEXT_W, CONTEXT_H = 2800, 2240
# Se descarga al doble: por debajo de ~0,0002°/px el IGN sirve otro mosaico con otros colores.
CONTEXT_FETCH = 2
# Neblina en el mosaico frente a Fuengirola/Benalmádena (lon0, lon1, lat0, lat1)
CONTEXT_HAZE = ((-4.566, -4.515, 36.548, 36.582),)
WMS = (
    "https://www.ign.es/wms-inspire/pnoa-ma?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0"
    "&LAYERS=OI.OrthoimageCoverage&STYLES=&CRS=EPSG:4326&FORMAT=image/png&TRANSPARENT=TRUE"
)
OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "map")


def fetch(lng0: float, lng1: float, lat0: float, lat1: float, w: int, h: int) -> Image.Image:
    url = f"{WMS}&BBOX={lat0},{lng0},{lat1},{lng1}&WIDTH={w}&HEIGHT={h}"
    print("descargando", lng0, lat0, w, h, file=sys.stderr)
    with urllib.request.urlopen(url, timeout=300) as res:
        return Image.open(io.BytesIO(res.read())).convert("RGBA")


def mosaic(lng0: float, lng1: float, lat0: float, lat1: float, w: int, h: int) -> Image.Image:
    """Descarga en 2×2 trozos (el WMS limita el tamaño por petición)."""
    full = Image.new("RGBA", (w, h))
    dlat, dlng = (lat1 - lat0) / 2, (lng1 - lng0) / 2
    for r in (0, 1):
        for c in (0, 1):
            top = lat1 - r * dlat
            left = lng0 + c * dlng
            full.paste(fetch(left, left + dlng, top - dlat, top, w // 2, h // 2), (c * (w // 2), r * (h // 2)))
    return full


def fill_gaps(full: Image.Image, bbox: tuple, haze: tuple = ()) -> Image.Image:
    W, H = full.size
    a = np.asarray(full).astype(np.float32)
    rgb, alpha = a[..., :3], a[..., 3]
    # El mosaico de alta resolución deja huecos en el mar (transparentes o negros puros).
    valid = (alpha > 0) & (rgb.max(axis=2) > 6)
    for lng0, lng1, lat0, lat1 in haze:
        # Bloques de neblina del mosaico sobre el mar: se tratan como hueco y se rellenan de mar.
        H_, W_ = valid.shape
        x0, x1 = (np.array([lng0, lng1]) - bbox[0]) / (bbox[1] - bbox[0]) * W_
        y0, y1 = (bbox[3] - np.array([lat1, lat0])) / (bbox[3] - bbox[2]) * H_
        sl = (slice(int(y0), int(y1)), slice(int(x0), int(x1)))
        valid[sl] &= rgb[sl].mean(axis=2) < 110
    valid = ndimage.binary_erosion(valid, iterations=3)

    # Relleno: color del píxel válido más cercano, calculado a 1/8 y muy suavizado (el mar es liso).
    # Solo se toman muestras de píxeles de mar (azulados y no muy claros): así no se arrastran oleaje ni nubes.
    k = 8
    small_rgb = rgb[::k, ::k]
    r, g, b = small_rgb[..., 0], small_rgb[..., 1], small_rgb[..., 2]
    sea = valid[::k, ::k] & (b > r + 12) & (small_rgb.max(axis=2) < 150)
    sea = ndimage.binary_erosion(sea, iterations=2)
    _, (iy, ix) = ndimage.distance_transform_edt(~sea, return_indices=True)
    filled = small_rgb[iy, ix]
    filled = np.stack([ndimage.gaussian_filter(filled[..., i], 25) for i in range(3)], axis=2)
    filled = np.asarray(Image.fromarray(filled.clip(0, 255).astype(np.uint8)).resize((W, H), Image.BILINEAR)).astype(np.float32)

    # Mezcla con borde suave para que no se vean las costuras de los huecos.
    w = (ndimage.gaussian_filter(valid.astype(np.float32), 45) * valid).clip(0, 1)
    w = np.clip((w - 0.5) * 2, 0, 1)[..., None]
    out = rgb * w + filled * (1 - w)
    return Image.fromarray(out.clip(0, 255).astype(np.uint8))


def main() -> None:
    img = fill_gaps(mosaic(LNG0, LNG1, LAT0, LAT1, W, H), (LNG0, LNG1, LAT0, LAT1))
    os.makedirs(OUT, exist_ok=True)
    img.save(os.path.join(OUT, "malaga-hi.webp"), quality=72, method=6)
    ctx = fill_gaps(mosaic(*CONTEXT_BBOX, CONTEXT_W * CONTEXT_FETCH, CONTEXT_H * CONTEXT_FETCH), CONTEXT_BBOX, CONTEXT_HAZE)
    ctx = ctx.resize((CONTEXT_W, CONTEXT_H), Image.LANCZOS)
    # La bahía, del mosaico de más detalle, incrustada en su sitio.
    cl0, cl1, ca0, ca1 = CONTEXT_BBOX
    px = lambda lng: round((lng - cl0) / (cl1 - cl0) * CONTEXT_W)
    py = lambda lat: round((ca1 - lat) / (ca1 - ca0) * CONTEXT_H)
    x0, x1, y0, y1 = px(LNG0), px(LNG1), py(LAT1), py(LAT0)
    # Borde fundido (~12 px) para que no se note la unión entre los dos mosaicos.
    inner = Image.new("L", (x1 - x0, y1 - y0), 0)
    inner.paste(255, (12, 12, x1 - x0 - 12, y1 - y0 - 12))
    inner = inner.filter(ImageFilter.GaussianBlur(6))
    ctx.paste(img.resize((x1 - x0, y1 - y0), Image.LANCZOS), (x0, y0), inner)
    ctx.save(os.path.join(OUT, "malaga-contexto.webp"), quality=70, method=6)
    print("listo:", OUT, file=sys.stderr)


if __name__ == "__main__":
    main()
