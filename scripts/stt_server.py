#!/usr/bin/env python3
"""Servidor de transcripción local compatible con la API de OpenAI (alternativa nativa a speaches).

Expone lo mínimo que usa la consola (lib/ai.ts):
  GET  /v1/models                    -> lista de modelos (sirve de sonda para /api/status)
  POST /v1/audio/transcriptions      -> multipart con file, model, language y task (transcribe|translate) opcionales -> {"text": ...}

Uso (desde la raíz del repo, con el venv de scripts/ia-local.sh):
  .venv-stt/bin/python scripts/stt_server.py [--model Systran/faster-whisper-small] [--device cuda|cpu] [--port 8000]
Por defecto solo escucha en 127.0.0.1 (--host para Docker): el audio de las llamadas no sale del equipo.
"""
from __future__ import annotations

import argparse
import ctypes
import glob
import io
import json
import os
import sys
import threading
import time
from email.parser import BytesParser
from email.policy import HTTP
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def preload_cuda_libs() -> None:
    """Carga cuBLAS instalado con pip (nvidia-cublas-cu12) para que ctranslate2 lo encuentre sin LD_LIBRARY_PATH."""
    site = os.path.join(sys.prefix, "lib", f"python{sys.version_info.major}.{sys.version_info.minor}", "site-packages")
    for pattern in ("nvidia/cublas/lib/libcublasLt.so.*", "nvidia/cublas/lib/libcublas.so.*", "nvidia/cudnn/lib/libcudnn*.so.*"):
        for path in sorted(glob.glob(os.path.join(site, pattern))):
            try:
                ctypes.CDLL(path, mode=ctypes.RTLD_GLOBAL)
            except OSError:
                pass


def parse_multipart(content_type: str, body: bytes) -> dict[str, tuple[bytes, str | None]]:
    msg = BytesParser(policy=HTTP).parsebytes(b"Content-Type: " + content_type.encode() + b"\r\n\r\n" + body)
    fields: dict[str, tuple[bytes, str | None]] = {}
    for part in msg.iter_parts():
        name = part.get_param("name", header="content-disposition")
        if name:
            fields[name] = (part.get_payload(decode=True) or b"", part.get_filename())
    return fields


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default=os.environ.get("STT_MODEL", "Systran/faster-whisper-small"))
    ap.add_argument("--device", default="cuda", choices=["cuda", "cpu"])
    ap.add_argument("--compute-type", default=None, help="float16 en GPU, int8 en CPU por defecto")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--max-seconds", type=float, default=float(os.environ.get("MAX_CALL_SECONDS") or 120),
                    help="rechaza (413) audio más largo que esto + 5 s sin transcribirlo")
    ap.add_argument("--beam-size", type=int, default=int(os.environ.get("STT_BEAM_SIZE") or 5),
                    help="tamaño del haz de la decodificación (5 = valor de siempre; 1 = más rápido, algo menos preciso)")
    ap.add_argument("--cpu-threads", type=int, default=int(os.environ.get("STT_CPU_THREADS") or 0),
                    help="hilos de CPU de CTranslate2 (0 = valor por defecto de la biblioteca)")
    ap.add_argument("--host", default="127.0.0.1", help="0.0.0.0 solo dentro de una red interna de Docker")
    args = ap.parse_args()

    if args.device == "cuda":
        preload_cuda_libs()
    from faster_whisper import WhisperModel, decode_audio  # import tardío: después de precargar CUDA

    compute = args.compute_type or ("float16" if args.device == "cuda" else "int8")
    t0 = time.time()
    model = WhisperModel(args.model, device=args.device, compute_type=compute, cpu_threads=args.cpu_threads)
    print(f"[stt] modelo {args.model} cargado en {args.device}/{compute} en {time.time() - t0:.1f}s", flush=True)
    lock = threading.Lock()  # un solo modelo en GPU: transcripciones en serie

    class Handler(BaseHTTPRequestHandler):
        def _json(self, status: int, payload: dict) -> None:
            data = json.dumps(payload, ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self) -> None:  # noqa: N802
            if self.path.rstrip("/") in ("/v1/models", "/models"):
                self._json(200, {"object": "list", "data": [{"id": args.model, "object": "model"}]})
            else:
                self._json(404, {"error": "no encontrado"})

        def do_POST(self) -> None:  # noqa: N802
            if self.path.rstrip("/") not in ("/v1/audio/transcriptions", "/audio/transcriptions"):
                self._json(404, {"error": "no encontrado"})
                return
            ctype = self.headers.get("Content-Type", "")
            if not ctype.startswith("multipart/form-data"):
                self._json(400, {"error": "se esperaba multipart/form-data"})
                return
            body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
            fields = parse_multipart(ctype, body)
            if "file" not in fields or not fields["file"][0]:
                self._json(400, {"error": "falta el campo file"})
                return
            lang = fields.get("language", (b"", None))[0].decode().strip() or None
            task = fields.get("task", (b"", None))[0].decode().strip() or "transcribe"
            if task not in ("transcribe", "translate"):
                self._json(400, {"error": "task debe ser transcribe o translate"})
                return
            t = time.time()
            try:
                # Se decodifica primero (rápido) para rechazar audios largos sin gastar CPU en transcribirlos.
                audio = decode_audio(io.BytesIO(fields["file"][0]), sampling_rate=16000)
            except Exception as e:  # audio corrupto o formato no soportado
                self._json(400, {"error": f"no se pudo decodificar el audio: {e}"})
                return
            seconds = len(audio) / 16000
            if seconds > args.max_seconds + 5:
                print(f"[stt] rechazado: {seconds:.0f}s > {args.max_seconds:.0f}s + 5", flush=True)
                self._json(413, {"error": f"el audio dura {seconds:.0f} s y el máximo es {args.max_seconds:.0f} s"})
                return
            try:
                with lock:
                    segments, info = model.transcribe(audio, language=lang, task=task, beam_size=args.beam_size)
                    text = " ".join(s.text.strip() for s in segments).strip()
            except Exception as e:  # audio corrupto o formato no soportado
                self._json(500, {"error": f"no se pudo transcribir: {e}"})
                return
            print(f"[stt] {fields['file'][1] or 'audio'} lang={lang or info.language} task={task} {time.time() - t:.2f}s", flush=True)
            self._json(200, {"text": text, "language": info.language, "duration": info.duration})

        def log_message(self, *_: object) -> None:  # silencia el log por petición de http.server
            pass

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"[stt] escuchando en http://{args.host}:{args.port}/v1", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
