#!/usr/bin/env bash
# harness/stack/down.sh — tear the local stack down (thin wrapper).
#
# Usage:                harness/stack/down.sh        # stop, keep data volumes
#        harness/stack/down.sh -v                    # stop AND wipe MySQL/RabbitMQ volumes
#
# Delegates to `docker compose down` in stride-devops/local, sourcing the
# pinned-tag manifest first (raw compose fails without it — see env.sh).
set -euo pipefail
. "$(dirname "$0")/env.sh"

echo "[harness/stack] docker compose down $* (data volumes kept unless -v)"
stack_compose down "$@"
echo "[harness/stack] stack down."
