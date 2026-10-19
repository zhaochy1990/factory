#!/usr/bin/env bash
# T4 第一验证项（ADR-0001）：容器内 claude-cli 经 GLM Anthropic 端点能对话
# 通过标准：最后一行输出含 GLM_OK
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose run --rm --no-deps --entrypoint sh openclaw-cli -c \
  'claude -p "只回复两个词：GLM_OK" --model haiku 2>&1 | tail -3'
