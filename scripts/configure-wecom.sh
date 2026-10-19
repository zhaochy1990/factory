#!/usr/bin/env bash
# 配置企业微信机器人（用户填好 .env 的 WECOM_BOT_ID/WECOM_BOT_SECRET 后跑）
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a
[ -n "$WECOM_BOT_ID" ] && [ -n "$WECOM_BOT_SECRET" ] || { echo "先在 .env 填 WECOM_BOT_ID/WECOM_BOT_SECRET（获取步骤见 docs/runbook.md）"; exit 1; }
docker compose exec openclaw-gateway openclaw config set channels.wecom.botId "$WECOM_BOT_ID"
docker compose exec openclaw-gateway openclaw config set channels.wecom.secret "$WECOM_BOT_SECRET"
docker compose exec openclaw-gateway openclaw config set channels.wecom.enabled true
docker compose restart openclaw-gateway
echo "完成。手机企业微信给机器人发第一条消息，按提示走配对码流程；"
echo "配对码审批：docker compose exec openclaw-gateway openclaw pairing approve wecom <CODE>"
