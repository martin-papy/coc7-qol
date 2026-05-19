# release.sh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single interactive `release.sh` script that drives the full FoundryVTT release of `coc7-qol` from the `main` branch — version decision, CHANGELOG validation, `module.json` bump, push, tag, push tag, and merge-back to `develop`.

**Architecture:** One self-contained bash script at the repo root, built incrementally as a pipeline of small functions called from `main()`. Each function performs one phase and either exits with a clear error or returns to let `main()` proceed. No new runtime dependencies beyond `git`, `gh`, and `jq` (already used by the project). No automated tests — verification is done by running the script itself and confirming behavior at each phase, with one end-to-end smoke test against a throwaway clone.

**Tech Stack:** `bash` (must work on macOS bash 3.2), `git`, `gh` CLI, `jq`. Spec: [docs/superpowers/specs/2026-05-19-release-script-design.md](../specs/2026-05-19-release-script-design.md).

---

## File Structure

- **Create:** `release.sh` — the script itself, executable, repo root.
- **Modify:** `CLAUDE.md` — replace the manual "Standard flow" in the `## Releasing` section with a reference to `./release.sh` and keep the manual fallback below.

The script is internally organized as:

```
release.sh
├── shebang + safety flags
├── helpers          (log, die, prompt_yn, semver_cmp)
├── preflight        (tools, branch, tree, sync, files)
├── read_versions    (CURRENT from module.json, LATEST from gh)
├── pick_target      (branch A bump menu / branch B confirm)
├── changelog_check  (grep for header line)
├── plan_summary     (print + confirm)
├── execute_release  (jq edit, no-op detect, commit, push, tag, push tag)
├── merge_back       (checkout develop, sync, merge main, push)
└── main             (orchestrates all of the above)
```

---

## Task 1: Scaffold release.sh with helpers and main() stub

**Files:**
- Create: `release.sh`

- [ ] **Step 1: Create the scaffold**

Create `release.sh` with the shebang, safety flags, helper functions, and an empty `main()` that immediately exits 0.

```bash
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

# semver_cmp <a> <b>  → echoes -1, 0, or 1
semver_cmp() {
  local a="$1" b="$2"
  local a1 a2 a3 b1 b2 b3
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
```

- [ ] **Step 2: Make the script executable**

Run: `chmod +x release.sh`
Expected: no output.

- [ ] **Step 3: Syntax check**

Run: `bash -n release.sh`
Expected: no output (exit 0).

- [ ] **Step 4: Smoke run**

Run: `./release.sh`
Expected stdout:
```
release.sh: scaffold only — no phases wired yet.
```
Expected exit code: `0` (check with `echo $?`).

- [ ] **Step 5: Commit**

```bash
git add release.sh
git commit -m "feat: scaffold release.sh with helpers"
```

---

## Task 2: Pre-flight checks

**Files:**
- Modify: `release.sh` (add `preflight` function; call from `main`)

- [ ] **Step 1: Add the preflight function**

Insert `preflight()` after the helpers block and before `main()`:

```bash
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
```

- [ ] **Step 2: Wire preflight into main**

Replace the body of `main()`:

```bash
main() {
  preflight
}
```

- [ ] **Step 3: Syntax check**

Run: `bash -n release.sh`
Expected: no output.

- [ ] **Step 4: Run preflight on the actual repo**

Run: `./release.sh`
Expected stdout:
```
✓ pre-flight checks passed
```
Expected exit code: `0`.

- [ ] **Step 5: Test a failure path (wrong branch)**

Run:
```bash
git checkout develop
./release.sh; echo "exit=$?"
git checkout main
```
Expected stderr contains: `must be on 'main' branch (currently on 'develop')`
Expected: `exit=2`

- [ ] **Step 6: Test another failure path (dirty tree)**

Run:
```bash
echo "scratch" > ./.scratch
./release.sh; echo "exit=$?"
rm ./.scratch
```
Expected stderr contains: `working tree is not clean`
Expected: `exit=2`

- [ ] **Step 7: Commit**

```bash
git add release.sh
git commit -m "feat: add pre-flight checks to release.sh"
```

---

## Task 3: Read versions and pick the target

**Files:**
- Modify: `release.sh` (add `read_versions`, `pick_target`; call from `main`)

- [ ] **Step 1: Add read_versions and pick_target functions**

Insert after `preflight()`:

