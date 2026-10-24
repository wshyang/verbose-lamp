#!/usr/bin/env bash
# dev-status.sh — what is running, on which ports, against which database.

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_dev-common.sh"

cd "$PSD_ROOT"
clear_stale_pidfile

api="$(api_port)"
web="$(web_port)"

printf '%sstack%s\n' "$C_BOLD" "$C_OFF"
if stack_running; then
  printf '  detached, pid %s (logs: .dev/dev.log)\n' "$(stack_pid)"
elif port_open "$api" || port_open "$web"; then
  printf '  not started by these scripts, but something is listening\n'
else
  printf '  down\n'
fi

report_port() {
  local name="$1" port="$2" probe="${3:-}"
  local holder state
  holder="$(port_holder "$port" || true)"
  if ! port_open "$port"; then
    printf '  %-4s :%-5s %sclosed%s\n' "$name" "$port" "$C_DIM" "$C_OFF"
    return
  fi
  state="listening"
  if [ -n "$probe" ]; then
    if http_ok "$probe"; then state="answering"; else state="listening, not answering"; fi
  fi
  printf '  %-4s :%-5s %s%s%s%s\n' "$name" "$port" "$C_GREEN" "$state" "$C_OFF" "${holder:+ (pid $holder)}"
}

printf '\n%sports%s\n' "$C_BOLD" "$C_OFF"
report_port api "$api" "http://127.0.0.1:${api}/api/health"
report_port web "$web"

printf '\n%sdatabase%s\n' "$C_BOLD" "$C_OFF"
db_url="$(read_env_var DATABASE_URL '')"
if [ -n "$db_url" ]; then
  # Never print the password: the driver follows DATABASE_URL (ADR-051), and a status line is
  # not a reason to put a credential on someone's screen or in their scrollback.
  printf '  postgres server (DATABASE_URL is set; host %s)\n' "$(printf '%s' "$db_url" | sed -E 's#^.*@##; s#/.*$##')"
elif [ -d "$PSD_DEV_DATA_DIR" ]; then
  size="$(du -sh "$PSD_DEV_DATA_DIR" 2>/dev/null | cut -f1 || echo '?')"
  printf '  embedded PGlite at apps/api/.data/dev (%s)\n' "$size"
  [ -f "$PSD_SEEDED_MARKER" ] && printf '  demo data seeded %s\n' "$(cat "$PSD_SEEDED_MARKER")"
else
  printf '  none yet — apps/api/.data/dev will be provisioned from schema.sql on first boot\n'
fi

printf '\n%senvironment%s\n' "$C_BOLD" "$C_OFF"
if [ -f "$PSD_ROOT/.env" ]; then
  printf '  .env present\n'
else
  printf '  %sno .env%s — ./dev.sh will copy .env.example for you\n' "$C_YELLOW" "$C_OFF"
fi
printf '  node %s\n' "$(node --version 2>/dev/null || echo 'not found')"
printf '\n'
