#!/usr/bin/env bash
# refresh-demo-seed.sh — regenerate apps/api/src/db/seed-demo.sql from the recorded demo dump
# plus the supplemental named sign-ups (ADR-314: 120 recorded + 15 supplemental = 135).
#
#   ./refresh-demo-seed.sh                 record the dump with the real model, then replay and export
#   ./refresh-demo-seed.sh --skip-record   keep scripts/demo-participants.dump.json, then replay and export
#
# Steps, in order:
#   1. record   PSD_E2E_REAL_MODEL=1 npm run demo:record. A Playwright spec walks every persona through
#               the real sign-up and photo studio and writes the dump. It uses its own data directory,
#               so it never fills the database the export reads. Skipped by --skip-record.
#   2. check    The dump must match scripts/demo-personas.json: same count, same nicknames, same order.
#               seed-demo.mjs refers to participants by position.
#   3. replay   Starts the stack on a NEW, EMPTY database at apps/api/.data/demo-export (deleted first),
#               then runs npm run seed:demo to replay the dump onto it.
#   4. export   Stops the stack, then npm run db:export-demo rewrites seed-demo.sql from that database.
#   5. verify   The new seed-demo.sql must hold the dump's participants plus the supplemental
#               named sign-ups. Otherwise the previous file is put back.
#
# Nothing is committed: review with `git diff --stat`, then commit and push by hand.
# Logs and backups go to .data/refresh-demo-seed/ (git-ignored). The recording always uses the real
# model, because a stand-in recording must never become the committed seed. With --skip-record the
# script uses the dump on disk as it is, and cannot tell how that dump was recorded.

# shellcheck source=_dev-common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_dev-common.sh"

DATA_DIR="$PSD_ROOT/apps/api/.data/demo-export"
WORK_DIR="$PSD_ROOT/.data/refresh-demo-seed"
DUMP="$PSD_ROOT/scripts/demo-participants.dump.json"
SUPPLEMENTAL="$PSD_ROOT/scripts/demo-supplemental-participants.json"
PERSONAS="$PSD_ROOT/scripts/demo-personas.json"
SEED_SQL="$PSD_ROOT/apps/api/src/db/seed-demo.sql"

SKIP_RECORD=0
STACK_PID=''
SQL_TOUCHED=0
SQL_VERIFIED=0

usage() {
  awk 'NR > 1 && !/^#/ { exit } NR > 1 { line = $0; sub(/^# ?/, "", line); print line }' "${BASH_SOURCE[0]}"
}

parse_args() {
  local arg
  for arg in "$@"; do
    case "$arg" in
      --skip-record) SKIP_RECORD=1 ;;
      -h | --help) usage; exit 0 ;;
      *) die "unknown option: $arg (try --help)" ;;
    esac
  done
}

