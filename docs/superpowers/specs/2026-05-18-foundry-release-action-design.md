# Foundry Release GitHub Action — Design

**Date:** 2026-05-18
**Status:** Approved

## Goal

Automate the module release pipeline. Pushing a `vX.Y.Z` tag should build the release zip, create the GitHub release, and publish to the FoundryVTT Package Release API in a single, observable run.

Today the flow is manual: bump `version` and `download` in `module.json`, commit, build the zip locally, run `gh release create`, then submit the release to foundryvtt.com by hand. Versions can drift, the zip contents can be forgotten, and the Foundry submission is a separate context switch.

## Non-goals

- Automatic version bumping. `module.json` remains the source of truth; the developer edits it intentionally and pushes the matching tag.
- Auto-generated changelog content. `--generate-notes` from `gh` is enough for now; curating release bodies stays manual.
- Pre-release publishing to Foundry. `v*-beta`/`v*-rc` tags still build a GitHub pre-release but the Foundry step is skipped.

## Trigger

`push` on tags matching `v*`. Inside the job, a regex separates stable (`v[0-9]+.[0-9]+.[0-9]+`) from pre-release (`v[0-9]+.[0-9]+.[0-9]+-...`). Anything else fails the preflight step.

## Inputs

- **Repo secret `FOUNDRY_RELEASE_TOKEN`** — the `fvttp_...` token from the package admin page on foundryvtt.com. Required for the Foundry API call.
- **Auto-provided `GITHUB_TOKEN`** — used by `gh release create`. Workflow permissions: `contents: write`.

## Pipeline

```
1. checkout
2. parse module.json + tag
3. preflight assertions          (fail before any state change)
4. build zip
5. create GitHub release
6. (stable only) verify manifest reachable
7. (stable only) Foundry POST dry-run
8. (stable only) Foundry POST real
9. job summary
```

### Step 2 — parse

Bash + `jq` reads:

- `id`, `version`, `compatibility.minimum`, `compatibility.verified`, `compatibility.maximum` (optional), `download` from `module.json`.
- `TAG` from `$GITHUB_REF_NAME`, `VERSION_FROM_TAG` from `${TAG#v}`.
- `IS_STABLE` from regex on `TAG`.

### Step 3 — preflight assertions

Each assertion logs expected vs actual before failing. All must pass:

1. **Tag format:** `TAG` matches `^v[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.]+)?$`.
2. **Version match:** `VERSION_FROM_TAG == module.json.version`. Enforces "module.json is source of truth."
3. **Download URL match:** `module.json.download == https://github.com/${{ github.repository }}/releases/download/${TAG}/coc7-qol.zip`.
4. **Required Foundry fields:** `id`, `compatibility.minimum`, `compatibility.verified` are non-empty strings.

### Step 4 — build zip

```bash
zip -r coc7-qol.zip module.json scripts/ styles/ lang/
```

Contents reflect what `module.json` actually loads at runtime: ES modules, CSS, and translations. `images/`, `docs/`, `temp/`, `CHANGELOG.md`, `README.md`, `LICENSE`, and `.github/` are excluded — they are repo-only.

**Note:** The current `CLAUDE.md` documents the zip as `module.json + scripts/` only. That instruction predates the `styles/` and `lang/` additions and must be updated as part of this change (see "Documentation updates" below). Verify the current v0.4.6 release is missing those directories before shipping; if so, the next release silently fixes unstyled UI and missing French translations for installed users.

### Step 5 — create GitHub release

```bash
gh release create "$TAG" \
  coc7-qol.zip module.json \
  --title "$TAG" \
  --generate-notes \
  --prerelease=<true if IS_STABLE=false else false>
```

Both the zip and a bare `module.json` are uploaded; the Foundry `manifest` URL points at the bare file.

### Step 6 — manifest reachability check (stable only)

```
curl -fsSL --head "https://github.com/${{ github.repository }}/releases/download/${TAG}/module.json"
```

Up to 3 attempts with 5s backoff. Rules out false-positive "manifest not accessible" errors from Foundry on cold CDN edges.

