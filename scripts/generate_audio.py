#!/usr/bin/env python3
"""Genera public/audio/<id>.wav y <id>.mp3 desde los transcript de los escenarios (MEMORIA §13).

Voz: Piper si hay binario `piper` y modelos en models/piper/<lang>.onnx; si no, edge-tts
(pip install edge-tts, necesita red solo al generar). Después: filtro de teléfono
(paso banda 300-3400 Hz, 8 kHz mono) y lluvia (ruido marrón a -25 dB, solo en la DANA) con ffmpeg.
El .wav (ignorado por git) lo usa Whisper en modo IA local; el .mp3 (16 kHz, 24 kbps, versionado) lo
reproduce la consola sin red. La voz depende del teléfono: quien vuelve a llamar suena igual.

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
# (femenina, masculina) por idioma
EDGE_VOICES = {
    "es": ("es-ES-ElviraNeural", "es-ES-AlvaroNeural"),
    "en": ("en-GB-SoniaNeural", "en-GB-RyanNeural"),
    "de": ("de-DE-KatjaNeural", "de-DE-ConradNeural"),
    "fr": ("fr-FR-DeniseNeural", "fr-FR-HenriNeural"),
    "ar": ("ar-SA-ZariyahNeural", "ar-SA-HamedNeural"),
    "it": ("it-IT-ElsaNeural", "it-IT-DiegoNeural"),
}
# Llamadas cuyo guion fija el género de quien habla («estoy sola», «soy vecino»…).
FEMALE = {"F1", "B3", "H1", "H3", "K1"}
MALE = {"B1", "B4"}
RATE = "+8%"


def voice_for(call: dict) -> str:
    f, m = EDGE_VOICES.get(call["lang"], EDGE_VOICES["es"])
    if call["id"] in FEMALE:
        return f
    if call["id"] in MALE:
        return m
    h = sum(ord(ch) for ch in call.get("phone", call["id"]))
    return f if h % 2 == 0 else m


def load_calls():
    out = subprocess.run(["npx", "tsx", "scripts/dump-scenario.ts"], cwd=ROOT, capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def tts_piper(text: str, lang: str, dest: Path) -> bool:
    model = ROOT / "models" / "piper" / f"{lang}.onnx"
    if not shutil.which("piper") or not model.exists():
        return False
    subprocess.run(["piper", "--model", str(model), "--output_file", str(dest)], input=text, text=True, check=True)
    return True


def tts_edge(text: str, voice: str, dest: Path) -> bool:
    try:
        import edge_tts  # type: ignore
    except ImportError:
        return False

    async def run():
        await edge_tts.Communicate(text, voice, rate=RATE).save(str(dest))

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
                if not (tts_piper(c["transcript"], c["lang"], raw) or tts_edge(c["transcript"], voice_for(c), raw)):
                    sys.exit("No hay motor de voz: instala piper con modelos en models/piper/<lang>.onnx o `pip install edge-tts`")
                wav = OUT / f"{c['id']}.wav"
                phone_filter(raw, wav, rain=not args.no_rain and c.get("scenario", "").startswith("dana"))
                subprocess.run(
                    ["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-ac", "1", "-ar", "16000", "-b:a", "24k", str(OUT / f"{c['id']}.mp3")],
                    check=True,
                )
                done += 1
                print(f"{c['id']} ({c['lang']}) ok")
            except Exception as e:  # una llamada fallida no impide generar el resto
                failed.append(c["id"])
                print(f"{c['id']} FALLÓ: {e}", file=sys.stderr)
    print(f"{done} audios en {OUT}" + (f"; fallaron: {', '.join(failed)}" if failed else ""))
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