```bash
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
    read -r ans || true
    case "$ans" in
      p|P) TARGET="$next_patch"; return ;;
      m|M) TARGET="$next_minor"; return ;;
      a|A) TARGET="$next_major"; return ;;
      q|Q) die 1 "aborted by user" ;;
      *)   log "Please answer P, M, A, or Q." ;;
    esac
  done
}
```

- [ ] **Step 2: Wire into main**

Replace `main()`:

```bash
main() {
  preflight
  read_versions
  pick_target
  log ""
  log "DEBUG: TARGET=$TARGET"
}
```

> The `DEBUG: TARGET=...` line is temporary — Task 4 replaces the body again.

- [ ] **Step 3: Syntax check**

Run: `bash -n release.sh`
Expected: no output.

- [ ] **Step 4: Run and bump as Patch**

Run: `./release.sh` and answer `P`.
Expected (assuming current `module.json` has `"version": "0.4.6"` and latest GitHub release is `v0.4.6`):
```
✓ pre-flight checks passed
Current module.json version: 0.4.6
Latest released:             0.4.6

The version needs to be bumped.

Bump which?
  [P]atch  → 0.4.7
  [M]inor  → 0.5.0
  m[A]jor  → 1.0.0
  [Q]uit
> P

DEBUG: TARGET=0.4.7
```
Expected exit code: `0`.

- [ ] **Step 5: Run and bump as Minor**

Run: `./release.sh` and answer `M`.
Expected: `DEBUG: TARGET=0.5.0`

- [ ] **Step 6: Run and quit at the prompt**

Run: `./release.sh` and answer `Q`.
Expected stderr: `aborted by user`
Expected exit code: `1`.

- [ ] **Step 7: Commit**

```bash
git add release.sh
git commit -m "feat: add version reading and bump prompt to release.sh"
```

---

## Task 4: CHANGELOG validation

**Files:**
- Modify: `release.sh` (add `changelog_check`; call from `main`)

- [ ] **Step 1: Add changelog_check function**

Insert after `pick_target`:

```bash
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
```

- [ ] **Step 2: Wire into main**

Replace `main()`:

```bash
main() {
  preflight
  read_versions
  pick_target
  changelog_check
  log ""
  log "DEBUG: TARGET=$TARGET (changelog ok)"
}
```

- [ ] **Step 3: Syntax check**

Run: `bash -n release.sh`
Expected: no output.

- [ ] **Step 4: Failing case — pick a version with no CHANGELOG entry**

Run: `./release.sh` and bump as `A` (major → `1.0.0`, almost certainly not in CHANGELOG).
Expected stderr contains: `CHANGELOG.md is missing an entry for v1.0.0`
Expected exit code: `3`.

- [ ] **Step 5: Passing case — add a temporary entry**

```bash
# Prepend a temporary entry to CHANGELOG.md
{ printf '## [1.0.0] - 2026-05-19\n\ntest entry\n\n'; cat CHANGELOG.md; } > CHANGELOG.md.new \
  && mv CHANGELOG.md.new CHANGELOG.md
./release.sh   # answer A for major bump
# revert the test edit
git checkout CHANGELOG.md
```

Expected stdout includes: `✓ CHANGELOG entry for v1.0.0 found`
Expected: `DEBUG: TARGET=1.0.0 (changelog ok)`
Expected exit code: `0`.

- [ ] **Step 6: Commit**

```bash
git add release.sh
git commit -m "feat: add CHANGELOG validation to release.sh"
```

---

## Task 5: Plan summary and final confirmation

**Files:**
- Modify: `release.sh` (add `plan_summary`; call from `main`)

- [ ] **Step 1: Add plan_summary function**

Insert after `changelog_check`. Define `DOWNLOAD_URL_BASE` as a top-level constant just below the helpers section (after `semver_cmp`):

```bash
# Top-level constant — place near the top of the script, after semver_cmp.
DOWNLOAD_URL_BASE="https://github.com/martin-papy/coc7-qol/releases/download"
```

Then add the function:

```bash
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
```

- [ ] **Step 2: Wire into main**

Replace `main()`:

```bash
main() {
  preflight
  read_versions
  pick_target
  changelog_check
  plan_summary
  log ""
  log "DEBUG: would now execute release for v${TARGET}"
}
```

- [ ] **Step 3: Syntax check**

Run: `bash -n release.sh`
Expected: no output.

- [ ] **Step 4: Run and decline at the prompt**

Add a temporary CHANGELOG entry as in Task 4 Step 5, then:

Run: `./release.sh` → answer `A` for major → answer `n` at "Proceed?".
Expected stderr: `aborted by user`
Expected exit code: `1`
Revert: `git checkout CHANGELOG.md`

