#!/usr/bin/env bash
# verify.sh — the merge gate: typecheck + lint + standards + web build + both test suites.
#
#   ./verify.sh              the whole gate, in one run
#   ./verify.sh --fast       skip the web build (iterating; NOT the gate)
#   ./verify.sh --e2e        add the Playwright suite afterwards
#
# `npm run verify` must pass before any commit (AGENTS-workflow.md §4, AGENTS.md §6). This
# wrapper exists to make running the WHOLE gate as easy as running one quarter of it: running
# the quarters individually is exactly how the missing quarter goes unnoticed for weeks
# (AGENTS-testing.md §1.1). It reports every stage, and it names the layers that actually ran
# so the commit message can be honest about them (AGENTS-workflow.md §4).

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_dev-common.sh"

FAST=0
WITH_E2E=0

while [ $# -gt 0 ]; do
  case "$1" in
    --fast) FAST=1 ;;
    --e2e) WITH_E2E=1 ;;
    -h | --help)
      sed -n '2,13p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) die "unknown option: $1 (try --help)" ;;
  esac
  shift
done

cd "$PSD_ROOT"
ensure_node
ensure_deps

RAN=()
FAILED=()

ensure_runtime_dir

# Every stage is teed to its own log. A gate that only reports "web tests FAILED" throws away
# the one thing you need when the failure is intermittent — which is how a flake here cost a
# re-run to identify. The log survives the run; the summary points at it.
stage() {
  local label="$1"
  shift
  local slug log started elapsed status
  slug="$(printf '%s' "$label" | tr ' ' '-')"
  log="$PSD_RUNTIME_DIR/verify-$slug.log"
  printf '\n%s── %s %s%s\n' "$C_BOLD" "$label" "$(printf '─%.0s' $(seq 1 $((60 - ${#label}))))" "$C_OFF"
  started=$(date +%s)
  set +e
  "$@" 2>&1 | tee "$log"
  status="${PIPESTATUS[0]}"
  set -e
  elapsed=$(($(date +%s) - started))
  if [ "$status" -eq 0 ]; then
    good "$label passed (${elapsed}s)"
    RAN+=("$label")
    return
  fi
  warn "$label FAILED (${elapsed}s) — full output: ${log#"$PSD_ROOT"/}"
  # The failing test names, pulled out of the noise so an intermittent failure is identifiable
  # from the summary alone rather than needing the whole run again.
  grep -E '^ *(×|✗|FAIL|AssertionError)' "$log" | head -n 15 >&2 || true
  FAILED+=("$label")
}

stage "typecheck" npm run --silent typecheck
stage "lint" npm run --silent lint
stage "standards" npm run --silent standards
if [ "$FAST" -eq 0 ]; then
  stage "web build" npm run --silent build:web
else
  warn "--fast: skipping the web build. This is NOT the merge gate."
fi
# ADR-292 — the engine has its own suite and coverage floor; `npm test` ran it and this gate did not.
stage "tournament tests" npm run --silent test:tournament
stage "api tests" npm run --silent test:api
stage "web tests" npm run --silent test:web

if [ "$WITH_E2E" -eq 1 ]; then
  if stack_running || port_open "$(web_port)"; then
    stage "e2e" npm run --silent test:e2e
  else
    warn "e2e asked for, but nothing is serving $(web_port). Start one with ./dev.sh --detach."
    FAILED+=("e2e (not run)")
  fi
fi

printf '\n%ssummary%s\n' "$C_BOLD" "$C_OFF"
for name in "${RAN[@]:-}"; do [ -n "$name" ] && printf '  %s✓%s %s\n' "$C_GREEN" "$C_OFF" "$name"; done
for name in "${FAILED[@]:-}"; do [ -n "$name" ] && printf '  %s✗%s %s\n' "$C_RED" "$C_OFF" "$name"; done

if [ "${#FAILED[@]}" -gt 0 ]; then
  printf '\n'
  die "the gate is red. Do not commit on top of this."
fi

printf '\n'
if [ "$WITH_E2E" -eq 1 ]; then
  good "full gate green, Playwright included."
else
  good "gate green. Playwright was NOT run — say so in the commit message (AGENTS-workflow.md §4)."
fi
