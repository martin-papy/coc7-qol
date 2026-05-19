# release.sh — interactive release helper

**Status:** Draft
**Date:** 2026-05-19
**Owner:** Martin Papy

## Goal

Provide a single `./release.sh` entry point that drives the full release of `coc7-qol` from the `main` branch: pick the next version, validate the `CHANGELOG.md`, bump `module.json`, commit, push `main`, then create and push the `vX.Y.Z` tag that triggers `.github/workflows/release.yml`.

The script replaces the manual checklist in `CLAUDE.md` § Releasing and reduces a five-step process to one command with explicit confirmations.

## Non-goals

- Pre-release tags (`vX.Y.Z-beta.N`, `-rc.N`). The bump menu offers stable releases only. Pre-releases can still be produced by editing `module.json` manually first; the script's "current > latest" branch will then ask for confirmation on whatever value is in the file, provided it matches stable semver. Non-stable strings are rejected — see Step 2.
- Editing `CHANGELOG.md`. The script verifies an entry exists; the user writes it.
- Rolling back side effects on failure. The script aborts and prints the specific cleanup command.
- Submitting the release to foundryvtt.com. The existing GitHub Actions workflow already handles that.

## Constraints

- Targets macOS and Linux. Must work with the default macOS bash 3.2 (no `mapfile`, no `${var^^}`).
- Depends only on tools already used by the project: `git`, `gh`, `jq`. No new runtime dependencies.
- Idempotent on the safe side: if a step fails, re-running after manual cleanup must work.

## High-level flow

```
1. Pre-flight checks      → fail fast (exit 2)
2. Read current version   ← module.json
3. Read latest released   ← gh release list
4. Decide target version  → prompt branch A (bump) or B (confirm)
5. Validate CHANGELOG     → fail fast (exit 3)
6. Plan summary + confirm → user types y to proceed
7. Execute release        → bump module.json (if needed), commit/push main, tag, push tag
8. Merge-back to develop  → checkout develop, merge main, push develop, end on develop
```

The script ends on `develop` with `main` merged in. Steps 7 and 8 use exit code 4 on failure, but Step 8 failures print a "release succeeded; develop sync failed" message because the tag is already published and the workflow has fired.

Exit codes:

| Code | Meaning |
| ---- | ------- |
| 0 | Release pushed, GitHub Actions workflow triggered |
| 1 | User aborted at a prompt |
| 2 | Pre-flight failed |
| 3 | CHANGELOG validation failed |
| 4 | An execute step failed (with cleanup hint printed) |

## Step 1 — Pre-flight

Each check reports the specific failure and exits with code 2.

- Tools on `$PATH`: `git`, `gh`, `jq`. Report each missing tool by name.
- `gh auth status` returns 0 (release lookup requires auth).
- `git rev-parse --abbrev-ref HEAD` == `main`. Otherwise print the actual branch.
- `git status --porcelain` is empty. Refuse to stash or auto-commit.
- `git fetch origin main` succeeds.
- `git rev-list --left-right --count origin/main...HEAD` returns `0\t0`. Ahead → "push first"; behind → "pull first"; diverged → manual fix.
- Local `develop` branch exists (`git rev-parse --verify develop`). Step 8 needs to switch to it.
- `module.json` exists and parses (`jq empty module.json`).
- `CHANGELOG.md` exists.

## Step 2 — Read current version

```
CURRENT=$(jq -r '.version' module.json)
```

Validate `CURRENT` against `^[0-9]+\.[0-9]+\.[0-9]+$`. If it fails (e.g. a pre-release string), abort with exit 2 and tell the user the script supports stable semver only in v1.

## Step 3 — Read latest released

```
LATEST=$(gh release list --limit 50 --json tagName,isDraft,isPrerelease \
  | jq -r '[.[] | select(.isDraft|not) | select(.isPrerelease|not) | .tagName]
           | map(select(test("^v[0-9]+\\.[0-9]+\\.[0-9]+$")))
           | .[0] // "v0.0.0"' \
  | sed 's/^v//')
```

If no prior stable release exists, `LATEST` defaults to `0.0.0` so the bump branch still produces a sensible result.

## Step 4 — Decide target version

Compare `CURRENT` vs `LATEST` numerically (split on `.`, integer compare per segment).

**Branch A — `CURRENT <= LATEST`** (most common case: user runs script after merging develop → main without bumping)

Print:

```
Current module.json version: 0.4.6
Latest released:             0.4.6
The version needs to be bumped.

Bump which?
  [P]atch  → 0.4.7
  [M]inor  → 0.5.0
  m[A]jor  → 1.0.0
  [Q]uit
>
```

Read one character; accept `p`/`P`/`m`/`M`/`a`/`A`/`q`/`Q`. Anything else re-prompts. `q` exits 1. Compute next version per choice.

**Branch B — `CURRENT > LATEST`** (user pre-bumped `module.json` manually)

Print:

```
Current module.json version: 0.4.7
Latest released:             0.4.6

Release v0.4.7? [y/N]
>
```

Anything but `y`/`Y` exits 1.

In both branches the outcome is a single shell variable `TARGET=X.Y.Z`.

## Step 5 — CHANGELOG validation

Look for one exact header line:

```bash
matches=$(grep -cE "^## \[${TARGET}\] - [0-9]{4}-[0-9]{2}-[0-9]{2}( |$)" CHANGELOG.md)
```

- `matches == 0` → exit 3: `CHANGELOG.md is missing an entry for v${TARGET}. Add a section "## [${TARGET}] - YYYY-MM-DD" before releasing.`
- `matches == 1` → pass.
- `matches > 1` → exit 3: `CHANGELOG.md has duplicate entries for v${TARGET}.`

