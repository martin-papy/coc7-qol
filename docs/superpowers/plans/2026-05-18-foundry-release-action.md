# Foundry Release GitHub Action Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the manual `gh release create` + Foundry-website submission flow with a single GitHub Actions workflow that fires on `v*` tag push, builds the release zip, creates the GitHub release, and (for stable tags) publishes to the FoundryVTT Package Release API.

**Architecture:** One workflow file at `.github/workflows/release.yml`. A single `release` job runs sequential bash steps that read `module.json` with `jq`, assert it matches the pushed tag, zip the runtime files, create the GitHub release with `gh`, then POST to `https://foundryvtt.com/_api/packages/release_version/` with a dry-run followed by a real submit. Pre-release tags (`v*.*.*-suffix`) build the GitHub release but skip the Foundry step.

**Tech Stack:** GitHub Actions, `bash`, `jq`, `curl`, `zip`, `gh` CLI (preinstalled on `ubuntu-latest` runners). No Node tooling, no third-party Actions beyond `actions/checkout@v4`.

**Spec:** `docs/superpowers/specs/2026-05-18-foundry-release-action-design.md`

**Note on testing:** This repo has no automated tests (per CLAUDE.md). Verification in each task is via local execution of the same bash logic with concrete inputs, plus a final manual smoke test using a pre-release tag.

---

## File Structure

- **Create** `.github/workflows/release.yml` — the workflow.
- **Modify** `CLAUDE.md` — replace the `## Releasing` section (lines 30–39) with new tag-driven instructions and a manual fallback subsection.

---

## Task 1: Bootstrap workflow skeleton

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Create the workflow directory if missing**

Run: `mkdir -p .github/workflows`
Expected: no output (directory now exists).

