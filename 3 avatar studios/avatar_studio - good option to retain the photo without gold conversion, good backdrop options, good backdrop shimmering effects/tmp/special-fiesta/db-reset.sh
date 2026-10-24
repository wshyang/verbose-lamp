#!/usr/bin/env bash
# Reset a database to empty: drop the tables schema.sql defines, nothing else (ADR-264).
#
#   ./db-reset.sh                                      # prompt for the URL (not in history)
#   ./db-reset.sh 'postgresql://ADMIN@host/db'
#   ./db-reset.sh 'postgresql://ADMIN@host/db' --no-install   # skip the npm ci preflight
#
# This is the destructive sibling of db-provision.sh. It exists for the one case the
# additive self-repair cannot heal — a schema changed in a way IF NOT EXISTS cannot
# reach (a type changed in place, a CHECK tightened, a column dropped) — where the
# honest remedy is to start over and let provisioning rebuild. The app calls this
# itself when DB_INIT and DB_INIT_RESET=stale are both set and the database's
# stamped schema version (schema_state) predates the build's.
#
# WHAT IT DROPS, AND WHAT IT DOES NOT
#
# Only the tables parsed out of apps/api/src/db/schema.sql, dropped CASCADE. Other
# tenants of the same database — extensions, another app's tables, the roles
# themselves — are untouched. Roles and grants survive; provisioning recreates
# tables and grants again as usual. Every row in the dropped tables is gone:
# this is a reset, not a migration, and it refuses (in setup-cli) when the role
# does not own what exists, rather than dying halfway through a CASCADE.
#
# CREDENTIAL HANDLING
#
# A connection string passed as an argument lands in your shell history and in
# the process list. Run with no argument and it is read from a hidden prompt
# instead. The app passes it on stdin for the same reason. Nothing here prints
# the string; output names only `user@host/database`.
set -euo pipefail

PSD_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PSD_ROOT"

# shellcheck source=_dev-common.sh
. "$PSD_ROOT/_dev-common.sh"

DB_URL=''
SKIP_INSTALL=0
for arg in "$@"; do
  case "$arg" in
    postgres://* | postgresql://*) DB_URL="$arg" ;;
    # Consumed here, not passed on: the app itself calls this script for
    # DB_INIT_RESET=stale (ADR-264), from inside a production image whose
    # node_modules is already pruned to what it needs.
    --no-install) SKIP_INSTALL=1 ;;
    *) die "unknown option: $arg (try --help)" ;;
  esac
done

ensure_node
[ "$SKIP_INSTALL" -eq 1 ] || ensure_deps

if [ -z "$DB_URL" ]; then
  # -s so it is not echoed to the terminal; -r so a backslash in a password survives.
  printf 'Connection string (input hidden): '
  read -rs DB_URL
  printf '\n'
fi
[ -n "$DB_URL" ] || die "no connection string given."

# No seed runs here, so no SUPERADMIN_INITIAL_PASSCODE is needed: reset only empties.
# DATABASE_DRIVER is forced off, tsx runs from node_modules, and the app's boot
# variables are unset — the same credential hygiene as db-provision.sh (ADR-249).
TSX="$PSD_ROOT/node_modules/.bin/tsx"
[ -x "$TSX" ] || die "tsx is not installed; run npm ci (or drop --no-install)."
env -u DATABASE_URL -u DATABASE_DRIVER -u DB_INIT -u DB_INIT_RESET -u DATABASE_URL_ADMIN \
  "$TSX" apps/api/src/db/setup-cli.ts --url "$DB_URL" --reset
