#!/usr/bin/env bash
# release.sh — interactive release driver for coc7-qol.
# See docs/superpowers/specs/2026-05-19-release-script-design.md

set -euo pipefail
IFS=$'\n\t'

# Globals set by read_versions / pick_target, consumed by later phases:
#   CURRENT — stable semver from module.json (no 'v' prefix)
#   LATEST  — latest published stable release (no 'v' prefix); "0.0.0" if none
#   TARGET  — the version string that will be tagged and released

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

DOWNLOAD_URL_BASE="https://github.com/martin-papy/coc7-qol/releases/download"

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
  if [[ "$branch" == "HEAD" ]]; then
    die 2 "HEAD is detached — checkout 'main' with 'git checkout main'"
  fi
  [[ "$branch" == "main" ]] \
    || die 2 "must be on 'main' branch (currently on '$branch') — run 'git checkout main'"

  # Clean tree
  [[ -z "$(git status --porcelain)" ]] \
    || die 2 "working tree is not clean — commit or stash changes first"

  # Fetch and check sync with origin/main
  git fetch origin main >/dev/null \
    || die 2 "git fetch origin main failed"

  local counts behind ahead
  counts=$(git rev-list --left-right --count origin/main...HEAD) \
    || die 2 "could not compare origin/main and HEAD — ensure 'origin' remote is set correctly"
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
    || die 2 "module.json is not valid JSON — run 'jq . module.json' to see the parse error"

  log "✓ pre-flight checks passed"
}

# ----------------------------------------------------------------------------
# Version decision
# ----------------------------------------------------------------------------

# Sets CURRENT and LATEST (no 'v' prefix).
read_versions() {
  CURRENT=$(jq -r '.version' module.json)
  [[ "$CURRENT" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] \
    || die 2 "module.json version '$CURRENT' is not stable semver X.Y.Z"

  LATEST=$(gh release list --limit 50 --json tagName,isDraft,isPrerelease \
    | jq -r '[.[] | select(.isDraft|not) | select(.isPrerelease|not) | .tagName]
             | map(select(test("^v[0-9]+\\.[0-9]+\\.[0-9]+$")))
             | .[0] // "v0.0.0"' \
    | sed 's/^v//')
}

# Sets TARGET.
pick_target() {
  local cmp
  cmp=$(semver_cmp "$CURRENT" "$LATEST")

  log "Current module.json version: $CURRENT"
  log "Latest released:             $LATEST"
  log ""

  if [[ "$cmp" == "1" ]]; then
    # Branch B — user pre-bumped.
    prompt_yn "Release v${CURRENT}?" \
      || die 1 "aborted by user"
    TARGET="$CURRENT"
    return
  fi

  # Branch A — needs bump.
  local maj min patch
  IFS=. read -r maj min patch <<< "$CURRENT"
  local next_patch="${maj}.${min}.$((patch + 1))"
  local next_minor="${maj}.$((min + 1)).0"
  local next_major="$((maj + 1)).0.0"

  log "The version needs to be bumped."
  log ""
  log "Bump which?"
  log "  [P]atch  → ${next_patch}"
  log "  [M]inor  → ${next_minor}"
  log "  m[A]jor  → ${next_major}"
  log "  [Q]uit"

  local ans=""
  while true; do
    printf '> '
    read -r ans || die 1 "aborted (EOF on stdin)"
    case "$ans" in
      p|P) TARGET="$next_patch"; return ;;
      m|M) TARGET="$next_minor"; return ;;
      a|A) TARGET="$next_major"; return ;;
      q|Q) die 1 "aborted by user" ;;
      *)   log "Please answer P, M, A, or Q." ;;
    esac
  done
}

# ----------------------------------------------------------------------------
# CHANGELOG validation
# ----------------------------------------------------------------------------

changelog_check() {
  # Escape dots in TARGET so they're literal in the regex.
  local pattern
  pattern="^## \[${TARGET//./\\.}\] - [0-9]{4}-[0-9]{2}-[0-9]{2}( |$)"

  local count
  count=$(grep -cE "$pattern" CHANGELOG.md || true)

  case "$count" in
    0) die 3 "CHANGELOG.md is missing an entry for v${TARGET}. Add a section \"## [${TARGET}] - YYYY-MM-DD\" before releasing." ;;
    1) log "✓ CHANGELOG entry for v${TARGET} found" ;;
    *) die 3 "CHANGELOG.md has duplicate entries for v${TARGET} (found $count)." ;;
  esac
}

# ----------------------------------------------------------------------------
# Plan summary and confirmation
# ----------------------------------------------------------------------------

plan_summary() {
  local download_url="${DOWNLOAD_URL_BASE}/v${TARGET}/coc7-qol.zip"

  log ""
  log "Plan for v${TARGET}:"
  log "  • Update module.json: version ${CURRENT} → ${TARGET} (if not already)"
  log "  • Update module.json: download URL → ${download_url} (if not already)"
  log "  • Commit + push origin main  (skipped if module.json is already up to date)"
  log "  • Tag v${TARGET} at HEAD and push the tag"
  log "  • GitHub Actions release workflow will fire on the tag"
  log "  • Switch to develop, merge main, push origin develop, end on develop"
  log ""

  prompt_yn "Proceed?" \
    || die 1 "aborted by user"
}

# ----------------------------------------------------------------------------
# main
# ----------------------------------------------------------------------------

main() {
  preflight
  read_versions
  pick_target
  changelog_check
  plan_summary
  log ""
  log "DEBUG: would now execute release for v${TARGET}"
}

main "$@"
