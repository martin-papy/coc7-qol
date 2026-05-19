#!/usr/bin/env bash
# release.sh — interactive release driver for coc7-qol.
# See docs/superpowers/specs/2026-05-19-release-script-design.md

set -euo pipefail
IFS=$'\n\t'

# ----------------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------------

log() {
  printf '%s\n' "$*"
}

die() {
  # die <exit_code> <message...>
  local code="$1"; shift
  printf 'error: %s\n' "$*" >&2
  exit "$code"
}

prompt_yn() {
  # prompt_yn <question>  → returns 0 on y/Y, 1 otherwise
  local q="$1" ans=""
  printf '%s [y/N] ' "$q"
  read -r ans || true
  case "$ans" in
    y|Y) return 0 ;;
    *)   return 1 ;;
  esac
}

# Expects clean stable semver "X.Y.Z" — strip pre-release suffixes before calling.
# semver_cmp <a> <b>  → echoes -1, 0, or 1
semver_cmp() {
  local a="$1" b="$2"
  local a1=0 a2=0 a3=0 b1=0 b2=0 b3=0
  IFS=. read -r a1 a2 a3 <<< "$a"
  IFS=. read -r b1 b2 b3 <<< "$b"
  if (( a1 < b1 )); then echo -1; return; fi
  if (( a1 > b1 )); then echo 1;  return; fi
  if (( a2 < b2 )); then echo -1; return; fi
  if (( a2 > b2 )); then echo 1;  return; fi
  if (( a3 < b3 )); then echo -1; return; fi
  if (( a3 > b3 )); then echo 1;  return; fi
  echo 0
}

# ----------------------------------------------------------------------------
# Pre-flight checks
# ----------------------------------------------------------------------------

preflight() {
  # Tools on PATH
  for tool in git gh jq; do
    command -v "$tool" >/dev/null 2>&1 \
      || die 2 "required tool '$tool' not found on PATH"
  done

  # gh authenticated
  gh auth status >/dev/null 2>&1 \
    || die 2 "gh is not authenticated — run 'gh auth login'"

  # On main
  local branch
  branch=$(git rev-parse --abbrev-ref HEAD)
  [[ "$branch" == "main" ]] \
    || die 2 "must be on 'main' branch (currently on '$branch')"

  # Clean tree
  [[ -z "$(git status --porcelain)" ]] \
    || die 2 "working tree is not clean — commit or stash changes first"

  # Fetch and check sync with origin/main
  git fetch origin main >/dev/null \
    || die 2 "git fetch origin main failed"

  local counts behind ahead
  counts=$(git rev-list --left-right --count origin/main...HEAD)
  behind=$(printf '%s' "$counts" | awk '{print $1}')
  ahead=$(printf '%s' "$counts" | awk '{print $2}')
  if [[ "$behind" != "0" || "$ahead" != "0" ]]; then
    if [[ "$ahead" != "0" && "$behind" == "0" ]]; then
      die 2 "local main is ahead of origin/main by ${ahead} commit(s) — push first"
    elif [[ "$behind" != "0" && "$ahead" == "0" ]]; then
      die 2 "local main is behind origin/main by ${behind} commit(s) — pull first"
    else
      die 2 "local main has diverged from origin/main (ahead ${ahead}, behind ${behind}) — resolve manually"
    fi
  fi

  # develop branch exists locally
  git rev-parse --verify --quiet develop >/dev/null \
    || die 2 "local 'develop' branch not found — create it with 'git checkout -b develop origin/develop'"

  # module.json and CHANGELOG.md exist + parse
  [[ -f module.json ]]  || die 2 "module.json not found in $(pwd)"
  [[ -f CHANGELOG.md ]] || die 2 "CHANGELOG.md not found in $(pwd)"
  jq empty module.json 2>/dev/null \
    || die 2 "module.json is not valid JSON"

  log "✓ pre-flight checks passed"
}

# ----------------------------------------------------------------------------
# main
# ----------------------------------------------------------------------------

main() {
  preflight
}

main "$@"