- [ ] **Step 5: Run and accept at the prompt (no destructive code yet)**

Re-add the temp CHANGELOG entry, run `./release.sh` and answer `A`, then `y`.
Expected stdout ends with: `DEBUG: would now execute release for v1.0.0`
Expected exit code: `0`.
Revert: `git checkout CHANGELOG.md`

- [ ] **Step 6: Commit**

```bash
git add release.sh
git commit -m "feat: add plan summary and confirmation to release.sh"
```

---

## Task 6: Execute the release

**Files:**
- Modify: `release.sh` (add `execute_release`; call from `main`)

- [ ] **Step 1: Add execute_release function**

Insert after `plan_summary`:

```bash
# ----------------------------------------------------------------------------
# Execute release
# ----------------------------------------------------------------------------

execute_release() {
  local download_url="${DOWNLOAD_URL_BASE}/v${TARGET}/coc7-qol.zip"

  # 1. Edit module.json
  jq --arg v "$TARGET" --arg dl "$download_url" \
     '.version = $v | .download = $dl' module.json > module.json.tmp \
     && mv module.json.tmp module.json \
     || die 4 "module.json edit failed — no changes committed."

  # 2. No-op detection: skip commit/push if jq produced no diff
  if git diff --quiet module.json; then
    log "module.json already up to date; skipping main commit."
  else
    # 3. Commit
    git add module.json
    git commit -m "chore: release v${TARGET}" \
      || die 4 "commit failed — inspect with 'git status' and run 'git restore --staged module.json && git checkout -- module.json' to reset."

    # 4. Push main
    git push origin main \
      || die 4 "push rejected — remote moved. Reset with 'git reset --hard HEAD~1' and re-run release.sh."
  fi

  # 5. Create tag
  if git rev-parse --verify --quiet "refs/tags/v${TARGET}" >/dev/null; then
    die 4 "local tag v${TARGET} already exists — delete with 'git tag -d v${TARGET}' before retrying."
  fi
  git tag "v${TARGET}" \
    || die 4 "git tag v${TARGET} failed."

  # 6. Push tag
  git push origin "v${TARGET}" \
    || die 4 "tag push failed — delete local tag with 'git tag -d v${TARGET}' and investigate (the main branch push has already landed)."

  log "✓ v${TARGET} tagged and pushed"
}
```

- [ ] **Step 2: Wire into main**

Replace `main()`:

```bash
main() {
  preflight
  read_versions
  pick_target
  changelog_check
  plan_summary
  execute_release
  log ""
  log "DEBUG: release pushed; merge-back not implemented yet"
}
```

- [ ] **Step 3: Syntax check**

Run: `bash -n release.sh`
Expected: no output.

- [ ] **Step 4: Dry-run via abort at confirmation (no real release)**

Run: `./release.sh`. If the current `module.json` version's matching CHANGELOG entry doesn't exist for any of Patch/Minor/Major, temporarily add an entry per Task 4 Step 5 first. Walk through the prompts and answer `n` at "Proceed?".
Then verify no changes:

```bash
git status
```

Expected: clean tree, no new tag. Revert any temp CHANGELOG edit with `git checkout CHANGELOG.md`.

- [ ] **Step 5: Commit**

```bash
git add release.sh
git commit -m "feat: add release execution to release.sh"
```

---

## Task 7: Merge-back to develop and switch

**Files:**
- Modify: `release.sh` (add `merge_back`; call from `main`; finalize success message)

- [ ] **Step 1: Add merge_back function**

Insert after `execute_release`:

```bash
# ----------------------------------------------------------------------------
# Merge-back to develop
# ----------------------------------------------------------------------------

# Step 8 failures use exit 4 but message that the release itself succeeded.
merge_back() {
  git checkout develop \
    || die 4 "release succeeded but 'git checkout develop' failed. Manually run: git checkout develop && git merge main && git push origin develop"

  git fetch origin develop >/dev/null \
    || die 4 "release succeeded but 'git fetch origin develop' failed. Manually run: git pull --ff-only origin develop && git merge main && git push origin develop"

  # Sync local develop with origin/develop. Ahead is fine (push will publish), diverged is fatal.
  local counts behind ahead
  counts=$(git rev-list --left-right --count origin/develop...HEAD)
  behind=$(printf '%s' "$counts" | awk '{print $1}')
  ahead=$(printf '%s' "$counts" | awk '{print $2}')
  if [[ "$behind" != "0" && "$ahead" == "0" ]]; then
    git merge --ff-only origin/develop \
      || die 4 "release succeeded but fast-forward of develop from origin/develop failed. Manually run: git pull --ff-only origin develop && git merge main && git push origin develop"
  elif [[ "$behind" != "0" && "$ahead" != "0" ]]; then
    die 4 "release succeeded but local develop has diverged from origin/develop (ahead ${ahead}, behind ${behind}). Resolve manually, then run: git merge main && git push origin develop"
  fi

  git merge --no-edit main \
    || die 4 "release succeeded but merging main into develop produced conflicts. Resolve them, then run: git push origin develop"

  git push origin develop \
    || die 4 "release succeeded and main↔develop merged locally, but 'git push origin develop' failed. Manually run: git push origin develop"

  log "✓ develop synced with main"
}
```

