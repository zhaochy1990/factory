#!/usr/bin/env bash
# harness/stack/up.sh — bring the REAL local stack up (thin wrapper).
#
# Delegates entirely to stride-devops/local (read-only for us):
#   - first run (no local/.env):  local/scripts/bootstrap.sh
#     (JWT keys + auth seed + AUTH_CLIENT_ID capture + full stack — idempotent)
#   - steady state:               local/up.sh
#     (pull pinned images + recreate + health checks)
#
# Usage: harness/stack/up.sh
set -euo pipefail
. "$(dirname "$0")/env.sh"

if [ ! -f "$LOCAL_DIR/.env" ]; then
  echo "[harness/stack] first run: bootstrapping via stride-devops local/scripts/bootstrap.sh" >&2
  (cd "$LOCAL_DIR" && ./scripts/bootstrap.sh)
else
  echo "[harness/stack] steady state: delegating to stride-devops local/up.sh" >&2
  # KNOWN PITFALL (recorded, stride-devops is read-only for the harness):
  # local/up.sh health-checks stride-coach-api on hardcoded :8888, but
  # local/.env maps it to COACH_API_HOST_PORT (18888 on this machine) — its
  # last check can exit non-zero even though every container is healthy.
  # Don't let that abort us; we verify on the REAL ports below.
  (cd "$LOCAL_DIR" && ./up.sh) || {
    echo "[harness/stack] warning: stride-devops up.sh exited non-zero (通常是它的 :8888 硬编码健康检查；以本脚本下面的真实端口复检为准)" >&2
  }
fi

# Post-check with harness-visible endpoints — the ports that actually matter
# (all from local/.env via env.sh), including coach-api on its mapped port.
ok() { curl -sf -m 3 "$1" >/dev/null && echo "[harness/stack]   $2 ok" || { echo "[harness/stack]   $2 FAILED ($1)" >&2; exit 1; }; }
ok "$HARNESS_AUTH_BASE_URL/health"        "auth-backend"
ok "$HARNESS_API_BASE_URL/health"         "stride-api"
ok "$HARNESS_DASHBOARD_BASE_URL/"         "admin-dashboard"
# api-gateway only routes /api/* & /health — its / is a 404 by design.
ok "$HARNESS_GATEWAY_BASE_URL/health"     "api-gateway"
ok "http://localhost:${HARNESS_COACH_API_PORT}/health" "stride-coach-api(:${HARNESS_COACH_API_PORT})"

echo "[harness/stack] stack up. MySQL DSN: mysql://${HARNESS_MYSQL_USER}:***@${HARNESS_MYSQL_HOST}:${HARNESS_MYSQL_PORT}/${HARNESS_MYSQL_DATABASE}"
