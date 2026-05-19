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
# main
# ----------------------------------------------------------------------------

main() {
  log "release.sh: scaffold only — no phases wired yet."
}

main "$@"
