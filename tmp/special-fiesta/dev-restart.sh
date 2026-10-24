#!/usr/bin/env bash
# dev-restart.sh — stop a detached stack and start it again, passing through any ./dev.sh flags.
#
#   ./dev-restart.sh                 restart detached
#   ./dev-restart.sh --reset --seed  wipe the database, restart, reseed

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_dev-common.sh"

cd "$PSD_ROOT"

"$PSD_ROOT/dev-stop.sh"

# Always detached: restarting into the foreground would be a different command wearing the
# same name, and the thing being restarted was a background stack.
exec "$PSD_ROOT/dev.sh" --detach "$@"
