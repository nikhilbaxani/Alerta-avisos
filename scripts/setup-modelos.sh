#!/usr/bin/env bash
# Descarga los modelos según la VRAM (MEMORIA §7) y escribe .env.local si no existe.
# Uso: bash scripts/setup-modelos.sh [8|16|24]   (sin argumento, detecta con nvidia-smi)
set -euo pipefail
cd "$(dirname "$0")/.."

GB="${1:-}"
if [ -z "$GB" ]; then
  MIB=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null | head -1 || echo 0)
  GB=$(( ${MIB:-0} / 1024 ))
  echo "VRAM detectada: ${GB} GB"
fi
if   [ "$GB" -ge 24 ]; then LLM="qwen2.5:32b-instruct"; STT="Systran/faster-whisper-large-v3"
elif [ "$GB" -ge 12 ]; then LLM="qwen2.5:14b-instruct"; STT="deepdml/faster-whisper-large-v3-turbo-ct2"
else                        LLM="qwen2.5:7b-instruct";  STT="Systran/faster-whisper-small"
fi
echo "LLM: $LLM · STT: $STT"

docker compose -f docker-compose.gpu.yml up -d
echo "Esperando a Ollama…"
for _ in $(seq 1 30); do curl -sf http://localhost:11434/api/tags >/dev/null && break; sleep 2; done
docker compose -f docker-compose.gpu.yml exec -T ollama ollama pull "$LLM"
curl -sf -X POST "http://localhost:8000/v1/models/${STT}" >/dev/null || echo "Aviso: no se pudo pedir el modelo de voz a speaches (se descargará en el primer uso)."

if [ ! -f .env.local ]; then
  cat > .env.local <<ENV
LLM_BASE_URL=http://localhost:11434/v1
LLM_MODEL=$LLM
LLM_API_KEY=local
STT_BASE_URL=http://localhost:8000/v1
STT_MODEL=$STT
ENV
  echo ".env.local creado."
else
  echo ".env.local ya existe: revisa LLM_MODEL=$LLM y STT_MODEL=$STT a mano."
fi
echo "Listo. Reinicia 'npm run dev': la barra superior mostrará «IA local»."
