#!/usr/bin/env bash
# harness/stack/env.sh — shared resolution for the QA e2e harness.
#
# The REAL stack recipe lives in the stride-devops repo (READ-ONLY from the
# harness's point of view): local/docker-compose.yml + local/up.sh +
# local/scripts/*. This file only resolves paths and lifts the handful of
# values tests need (MySQL host port, credentials, client ids) out of
# stride-devops/local/.env — it never copies or duplicates the compose config.
#
# Overridable via environment:
#   STRIDE_DEVOPS_DIR  (default: <factory>/../stride/stride-devops)
#   RUNNING_DIR        (default: <factory>/../stride/running)

set -euo pipefail

HARNESS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FACTORY_DIR="$(cd "$HARNESS_DIR/.." && pwd)"

# --- repo resolution --------------------------------------------------------
resolve_repo() { # $1=env var name, $2=default sibling path
  local current="${!1:-}"
  if [ -n "$current" ]; then
    [ -d "$current" ] || { echo "env.sh: $1=$current is not a directory" >&2; exit 1; }
    cd "$current" && pwd && return
  fi
  local guess="$FACTORY_DIR/../$2"
  [ -d "$guess" ] || { echo "env.sh: default $1 ($guess) missing — export $1=/path/to/repo" >&2; exit 1; }
  cd "$guess" && pwd
}

export STRIDE_DEVOPS_DIR="$(resolve_repo STRIDE_DEVOPS_DIR stride/stride-devops)"
export RUNNING_DIR="$(resolve_repo RUNNING_DIR stride/running)"
export LOCAL_DIR="$STRIDE_DEVOPS_DIR/local"

# --- stack config values (from stride-devops/local/.env, compose defaults) ---
# Known pitfall #1: the local MySQL does NOT listen on 3306. Another compose
# stack owns 3306 on this machine, so local/.env sets MYSQL_HOST_PORT=3308.
# Always read the port/user/password from local/.env instead of hardcoding.
STACK_ENV_FILE="$LOCAL_DIR/.env"
stack_env() { # $1=key, $2=fallback (mirrors the compose default)
  if [ -f "$STACK_ENV_FILE" ]; then
    local v
    v="$(grep -E "^$1=" "$STACK_ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '[:space:]' || true)"
    [ -n "$v" ] && { echo "$v"; return; }
  fi
  echo "$2"
}

export HARNESS_MYSQL_HOST="${HARNESS_MYSQL_HOST:-127.0.0.1}"
export HARNESS_MYSQL_PORT="$(stack_env MYSQL_HOST_PORT 3306)"
export HARNESS_MYSQL_USER="$(stack_env MYSQL_USER auth)"
export HARNESS_MYSQL_PASSWORD="$(stack_env MYSQL_PASSWORD auth_password)"
export HARNESS_MYSQL_DATABASE="${HARNESS_MYSQL_DATABASE:-auth}"
export HARNESS_AUTH_BASE_URL="${HARNESS_AUTH_BASE_URL:-http://localhost:3001}"
export HARNESS_API_BASE_URL="${HARNESS_API_BASE_URL:-http://localhost:3000}"
export HARNESS_DASHBOARD_BASE_URL="${HARNESS_DASHBOARD_BASE_URL:-http://localhost:8081}"
export HARNESS_GATEWAY_BASE_URL="${HARNESS_GATEWAY_BASE_URL:-http://localhost:8082}"
# Known pitfall #2: a local Java process owns 8888, so stride-coach-api is
# mapped to 18888 on the host (COACH_API_HOST_PORT in local/.env).
export HARNESS_COACH_API_PORT="$(stack_env COACH_API_HOST_PORT 8888)"

# OAuth client ids (written into local/.env by bootstrap.sh after it registers
# the ids baked into the prebuilt SPA images). /api/auth/login REQUIRES a valid
# X-Client-Id — the admin-dashboard baked id is what the dashboard itself uses.
export HARNESS_ADMIN_DASHBOARD_CLIENT_ID="$(stack_env ADMIN_DASHBOARD_CLIENT_ID '')"
export HARNESS_AUTH_CLIENT_ID="$(stack_env AUTH_CLIENT_ID '')"
export HARNESS_WECHAT_MINIPROGRAM_CLIENT_ID="$(stack_env WECHAT_MINIPROGRAM_CLIENT_ID '')"

# --- compose helper ----------------------------------------------------------
# Known pitfall #3: `docker compose` auto-loads local/.env but NOT the shared
# pinned-tag manifest ../versions.env — a raw `docker compose <cmd>` in local/
# dies with "required variable STRIDE_WORKER_IMAGE_TAG is missing a value".
# Always go through this helper (or local/up.sh, which sources it).
stack_compose() {
  (cd "$LOCAL_DIR" &&
    set -a && . ../versions.env && set +a &&
    docker compose "$@")
}
