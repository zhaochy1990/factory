#!/usr/bin/env bash
# harness/stack/mysql.sh — run a SQL query against the local stack's MySQL.
#
# Connects through the container (docker exec) so it needs no host mysql
# client; the same instance is reachable from tests over TCP 127.0.0.1:3308
# (see env.sh — port comes from stride-devops/local/.env MYSQL_HOST_PORT).
#
# Usage: harness/stack/mysql.sh <database> <<'SQL'
#        select …;
#        SQL
set -euo pipefail
. "$(dirname "$0")/env.sh"

db="${1:-$HARNESS_MYSQL_DATABASE}"
shift || true
CONTAINER="$(docker ps --filter name=local-mysql-1 --format '{{.Names}}' | head -1)"
[ -n "$CONTAINER" ] || { echo "mysql.sh: local-mysql-1 not running — harness/stack/up.sh first" >&2; exit 1; }

docker exec -i "$CONTAINER" mysql -u"$HARNESS_MYSQL_USER" -p"$HARNESS_MYSQL_PASSWORD" "$db" "$@" 2>/dev/null
