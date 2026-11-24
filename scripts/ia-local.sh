#!/usr/bin/env bash
# IA local SIN Docker ni sudo: alternativa a setup-modelos.sh cuando Docker no ve la GPU
# (falta nvidia-container-toolkit). Arranca Ollama (~/.local/ollama) y el servidor de Whisper
# (scripts/stt_server.py), descarga lo que falte, precalienta el LLM y crea .env.local si no existe.
# Uso:   bash scripts/ia-local.sh          Parar:  bash scripts/ia-local.sh stop
# Ajustes: LLM_MODEL, STT_MODEL, STT_DEVICE=cpu (libera VRAM para el LLM), OLLAMA_BIN.
set -euo pipefail
cd "$(dirname "$0")/.."
OLLAMA_BIN=${OLLAMA_BIN:-$HOME/.local/ollama/bin/ollama}
LLM=${LLM_MODEL:-qwen2.5:7b-instruct}
STT=${STT_MODEL:-Systran/faster-whisper-small}
STT_DEVICE=${STT_DEVICE:-cuda}
export OLLAMA_HOST=127.0.0.1:11434
mkdir -p logs

if [ "${1:-}" = "stop" ]; then
  pkill -f "stt_server[.]py" && echo "Whisper parado." || true
  pkill -f "$OLLAMA_BIN serve" && echo "Ollama parado." || true
  exit 0
fi

up() { curl -sf -m 2 "$1" >/dev/null; }
wait_for() { # url nombre segundos
  for _ in $(seq 1 "$3"); do up "$1" && { echo "✓ $2 listo"; return 0; }; sleep 1; done
  echo "✗ $2 no responde; mira logs/" >&2; return 1
}

[ -x "$OLLAMA_BIN" ] || {
  echo "Falta Ollama en $OLLAMA_BIN: descarga ollama-linux-amd64.tar.zst de github.com/ollama/ollama/releases y extráelo en ~/.local/ollama" >&2
  exit 1
}
if ! up http://127.0.0.1:11434/api/version; then
  OLLAMA_KEEP_ALIVE=2h nohup "$OLLAMA_BIN" serve >logs/ollama.log 2>&1 &
  wait_for http://127.0.0.1:11434/api/version Ollama 30
fi
"$OLLAMA_BIN" show "$LLM" >/dev/null 2>&1 || "$OLLAMA_BIN" pull "$LLM"

if [ ! -x .venv-stt/bin/python ]; then
  uv venv --python 3.12 .venv-stt
  # av<19: PyAV 19 quitó metadata_errors, que faster-whisper 1.2.1 todavía usa al decodificar.
  VIRTUAL_ENV=.venv-stt uv pip install faster-whisper "av<19" nvidia-cublas-cu12
fi
if ! up http://127.0.0.1:8000/v1/models; then
  nohup .venv-stt/bin/python scripts/stt_server.py --model "$STT" --device "$STT_DEVICE" >logs/stt.log 2>&1 &
  wait_for http://127.0.0.1:8000/v1/models "Whisper ($STT_DEVICE)" 300
fi

# Precalienta el LLM para que la primera llamada de la demo no espere a cargarlo en la GPU.
curl -sf -m 180 http://127.0.0.1:11434/api/generate \
  -d "{\"model\":\"$LLM\",\"prompt\":\"ok\",\"stream\":false,\"keep_alive\":\"2h\",\"options\":{\"num_predict\":1}}" >/dev/null \
  && echo "✓ $LLM cargado en la GPU"

if [ ! -f .env.local ]; then
  cat > .env.local <<ENV
LLM_BASE_URL=http://localhost:11434/v1
LLM_MODEL=$LLM
LLM_API_KEY=local
STT_BASE_URL=http://localhost:8000/v1
STT_MODEL=$STT
ENV
  echo ".env.local creado."
fi
echo "Listo. Arranca 'npm run dev': la barra superior mostrará «IA local»."