The date is validated structurally (any `YYYY-MM-DD`), not against today's date.

## Step 6 — Plan summary and final confirmation

No side effects until this confirmation passes.

```
Plan for v${TARGET}:
  • Update module.json: version ${CURRENT} → ${TARGET} (if not already)
  • Update module.json: download URL → https://github.com/martin-papy/coc7-qol/releases/download/v${TARGET}/coc7-qol.zip (if not already)
  • Commit + push origin main  (skipped if module.json is already up to date)
  • Tag v${TARGET} at HEAD and push the tag
  • GitHub Actions release workflow will fire on the tag
  • Switch to develop, merge main, push origin develop, end on develop

Proceed? [y/N]
>
```

Anything but `y`/`Y` exits 1, no files modified.

## Step 7 — Execute release (fail-fast, no rollback)

Each step that fails prints a recovery hint and exits 4.

1. **Edit `module.json` atomically** with `jq`:

   ```bash
   jq --arg v "$TARGET" \
      --arg dl "https://github.com/martin-papy/coc7-qol/releases/download/v${TARGET}/coc7-qol.zip" \
      '.version = $v | .download = $dl' module.json > module.json.tmp \
     && mv module.json.tmp module.json
   ```

   On failure: `module.json edit failed — no changes committed.`

2. **Detect no-op case**: if `git diff --quiet module.json` (no change), skip 7.3 and 7.4. This happens in Branch B when the user pre-bumped both `version` and `download` via a develop → main PR before running the script. Print: `module.json already up to date; skipping main commit.`

3. **Commit**: `git add module.json && git commit -m "chore: release v${TARGET}"`

   On failure: `commit failed — inspect with 'git status' and run 'git restore --staged module.json && git checkout -- module.json' to reset.`

4. **Push main**: `git push origin main`

   On rejection (remote moved during the run): `push rejected — remote moved. Reset with 'git reset --hard HEAD~1' and re-run release.sh.`

5. **Create tag**: `git tag "v${TARGET}"`

   If tag already exists locally: `local tag v${TARGET} already exists — delete with 'git tag -d v${TARGET}' before retrying.`

6. **Push tag**: `git push origin "v${TARGET}"`

   On failure: `tag push failed — delete local tag with 'git tag -d v${TARGET}' and investigate (the main branch push has already landed).`

After step 7.6 succeeds the release is published and the GitHub Actions workflow has fired. The script proceeds to Step 8; any failure there is post-release.

## Step 8 — Merge-back to develop and switch

After the tag is pushed, `main` may carry commits that aren't on `develop` yet:

- The `chore: release v${TARGET}` commit from step 7.3 (if produced).
- Any CHANGELOG updates or other prep commits the user landed directly on `main` (or via a prep PR) before running the script.

All of these need to come back to `develop` so the branches stay aligned and `develop` never falls behind on the latest release commit.

Step 8 failures use exit code 4 but print a `release succeeded; develop sync failed` message because the tag is already public.

1. **Switch to develop**: `git checkout develop`

   On failure: `release succeeded but 'git checkout develop' failed: <stderr>. Manually run: git checkout develop && git merge main && git push origin develop`

2. **Sync local develop with origin**: `git fetch origin develop` then check status.

   - Local behind origin/develop: `git merge --ff-only origin/develop`.
   - Local ahead of origin/develop: leave it; the final push will publish those commits.
   - Diverged: abort. `release succeeded but local develop has diverged from origin/develop. Resolve manually, then run: git merge main && git push origin develop`

3. **Merge main into develop**: `git merge --no-edit main`

   Fast-forwards if possible; produces a merge commit otherwise. The `--no-edit` flag accepts the default merge message non-interactively.

   On merge conflict (very rare — would require both branches to edit the same lines in `module.json` or another release-touched file): `release succeeded but merging main into develop has conflicts. Resolve them, then run: git push origin develop`

4. **Push develop**: `git push origin develop`

   On failure: `release succeeded and main↔develop merged locally, but 'git push origin develop' failed: <stderr>. Manually run: git push origin develop`

5. **Final success message**:

   ```
   v${TARGET} released.
   Now on develop, synced with main.
   Actions: https://github.com/martin-papy/coc7-qol/actions
   Release (when workflow finishes): https://github.com/martin-papy/coc7-qol/releases/tag/v${TARGET}
   ```

## Error message style

- One line per abort, prefixed with `error: `.
- Always name the exact command to recover, if any.
- No stack traces. No colour codes (or guard with `[ -t 1 ]`).

## Testing strategy

Manual only — this is a release tool that mutates `main`. Verification approach:

1. **Dry-run by inspection** — run the script in a throwaway clone (`git clone . /tmp/coc7-qol-test`) with `gh` pointed at a forked repo, walk through both branches (bump and pre-bump) and abort at the final confirmation prompt. Verify no files changed.
2. **Real release** — first production use ships the next bump from current. Confirm `.github/workflows/release.yml` runs, the FoundryVTT package edit URL appears in the job summary, and the script ends on `develop` with `main` reachable from `HEAD`.
3. **Failure-path spot checks** — simulate dirty tree, wrong branch, missing CHANGELOG entry, duplicate CHANGELOG entry, missing `jq`, `gh` not authenticated, missing local `develop` branch. Confirm correct exit code and message for each.
4. **Step 8 failure isolation** — simulate `develop` diverged from `origin/develop` before running the script. Confirm the release tag still gets pushed and the script reports `release succeeded; develop sync failed` with the manual recovery command.

## Open questions

None at this point. If pre-release support becomes a frequent need, revisit the bump-options decision in a follow-up spec.
