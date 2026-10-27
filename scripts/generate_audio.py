#!/usr/bin/env python3
"""Genera public/audio/<id>.wav desde los transcript del escenario (MEMORIA §13).

Voz: Piper si hay binario `piper` y modelos en models/piper/<lang>.onnx; si no, edge-tts
(pip install edge-tts, necesita red solo al generar). Después: filtro de teléfono
(paso banda 300-3400 Hz, 8 kHz mono) y lluvia (ruido marrón a -25 dB) con ffmpeg.

Uso: python3 scripts/generate_audio.py [--only A1,E1] [--no-rain]
"""
import argparse
import asyncio
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "audio"
EDGE_VOICES = {
    "es": "es-ES-ElviraNeural",
    "en": "en-GB-SoniaNeural",
    "de": "de-DE-KatjaNeural",
    "fr": "fr-FR-DeniseNeural",
    "ar": "ar-SA-ZariyahNeural",
    "it": "it-IT-ElsaNeural",
}


def load_calls():
    out = subprocess.run(["npx", "tsx", "scripts/dump-scenario.ts"], cwd=ROOT, capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def tts_piper(text: str, lang: str, dest: Path) -> bool:
    model = ROOT / "models" / "piper" / f"{lang}.onnx"
    if not shutil.which("piper") or not model.exists():
        return False
    subprocess.run(["piper", "--model", str(model), "--output_file", str(dest)], input=text, text=True, check=True)
    return True


def tts_edge(text: str, lang: str, dest: Path) -> bool:
    try:
        import edge_tts  # type: ignore
    except ImportError:
        return False

    async def run():
        await edge_tts.Communicate(text, EDGE_VOICES.get(lang, EDGE_VOICES["es"])).save(str(dest))

    asyncio.run(run())
    return True


def phone_filter(src: Path, dest: Path, rain: bool):
    band = "highpass=f=300,lowpass=f=3400,aresample=8000"
    if rain:
        cmd = [
            "ffmpeg", "-y", "-loglevel", "error", "-i", str(src),
            "-f", "lavfi", "-i", "anoisesrc=color=brown:amplitude=0.5:sample_rate=8000",
            "-filter_complex",
            f"[0:a]{band}[v];[1:a]volume=-25dB,highpass=f=300,lowpass=f=3400[n];[v][n]amix=inputs=2:duration=first:normalize=0",
            "-ac", "1", "-ar", "8000", str(dest),
        ]
    else:
        cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", str(src), "-af", band, "-ac", "1", "-ar", "8000", str(dest)]
    subprocess.run(cmd, check=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--no-rain", action="store_true")
    args = ap.parse_args()
    if not shutil.which("ffmpeg"):
        sys.exit("Falta ffmpeg")
    only = {x for x in args.only.split(",") if x}
    OUT.mkdir(parents=True, exist_ok=True)
    done, failed = 0, []
    with tempfile.TemporaryDirectory() as tmp:
        for c in load_calls():
            if only and c["id"] not in only:
                continue
            raw = Path(tmp) / f"{c['id']}.raw"
            try:
                if not (tts_piper(c["transcript"], c["lang"], raw) or tts_edge(c["transcript"], c["lang"], raw)):
                    sys.exit("No hay motor de voz: instala piper con modelos en models/piper/<lang>.onnx o `pip install edge-tts`")
                phone_filter(raw, OUT / f"{c['id']}.wav", rain=not args.no_rain)
                done += 1
                print(f"{c['id']} ({c['lang']}) ok")
            except Exception as e:  # una llamada fallida no impide generar el resto
                failed.append(c["id"])
                print(f"{c['id']} FALLÓ: {e}", file=sys.stderr)
    print(f"{done} audios en {OUT}" + (f"; fallaron: {', '.join(failed)}" if failed else ""))
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
