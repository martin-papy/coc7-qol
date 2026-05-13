# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [0.4.5] - 2026-05-13

### Security

- `escapeHtml` extended to the full OWASP attribute-value set (`&`, `<`, `>`, `"`, `'`, `/`, backtick) in a single-pass regex, closing escape gaps that surfaced with French apostrophes (`l'Arkham`, `d'âge moyen`) breaking the placeholder attribute.
- Gemini API key moved from the URL query string to the `x-goog-api-key` request header so the key no longer leaks into browser history, proxy logs, or `Referer` headers.
- Provider error responses sanitized before display: `formatApiError()` maps 401/429/5xx to friendly strings, strips HTML tags, and truncates unknown bodies to 300 chars — Cloudflare/proxy HTML interstitials no longer reach `ui.notifications.error`.
- API key setting hint strengthened to surface the direct-browser-access caveat (the key is sent from the player's browser and is readable by any module on the client). Users are now advised to use a provider-scoped, spend-limited key.

### Fixed

- 60 s `AbortController` timeout added to all three LLM providers (Anthropic, OpenAI, Gemini). Stuck requests now fail cleanly through the existing error surface instead of leaving the UI in "Generating…" indefinitely.
- Anthropic `max_tokens` raised from 1024 to 4096, matching the OpenAI/Gemini ceiling. Long NPC responses (characteristics + skills + narrative) no longer get truncated mid-JSON and crash `JSON.parse`.
- `applyRandomCharacteristics` now returns a new object instead of mutating its argument — the call site in `dialog-injector` was updated to capture the returned value.
- Weapon range enforced as a finite integer or `null` for melee. The system prompt requests no unit, and `toFoundryData` writes `system.range.normal.value` as a number — string units (e.g. `"50 m"`) can no longer slip through.
- Single quotes (`'` → `&#39;`) added to `escapeHtml`; placeholder attribute switched from single to double quotes in `dialog-injector` so French strings render correctly.

### Changed

- Module compatibility bumped: FoundryVTT minimum **v13**, verified **v14**. CoC7 system minimum **v8**.

## [0.4.4] - 2026-04-17

### Added

- **Internationalization (i18n)** — All user-visible strings are now extracted into translation JSON files. Module supports English and French at launch. Strings are managed via FoundryVTT's built-in i18n system (`game.i18n.localize()`). Settings automatically display in the user's configured language.

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

[Unreleased]: https://github.com/martin-papy/coc7-qol/compare/v0.4.5...HEAD
[0.4.5]: https://github.com/martin-papy/coc7-qol/compare/v0.4.4...v0.4.5
[0.4.4]: https://github.com/martin-papy/coc7-qol/compare/v0.4.3...v0.4.4
[0.4.3]: https://github.com/martin-papy/coc7-qol/compare/v0.4.2...v0.4.3
[0.4.2]: https://github.com/martin-papy/coc7-qol/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/martin-papy/coc7-qol/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/martin-papy/coc7-qol/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/martin-papy/coc7-qol/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/martin-papy/coc7-qol/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/martin-papy/coc7-qol/releases/tag/v0.1.0
