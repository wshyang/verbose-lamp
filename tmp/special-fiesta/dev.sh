#!/usr/bin/env bash
# dev.sh — bring the whole local stack up with one command.
#
#   ./dev.sh                 API + web in the foreground, Ctrl-C stops both
#   ./dev.sh --detach        start in the background, print the URLs, return
#   ./dev.sh --reset         wipe the dev database first, then start
#
# It wraps `npm run dev` (AGENTS-workflow.md §1) and adds only the preflight a human would
# otherwise do from memory: node version, .env, dependencies, free ports, a readiness check,
# and a demo seed when the database is brand new.

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_dev-common.sh"

DETACH=0
FORCE=0
RESET=0
SEED=auto

usage() {
  cat <<'EOF'
Usage: ./dev.sh [options]

  -d, --detach     Run in the background; write logs to .dev/dev.log and return once the
                   stack answers. Stop it later with ./dev-stop.sh.
      --reset      Wipe the dev database (apps/api/.data/dev) before starting.
      --seed       Replay the recorded demo day after boot, even on an existing database.
      --no-seed    Never seed, not even on a brand-new database.
      --force      If a port is busy, kill whatever is holding it.
  -h, --help       This.

Environment:
  PSD_DEV_READY_TIMEOUT   Seconds to wait for the stack to answer (default 90).
  PSD_WEB_PORT            Web port to probe (default 5173).

Companions: ./dev-stop.sh  ./dev-restart.sh  ./dev-status.sh  ./dev-logs.sh
            ./dev-reset.sh ./verify.sh
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    -d | --detach) DETACH=1 ;;
    --reset) RESET=1 ;;
    --seed) SEED=always ;;
    --no-seed) SEED=never ;;
    --force) FORCE=1 ;;
    -h | --help)
      usage
      exit 0
      ;;
    *) die "unknown option: $1 (try --help)" ;;
  esac
  shift
done

cd "$PSD_ROOT"
ensure_runtime_dir
clear_stale_pidfile

if stack_running; then
  warn "a detached stack is already running (pid $(stack_pid))."
  print_urls
  info "Use ./dev-restart.sh to restart it, or ./dev-stop.sh to stop it."
  exit 0
fi

# ---------------------------------------------------------------------------
# Preflight
# ---------------------------------------------------------------------------

ensure_node
ensure_env_file
ensure_deps

if [ "$RESET" -eq 1 ]; then
  "$PSD_ROOT/dev-reset.sh" --yes
fi

API_PORT="$(api_port)"
WEB_PORT="$(web_port)"

for port_pair in "api:$API_PORT" "web:$WEB_PORT"; do
  name="${port_pair%%:*}"
  port="${port_pair##*:}"
  port_open "$port" || continue
  holder="$(port_holder "$port" || true)"
  if [ "$FORCE" -eq 1 ] && [ -n "$holder" ]; then
    warn "port $port ($name) was held by pid $holder — killing it (--force)."
    kill "$holder" 2>/dev/null || true
    sleep 1
    port_open "$port" && kill -9 "$holder" 2>/dev/null || true
    sleep 1
  fi
  if port_open "$port"; then
    die "port $port ($name) is already in use${holder:+ by pid $holder}.
     Something else is serving it — possibly a stack started outside these scripts.
     Stop it, or re-run with --force to have this script kill the holder."
  fi
done

# Decided BEFORE boot: the API creates this directory as it provisions, so after boot the
# question can no longer be asked.
SHOULD_SEED=0
case "$SEED" in
  always) SHOULD_SEED=1 ;;
  never) SHOULD_SEED=0 ;;
  auto) dev_db_is_fresh && SHOULD_SEED=1 ;;
esac

if [ "$SHOULD_SEED" -eq 1 ]; then
  info "the dev database is new — the recorded demo day will be seeded once the API answers."
fi

# ---------------------------------------------------------------------------
# Start
# ---------------------------------------------------------------------------

seed_now() {
  info "seeding the recorded demo day…"
  if (cd "$PSD_ROOT" && npm run --silent seed:demo); then
    date -u +%Y-%m-%dT%H:%M:%SZ >"$PSD_SEEDED_MARKER"
    good "demo data seeded. Sign in as Wei_Ling / 1000 (participant) or superadmin / 4242."
  else
    warn "seeding failed. The stack is still up; re-run ./dev.sh --seed once you know why."
  fi
}

if [ "$DETACH" -eq 1 ]; then
  : >"$PSD_LOG_FILE"
  if command -v setsid >/dev/null 2>&1; then
    setsid npm run dev >>"$PSD_LOG_FILE" 2>&1 &
  else
    npm run dev >>"$PSD_LOG_FILE" 2>&1 &
  fi
  pid=$!
  echo "$pid" >"$PSD_PID_FILE"
  # The process group, so dev-stop.sh can take the API and Vite down with the parent rather
  # than orphaning them. `ps -o pgid=` is POSIX enough for macOS and Linux both.
  (ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ' || true) >"$PSD_PGID_FILE"
  info "started detached (pid $pid); logs: .dev/dev.log"

  if wait_for_ready; then
    good "stack is up."
  else
    status=$?
    if [ "$status" -eq 2 ]; then
      warn "the stack exited during start-up. Last lines of .dev/dev.log:"
    else
      warn "the stack did not answer within ${PSD_DEV_READY_TIMEOUT:-90}s. Last lines of .dev/dev.log:"
    fi
    tail -n 30 "$PSD_LOG_FILE" >&2 || true
    exit 1
  fi

  [ "$SHOULD_SEED" -eq 1 ] && seed_now
  print_urls
  info "Follow the logs with ./dev-logs.sh, stop with ./dev-stop.sh."
  exit 0
fi

# Foreground. The seeder runs in a subshell so `npm run dev` can own the terminal and keep
# Ctrl-C behaving exactly as it does without this wrapper.
if [ "$SHOULD_SEED" -eq 1 ]; then
  (
    wait_for_ready || exit 0
    seed_now
  ) &
  SEEDER_PID=$!
  trap 'kill "$SEEDER_PID" 2>/dev/null || true' EXIT
fi

print_urls
info "starting in the foreground — Ctrl-C stops both processes."

# Not `exec`, and not a bare `npm run dev`: this shell stays alive to take the stack down with
# it. Signalling the npm process is NOT enough — measured, not assumed: `npm run` does not pass
# SIGTERM on to the `sh -c node scripts/dev.mjs` it spawned, so npm dies, the supervisor
# re-parents to init, and the API and Vite keep both ports. Only the process GROUP catches
# everything, which is why npm is started in one of its own with setsid.
if command -v setsid >/dev/null 2>&1; then
  setsid npm run dev &
else
  npm run dev &
fi
DEV_PID=$!
DEV_PGID="$(ps -o pgid= -p "$DEV_PID" 2>/dev/null | tr -d ' ' || true)"
OWN_PGID="$(ps -o pgid= -p $$ 2>/dev/null | tr -d ' ' || true)"

shutdown_stack() {
  # Never signal our own group: without setsid the child shares it, and `kill -TERM -$PGID`
  # would take down this script and the user's shell along with the servers.
  if [ -n "$DEV_PGID" ] && [ "$DEV_PGID" != "$OWN_PGID" ]; then
    kill -TERM "-$DEV_PGID" 2>/dev/null || true
  else
    kill -TERM "$DEV_PID" 2>/dev/null || true
  fi
}
trap 'shutdown_stack' INT TERM

status=0
wait "$DEV_PID" || status=$?
# Also on a normal exit: if npm fell over on its own, its children are still out there.
shutdown_stack
exit "$status"
