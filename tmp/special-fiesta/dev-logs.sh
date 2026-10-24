#!/usr/bin/env bash
# dev-logs.sh — follow the detached stack's log.
#
#   ./dev-logs.sh            follow from the last 50 lines
#   ./dev-logs.sh -n 200     follow from the last 200
#   ./dev-logs.sh --no-follow  print and exit

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_dev-common.sh"

LINES=50
FOLLOW=1

while [ $# -gt 0 ]; do
  case "$1" in
    -n | --lines)
      shift
      [ $# -gt 0 ] || die "--lines needs a number."
      LINES="$1"
      ;;
    --no-follow) FOLLOW=0 ;;
    -h | --help)
      sed -n '2,7p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) die "unknown option: $1 (try --help)" ;;
  esac
  shift
done

[ -f "$PSD_LOG_FILE" ] || die "no log yet at .dev/dev.log — start a detached stack with ./dev.sh --detach."

if [ "$FOLLOW" -eq 1 ]; then
  stack_running || warn "nothing is running; showing the log from the last run."
  exec tail -n "$LINES" -f "$PSD_LOG_FILE"
fi

exec tail -n "$LINES" "$PSD_LOG_FILE"
