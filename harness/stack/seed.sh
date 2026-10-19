#!/usr/bin/env bash
# harness/stack/seed.sh — idempotent fixture seeding (thin wrapper).
#
# Delegates to stride-devops/local/scripts (read-only for us):
#   - seed-race-center.py  : publishes the 赛事中心 fixtures (1 rich race +
#                            5 basic-field races; idempotent, safe to re-run)
#   - --miniprogram-login  : additionally registers the WeChat mini-program
#                            auth app (needs WECHAT_MINIPROGRAM_APPID/_APP_SECRET
#                            already in stride-devops/local/.env) so wx.login
#                            token_exchange works against the local stack
#
# Usage: harness/stack/seed.sh [--miniprogram-login]
set -euo pipefail
. "$(dirname "$0")/env.sh"

echo "[harness/stack] seeding race-center fixtures (idempotent)…"
python3 "$LOCAL_DIR/scripts/seed-race-center.py"

if [ "${1:-}" = "--miniprogram-login" ]; then
  echo "[harness/stack] enabling mini-program login (registers wechat provider app)…"
  "$LOCAL_DIR/scripts/enable-miniprogram-login.sh"
fi

# Record the fixture provenance for the QA report (which seed script at which
# stride-devops commit). Printed so harness/run.sh can capture it.
DEVOPS_SHA="$(cd "$STRIDE_DEVOPS_DIR" && git rev-parse --short HEAD)"
echo "[harness/stack] fixture: race-center@seed-race-center.py (stride-devops ${DEVOPS_SHA})"
