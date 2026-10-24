#!/bin/bash
# Activate the inert SHIP-HATS files (CLAUDE §10.3): renders every *.shiphats
# file to its active name with @@SHIPHATS_*@@ placeholders substituted.
# Bash 3.2 compatible (no associative arrays / mapfile / case substitution).
# Usage: ./activate-shiphats.sh [--force] [--keep-inert] [--non-interactive]
# Non-interactive values come from SHIPHATS_* environment variables.
set -eu

FORCE=0
KEEP_INERT=0
NON_INTERACTIVE=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --keep-inert) KEEP_INERT=1 ;;
    --non-interactive) NON_INTERACTIVE=1 ;;
    *) echo "Unknown argument: $arg" >&2; exit 2 ;;
  esac
done

ask_value() {
  # $1 = variable name, $2 = prompt, $3 = default
  eval "current=\${$1:-}"
  if [ -n "$current" ]; then printf '%s' "$current"; return; fi
  if [ "$NON_INTERACTIVE" = "1" ]; then printf '%s' "$3"; return; fi
  printf '%s [%s]: ' "$2" "$3" >&2
  read -r reply || reply=""
  if [ -n "$reply" ]; then printf '%s' "$reply"; else printf '%s' "$3"; fi
}

PROJECT=$(ask_value SHIPHATS_PROJECT "Project name" "kallang-active-day")
TEMPLATES_REF=$(ask_value SHIPHATS_TEMPLATES_REF "SHIP-HATS templates release tag" "v1.1.12")
SONAR_KEY=$(ask_value SHIPHATS_SONAR_PROJECTKEY "SonarQube project key" "$PROJECT")
CODEOWNER=$(ask_value SHIPHATS_CODEOWNER "CODEOWNERS owner (e.g. @group/team)" "@group/$PROJECT")

render_one() {
  src="$1"
  dest=$(printf '%s' "$src" | sed 's/\.shiphats$//')
  if [ -e "$dest" ] && [ "$FORCE" != "1" ]; then
    echo "Refusing to overwrite existing file: $dest (use --force)" >&2
    exit 1
  fi
  rendered=$(sed \
    -e "s|@@SHIPHATS_PROJECT@@|$PROJECT|g" \
    -e "s|@@SHIPHATS_TEMPLATES_REF@@|$TEMPLATES_REF|g" \
    -e "s|@@SHIPHATS_SONAR_PROJECTKEY@@|$SONAR_KEY|g" \
    -e "s|@@SHIPHATS_CODEOWNER@@|$CODEOWNER|g" "$src")
  if printf '%s' "$rendered" | grep -q '@@SHIPHATS_'; then
    echo "Unresolved placeholder left in $src" >&2
    exit 1
  fi
  mkdir -p "$(dirname "$dest")"
  printf '%s\n' "$rendered" > "$dest"
  echo "activated: $dest"
  if [ "$KEEP_INERT" != "1" ]; then rm -f "$src"; fi
}

INERT_FILES=$(find . -name '*.shiphats' -not -path './node_modules/*' | sort)
if [ -z "$INERT_FILES" ]; then echo "No *.shiphats files found."; exit 0; fi
OLDIFS=$IFS; IFS='
'
for file in $INERT_FILES; do render_one "$file"; done
IFS=$OLDIFS

cat <<'NOTE'

GitLab settings that cannot live in files — set these in the project:
- CI/CD variables (masked): SONAR_TOKEN, NEXUS_IQ_USERNAME/PASSWORD,
  COSIGN_PASSWORD, FOD_PAT; plain: CF_LEVEL, SONAR_PROJECTKEY, NEXUS_IQ_APP_ID.
- Apply the WOG compliance framework (Pipeline Execution Policy).
- Protect the default branch; code owners; owners manage MR approval rules.
- Pull packages/images via the Nexus proxies (npm-proxy, docker proxies).
NOTE
