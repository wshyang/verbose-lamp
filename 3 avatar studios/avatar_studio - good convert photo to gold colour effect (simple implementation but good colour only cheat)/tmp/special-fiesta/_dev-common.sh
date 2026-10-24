#!/usr/bin/env bash
# _dev-common.sh — shared helpers for the dev-stack scripts. SOURCED, never executed.
#
# The scripts in the repo root (dev.sh, dev-stop.sh, …) are a thin, honest wrapper around the
# npm scripts that already exist. They add the preflight a human would otherwise do from
# memory — node version, .env, dependencies, ports, a readiness check — and nothing else.
# If a wrapper and `npm run dev` ever disagree, `npm run dev` is right and the wrapper is the
# bug: see AGENTS-workflow.md §1.

set -euo pipefail

# Resolve the repo root from this file, so the scripts work from any cwd.
PSD_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PSD_ROOT

PSD_RUNTIME_DIR="$PSD_ROOT/.dev"
PSD_PID_FILE="$PSD_RUNTIME_DIR/dev.pid"
PSD_PGID_FILE="$PSD_RUNTIME_DIR/dev.pgid"
PSD_LOG_FILE="$PSD_RUNTIME_DIR/dev.log"
PSD_SEEDED_MARKER="$PSD_RUNTIME_DIR/seeded"

# PGLITE_DATA_DIR is relative to the API's cwd, not the repo root. Getting this wrong wipes
# the wrong database and silently reseeds on top of old data — AGENTS-testing.md §11.
PSD_DEV_DATA_DIR="$PSD_ROOT/apps/api/.data/dev"

# Node's own minimum for this workspace (package.json engines).
PSD_MIN_NODE_MAJOR=20
PSD_MIN_NODE_MINOR=11

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  C_DIM=$'\033[2m'; C_RED=$'\033[31m'; C_GREEN=$'\033[32m'
  C_YELLOW=$'\033[33m'; C_BOLD=$'\033[1m'; C_OFF=$'\033[0m'
else
  C_DIM=''; C_RED=''; C_GREEN=''; C_YELLOW=''; C_BOLD=''; C_OFF=''
fi

info() { printf '%s[dev]%s %s\n' "$C_DIM" "$C_OFF" "$*"; }
good() { printf '%s[dev]%s %s%s%s\n' "$C_DIM" "$C_OFF" "$C_GREEN" "$*" "$C_OFF"; }
warn() { printf '%s[dev]%s %s%s%s\n' "$C_DIM" "$C_OFF" "$C_YELLOW" "$*" "$C_OFF" >&2; }
die() {
  printf '%s[dev]%s %serror:%s %s\n' "$C_DIM" "$C_OFF" "$C_RED" "$C_OFF" "$*" >&2
  exit 1
}

# ---------------------------------------------------------------------------
# Environment file
# ---------------------------------------------------------------------------

# Read one KEY from .env, falling back to .env.example, falling back to a default.
# Deliberately simple: the real parser is apps/api/src/env.ts, and config is read exactly
# once there (AGENTS-workflow.md §2). This only needs enough to find the ports.
read_env_var() {
  local key="$1" fallback="${2:-}" value=''
  local file
  for file in "$PSD_ROOT/.env" "$PSD_ROOT/.env.example"; do
    [ -f "$file" ] || continue
    value="$(sed -n "s/^[[:space:]]*${key}=//p" "$file" | tail -n 1 || true)"
    value="${value%\"}"; value="${value#\"}"
    value="${value%\'}"; value="${value#\'}"
    if [ -n "$value" ]; then
      printf '%s' "$value"
      return 0
    fi
  done
  printf '%s' "$fallback"
}

api_port() { read_env_var PORT 8787; }
web_port() { printf '%s' "${PSD_WEB_PORT:-5173}"; }

ensure_env_file() {
  if [ -f "$PSD_ROOT/.env" ]; then
    return 0
  fi
  [ -f "$PSD_ROOT/.env.example" ] || die ".env.example is missing; cannot create a .env."
  cp "$PSD_ROOT/.env.example" "$PSD_ROOT/.env"
  warn "no .env found — copied .env.example to .env."
  warn "It carries the example SUPERADMIN_INITIAL_PASSCODE. Change it before anyone else can reach this host."
}

