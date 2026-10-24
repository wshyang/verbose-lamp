#!/bin/bash
# One-command local environment (GREENFIELD s9). Bash 3.2 compatible.
set -eu
cd "$(dirname "$0")"
if [ ! -d node_modules ]; then
  npm install --ignore-scripts
fi
npm run build
PORT="${PORT:-3000}"
export PORT
echo "Tournament Engine on http://0.0.0.0:${PORT} (API under /api)"
exec npm start
