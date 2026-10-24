#!/bin/sh
# The API provisions the schema from the snapshot and seeds on boot (ADR-049,
# AGENTS-database.md §5 — there are no migrations), so this is just the process.
# PGLITE_DATA_DIR is absolute in the image, which makes the working directory irrelevant to
# where data lands — but /app is still required so tsx resolves workspace imports.
set -eu
cd /app
exec node_modules/.bin/tsx apps/api/src/index.ts
