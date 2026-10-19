#!/usr/bin/env bash
# 把 .env 的 GLM 接入写进容器内 Claude Code 的 settings.json（原生凭证）。
# claude-cli backend 派生的进程不继承容器 env，必须走 Claude 自身配置。
set -euo pipefail
cd "$(dirname "$0")/.."

python3 - <<'PY' > /tmp/claude-settings.json
import os, json
env = {}
for line in open(".env"):
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    k, v = line.split("=", 1)
    if k.startswith("ANTHROPIC_") or k == "GH_TOKEN":
        env[k] = v
env["GIT_CONFIG_GLOBAL"] = "/workspace/factory/config/gitconfig"
# 思考强度保持模型默认（CEO 10-19 拍板：不降思考强度，速度靠架构优化不靠砍质量）
json.dump({"env": env}, open("/tmp/claude-settings.json", "w"), indent=2)
PY

docker compose cp /tmp/claude-settings.json openclaw-gateway:/home/node/.claude/settings.json >/dev/null
rm /tmp/claude-settings.json
echo "已写入容器 settings.json（键：$(docker compose exec -T openclaw-gateway sh -c 'python3 -c "import json;print(list(json.load(open(\"/home/node/.claude/settings.json\"))[\"env\"].keys()))"'))"
