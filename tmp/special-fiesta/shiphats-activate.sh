#!/usr/bin/env bash
# shiphats-activate.sh — turn the inert SHIP-HATS pipeline files into live ones.
#
#   ./shiphats-activate.sh                     answer each question (Enter takes the default)
#   ./shiphats-activate.sh --defaults          accept every default, no questions
#   ./shiphats-activate.sh --dry-run           compute everything, write nothing
#   ./shiphats-activate.sh --answers a.json    non-interactive, values from a JSON object
#   ./shiphats-activate.sh --revert            delete the live files, back to inert
#
# Needs bash and node 20.11+ and nothing else: no npm install, no network. That is what makes
# it usable on a remote host that has a clone and a node binary but no toolchain.
#
# What the four files are, and which of their contents still has to be confirmed after
# onboarding, is in docs/design/ship-hats-pipeline.md.
set -euo pipefail

PSD_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$PSD_ROOT/scripts/ship-hats-activate.mjs" "$@"
