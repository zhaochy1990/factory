#!/usr/bin/env bash
# harness/run.sh — QA e2e harness 的目标命令：起真实栈 → 跑用例 → 出报告。
#
# 用法：
#   harness/run.sh                # 栈 + 浏览器用例（必须全绿）+ 报告
#   harness/run.sh --with-mp      # 加跑小程序用例（需要 DevTools 自动化端口，见 miniprogram/README）
#   harness/run.sh --keep-going   # 失败不中断，仍出报告（默认用例失败即停）
#
# 环境要求：nvm node 24（`source ~/.nvm/nvm.sh && nvm use 24`）、Docker Desktop。
set -uo pipefail
HARNESS_DIR="$(cd "$(dirname "$0")" && pwd)"
. "$HARNESS_DIR/stack/env.sh"

WITH_MP=0
KEEP_GOING=0
for arg in "$@"; do
  case "$arg" in
    --with-mp) WITH_MP=1 ;;
    --keep-going) KEEP_GOING=1 ;;
    *) echo "run.sh: unknown flag $arg" >&2; exit 2 ;;
  esac
done

RESULTS_DIR="$HARNESS_DIR/results"
mkdir -p "$RESULTS_DIR"
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
FAIL=0
regression_json='['
reg_first=1
smoke() { # $1=name, $2=shell check command
  if eval "$2" >/dev/null 2>&1; then
    [ $reg_first -eq 1 ] || regression_json+=','; reg_first=0
    regression_json+="{\"name\":\"$1\",\"ok\":true}"
    echo "[run] smoke $1 ok"
  else
    [ $reg_first -eq 1 ] || regression_json+=','; reg_first=0
    regression_json+="{\"name\":\"$1\",\"ok\":false,\"detail\":\"check failed: $2\"}"
    echo "[run] smoke $1 FAILED ($2)" >&2
    FAIL=1
  fi
}

source ~/.nvm/nvm.sh && nvm use 24 >/dev/null || { echo "[run] node 24 (nvm) 不可用" >&2; exit 1; }

echo "== [1/5] 真实本地栈 =="
"$HARNESS_DIR/stack/up.sh" || { echo "[run] 栈起不来" >&2; exit 1; }

echo "== [2/5] 浏览器用例（Playwright，无 mock） =="
( cd "$HARNESS_DIR/browser" &&
  [ -d node_modules ] || npm install --no-audit --no-fund
  ./node_modules/.bin/playwright install chromium >/dev/null 2>&1 || true  # idempotent
  npx playwright test   # reporters come from playwright.config.ts: list + JSON(→results/)
) || FAIL=1
[ $FAIL -eq 0 ] || [ $KEEP_GOING -eq 1 ] || { echo "[run] 浏览器用例未全绿（--keep-going 可继续出报告）" >&2; exit 1; }

echo "== [3/5] 小程序用例（miniprogram-automator，尽力而为） =="
MP_STATUS="skipped"
if [ $WITH_MP -eq 1 ]; then
  ( cd "$HARNESS_DIR/miniprogram" &&
    [ -d node_modules ] || npm install --no-audit --no-fund
    bash prepare.sh && npm test
  ); mp_rc=$?
  if [ $mp_rc -eq 0 ]; then MP_STATUS=true; else MP_STATUS=false; [ $mp_rc -eq 2 ] && MP_STATUS="blocked"; FAIL=1; fi
fi

echo "== [4/5] 冒烟健康检查 =="
smoke auth-backend    "curl -sf -m 5 $HARNESS_AUTH_BASE_URL/health"
smoke stride-api      "curl -sf -m 5 $HARNESS_API_BASE_URL/health"
smoke admin-dashboard "curl -sf -m 5 $HARNESS_DASHBOARD_BASE_URL/"
smoke api-gateway     "curl -sf -m 5 $HARNESS_GATEWAY_BASE_URL/health"
smoke mysql-tcp       "docker exec local-mysql-1 mysqladmin ping -h 127.0.0.1 --silent"
regression_json+=']'

echo "== [5/5] 报告 =="
RUNNING_SHA="$(cd "$RUNNING_DIR" && git rev-parse --short HEAD 2>/dev/null || echo unknown)"
DEVOPS_SHA="$(cd "$STRIDE_DEVOPS_DIR" && git rev-parse --short HEAD 2>/dev/null || echo unknown)"
HARNESS_SHA="$(cd "$FACTORY_DIR" && git rev-parse --short HEAD 2>/dev/null || echo unknown)"

cat > "$RESULTS_DIR/env.json" <<EOF
{
  "startedAt": "$STARTED_AT",
  "finishedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "runningSha": "$RUNNING_SHA",
  "devopsSha": "$DEVOPS_SHA",
  "harnessSha": "$HARNESS_SHA",
  "fixtureVersion": "race-center@seed-race-center.py (stride-devops $DEVOPS_SHA); auth admin/bootstrap seed",
  "stackDesc": "stride-devops/local docker compose 全栈（ACR 钉定镜像：真实 Go api/worker + auth + admin-dashboard + MySQL:3308/Redis/RabbitMQ）",
  "noMock": {
    "realBackend": true,
    "realDatastore": true,
    "realHttp": true,
    "miniprogram": "$MP_STATUS",
    "noProd": true
  },
  "regression": $regression_json
}
EOF

node "$HARNESS_DIR/report/generate.mjs" "$RESULTS_DIR" || FAIL=1

if [ $FAIL -eq 0 ]; then
  echo "[run] ✅ 全绿"
  exit 0
else
  echo "[run] ❌ 有失败/blocked——看上面的报告" >&2
  exit 1
fi