# ---------------------------------------------------------------------------
# Toolchain and dependencies
# ---------------------------------------------------------------------------

ensure_node() {
  command -v node >/dev/null 2>&1 || die "node is not on PATH. Node >= ${PSD_MIN_NODE_MAJOR}.${PSD_MIN_NODE_MINOR} is required."
  local raw major minor
  raw="$(node --version)"; raw="${raw#v}"
  major="${raw%%.*}"
  minor="${raw#*.}"; minor="${minor%%.*}"
  if [ "$major" -lt "$PSD_MIN_NODE_MAJOR" ] ||
    { [ "$major" -eq "$PSD_MIN_NODE_MAJOR" ] && [ "$minor" -lt "$PSD_MIN_NODE_MINOR" ]; }; then
    die "node $raw is too old; this workspace needs >= ${PSD_MIN_NODE_MAJOR}.${PSD_MIN_NODE_MINOR}."
  fi
  command -v npm >/dev/null 2>&1 || die "npm is not on PATH."
}

# Install only when the tree is actually stale. `npm ci` is the honest choice when a lockfile
# exists: it installs exactly what is locked instead of quietly resolving something else.
ensure_deps() {
  local stamp="$PSD_ROOT/node_modules/.package-lock.json"
  if [ -d "$PSD_ROOT/node_modules" ] && [ -f "$stamp" ] &&
    [ ! "$PSD_ROOT/package-lock.json" -nt "$stamp" ]; then
    return 0
  fi
  if [ -d "$PSD_ROOT/node_modules" ]; then
    info "dependencies look stale (package-lock.json is newer) — installing…"
  else
    info "node_modules is missing — installing…"
  fi
  if [ -f "$PSD_ROOT/package-lock.json" ]; then
    (cd "$PSD_ROOT" && npm ci)
  else
    (cd "$PSD_ROOT" && npm install)
  fi
}

# ---------------------------------------------------------------------------
# Ports and readiness
# ---------------------------------------------------------------------------

# Portable TCP probe. node is already a hard dependency, so this needs no lsof/ss/nc.
port_open() {
  local port="$1"
  node -e '
    const net = require("node:net");
    const socket = net.connect({ host: "127.0.0.1", port: Number(process.argv[1]) });
    socket.setTimeout(900);
    const done = (code) => { socket.destroy(); process.exit(code); };
    socket.on("connect", () => done(0));
    socket.on("timeout", () => done(1));
    socket.on("error", () => done(1));
  ' "$port" >/dev/null 2>&1
}

http_ok() {
  local url="$1"
  node -e '
    const url = process.argv[1];
    const done = (code) => process.exit(code);
    fetch(url, { signal: AbortSignal.timeout(2000) })
      .then((res) => done(res.ok ? 0 : 1))
      .catch(() => done(1));
  ' "$url" >/dev/null 2>&1
}

# Whoever is holding a port. Three ways, because the first two are not everywhere: a slim
# Linux container often has neither lsof nor fuser (this one did not, which is how the
# --force path came to be tested properly), and macOS ships lsof but no /proc.
port_holder() {
  local port="$1" pid=''
  if command -v lsof >/dev/null 2>&1; then
    pid="$(lsof -ti "tcp:${port}" -sTCP:LISTEN 2>/dev/null | head -n 1 || true)"
  fi
  if [ -z "$pid" ] && command -v fuser >/dev/null 2>&1; then
    pid="$(fuser -n tcp "$port" 2>/dev/null | tr -d ' ' | head -n 1 || true)"
  fi
  if [ -z "$pid" ] && [ -r /proc/net/tcp ]; then
    pid="$(port_holder_from_proc "$port" || true)"
  fi
  [ -n "$pid" ] && printf '%s' "$pid"
}

