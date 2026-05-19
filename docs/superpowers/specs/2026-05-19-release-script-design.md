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
7. Execute steps          → first failure aborts with cleanup hint (exit 4)
```

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
  • Update module.json: version ${CURRENT} → ${TARGET}
  • Update module.json: download URL → https://github.com/martin-papy/coc7-qol/releases/download/v${TARGET}/coc7-qol.zip
  • Commit on main:     "chore: release v${TARGET}"
  • Push origin main
  • Tag v${TARGET} at HEAD and push the tag
  • GitHub Actions release workflow will fire on the tag

Proceed? [y/N]
>
```

Anything but `y`/`Y` exits 1, no files modified.

## Step 7 — Execute (fail-fast, no rollback)

Each step that fails prints a recovery hint and exits 4.

1. **Edit `module.json` atomically** with `jq`:

   ```bash
   jq --arg v "$TARGET" \
      --arg dl "https://github.com/martin-papy/coc7-qol/releases/download/v${TARGET}/coc7-qol.zip" \
      '.version = $v | .download = $dl' module.json > module.json.tmp \
     && mv module.json.tmp module.json
   ```

   On failure: `module.json edit failed — no changes committed.`

2. **Commit**: `git add module.json && git commit -m "chore: release v${TARGET}"`

   On failure: `commit failed — inspect with 'git status' and run 'git restore --staged module.json && git checkout -- module.json' to reset.`

3. **Push main**: `git push origin main`

   On rejection (remote moved during the run): `push rejected — remote moved. Reset with 'git reset --hard HEAD~1' and re-run release.sh.`

4. **Create tag**: `git tag "v${TARGET}"`

   If tag already exists locally: `local tag v${TARGET} already exists — delete with 'git tag -d v${TARGET}' before retrying.`

5. **Push tag**: `git push origin "v${TARGET}"`

   On failure: `tag push failed — delete local tag with 'git tag -d v${TARGET}' and investigate (the main branch push has already landed).`

6. **Success**: print release & actions URLs:

   ```
   v${TARGET} released.
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
2. **Real release** — first production use ships the next bump from current. Confirm `.github/workflows/release.yml` runs and the FoundryVTT package edit URL appears in the job summary.
3. **Failure-path spot checks** — simulate dirty tree, wrong branch, missing CHANGELOG entry, duplicate CHANGELOG entry, missing `jq`, `gh` not authenticated. Confirm correct exit code and message for each.

## Open questions

None at this point. If pre-release support becomes a frequent need, revisit the bump-options decision in a follow-up spec.
