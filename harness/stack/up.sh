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
  (cd "$LOCAL_DIR" && ./up.sh)
fi

# Post-check with harness-visible endpoints (up.sh already health-gates the
# core four; this re-checks from the harness's perspective and prints the DSN).
ok() { curl -sf -m 3 "$1" >/dev/null && echo "[harness/stack]   $2 ok" || { echo "[harness/stack]   $2 FAILED ($1)" >&2; exit 1; }; }
ok "$HARNESS_AUTH_BASE_URL/health"        "auth-backend"
ok "$HARNESS_API_BASE_URL/health"         "stride-api"
ok "$HARNESS_DASHBOARD_BASE_URL/"         "admin-dashboard"
ok "$HARNESS_GATEWAY_BASE_URL/"           "api-gateway"

echo "[harness/stack] stack up. MySQL DSN: mysql://${HARNESS_MYSQL_USER}:***@${HARNESS_MYSQL_HOST}:${HARNESS_MYSQL_PORT}/${HARNESS_MYSQL_DATABASE}"
