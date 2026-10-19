#!/usr/bin/env bash
# 生成 .env：GLM 配置从本机 ~/.claude/settings.json 同步（值不回显、不入仓）
# 用法：scripts/gen-env.sh [--force]
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f .env ] && [ "${1:-}" != "--force" ]; then
  echo ".env 已存在（--force 覆盖）"; exit 0
fi

python3 - <<'PY' > .env
import json, os, secrets
s = json.load(open(os.path.expanduser("~/.claude/settings.json")))["env"]
keep = [k for k in s if k.startswith("ANTHROPIC_")]
print("# 由 scripts/gen-env.sh 生成；勿提交勿外传")
print(f"OPENCLAW_IMAGE={os.environ.get('OPENCLAW_IMAGE','ghcr.io/openclaw/openclaw:latest')}")
print(f"OPENCLAW_GATEWAY_TOKEN={secrets.token_urlsafe(32)}")
for k in keep:
    print(f"{k}={s[k]}")
PY

# gh 凭证（GitHub 全用 CEO 账号，#634 决议）
if GH_TOKEN=$(gh auth token 2>/dev/null); then
  echo "GH_TOKEN=$GH_TOKEN" >> .env
else
  echo "# GH_TOKEN=<未取到，手动补：gh auth token>" >> .env
fi

# 企业微信（用户拿超管建机器人后填，见 docs/runbook.md）
cat >> .env <<'EOF'
WECOM_BOT_ID=
WECOM_BOT_SECRET=
EOF

chmod 600 .env
echo "生成完成，键列表："
sed 's/=.*/=<redacted>/' .env
