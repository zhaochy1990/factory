#!/usr/bin/env bash
# 应用 config/openclaw.seed.json5 到网关（首次启动后跑一次）
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose run --rm --no-deps openclaw-cli config set --batch-json \
  --file /workspace/factory/config/openclaw.seed.json5 \
  || { echo "batch set 不支持时逐键 set；对照 \`openclaw config get\` 修正 seed"; exit 1; }
docker compose restart openclaw-gateway
