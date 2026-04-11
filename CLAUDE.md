# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`coc7-qol` is a FoundryVTT module that adds quality-of-life improvements for the Call of Cthulhu 7th Edition (CoC7) game system. It is a companion module — it does not modify the CoC7 system itself, but hooks into it at runtime.

## Architecture

This is a no-build-step vanilla JS module. FoundryVTT loads `scripts/*.js` files declared in `module.json` as ES modules directly in the browser.

Each feature is a self-contained ES module in `scripts/` that registers FoundryVTT hooks. The module.json `esmodules` array is the entry point list — add new feature files there.

**Key pattern:** Features hook into FoundryVTT's render lifecycle (e.g., `Hooks.on('renderItemSheetV2', ...)` for item sheets, `Hooks.on('renderActorSheetV2', ...)` for actor sheets) to modify sheet HTML after the system renders it. This avoids modifying CoC7 source code.

### AI Generator

The `scripts/ai-generator/` directory uses an extensible registry pattern:

- **Providers** (`providers/registry.js`): LLM providers (Anthropic, OpenAI, Gemini) implementing `generate(systemPrompt, userPrompt)`. Adding a provider is a single `register()` call.
- **Mappers** (`mappers/registry.js`): Document type mappers implementing `buildSystemPrompt()`, `validate()`, `toFoundryData()`. Current mappers: `weapon` (items), `npc` (actors). Adding a new document type means adding a mapper + a dialog injector detection branch.
- **Dialog injection** (`dialog-injector.js`): Hooks into `renderDialogV2` to inject the AI sparkle button into the Create Item / Create Actor dialogs. The button only appears when a supported type is selected (weapon, npc). Type-awareness is controlled by `SUPPORTED_ITEM_TYPES` / `SUPPORTED_ACTOR_TYPES` constants.
- **NPC skill resolution**: The NPC mapper resolves skills against the `CoC7.skills` compendium pack, falling back to `CONFIG.Item.dataModels.skill.guessNameParts()` for skills not in the compendium.

## Compatibility

Targets FoundryVTT v13+ only. The `html` parameter in render hooks is an HTMLElement, and `ImagePopout` is at `foundry.applications.apps.ImagePopout` (ApplicationV2).

## Releasing

Releases are created via `gh` CLI. The release zip must contain only the files needed at runtime (`module.json` + `scripts/`):

```bash
zip -r /tmp/coc7-qol.zip module.json scripts/
gh release create vX.Y.Z --title "vX.Y.Z" --notes "Release notes" /tmp/coc7-qol.zip module.json
```

**Important:** The `download` URL in `module.json` must use the `v`-prefixed tag (e.g., `v0.1.0`, not `0.1.0`). Update this URL when bumping versions.

## Testing

No automated tests. All features require manual testing in a running FoundryVTT instance with the CoC7 system. Test as both GM and player — most features behave differently per role.

## Reference

- CoC7 system source: `../CoC7-FoundryVTT-8.x/` (workspace sibling, targets CoC7 8.1+)
- FoundryVTT API docs: https://foundryvtt.com/api/
- Design specs: `docs/superpowers/specs/`
- Implementation plans: `docs/superpowers/plans/`
