#!/usr/bin/env bash
# dev-reset.sh — wipe the dev database so the next boot provisions a clean one.
#
#   ./dev-reset.sh            ask first, then wipe
#   ./dev-reset.sh --yes      no prompt
#   ./dev-reset.sh --yes --seed  wipe, start detached, and replay the recorded demo day
#
# It deletes exactly ONE directory: apps/api/.data/dev. PGLITE_DATA_DIR is resolved against
# the API's cwd, not the repo root, so the repo-root .data/dev a careless `rm` would reach for
# is NOT the dev database — wiping that one leaves the real data in place and reseeds on top
# of it (AGENTS-testing.md §11). That gotcha is the reason this script exists.

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_dev-common.sh"

ASSUME_YES=0
THEN_SEED=0

while [ $# -gt 0 ]; do
  case "$1" in
    -y | --yes) ASSUME_YES=1 ;;
    --seed) THEN_SEED=1 ;;
    -h | --help)
      sed -n '2,13p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) die "unknown option: $1 (try --help)" ;;
  esac
  shift
done

cd "$PSD_ROOT"
clear_stale_pidfile

db_url="$(read_env_var DATABASE_URL '')"
if [ -n "$db_url" ]; then
  die "DATABASE_URL is set, so the dev data lives on a Postgres server this script will not touch.
     Drop and recreate that database yourself, or unset DATABASE_URL to go back to embedded PGlite."
fi

if [ ! -d "$PSD_DEV_DATA_DIR" ]; then
  info "nothing to wipe — apps/api/.data/dev does not exist."
else
  if [ "$ASSUME_YES" -ne 1 ]; then
    size="$(du -sh "$PSD_DEV_DATA_DIR" 2>/dev/null | cut -f1 || echo '?')"
    printf 'Delete the dev database at apps/api/.data/dev (%s)? [y/N] ' "$size"
    read -r reply </dev/tty || reply=''
    case "$reply" in
      y | Y | yes | YES) ;;
      *) die "cancelled." ;;
    esac
  fi

  # PGlite is single-process: a live stack holds this directory open, and deleting it under a
  # running API is how you get a half-provisioned database that boots into nonsense.
  if stack_running; then
    info "stopping the running stack first (PGlite is single-process)."
    "$PSD_ROOT/dev-stop.sh"
  elif port_open "$(api_port)"; then
    die "the API is still listening on $(api_port) but was not started by these scripts.
     Stop it before wiping its database."
  fi

  rm -rf "$PSD_DEV_DATA_DIR"
  rm -f "$PSD_SEEDED_MARKER"
  good "wiped apps/api/.data/dev — the next boot provisions it from schema.sql (ADR-049)."
fi

if [ "$THEN_SEED" -eq 1 ]; then
  exec "$PSD_ROOT/dev.sh" --detach --seed
fi