- [ ] **Step 2: Wire into main and finalize success message**

Replace `main()`:

```bash
main() {
  preflight
  read_versions
  pick_target
  changelog_check
  plan_summary
  execute_release
  merge_back

  log ""
  log "v${TARGET} released."
  log "Now on develop, synced with main."
  log "Actions: https://github.com/martin-papy/coc7-qol/actions"
  log "Release (when workflow finishes): https://github.com/martin-papy/coc7-qol/releases/tag/v${TARGET}"
}
```

- [ ] **Step 3: Syntax check**

Run: `bash -n release.sh`
Expected: no output.

- [ ] **Step 4: Dry-run via abort at confirmation (still no real release)**

Run: `./release.sh` → walk to "Proceed?" → answer `n`.
Expected exit code: `1` (aborted before any destructive step).
Verify clean tree and no new tags via `git status` and `git tag --list 'v*'`.

- [ ] **Step 5: Commit**

```bash
git add release.sh
git commit -m "feat: add develop merge-back to release.sh"
```

---

## Task 8: End-to-end smoke test in a throwaway clone

**Files:** (no edits — verification only)

This task runs the full happy path against a throwaway clone whose `origin` points back at the working repo. A real tag is created locally and on the working repo (the clone's origin), but **nothing is pushed to GitHub** — `origin` is a local path. After the test, the smoke artifacts are cleaned out of the working repo.

- [ ] **Step 1: Set up a throwaway clone**

In a fresh shell, outside the project worktree:

```bash
cd /tmp
rm -rf coc7-qol-release-smoke
git clone /Users/martin.papy/Development/coc7-qol coc7-qol-release-smoke
cd coc7-qol-release-smoke
git remote -v
```

Confirm `origin` points at the local working-repo path (it does by default after `git clone <local-path>`).

- [ ] **Step 2: Bring develop into the clone**

```bash
git fetch origin develop:develop
git checkout main
```

- [ ] **Step 3: Add a temporary CHANGELOG entry for the smoke version**

Pick a version far from current so the bump options can reach it. For a current of `0.4.6`, the `A` option lands on `1.0.0` — use that:

```bash
SMOKE=1.0.0
{ printf '## [%s] - 2026-05-19\n\nsmoke test\n\n' "$SMOKE"; cat CHANGELOG.md; } > CHANGELOG.md.new \
  && mv CHANGELOG.md.new CHANGELOG.md
git add CHANGELOG.md
git commit -m "chore: smoke test changelog entry for $SMOKE"
```

> Note: the script's preflight requires `origin/main` to be in sync with local `main`. Because this commit is local, the preflight will refuse with "local main is ahead of origin/main". Push it back to origin (= the working repo) first:
>
> ```bash
> git push origin main
> ```
>
> The working repo will receive this commit on its `main` branch — that's fine because it gets cleaned up in step 6.

- [ ] **Step 4: Run release.sh and accept**

```bash
./release.sh
```

Answer `A` for major bump (lands on `1.0.0`), then `y` at "Proceed?".

Expected behavior:
1. Preflight passes.
2. Plan summary shows the target version.
3. `module.json` is edited.
4. A `chore: release v1.0.0` commit lands on `main`.
5. `main` is pushed (back to the working repo).
6. Tag `v1.0.0` is created and pushed.
7. Script checks out `develop`, merges `main`, pushes `develop`.
8. Script ends on `develop`.

- [ ] **Step 5: Verify final state**

In the clone:

```bash
git rev-parse --abbrev-ref HEAD  # → develop
git log --oneline -5             # release commit reachable
git tag --list 'v*'              # smoke tag exists locally
```

In the source working repo:

```bash
cd /Users/martin.papy/Development/coc7-qol
git fetch
git tag --list 'v1.0.0'          # should print v1.0.0
git log --oneline -5 main        # smoke commits present on main
git log --oneline -5 develop     # smoke commits present on develop
```

- [ ] **Step 6: Clean up the smoke artifacts from the working repo**

```bash
cd /Users/martin.papy/Development/coc7-qol

# Delete the smoke tag
git tag -d v1.0.0

# Reset main and develop back to their pre-smoke commits. Determine the safe target:
git log --oneline main | head -10
# Identify the commit hash that was the tip of main BEFORE the smoke test (the commit
# whose subject is NOT "chore: smoke test changelog entry for 1.0.0" and NOT
# "chore: release v1.0.0"). Call that <SAFE_MAIN>.

git checkout main
git reset --hard <SAFE_MAIN>

# Same for develop:
git log --oneline develop | head -10
# Identify the develop commit BEFORE the merge-back. Call that <SAFE_DEVELOP>.
git checkout develop
git reset --hard <SAFE_DEVELOP>

# Return to whichever branch you started on.
```

> If this clean-up feels risky, an alternative is to skip step 3's `git push origin main` entirely and run the smoke test against a clone with a remote that points at a GitHub fork instead of the local working repo. The clone-pointing-at-working-repo approach is faster for a one-off smoke; the fork approach is safer for repeated testing.

- [ ] **Step 7: Remove the throwaway clone**

```bash
rm -rf /tmp/coc7-qol-release-smoke
```

- [ ] **Step 8: No code commit for this task**

This task is verification-only. If the smoke test surfaced a bug, fix it in a follow-up commit on the appropriate earlier task's code.

---

## Task 9: Update CLAUDE.md to reference release.sh

**Files:**
- Modify: `CLAUDE.md` (`## Releasing` section)

- [ ] **Step 1: Replace the "Standard flow" subsection**

Open `CLAUDE.md`, find the section starting with `### Standard flow` under `## Releasing`, and replace its body (steps 1–5) with:

```markdown
### Standard flow

From the `main` branch, run:

    ./release.sh

The script handles version selection, `module.json` edits, the release commit, tag creation, push, and the merge-back to `develop`. It validates that `CHANGELOG.md` already has a `## [X.Y.Z] - YYYY-MM-DD` entry for the target version and aborts cleanly if not.

End state: you are on `develop`, fully synced with `main`. The GitHub Actions release workflow runs from the pushed tag and submits to FoundryVTT.

See [docs/superpowers/specs/2026-05-19-release-script-design.md](docs/superpowers/specs/2026-05-19-release-script-design.md) for the full design and [docs/superpowers/plans/2026-05-19-release-script.md](docs/superpowers/plans/2026-05-19-release-script.md) for the implementation breakdown.
```

- [ ] **Step 2: Keep the "Manual fallback" subsection as-is**

Verify the existing `### Manual fallback` subsection remains below — it's still the documented escape hatch when the script breaks.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: point release flow at release.sh"
```

---

## Self-Review Checklist

**Spec coverage:**

| Spec section | Covered by |
| --- | --- |
| Step 1 — Pre-flight | Task 2 |
| Step 2 — Read current version | Task 3 (`read_versions`) |
| Step 3 — Read latest released | Task 3 (`read_versions`) |
| Step 4 — Target decision (branches A/B) | Task 3 (`pick_target`) |
| Step 5 — CHANGELOG validation | Task 4 |
| Step 6 — Plan summary + confirm | Task 5 |
| Step 7 — Execute release (with no-op detection) | Task 6 |
| Step 8 — Merge-back to develop | Task 7 |
| Exit codes 0–4 | All `die` calls use the codes deliberately |
| Smoke test (testing strategy item 2) | Task 8 |
| Failure-path spot checks (testing strategy item 3) | Task 2 steps 5–6 (branch + dirty tree); Task 4 step 4 (missing CHANGELOG); other failure paths surface naturally during Task 8 |
| Documentation update | Task 9 |

**Placeholder scan:** No `TBD`, no `implement later`, no `appropriate error handling`. Every code-bearing step shows complete code; every command step shows the exact command and expected output or exit code.

**Type/name consistency:** `CURRENT`, `LATEST`, `TARGET`, `DOWNLOAD_URL_BASE` used identically across Tasks 3, 4, 5, 6, 7. Function names (`preflight`, `read_versions`, `pick_target`, `changelog_check`, `plan_summary`, `execute_release`, `merge_back`) are consistent between their definition tasks and their wiring in `main()`.
