#!/usr/bin/env bash
# harness/miniprogram/prepare.sh — build the automator workspace.
#
# running/src/wechat-miniprogram is READ-ONLY for the harness (and its compiled
# .js artifacts are gitignored build products; CURRENT_ENV in the repo is
# STAGING = 生产 API，绝对不能拿来跑本地 e2e). So instead of touching the
# running repo we:
#   1. rsync the miniprogram tree into .workspace/ (gitignored)
#   2. patch CURRENT_ENV -> ENV.DEV **in the copy only** (config then points at
#      http://127.0.0.1:8082 — the local stack's api-gateway)
#   3. recompile TypeScript with the SAME toolchain the repo uses
#      (frontend/node_modules/.bin/tsc, per stride-devops/local README)
#
# WeChat DevTools then opens .workspace/ as its project — the running repo is
# never modified and the miniprogram never touches prod.
set -euo pipefail
. "$(dirname "$0")/../stack/env.sh"

SRC="$RUNNING_DIR/src/wechat-miniprogram"
WS="$(cd "$(dirname "$0")" && pwd)/.workspace"

[ -d "$SRC" ] || { echo "prepare.sh: $SRC missing (RUNNING_DIR=$RUNNING_DIR)" >&2; exit 1; }

echo "[mp/prepare] rsync $SRC -> $WS (excluding node_modules)"
mkdir -p "$WS"
rsync -a --delete --exclude node_modules "$SRC/" "$WS/"

echo "[mp/prepare] patching CURRENT_ENV -> ENV.DEV (workspace copy only)"
sed -i '' 's/^export const CURRENT_ENV: Env = ENV\.[A-Z]*;/export const CURRENT_ENV: Env = ENV.DEV;/' \
  "$WS/constants/config.ts"
grep -q 'CURRENT_ENV: Env = ENV.DEV' "$WS/constants/config.ts" || {
  echo "prepare.sh: CURRENT_ENV patch failed (constants/config.ts 变了格式？)" >&2; exit 1; }

# typings live in the running repo's miniprogram node_modules — symlink instead
# of a second install (also keeps tsc on the exact devDependency versions).
if [ -d "$SRC/node_modules" ] && [ ! -e "$WS/node_modules" ]; then
  ln -s "$SRC/node_modules" "$WS/node_modules"
fi

TSC="$RUNNING_DIR/frontend/node_modules/.bin/tsc"
if [ ! -x "$TSC" ]; then
  echo "[mp/prepare] frontend tsc missing — falling back to npx typescript"
  (cd "$WS" && npx -y typescript@5.9 tsc --project tsconfig.json)
else
  echo "[mp/prepare] tsc --project tsconfig.json (running/frontend toolchain)"
  (cd "$WS" && "$TSC" --project tsconfig.json)
fi

# 已知坑（实测）：新项目路径首次被 DevTools 打开时，「不校验合法域名」
# （setting.urlCheck=false）不生效——模拟器仍报 request:fail url not in
# domain list。改写一次 project.config.json（内容有 diff）能触发 DevTools
# 重读配置并生效。这里每次构建都带时间戳键强制产生 diff。
python3 - "$WS/project.config.json" <<'PY'
import json, sys, time
p = sys.argv[1]
d = json.load(open(p))
d.setdefault('setting', {})['urlCheck'] = False
d['_qaHarnessRefresh'] = str(int(time.time()))
json.dump(d, open(p, 'w'), ensure_ascii=False, indent=2)
PY

# 给 DevTools 的文件监听一点时间消化配置变更（避免用例 attach 时撞上重编译窗口）
sleep 3

RUNNING_SHA="$(cd "$RUNNING_DIR" && git rev-parse --short HEAD)"
echo "[mp/prepare] workspace ready: $WS (source running@${RUNNING_SHA}, ENV.DEV -> 127.0.0.1:8082)"
