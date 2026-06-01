# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`coc7-qol` is a FoundryVTT module that adds quality-of-life improvements for the Call of Cthulhu 7th Edition (CoC7) game system. It is a companion module — it does not modify the CoC7 system itself, but hooks into it at runtime.

## Architecture

This is a no-build-step vanilla JS module. FoundryVTT loads `scripts/*.js` files declared in `module.json` as ES modules directly in the browser.

Each feature is a self-contained ES module in `scripts/` that registers FoundryVTT hooks. The module.json `esmodules` array is the entry point list — add new feature files there.

**Key pattern:** Features hook into FoundryVTT's lifecycle via `Hooks.on(...)`. Most use render hooks (e.g., `renderItemSheetV2` for item sheets, `renderActorSheetV2` for actor sheets) to modify sheet HTML after the system renders it. Some use non-render hooks (e.g., `getSceneControlButtons` to inject buttons into the scene controls toolbar). This avoids modifying CoC7 source code.

### AI Generator

The `scripts/ai-generator/` directory uses an extensible registry pattern:

- **Providers** (`providers/registry.js`): LLM providers (Anthropic, OpenAI, Gemini) implementing `generate(systemPrompt, userPrompt)`. Adding a provider is a single `register()` call.
- **Mappers** (`mappers/registry.js`): Document type mappers implementing `buildSystemPrompt()`, `validate()`, `toFoundryData()`. Current mappers: `weapon` (items), `npc` (actors). Adding a new document type means adding a mapper + a dialog injector detection branch.
- **Dialog injection** (`dialog-injector.js`): Hooks into `renderDialogV2` to inject the AI sparkle button into the Create Item / Create Actor dialogs. The button only appears when a supported type is selected (weapon, npc). Type-awareness is controlled by `SUPPORTED_ITEM_TYPES` / `SUPPORTED_ACTOR_TYPES` constants.
- **NPC skill resolution**: The NPC mapper resolves skills against the `CoC7.skills` compendium pack, falling back to `CONFIG.Item.dataModels.skill.guessNameParts()` for skills not in the compendium.

## Compatibility

Targets FoundryVTT v13+ only. The `html` parameter in render hooks is an HTMLElement, and `ImagePopout` is at `foundry.applications.apps.ImagePopout` (ApplicationV2).

## Development workflow

- The default ongoing development branch is `develop`. `main` only receives released code.
- Unless explicitly instructed otherwise, every new feature or fix gets its own branch off `develop`, named `feature-xxx` for features or `bugfix-yyy` for fixes. Use branches, not git worktrees.
- A change ships in two PRs: feature/bugfix branch → `develop`, then `develop` → `main`. The release workflow then runs from the tag pushed on `main` (see [Releasing](#releasing)).

## Releasing

Releases are automated by `.github/workflows/release.yml`, which fires on any tag matching `v*`.

### Standard flow

From the `main` branch, run:

    ./release.sh

The script handles version selection, `module.json` edits, the release commit, tag creation, push, and the merge-back to `develop`. It validates that `CHANGELOG.md` already has a `## [X.Y.Z] - YYYY-MM-DD` entry for the target version and aborts cleanly if not.

End state: you are on `develop`, fully synced with `main`. The GitHub Actions release workflow runs from the pushed tag and submits to FoundryVTT.

See [docs/superpowers/specs/2026-05-19-release-script-design.md](docs/superpowers/specs/2026-05-19-release-script-design.md) for the full design and [docs/superpowers/plans/2026-05-19-release-script.md](docs/superpowers/plans/2026-05-19-release-script.md) for the implementation breakdown.

Pre-release tags (`vX.Y.Z-beta.N`, `vX.Y.Z-rc.N`, etc.) create a GitHub pre-release and skip the FoundryVTT publish step.

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

## Testing

No automated tests. All features require manual testing in a running FoundryVTT instance with the CoC7 system. Test as both GM and player — most features behave differently per role.

### Browser automation with Playwright

If a FoundryVTT instance is running (typically `http://localhost:30000`) and the **Playwright MCP server** is available, use it to verify UI and behaviour against the real client instead of relying on synthetic reproductions. This is the closest thing to an automated check this project has.

**When to use it:**

- Verifying anything visual or layout-related: render-hook modifications to sheets, injected buttons, dialogs, and especially sizing/scroll/overflow issues (resize the viewport to reproduce small-display bugs).
- Confirming a fix before committing — reproduce the broken state, apply the change, and re-measure.
- Checking role-dependent behaviour: log in as `Gamemaster` and as a player and compare.

**How to use it:**

1. Navigate to `http://localhost:30000`. If at `/join`, set `select[name="userid"]` to the desired user and click `button[name="join"]`, then wait for `game.ready`.
2. The module is installed as a **symlink** into the Foundry `Data/modules/coc7-qol` directory, so working-tree edits are live. JS changes apply on page reload; **CSS changes need a page reload** (or inject the rule via `browser_evaluate` for a quick visual check — but the file is the source of truth).
3. To exercise a component directly without driving the whole UI, dynamically import its ES module and instantiate it with mock data inside `browser_evaluate`, e.g.:

   ```js
   const { default: Dialog } = await import('/modules/coc7-qol/scripts/ai-generator/npc-confirmation-dialog.js')
   const dlg = new Dialog({ npcData: { /* mock llmData, weaponsData, … */ }, onAccept(){}, onRegenerate(){}, onCancel(){} })
   await dlg.render(true)
   ```

4. Assert with real measurements — `getBoundingClientRect()`, `getComputedStyle()`, `scrollHeight` vs `clientHeight` — and capture a screenshot for visual confirmation. Resize with `browser_resize` to test breakpoints.
5. Clean up after each check: `await dlg.close()` and remove any injected `<style>` elements.

Foundry caps `ApplicationV2` windows at `calc(100vh - 1.5 * var(--hotbar-height))` and gives `.window-content` `overflow: hidden`, so content-heavy auto-height dialogs must own their own scroll region (see issue #8 / `styles/ai-generator.css`).

## Code Exploration

If installed and available, use `codebase-memory-mcp` tools **first** for any structural code exploration:

- `search_graph(name_pattern/label/qn_pattern)` — find functions, classes, modules by name
- `trace_path(function_name, mode=calls|data_flow)` — follow call chains
- `get_code_snippet(qualified_name)` — read source for a specific symbol
- `get_architecture(aspects)` — understand project structure
- `search_code(pattern)` — graph-augmented text search

If the project is not yet indexed, run `index_repository` first. Fall back to `Grep`/`Glob`/`Read` only for config values, non-code files, or plain text content.

## External Documentation

If the **Context7 MCP server** is available, when working with FoundryVTT APIs, use it to fetch up-to-date documentation rather than relying on training data:

```
mcp__plugin_context7_context7__resolve-library-id({ libraryName: "foundryvtt" })
mcp__plugin_context7_context7__query-docs({ context7CompatibleLibraryID: "...", query: "..." })
```

Use this for: ApplicationV2, DocumentSheet, Hooks API, canvas/scene APIs, compendium packs, data models, and any other FoundryVTT or CoC7 system APIs.

## Reference

- CoC7 system source: `../CoC7-FoundryVTT-8.x/` (workspace sibling, targets CoC7 8.1+)
- FoundryVTT API docs: https://foundryvtt.com/api/
- Design specs: `docs/superpowers/specs/`
- Implementation plans: `docs/superpowers/plans/`
- FoundryVTT v13 Source : `../Foundry Virtual Tabletop/v13` (workspace sibling)
- FoundryVTT v14 Source : `../Foundry Virtual Tabletop/v14` (workspace sibling)