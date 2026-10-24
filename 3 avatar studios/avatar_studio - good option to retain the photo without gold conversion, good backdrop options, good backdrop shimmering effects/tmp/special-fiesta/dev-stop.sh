#!/usr/bin/env bash
# dev-stop.sh — stop a stack started with ./dev.sh --detach.

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_dev-common.sh"

FORCE=0
while [ $# -gt 0 ]; do
  case "$1" in
    -f | --force) FORCE=1 ;;
    -h | --help)
      sed -n '2,3p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      printf '  -f, --force   Also kill whatever holds the ports, even if these scripts did not start it.\n'
      exit 0
      ;;
    *) die "unknown option: $1 (try --help)" ;;
  esac
  shift
done

# Kill whoever holds the dev ports, whatever started them. This is the cleanup path for an
# orphaned stack: if the supervising shell dies hard, `npm run dev` never hears the signal and
# the API and Vite re-parent to init with the ports still held. Nothing else can reclaim those.
reclaim_ports() {
  local reclaimed=0 port holder
  for port in "$(api_port)" "$(web_port)"; do
    port_open "$port" || continue
    holder="$(port_holder "$port" || true)"
    if [ -z "$holder" ]; then
      warn "port $port is held, but this host offers no lsof/fuser to say by whom."
      continue
    fi
    info "killing pid $holder, which holds port $port."
    kill -TERM "$holder" 2>/dev/null || true
    sleep 1
    port_open "$port" && kill -KILL "$holder" 2>/dev/null || true
    reclaimed=1
  done
  # The supervisor holds no port of its own, so the loop above cannot see it — and left alive
  # it restarts what was just killed. It only ever runs from this repo, so the name is enough.
  local supervisor
  for supervisor in $(ps -eo pid,args | grep '[s]cripts/dev\.mjs' | awk '{print $1}'); do
    info "killing the orphaned supervisor, pid $supervisor."
    kill -TERM "$supervisor" 2>/dev/null || true
    reclaimed=1
  done
  return $((1 - reclaimed))
}

cd "$PSD_ROOT"
clear_stale_pidfile

if ! stack_running; then
  if port_open "$(api_port)" || port_open "$(web_port)"; then
    if [ "$FORCE" -eq 1 ]; then
      warn "no stack of ours, but the ports are held — reclaiming them (--force)."
      reclaim_ports || true
      sleep 1
      if port_open "$(api_port)" || port_open "$(web_port)"; then
        die "the ports are still held. ./dev-status.sh names the holder."
      fi
      good "ports reclaimed."
      exit 0
    fi
    info "no detached stack is running."
    # A foreground stack is not ours to kill silently, but saying so saves a puzzled minute.
    warn "something is still listening on $(api_port)/$(web_port) — a foreground ./dev.sh, perhaps.
     Ctrl-C that terminal, or re-run with --force to kill the holder."
    exit 0
  fi
  info "no detached stack is running."
  exit 0
fi

pid="$(stack_pid)"
pgid="$(cat "$PSD_PGID_FILE" 2>/dev/null || true)"

# Prefer the process group: `npm run dev` supervises the API and Vite as children, and
# signalling only the parent is how you end up with an orphaned port.
if [ -n "$pgid" ] && [ "$pgid" != "0" ]; then
  kill -TERM "-$pgid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
else
  kill -TERM "$pid" 2>/dev/null || true
fi

info "stopping (pid $pid)…"
for _ in $(seq 1 20); do
  stack_running || break
  sleep 0.5
done

if stack_running; then
  warn "it did not stop on SIGTERM; sending SIGKILL."
  if [ -n "$pgid" ] && [ "$pgid" != "0" ]; then
    kill -KILL "-$pgid" 2>/dev/null || true
  fi
  kill -KILL "$pid" 2>/dev/null || true
  sleep 1
fi

rm -f "$PSD_PID_FILE" "$PSD_PGID_FILE"

if port_open "$(api_port)" || port_open "$(web_port)"; then
  if [ "$FORCE" -eq 1 ]; then
    warn "a child outlived its parent; reclaiming the ports (--force)."
    reclaim_ports || true
  else
    warn "a port is still open — a child outlived its parent. ./dev-status.sh names it;
     ./dev-stop.sh --force kills it."
  fi
fi

good "stopped."
