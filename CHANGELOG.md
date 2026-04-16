# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [0.4.3] - 2026-04-16

### Added

- **NPC random characteristics** — A new **Random characteristics** checkbox in the NPC generation prompt lets the AI return rulebook dice formulas (e.g. `5*(3d6)`) instead of fixed values. Characteristics are then rolled on token drop, giving each NPC a unique stat spread while preserving the AI-generated flavour. The confirmation dialog displays the formula strings for review before accepting.

### Fixed

- Null guard added to `applyRandomCharacteristics` to prevent errors when characteristic data is missing.
- Removed double-escaping of formula strings in the non-random confirmation dialog cell renderer.

## [0.4.2] - 2026-04-16

### Changed

- Extracted AI generator styles into a dedicated CSS file (previously inline).
- Extracted Close All Cards styles into a dedicated CSS file.
- Extracted shared `escapeHtml` helper into `scripts/utils.js`, removing duplication across modules.
- Merged duplicate weapon/NPC prompt-view functions in `dialog-injector.js`.
- Replaced inline `img.style.cursor` assignments with a CSS class for the image popout trigger.

### Fixed

- Restored inline comments and fixed config propagation through `runGeneration`.

## [0.4.1] - 2026-04-15

### Fixed

- Improved error logging for AI generation failures: invalid JSON responses from LLM providers now log the full raw response to the browser console, and all FoundryVTT operation errors (actor/item creation, skill attachment) are consistently logged with their full stack trace.

## [0.4.0] - 2026-04-15

### Added

- **AI Weapon Generator** — GMs can generate CoC7 weapon items from a natural-language description inside FoundryVTT.
- **AI NPC Generator** — GMs can generate CoC7 NPC actors with full stat block, AI-curated skills, and narrative prose (appearance, personality, background).
- **Close All Cards** — GMs can bulk-close all open chat message cards from the Keeper toolbar, with a card selection dialog.
- Three LLM providers: Anthropic (Claude), OpenAI (GPT), Google Gemini.
- Module settings for provider, API key, endpoint, and model. API key stored client-side only.
- AI button appears only when a supported type is selected in creation dialogs.

### Fixed

- NPC skills resolved against the CoC7 compendium when available, with specialization fallback.
- HTML escaping for all LLM-generated content to prevent XSS.

## [0.3.0] - 2026-04-08

### Added

- **Possession Tab Item Image Popout** — Players and GMs can click on the small item icon in the Gear & Cash tab of the character sheet to view the full-size illustration in a popout window.

## [0.2.0] - 2026-04-08

### Added

- CoC7 8.x system compatibility (AppV2 sheets).

### Fixed

- Item image popout hook updated for CoC7 8.x AppV2 sheets.
- Guard against null document in ImagePopout title.

## [0.1.0] - 2026-03-28

### Added

- **Item Image Popout** — Players can click on any item image to view the full-size illustration in a draggable, resizable popout window. GMs retain the default file picker behavior.

[Unreleased]: https://github.com/martin-papy/coc7-qol/compare/v0.4.3...HEAD
[0.4.3]: https://github.com/martin-papy/coc7-qol/compare/v0.4.2...v0.4.3
[0.4.2]: https://github.com/martin-papy/coc7-qol/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/martin-papy/coc7-qol/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/martin-papy/coc7-qol/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/martin-papy/coc7-qol/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/martin-papy/coc7-qol/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/martin-papy/coc7-qol/releases/tag/v0.1.0