# Linux only: find the listening socket's inode in /proc/net/tcp{,6}, then find the process
# holding a file descriptor onto it. Reads of other users' /proc entries fail and are skipped,
# so this answers for processes we could actually signal — which is all the callers need.
port_holder_from_proc() {
  node -e '
    const fs = require("node:fs");
    const want = Number(process.argv[1]);
    const inodes = new Set();
    for (const table of ["/proc/net/tcp", "/proc/net/tcp6"]) {
      let text = "";
      try { text = fs.readFileSync(table, "utf8"); } catch { continue; }
      for (const line of text.split("\n").slice(1)) {
        const cols = line.trim().split(/\s+/);
        if (cols.length < 10) continue;
        if (cols[3] !== "0A") continue;            // 0A = TCP LISTEN
        if (parseInt(cols[1].split(":")[1], 16) !== want) continue;
        inodes.add(cols[9]);
      }
    }
    if (inodes.size === 0) process.exit(1);
    for (const entry of fs.readdirSync("/proc")) {
      if (!/^[0-9]+$/.test(entry)) continue;
      let fds = [];
      try { fds = fs.readdirSync(`/proc/${entry}/fd`); } catch { continue; }
      for (const fd of fds) {
        let link = "";
        try { link = fs.readlinkSync(`/proc/${entry}/fd/${fd}`); } catch { continue; }
        const match = /^socket:\[(\d+)\]$/.exec(link);
        if (match && inodes.has(match[1])) { console.log(entry); process.exit(0); }
      }
    }
    process.exit(1);
  ' "$port" 2>/dev/null
}

# Poll frequently, print progress, and fail fast rather than stalling on a known-bad boot.
# AGENTS-workflow.md §4b: an oversized timeout converts a fast failure into a long wait, and
# is usually concealing something worth fixing. Override with PSD_DEV_READY_TIMEOUT.
wait_for_ready() {
  local timeout="${PSD_DEV_READY_TIMEOUT:-90}"
  local api web deadline now
  api="$(api_port)"; web="$(web_port)"
  deadline=$(($(date +%s) + timeout))
  local waited=0
  while :; do
    if http_ok "http://127.0.0.1:${api}/api/health" && port_open "$web"; then
      return 0
    fi
    # Only meaningful for a detached stack: in the foreground the caller IS the supervisor,
    # so there is no pidfile and no early exit to detect here.
    if [ -f "$PSD_PID_FILE" ] && ! stack_running; then
      return 2
    fi
    now=$(date +%s)
    if [ "$now" -ge "$deadline" ]; then
      return 1
    fi
    waited=$((waited + 1))
    if [ $((waited % 10)) -eq 0 ]; then
      info "waiting for the stack… $((deadline - now))s left (logs: ${PSD_LOG_FILE#"$PSD_ROOT"/})"
    fi
    sleep 1
  done
}

# ---------------------------------------------------------------------------
# The detached process
# ---------------------------------------------------------------------------

stack_pid() {
  [ -f "$PSD_PID_FILE" ] || return 1
  local pid
  pid="$(cat "$PSD_PID_FILE" 2>/dev/null || true)"
  [ -n "$pid" ] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  printf '%s' "$pid"
}

stack_running() {
  stack_pid >/dev/null 2>&1
}

# Remove a pidfile whose process is gone, so `status` never reports a ghost.
clear_stale_pidfile() {
  if [ -f "$PSD_PID_FILE" ] && ! stack_running; then
    rm -f "$PSD_PID_FILE" "$PSD_PGID_FILE"
  fi
}

ensure_runtime_dir() {
  mkdir -p "$PSD_RUNTIME_DIR"
}

# The database is only "fresh" when the PGlite data directory does not exist yet. That is the
# one signal available BEFORE the API boots and creates it, which is what makes it usable as
# the "should I offer to seed?" test.
dev_db_is_fresh() {
  [ ! -d "$PSD_DEV_DATA_DIR" ]
}

print_urls() {
  local api web
  api="$(api_port)"; web="$(web_port)"
  printf '\n'
  printf '  %sweb%s  http://127.0.0.1:%s\n' "$C_BOLD" "$C_OFF" "$web"
  printf '  %sapi%s  http://127.0.0.1:%s/api/health\n' "$C_BOLD" "$C_OFF" "$api"
  printf '\n'
}
