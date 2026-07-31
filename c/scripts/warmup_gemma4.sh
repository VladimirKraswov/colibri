#!/usr/bin/env bash
set -euo pipefail

for _ in $(seq 1 180); do
  if curl -fsS --max-time 2 http://127.0.0.1:18080/health >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

curl -fsS --max-time 300 \
  -H 'Content-Type: application/json' \
  -X POST http://127.0.0.1:18080/v1/chat/completions \
  --data-binary @- >/dev/null <<'JSON'
{"model":"gemma-4-26b-a4b-it-qat-q4_0","messages":[{"role":"user","content":"Write one detailed paragraph of about 100 words explaining quantization-aware training."}],"stream":false,"temperature":0.0,"top_k":1,"max_tokens":128,"chat_template_kwargs":{"enable_thinking":false}}
JSON