### Step 7 — Foundry dry-run (stable only)

Build `payload.json` with `jq`, then POST.

```json
{
  "id": "<module.json .id>",
  "dry-run": true,
  "release": {
    "version": "<module.json .version>",
    "manifest": "https://github.com/<owner>/<repo>/releases/download/v$VERSION/module.json",
    "notes":    "https://github.com/<owner>/<repo>/releases/tag/v$VERSION",
    "compatibility": {
      "minimum":  "<module.json .compatibility.minimum>",
      "verified": "<module.json .compatibility.verified>",
      "maximum":  "<module.json .compatibility.maximum, if set>"
    }
  }
}
```

```bash
curl -sS -X POST https://foundryvtt.com/_api/packages/release_version/ \
  -H "Authorization: $FOUNDRY_RELEASE_TOKEN" \
  -H "Content-Type: application/json" \
  -d @payload.json
```

Parse response with `jq`. If `.status != "success"`, log the full body and exit non-zero.

### Step 8 — Foundry real submit (stable only)

Same request, `dry-run` field removed. Same success check. The success response includes the package edit page URL, surfaced in the job summary.

### Step 9 — job summary

Written to `$GITHUB_STEP_SUMMARY`:

```markdown
## Release v0.5.0

- ✅ GitHub release: https://github.com/martin-papy/coc7-qol/releases/tag/v0.5.0
- ✅ Foundry dry-run: passed
- ✅ Foundry publish: https://foundryvtt.com/packages/coc7-qol/edit/
- Manifest: https://github.com/martin-papy/coc7-qol/releases/download/v0.5.0/module.json
- Compatibility: min 13 / verified 14
```

Pre-release runs show the GitHub release line and the rest marked "skipped (pre-release)".

## Failure handling

| Stage | Failure mode | Outcome |
|---|---|---|
| Preflight | Tag/version/download mismatch | Fail fast; no GitHub release, no Foundry call. |
| Build zip | (shouldn't fail) | Fail; no GitHub release. |
| Create GitHub release | `gh` error, tag collision | Fail; GitHub release not created. |
| Manifest reachability | 3 retries exhausted | Fail; GitHub release exists. Manual: investigate CDN, re-run workflow on same SHA. |
| Foundry dry-run | `status != success` | Fail; GitHub release exists. Manual: fix `module.json`, decide whether to delete the GitHub release, retag (e.g. `v0.5.1`), retry. |
| Foundry real submit | `status != success` (rare after dry-run) | Fail; GitHub release exists, Foundry not updated. Same manual recovery path. |
| Foundry real submit | `429` rate limit | Fail; log `Retry-After`. Re-run workflow after the window. |

No automatic rollback of the GitHub release. Manual recovery is acceptable because preflight catches almost every realistic failure before any state changes.

## Files added / changed

### New

- `.github/workflows/release.yml` — the workflow.

### Updated

- `CLAUDE.md` — replace the manual release section with the new tag-driven flow:
  - Zip contents updated to `module.json + scripts/ + styles/ + lang/`.
  - New checklist: bump `version` + `download` in `module.json`, commit, push `vX.Y.Z` tag, watch the Actions run, check the job summary for the Foundry edit URL.
  - Document the `FOUNDRY_RELEASE_TOKEN` secret requirement and where to get the token.
  - Keep a "manual fallback" subsection that preserves the existing `gh release create` recipe in case the workflow is broken.

## Security

- `FOUNDRY_RELEASE_TOKEN` is a repo secret; never logged. Curl responses do not include the token.
- The workflow uses `GITHUB_TOKEN` with `contents: write` only — no PATs, no extra scopes.
- No third-party Actions beyond `actions/checkout` (pinned by major version).

## Open questions resolved during brainstorming

- **Scope:** tag-driven full release (build zip + GitHub release + Foundry publish in one workflow).
- **Version sync:** `module.json` is source of truth; workflow fails if tag and `module.json.version` disagree.
- **Failure handling:** dry-run before real submit.
- **Pre-releases:** `v*-beta` builds GitHub release but skips Foundry.