- [ ] **Step 2: Write the skeleton workflow**

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
```

- [ ] **Step 3: Verify the YAML parses**

Run: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/release.yml')); print('ok')"`
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: scaffold release workflow on v* tags"
```

---

## Task 2: Parse module.json and tag into env

**Files:**
- Modify: `.github/workflows/release.yml`

- [ ] **Step 1: Append the parse step to `steps:`**

Add this step right after the `Checkout` step:

```yaml
      - name: Parse module.json and tag
        id: parse
        run: |
          set -euo pipefail

          TAG="${GITHUB_REF_NAME}"
          VERSION_FROM_TAG="${TAG#v}"

          MODULE_ID=$(jq -r '.id'                          module.json)
          MODULE_VERSION=$(jq -r '.version'                module.json)
          MODULE_DOWNLOAD=$(jq -r '.download'              module.json)
          COMPAT_MIN=$(jq -r '.compatibility.minimum'      module.json)
          COMPAT_VERIFIED=$(jq -r '.compatibility.verified' module.json)
          COMPAT_MAX=$(jq -r '.compatibility.maximum // ""' module.json)

          IS_STABLE=false
          if [[ "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
            IS_STABLE=true
          fi

          {
            echo "TAG=$TAG"
            echo "VERSION_FROM_TAG=$VERSION_FROM_TAG"
            echo "MODULE_ID=$MODULE_ID"
            echo "MODULE_VERSION=$MODULE_VERSION"
            echo "MODULE_DOWNLOAD=$MODULE_DOWNLOAD"
            echo "COMPAT_MIN=$COMPAT_MIN"
            echo "COMPAT_VERIFIED=$COMPAT_VERIFIED"
            echo "COMPAT_MAX=$COMPAT_MAX"
            echo "IS_STABLE=$IS_STABLE"
          } >> "$GITHUB_ENV"

          echo "Parsed: tag=$TAG version=$MODULE_VERSION id=$MODULE_ID stable=$IS_STABLE"
```

- [ ] **Step 2: Dry-run the bash locally with a fake tag**

Run from the repo root:

```bash
TAG=v0.4.6 bash -c '
  set -euo pipefail
  VERSION_FROM_TAG="${TAG#v}"
  MODULE_ID=$(jq -r .id module.json)
  MODULE_VERSION=$(jq -r .version module.json)
  IS_STABLE=false
  [[ "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] && IS_STABLE=true
  echo "TAG=$TAG VERSION=$MODULE_VERSION ID=$MODULE_ID STABLE=$IS_STABLE"
'
```

Expected output: `TAG=v0.4.6 VERSION=0.4.6 ID=coc7-qol STABLE=true`

- [ ] **Step 3: Dry-run with a pre-release tag**

```bash
TAG=v0.4.6-beta.1 bash -c '
  IS_STABLE=false
  [[ "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] && IS_STABLE=true
  echo "STABLE=$IS_STABLE"
'
```

Expected: `STABLE=false`

- [ ] **Step 4: Re-validate YAML**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml')); print('ok')"`
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci(release): parse module.json and tag metadata into env"
```

---

## Task 3: Preflight assertions

**Files:**
- Modify: `.github/workflows/release.yml`

- [ ] **Step 1: Append the preflight step**

Add this step after the `Parse` step:

```yaml
      - name: Preflight assertions
        run: |
          set -euo pipefail

          fail() { echo "::error::$1"; exit 1; }

          # 1. Tag format
          if ! [[ "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.]+)?$ ]]; then
            fail "Tag '$TAG' does not match vX.Y.Z[-suffix]"
          fi

          # 2. Tag version matches module.json
          if [[ "$VERSION_FROM_TAG" != "$MODULE_VERSION" ]]; then
            fail "Tag version '$VERSION_FROM_TAG' does not match module.json .version '$MODULE_VERSION'"
          fi

          # 3. download URL points at this tag's zip
          EXPECTED_DOWNLOAD="https://github.com/${GITHUB_REPOSITORY}/releases/download/${TAG}/coc7-qol.zip"
          if [[ "$MODULE_DOWNLOAD" != "$EXPECTED_DOWNLOAD" ]]; then
            fail "module.json .download is '$MODULE_DOWNLOAD' but expected '$EXPECTED_DOWNLOAD'"
          fi

          # 4. Required Foundry fields are non-empty
          [[ -n "$MODULE_ID"        ]] || fail "module.json .id is empty"
          [[ -n "$COMPAT_MIN"       ]] || fail "module.json .compatibility.minimum is empty"
          [[ -n "$COMPAT_VERIFIED"  ]] || fail "module.json .compatibility.verified is empty"

          echo "Preflight OK: id=$MODULE_ID version=$MODULE_VERSION download=$MODULE_DOWNLOAD"
```

- [ ] **Step 2: Locally simulate a passing preflight against current `module.json`**

```bash
TAG=v0.4.6 GITHUB_REPOSITORY=martin-papy/coc7-qol bash -c '
  set -euo pipefail
  VERSION_FROM_TAG="${TAG#v}"
  MODULE_VERSION=$(jq -r .version module.json)
  MODULE_DOWNLOAD=$(jq -r .download module.json)
  EXPECTED_DOWNLOAD="https://github.com/${GITHUB_REPOSITORY}/releases/download/${TAG}/coc7-qol.zip"
  [[ "$VERSION_FROM_TAG" == "$MODULE_VERSION" ]] && echo "version OK"
  [[ "$MODULE_DOWNLOAD"  == "$EXPECTED_DOWNLOAD" ]] && echo "download OK"
'
```

Expected: both lines `version OK` and `download OK`.

- [ ] **Step 3: Locally simulate a failing version mismatch**

```bash
TAG=v9.9.9 GITHUB_REPOSITORY=martin-papy/coc7-qol bash -c '
  VERSION_FROM_TAG="${TAG#v}"
  MODULE_VERSION=$(jq -r .version module.json)
  if [[ "$VERSION_FROM_TAG" != "$MODULE_VERSION" ]]; then
    echo "would fail: tag=$VERSION_FROM_TAG module=$MODULE_VERSION"
  fi
'
```

Expected: `would fail: tag=9.9.9 module=0.4.6`

- [ ] **Step 4: Re-validate YAML**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml')); print('ok')"`
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci(release): add preflight assertions for tag/version/download"
```

---

## Task 4: Build the release zip

**Files:**
- Modify: `.github/workflows/release.yml`

- [ ] **Step 1: Append the zip step**

Add after the `Preflight assertions` step:

```yaml
      - name: Build release zip
        run: |
          set -euo pipefail
          zip -r coc7-qol.zip module.json scripts/ styles/ lang/
          echo "Zip contents:"
          unzip -l coc7-qol.zip
```

- [ ] **Step 2: Locally verify the zip command produces the expected layout**

```bash
rm -f /tmp/coc7-qol.zip
( cd /Users/martin.papy/Development/coc7-qol && zip -r /tmp/coc7-qol.zip module.json scripts/ styles/ lang/ > /dev/null )
unzip -l /tmp/coc7-qol.zip | head -30
```

Expected: listing contains `module.json`, `scripts/*.js`, `styles/*.css`, `lang/en.json`, `lang/fr.json`, and nothing from `images/`, `docs/`, `temp/`, `.github/`.

- [ ] **Step 3: Clean up local test artifact**

```bash
rm /tmp/coc7-qol.zip
```

- [ ] **Step 4: Re-validate YAML**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml')); print('ok')"`
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci(release): build coc7-qol.zip with runtime files"
```

---

## Task 5: Create the GitHub release

**Files:**
- Modify: `.github/workflows/release.yml`

- [ ] **Step 1: Append the GitHub release step**

Add after the `Build release zip` step:

```yaml
      - name: Create GitHub release
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          set -euo pipefail

          PRERELEASE_FLAG="--prerelease"
          if [[ "$IS_STABLE" == "true" ]]; then
            PRERELEASE_FLAG="--latest"
          fi

          gh release create "$TAG" \
            coc7-qol.zip module.json \
            --title "$TAG" \
            --generate-notes \
            $PRERELEASE_FLAG

          echo "GitHub release created: https://github.com/${GITHUB_REPOSITORY}/releases/tag/${TAG}"
```

Note on flags: `gh release create` uses `--prerelease` to mark a release as a pre-release and `--latest` to explicitly mark a release as the latest. We pick one based on `IS_STABLE`.

- [ ] **Step 2: Verify the `gh release create` invocation shape is valid**

```bash
gh release create --help 2>&1 | grep -E -- "--prerelease|--latest|--generate-notes" | head -5
```

Expected: lines confirming all three flags exist.

- [ ] **Step 3: Re-validate YAML**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml')); print('ok')"`
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci(release): create GitHub release with zip + module.json assets"
```

---

## Task 6: Foundry publish (reachability + dry-run + real)

**Files:**
- Modify: `.github/workflows/release.yml`

- [ ] **Step 1: Append the Foundry publish step**

Add after the `Create GitHub release` step:

```yaml
      - name: Foundry publish (stable only)
        if: env.IS_STABLE == 'true'
        env:
          FOUNDRY_RELEASE_TOKEN: ${{ secrets.FOUNDRY_RELEASE_TOKEN }}
        run: |
          set -euo pipefail

          if [[ -z "${FOUNDRY_RELEASE_TOKEN:-}" ]]; then
            echo "::error::FOUNDRY_RELEASE_TOKEN secret is not set"
            exit 1
          fi

          MANIFEST_URL="https://github.com/${GITHUB_REPOSITORY}/releases/download/${TAG}/module.json"
          NOTES_URL="https://github.com/${GITHUB_REPOSITORY}/releases/tag/${TAG}"

          # 1. Reachability: up to 3 attempts with 5s backoff
          for attempt in 1 2 3; do
            if curl -fsSL --head -o /dev/null "$MANIFEST_URL"; then
              echo "Manifest reachable on attempt $attempt: $MANIFEST_URL"
              break
            fi
            if [[ $attempt -eq 3 ]]; then
              echo "::error::Manifest URL not reachable after 3 attempts: $MANIFEST_URL"
              exit 1
            fi
            echo "Manifest not reachable yet, retrying in 5s..."
            sleep 5
          done

          # 2. Build payload.json
          jq -n \
            --arg id        "$MODULE_ID" \
            --arg version   "$MODULE_VERSION" \
            --arg manifest  "$MANIFEST_URL" \
            --arg notes     "$NOTES_URL" \
            --arg minimum   "$COMPAT_MIN" \
            --arg verified  "$COMPAT_VERIFIED" \
            --arg maximum   "$COMPAT_MAX" \
            '{
              id: $id,
              "dry-run": true,
              release: ({
                version: $version,
                manifest: $manifest,
                notes: $notes,
                compatibility: ({
                  minimum: $minimum,
                  verified: $verified
                } + (if $maximum == "" then {} else {maximum: $maximum} end))
              })
            }' > payload.json

          echo "Dry-run payload:"
          cat payload.json

          # 3. Dry-run POST
          DRY_RESPONSE=$(curl -sS -X POST https://foundryvtt.com/_api/packages/release_version/ \
            -H "Authorization: $FOUNDRY_RELEASE_TOKEN" \
            -H "Content-Type: application/json" \
            -d @payload.json)

          echo "Dry-run response: $DRY_RESPONSE"
          if [[ "$(echo "$DRY_RESPONSE" | jq -r '.status')" != "success" ]]; then
            echo "::error::Foundry dry-run failed: $DRY_RESPONSE"
            exit 1
          fi

          # 4. Real POST (strip dry-run field)
          jq 'del(."dry-run")' payload.json > payload-real.json

          REAL_RESPONSE=$(curl -sS -X POST https://foundryvtt.com/_api/packages/release_version/ \
            -H "Authorization: $FOUNDRY_RELEASE_TOKEN" \
            -H "Content-Type: application/json" \
            -d @payload-real.json)

          echo "Real submit response: $REAL_RESPONSE"
          if [[ "$(echo "$REAL_RESPONSE" | jq -r '.status')" != "success" ]]; then
            echo "::error::Foundry real submit failed: $REAL_RESPONSE"
            exit 1
          fi

          FOUNDRY_PAGE=$(echo "$REAL_RESPONSE" | jq -r '.page')
          echo "FOUNDRY_PAGE=$FOUNDRY_PAGE" >> "$GITHUB_ENV"
          echo "Foundry publish succeeded: $FOUNDRY_PAGE"
```

- [ ] **Step 2: Locally verify the jq payload shape against current module.json**

```bash
MODULE_ID=$(jq -r .id module.json)
MODULE_VERSION=$(jq -r .version module.json)
COMPAT_MIN=$(jq -r .compatibility.minimum module.json)
COMPAT_VERIFIED=$(jq -r .compatibility.verified module.json)
COMPAT_MAX=$(jq -r '.compatibility.maximum // ""' module.json)
TAG=v$MODULE_VERSION
GITHUB_REPOSITORY=martin-papy/coc7-qol

jq -n \
  --arg id        "$MODULE_ID" \
  --arg version   "$MODULE_VERSION" \
  --arg manifest  "https://github.com/${GITHUB_REPOSITORY}/releases/download/${TAG}/module.json" \
  --arg notes     "https://github.com/${GITHUB_REPOSITORY}/releases/tag/${TAG}" \
  --arg minimum   "$COMPAT_MIN" \
  --arg verified  "$COMPAT_VERIFIED" \
  --arg maximum   "$COMPAT_MAX" \
  '{
    id: $id,
    "dry-run": true,
    release: ({
      version: $version,
      manifest: $manifest,
      notes: $notes,
      compatibility: ({minimum: $minimum, verified: $verified} + (if $maximum == "" then {} else {maximum: $maximum} end))
    })
  }'
```

Expected: prints a JSON object matching the API contract in the spec — `id`, `dry-run: true`, `release.version`, `release.manifest`, `release.notes`, `release.compatibility.minimum`, `release.compatibility.verified`, and NO `maximum` key (since `module.json` currently has no `compatibility.maximum`).

- [ ] **Step 3: Locally confirm the "strip dry-run" jq filter works**

```bash
echo '{"id":"x","dry-run":true,"release":{}}' | jq 'del(."dry-run")'
```

Expected: `{"id":"x","release":{}}` (no `dry-run` field).

- [ ] **Step 4: Re-validate YAML**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml')); print('ok')"`
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci(release): publish to FoundryVTT Package Release API with dry-run"
```

---

## Task 7: Job summary

**Files:**
- Modify: `.github/workflows/release.yml`

- [ ] **Step 1: Append the summary step**

Add after the `Foundry publish` step:

```yaml
      - name: Job summary
        if: always()
        run: |
          set -euo pipefail
          {
            echo "## Release ${TAG}"
            echo ""
            echo "- GitHub release: https://github.com/${GITHUB_REPOSITORY}/releases/tag/${TAG}"
            if [[ "${IS_STABLE:-false}" == "true" ]]; then
              echo "- Foundry publish: ${FOUNDRY_PAGE:-N/A}"
              echo "- Manifest: https://github.com/${GITHUB_REPOSITORY}/releases/download/${TAG}/module.json"
              echo "- Compatibility: min ${COMPAT_MIN:-?} / verified ${COMPAT_VERIFIED:-?}"
            else
              echo "- Foundry publish: skipped (pre-release tag)"
            fi
          } >> "$GITHUB_STEP_SUMMARY"
```

The `if: always()` ensures the summary still appears on failed runs (showing whichever data we got to before the failure).

- [ ] **Step 2: Verify the summary block renders sensibly with a sample env**

```bash
TAG=v0.4.6 GITHUB_REPOSITORY=martin-papy/coc7-qol IS_STABLE=true FOUNDRY_PAGE=https://foundryvtt.com/packages/coc7-qol/edit/ COMPAT_MIN=13 COMPAT_VERIFIED=14 bash -c '
  {
    echo "## Release ${TAG}"
    echo ""
    echo "- GitHub release: https://github.com/${GITHUB_REPOSITORY}/releases/tag/${TAG}"
    if [[ "${IS_STABLE:-false}" == "true" ]]; then
      echo "- Foundry publish: ${FOUNDRY_PAGE:-N/A}"
      echo "- Manifest: https://github.com/${GITHUB_REPOSITORY}/releases/download/${TAG}/module.json"
      echo "- Compatibility: min ${COMPAT_MIN:-?} / verified ${COMPAT_VERIFIED:-?}"
    else
      echo "- Foundry publish: skipped (pre-release tag)"
    fi
  }
'
```

Expected: a markdown block with all four lines populated.

- [ ] **Step 3: Re-validate YAML**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml')); print('ok')"`
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci(release): emit job summary with release links"
```

---

## Task 8: Update CLAUDE.md release instructions

**Files:**
- Modify: `CLAUDE.md` (lines 30–39, the `## Releasing` section)

- [ ] **Step 1: Replace the `## Releasing` section**

Replace lines 30–39 of `CLAUDE.md` (the current `## Releasing` block) with the new content shown below. The outer fence in this plan uses four backticks so the inner three-backtick fences pass through unchanged — copy only the inner markdown (everything between the four-backtick fences), not the four-backtick fences themselves.

````markdown
## Releasing

Releases are automated by `.github/workflows/release.yml`, which fires on any tag matching `v*`.

### Standard flow

1. Bump `version` in `module.json` to `X.Y.Z`.
2. Update `download` in `module.json` to `https://github.com/martin-papy/coc7-qol/releases/download/vX.Y.Z/coc7-qol.zip` (the `v`-prefixed tag is required).
3. Commit the `module.json` change to `main`.
4. Tag and push: `git tag vX.Y.Z && git push origin vX.Y.Z`.
5. Watch the **Release** workflow run on GitHub Actions. The job summary on a successful run contains the GitHub release URL and the FoundryVTT package edit URL.

Pre-release tags (`vX.Y.Z-beta.N`, `vX.Y.Z-rc.N`, etc.) create a GitHub pre-release and skip the FoundryVTT publish step.

### Required secret

`FOUNDRY_RELEASE_TOKEN` — the `fvttp_...` token from the "Package Release Token" field on the package admin page at `https://foundryvtt.com/packages/coc7-qol/edit/`. Set it in the repository secrets (Settings → Secrets and variables → Actions).

### Zip contents

The workflow builds `coc7-qol.zip` containing the runtime files referenced by `module.json`:

```
module.json
scripts/
styles/
lang/
```

`images/`, `docs/`, `temp/`, `CHANGELOG.md`, `README.md`, `LICENSE`, and `.github/` are repo-only and excluded.

### Manual fallback

If the workflow is broken or unavailable, the release can be produced by hand:

```bash
zip -r /tmp/coc7-qol.zip module.json scripts/ styles/ lang/
gh release create vX.Y.Z --title "vX.Y.Z" --generate-notes /tmp/coc7-qol.zip module.json
```

Then submit the release to FoundryVTT by editing the package on foundryvtt.com (no automated submission in this path).
````

- [ ] **Step 2: Verify the replacement landed correctly**

Run: `grep -n "Releasing\|FOUNDRY_RELEASE_TOKEN\|Manual fallback" CLAUDE.md`
Expected: three lines, including `## Releasing`, the `FOUNDRY_RELEASE_TOKEN` line, and the `### Manual fallback` heading.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md release instructions for automated workflow"
```

---

## Task 9: Manual smoke test (post-merge)

This task is **manual** — it requires the workflow to already be on `main` and the `FOUNDRY_RELEASE_TOKEN` secret to be set.

**Files:** none — operational steps only.

- [ ] **Step 1: Confirm `FOUNDRY_RELEASE_TOKEN` is set**

In the GitHub UI: Settings → Secrets and variables → Actions → check that `FOUNDRY_RELEASE_TOKEN` appears. If not, retrieve the token from `https://foundryvtt.com/packages/coc7-qol/edit/` ("Package Release Token" field) and add it.

- [ ] **Step 2: Run a pre-release smoke test**

Pick a throwaway pre-release version that won't conflict with future stable releases. Example: `0.4.7-beta.0` (assuming current stable is 0.4.6).

```bash
# On a short-lived branch
git checkout -b smoke-test-release-workflow
# Edit module.json:
#   .version = "0.4.7-beta.0"
#   .download = "https://github.com/martin-papy/coc7-qol/releases/download/v0.4.7-beta.0/coc7-qol.zip"
git add module.json
git commit -m "test: smoke test release workflow"
git push -u origin smoke-test-release-workflow
git tag v0.4.7-beta.0
git push origin v0.4.7-beta.0
```

- [ ] **Step 3: Watch the workflow run**

Open: `https://github.com/martin-papy/coc7-qol/actions`
Expected:
- Preflight, build zip, create GitHub release steps all green.
- `Foundry publish (stable only)` step skipped (because `IS_STABLE=false`).
- Job summary shows the GitHub release URL and `Foundry publish: skipped (pre-release tag)`.

- [ ] **Step 4: Inspect the produced GitHub release**

Open: `https://github.com/martin-papy/coc7-qol/releases/tag/v0.4.7-beta.0`
Expected: pre-release badge, two assets (`coc7-qol.zip`, `module.json`), autogenerated release notes.

- [ ] **Step 5: Verify the zip contents**

```bash
curl -fsSL -o /tmp/smoke.zip https://github.com/martin-papy/coc7-qol/releases/download/v0.4.7-beta.0/coc7-qol.zip
unzip -l /tmp/smoke.zip
rm /tmp/smoke.zip
```

Expected: `module.json`, files under `scripts/`, `styles/`, `lang/`, and nothing else.

- [ ] **Step 6: Tear down the smoke test**

```bash
# Delete the GitHub release + asset
gh release delete v0.4.7-beta.0 --yes --cleanup-tag
# Drop the smoke-test branch
git checkout main
git branch -D smoke-test-release-workflow
git push origin --delete smoke-test-release-workflow
```

Expected: pre-release and tag removed; branch deleted locally and remotely. `module.json` on `main` is back to the real current version.

- [ ] **Step 7: (Optional) Stable end-to-end test**

When ready to ship the next real release, follow the standard flow in `CLAUDE.md`. The first stable run will exercise the dry-run + real Foundry POST path. Check the job summary for the Foundry edit URL.

---

## Verification checklist (after all tasks complete)

- [ ] `.github/workflows/release.yml` exists and parses as valid YAML.
- [ ] `CLAUDE.md` `## Releasing` section references the workflow and `FOUNDRY_RELEASE_TOKEN`.
- [ ] Manual smoke test (Task 9) produced a GitHub pre-release with the correct zip contents and skipped the Foundry step.
- [ ] No new dependencies, files, or directories outside the two listed above.