# Node does the comparisons, so the JSON is parsed properly and the rules live in one place.
#   dump — the dump matches the persona file: count, nicknames, order
#   sql  — seed-demo.sql holds the seeded crowd: dump + supplemental nicknames
compare_nicknames() {
  node --input-type=module - "$@" <<'NODE'
import { readFileSync } from 'node:fs';

const [mode, dumpPath, other, supplementalPath] = process.argv.slice(2);
const dump = JSON.parse(readFileSync(dumpPath, 'utf8')).participants;
const nicknames = dump.map((p) => p.nickname);

if (mode === 'dump') {
  const personas = JSON.parse(readFileSync(other, 'utf8')).participants.map((p) => p.nickname);
  const sameOrder = personas.length === nicknames.length && personas.every((name, i) => name === nicknames[i]);
  const noPhoto = dump.filter((p) => p.avatarPhoto == null).map((p) => p.nickname);
  console.log(`dump: ${nicknames.length} entries; personas: ${personas.length}; same nicknames in the same order: ${sameOrder ? 'yes' : 'NO'}`);
  console.log(`dump: no photo for ${noPhoto.length}: ${noPhoto.join(', ') || 'none'}`);
  process.exitCode = sameOrder ? 0 : 1;
} else {
  // The export writes participants in batches of 40, one INSERT per batch, so read every block.
  const lines = readFileSync(other, 'utf8').split('\n');
  const inSql = [];
  let inBlock = false;
  for (const line of lines) {
    if (line.startsWith('INSERT INTO participant (')) inBlock = true;
    if (!inBlock) continue;
    const match = /^\s+\('[^']*', '([^']*)'/.exec(line);
    if (match) inSql.push(match[1]);
    if (line.trimEnd().endsWith(';')) inBlock = false;
  }
  const supplemental = supplementalPath
    ? JSON.parse(readFileSync(supplementalPath, 'utf8')).participants.map((p) => p.nickname)
    : [];
  const want = [...nicknames, ...supplemental].sort();
  const got = [...inSql].sort();
  const same = got.length === want.length && want.every((name, i) => name === got[i]);
  console.log(`seed-demo.sql: ${got.length} participants; dump + supplemental: ${want.length}; same nicknames: ${same ? 'yes' : 'NO'}`);
  process.exitCode = same ? 0 : 1;
}
NODE
}

preflight() {
  ensure_node
  ensure_deps
  local port
  for port in "$(api_port)" "$(web_port)"; do
    if port_open "$port"; then
      die "port $port is in use. Stop the dev stack first (./dev-stop.sh, or Ctrl-C the terminal running npm run dev)."
    fi
  done
  if [ -n "${DATABASE_URL:-}" ] || [ -n "$(read_env_var DATABASE_URL '')" ]; then
    die "DATABASE_URL is set, so the dev database is a Postgres server. This script rebuilds the embedded PGlite directory. Unset DATABASE_URL to continue."
  fi
  mkdir -p "$WORK_DIR"
}

record_dump() {
  if [ -f "$DUMP" ]; then
    cp "$DUMP" "$WORK_DIR/demo-participants.before.json"
  fi
  info "recording with the real model: Playwright walks every persona through the real onboarding. Budget about 30 minutes; the model weights download once."
  if ! (PSD_E2E_REAL_MODEL=1 npm run demo:record) 2>&1 | tee "$WORK_DIR/record.log"; then
    die "the recording failed. Log: .data/refresh-demo-seed/record.log. The previous dump is saved beside it."
  fi
}

check_dump() {
  if ! compare_nicknames dump "$DUMP" "$PERSONAS"; then
    die "the dump does not match scripts/demo-personas.json. Record again, without --skip-record."
  fi
}

# The stack gets its own process group, so one signal takes all of it down. `npm run` does not
# forward SIGTERM to its children (AGENTS-workflow.md), so signalling the npm process alone would
# leave scripts/dev.mjs holding both ports.
start_stack() {
  set -m
  PSD_SEED=default PGLITE_DATA_DIR="$DATA_DIR" npm run dev >"$WORK_DIR/server.log" 2>&1 &
  STACK_PID=$!
  set +m
}

wait_for_api() {
  local port deadline
  port="$(api_port)"
  deadline=$(($(date +%s) + 120))
  until http_ok "http://127.0.0.1:${port}/api/health"; do
    if ! kill -0 "$STACK_PID" 2>/dev/null; then
      tail -n 30 "$WORK_DIR/server.log" >&2
      die "the stack exited before the API answered. Log: .data/refresh-demo-seed/server.log"
    fi
    if [ "$(date +%s)" -ge "$deadline" ]; then
      tail -n 30 "$WORK_DIR/server.log" >&2
      die "the API did not answer on :${port} within 120 seconds. Log: .data/refresh-demo-seed/server.log"
    fi
    sleep 1
  done
}

stop_stack() {
  if [ -z "$STACK_PID" ]; then
    return 0
  fi
  if kill -0 "$STACK_PID" 2>/dev/null; then
    kill -TERM -- "-$STACK_PID" 2>/dev/null || true
  fi
  local i=0
  while [ "$i" -lt 60 ]; do
    if ! kill -0 "$STACK_PID" 2>/dev/null && ! port_open "$(api_port)" && ! port_open "$(web_port)"; then
      break
    fi
    sleep 1
    i=$((i + 1))
  done
  wait "$STACK_PID" 2>/dev/null || true
  STACK_PID=''
  if port_open "$(api_port)" || port_open "$(web_port)"; then
    warn "a port is still listening after the stack stopped. ./dev-status.sh shows who holds it."
    return 1
  fi
}

replay_and_export() {
  local expected
  expected="$(node -p 'require(process.argv[1]).participants.length + require(process.argv[2]).participants.length' "$DUMP" "$SUPPLEMENTAL")"

  info "replay: a new, empty database at apps/api/.data/demo-export"
  rm -rf "$DATA_DIR"
  start_stack
  wait_for_api
  if ! grep -q 'empty database: applied schema.sql' "$WORK_DIR/server.log"; then
    die "the server did not start on an empty database. Log: .data/refresh-demo-seed/server.log"
  fi

  info "seeding ${expected} participants from the dump plus supplemental sign-ups"
  if ! SUPERADMIN_INITIAL_USERNAME="$(read_env_var SUPERADMIN_INITIAL_USERNAME superadmin)" \
    SUPERADMIN_INITIAL_PASSCODE="$(read_env_var SUPERADMIN_INITIAL_PASSCODE 4242)" \
    npm run seed:demo >"$WORK_DIR/seed.log" 2>&1; then
    tail -n 30 "$WORK_DIR/seed.log" >&2
    die "seed:demo failed. Log: .data/refresh-demo-seed/seed.log"
  fi
  if ! grep -q "${expected} participants ready" "$WORK_DIR/seed.log"; then
    die "seed:demo did not report ${expected} participants. Log: .data/refresh-demo-seed/seed.log"
  fi

  stop_stack || die "the stack did not stop, so the database is not safe to export."
  info "export: rewriting apps/api/src/db/seed-demo.sql from the database"
  cp "$SEED_SQL" "$WORK_DIR/seed-demo.before.sql"
  SQL_TOUCHED=1
  if ! PSD_SEED=default PGLITE_DATA_DIR="$DATA_DIR" npm run db:export-demo >"$WORK_DIR/export.log" 2>&1; then
    tail -n 30 "$WORK_DIR/export.log" >&2
    die "db:export-demo failed. Log: .data/refresh-demo-seed/export.log"
  fi
  if ! compare_nicknames sql "$DUMP" "$SEED_SQL" "$SUPPLEMENTAL"; then
    die "the regenerated seed-demo.sql does not hold the dump's participants plus the supplemental sign-ups."
  fi
  SQL_VERIFIED=1
}

summarise() {
  local count
  count="$(node -p 'require(process.argv[1]).participants.length + require(process.argv[2]).participants.length' "$DUMP" "$SUPPLEMENTAL")"
  good "apps/api/src/db/seed-demo.sql now holds the ${count} seeded participants (recorded dump plus supplemental sign-ups)."
  info "$(git diff --stat -- apps/api/src/db/seed-demo.sql | tail -n 1)"
  info "review:  git diff -- apps/api/src/db/seed-demo.sql"
  if [ "$SKIP_RECORD" -eq 1 ]; then
    info "commit:  git add scripts/demo-supplemental-participants.json apps/api/src/db/seed-demo.sql"
  else
    info "commit:  git add scripts/demo-participants.dump.json scripts/demo-supplemental-participants.json apps/api/src/db/seed-demo.sql"
  fi
  info "         git commit -m \"...\" && git push origin $(git branch --show-current)"
}

# Runs on every exit. Stops the stack, and puts the previous seed-demo.sql back if the export
# touched it and the check did not pass.
cleanup() {
  local status=$?
  stop_stack || true
  if [ "$SQL_TOUCHED" -eq 1 ] && [ "$SQL_VERIFIED" -ne 1 ]; then
    cp "$WORK_DIR/seed-demo.before.sql" "$SEED_SQL"
    warn "put the previous seed-demo.sql back"
  fi
  exit "$status"
}

main() {
  cd "$PSD_ROOT"
  parse_args "$@"
  trap cleanup EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  preflight
  if [ "$SKIP_RECORD" -eq 1 ]; then
    info "skipping the recording: using the dump already in scripts/"
  else
    record_dump
  fi
  check_dump
  replay_and_export
  summarise
}

main "$@"
