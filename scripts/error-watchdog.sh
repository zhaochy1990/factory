#!/usr/bin/env bash
# 网关错误看门狗：tail 网关日志，命中错误模式即推企业微信给 CEO。
# 用法：nohup scripts/error-watchdog.sh >/tmp/factory-watchdog.log 2>&1 &
# 防抖：同 5 分钟窗口内只推第一条。
set -uo pipefail
cd "$(dirname "$0")/.."

PATTERN='lane task error|cli terminal failure|model fallback decision: decision=candidate_failed|Gateway start blocked|startup failed|Pairing request created'
LAST_SENT=0

docker compose logs -f --since now openclaw-gateway 2>/dev/null | grep --line-buffered -E "$PATTERN" | while read -r line; do
  NOW=$(date +%s)
  # 读共享时间戳文件做跨循环防抖
  LAST=0; [ -f /tmp/factory-wd-last ] && LAST=$(cat /tmp/factory-wd-last)
  if [ $((NOW - LAST)) -lt 300 ]; then continue; fi
  echo "$NOW" > /tmp/factory-wd-last
  SNIP=$(printf '%s' "$line" | cut -c1-220)
  docker compose exec -T openclaw-gateway openclaw message send \
    --channel wecom --target ZhaoChaoYi \
    --message "⚠️ Lily 工作台后台错误
${SNIP}
（详情：docker compose logs openclaw-gateway；5 分钟内同类错误不再重复推送）" \
    >/dev/null 2>&1 || echo "watchdog send failed: $SNIP"
done
