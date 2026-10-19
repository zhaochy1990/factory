#!/usr/bin/env bash
# 首次/日常拉起底座
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] || scripts/gen-env.sh
docker compose build
docker compose up -d openclaw-gateway
echo "等待健康检查..."
for i in $(seq 1 30); do
  curl -sf http://127.0.0.1:18789/healthz >/dev/null 2>&1 && { echo "healthy ✓"; exit 0; }
  sleep 2
done
echo "30s 未 healthy，看日志：docker compose logs openclaw-gateway --tail 50" >&2
exit 1
