#!/bin/bash
# Turns the inert *.shiphats files active (GREENFIELD s10.3).
# Bash 3.2 compatible: no associative arrays, no mapfile, no ${var,,}.
set -eu
cd "$(dirname "$0")"

FORCE=0
KEEP=0
NON_INTERACTIVE=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --keep-inert) KEEP=1 ;;
    --non-interactive) NON_INTERACTIVE=1 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

PROJECT="${SHIPHATS_PROJECT:-}"
if [ -z "$PROJECT" ]; then
  if [ "$NON_INTERACTIVE" = "1" ]; then
    echo "SHIPHATS_PROJECT is required with --non-interactive" >&2
    exit 2
  fi
  printf 'SHIP-HATS project key: '
  read -r PROJECT
fi
if [ -z "$PROJECT" ]; then
  echo "A project key is required" >&2
  exit 2
fi

# Render every file before writing any; refuse leftovers and clobbers.
FILES=".gitlab-ci.yml.shiphats sonar-project.properties.shiphats"
for inert in $FILES; do
  active=$(echo "$inert" | sed 's/\.shiphats$//')
  if [ -e "$active" ] && [ "$FORCE" != "1" ]; then
    echo "Refusing to overwrite existing $active (use --force)" >&2
    exit 1
  fi
done
for inert in $FILES; do
  active=$(echo "$inert" | sed 's/\.shiphats$//')
  sed "s/@@SHIPHATS_PROJECT@@/$PROJECT/g" "$inert" > "$active.tmp"
  if grep -q '@@SHIPHATS_' "$active.tmp"; then
    echo "Unknown placeholder remains in $active" >&2
    rm -f "$active.tmp"
    exit 1
  fi
  mv "$active.tmp" "$active"
  echo "Activated $active"
  if [ "$KEEP" != "1" ]; then
    rm -f "$inert"
  fi
done

echo "Now set in GitLab (cannot live in files): masked CI/CD variables"
echo "SONAR_TOKEN, NEXUS credentials, COSIGN_PASSWORD, CF_LEVEL, branch"
echo "protection and code owners. See GREENFIELD s10.2."
