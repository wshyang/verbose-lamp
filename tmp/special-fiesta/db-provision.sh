#!/usr/bin/env bash
# Provision a database this machine can reach but the app cannot build (ADR-178).
#
#   ./db-provision.sh                                      # prompt for the URL (not in history)
#   ./db-provision.sh 'postgresql://ADMIN@host/db' --grant-to 'postgresql://APP@host/db'
#   ./db-provision.sh 'postgresql://ADMIN@host/db' --grant-to app_role --demo
#   ./db-provision.sh 'postgresql://ADMIN@host/db' --inspect --grant-to app_role   # write nothing
#
#   ./db-provision.sh 'postgresql://ADMIN@host/db' --demo --no-install   # skip the npm ci preflight
#
# --grant-to takes either a role name or the app's own connection string, from which it uses the
# username and nothing else. Exits non-zero if the app role still cannot reach every table.
#
# IF YOU CANNOT SEE THE APP'S CONNECTION STRING
#
# Managed platforms inject it into the container as a hidden variable. The database still knows:
#
#   ./db-provision.sh 'postgresql://ADMIN@host/db' --inspect
#
# prints the login roles and anything connected right now. A crash-looping app reconnects every
# few seconds, so its role shows up as a live backend. The app also names its own role on every
# boot — `[api] database: role … on …` — so the deploy log is a second witness.
#
# As a last resort, --grant-to PUBLIC grants to every role in the database, present and future.
# Blunt, but on a single-tenant managed database it is a defensible way to stop guessing.
#
# WHY THIS EXISTS
#
# The app provisions itself on boot (ADR-049) and that needs CREATE on schema public. Since
# PostgreSQL 15 only the database owner has it, so a managed provider's application role does
# not — and `IF NOT EXISTS` does not help, because Postgres checks the privilege before it checks
# existence. Somebody holding an admin credential therefore has to build the schema once, from
# somewhere that is not the container. That somewhere is usually a developer's laptop.
#
# PASS --grant-to ON EVERY RUN
#
# Tables are owned by whoever created them, so the app's role needs explicit privileges on them.
# Where the platform mints a fresh just-in-time admin per maintenance window — a different role
# name each time — ALTER DEFAULT PRIVILEGES set by the previous admin does NOT cover what this
# one creates. The explicit grant, re-run every time, is what actually keeps the app working;
# the verification at the end of each run is what tells you if it did not.
#
# CREDENTIAL HANDLING
#
# A connection string passed as an argument lands in your shell history and in the process list.
# Run with no argument and it is read from a hidden prompt instead, which is the better habit for
# anything long-lived. Nothing here writes the string to disk, and the script prints only
# `user@host/database` — never the password.
set -euo pipefail

PSD_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PSD_ROOT"

# shellcheck source=_dev-common.sh
. "$PSD_ROOT/_dev-common.sh"

DB_URL=''
SKIP_INSTALL=0
ARGS=()
for arg in "$@"; do
  case "$arg" in
    postgres://* | postgresql://*) DB_URL="$arg" ;;
    # Consumed here, not passed on: the app itself calls this script for DB_INIT=demo (ADR-249),
    # from inside a production image whose node_modules is already pruned to what it needs.
    # ensure_deps would see a lockfile newer than the install stamp and run `npm ci` over it.
    --no-install) SKIP_INSTALL=1 ;;
    *) ARGS+=("$arg") ;;
  esac
done

ensure_node
[ "$SKIP_INSTALL" -eq 1 ] || ensure_deps

if [ -z "$DB_URL" ]; then
  # -s so it is not echoed to the terminal; -r so a backslash in a generated password survives.
  printf 'Connection string (input hidden): '
  read -rs DB_URL
  printf '\n'
fi
[ -n "$DB_URL" ] || die "no connection string given."

# The default seed creates the initial superadmin, and refuses to invent a passcode (fds.md §8.3).
# Prompt rather than fail three steps in, by which point the schema is already built.
if [ -z "${SUPERADMIN_INITIAL_PASSCODE:-}" ]; then
  SUPERADMIN_INITIAL_PASSCODE="$(read_env_var SUPERADMIN_INITIAL_PASSCODE '')"
fi
if [ -z "$SUPERADMIN_INITIAL_PASSCODE" ] && ! printf '%s\n' "${ARGS[@]:-}" | grep -q -- '--inspect'; then
  printf 'SUPERADMIN_INITIAL_PASSCODE (4 digits, input hidden): '
  read -rs SUPERADMIN_INITIAL_PASSCODE
  printf '\n'
fi
export SUPERADMIN_INITIAL_PASSCODE

# DATABASE_DRIVER is forced off: the URL is passed explicitly, and a stale DATABASE_URL in the
# developer's .env must not be able to redirect a run that names its target on the command line.
#
# tsx is run from node_modules, not through `npx`: npx prints the full command line it runs, and
# that line carries the connection string — password included — into whatever captures stdout.
# That is a terminal scrollback for a person and the container log for the app (ADR-249).
TSX="$PSD_ROOT/node_modules/.bin/tsx"
[ -x "$TSX" ] || die "tsx is not installed; run npm ci (or drop --no-install)."
# DB_INIT and DATABASE_URL_ADMIN are unset for the same reason: they configure the APP's boot, and
# with DATABASE_URL gone the app's own env validation rejects DB_INIT ("requires DATABASE_URL").
# That is exactly how the app's DB_INIT=demo call to this script failed (ADR-249).
env -u DATABASE_URL -u DATABASE_DRIVER -u DB_INIT -u DATABASE_URL_ADMIN \
  "$TSX" apps/api/src/db/setup-cli.ts --url "$DB_URL" ${ARGS[@]+"${ARGS[@]}"}
