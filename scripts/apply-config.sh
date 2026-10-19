#!/usr/bin/env bash
# 应用 config/openclaw.seed.json 到网关。
# 本版配置为 agents.entries 按 id 的 map；main（onboard 产物）保留不删、
# 只交出 default；其余路径原样 set。
set -euo pipefail
cd "$(dirname "$0")/.."

docker compose exec -T openclaw-gateway openclaw config get agents --json 2>/dev/null > /tmp/agents-current.json || true

python3 - <<'PY' > /tmp/openclaw.batch.json
import json
seed = json.load(open("config/openclaw.seed.json"))
try:
    cur = json.load(open("/tmp/agents-current.json"))
    entries = cur.get("agents", cur).get("entries", {})
except Exception:
    entries = {}
merged = {}
for aid, a in entries.items():
    a = dict(a); a.pop("default", None)   # main 交出 default 给 lily
    merged[aid] = a
merged.update(seed["agents"]["entries"])
ops = [
    {"path": "agents.entries", "value": merged},
    {"path": "agents.defaults.models", "value": seed["agents"]["defaults_models"]},
    {"path": "bindings", "value": seed["bindings"]},
    {"path": "tools.agentToAgent", "value": seed["tools"]["agentToAgent"]},
    {"path": "tools.alsoAllow", "value": seed["tools"]["alsoAllow"]},
    {"path": "channels.wecom", "value": seed["channels"]["wecom"]},
]
json.dump(ops, open("/tmp/openclaw.batch.json", "w"))
print("roster:", sorted(merged.keys()), file=__import__("sys").stderr)
PY

docker compose cp /tmp/openclaw.batch.json openclaw-gateway:/tmp/openclaw.batch.json >/dev/null
docker compose exec openclaw-gateway openclaw config set --batch-file /tmp/openclaw.batch.json --dry-run 2>&1 | tail -2
docker compose exec openclaw-gateway openclaw config set --batch-file /tmp/openclaw.batch.json 2>&1 | tail -2
docker compose exec openclaw-gateway openclaw gateway restart 2>&1 | tail -1 || docker compose restart openclaw-gateway
