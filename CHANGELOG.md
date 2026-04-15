# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

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

[Unreleased]: https://github.com/martin-papy/coc7-qol/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/martin-papy/coc7-qol/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/martin-papy/coc7-qol/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/martin-papy/coc7-qol/releases/tag/v0.1.0
