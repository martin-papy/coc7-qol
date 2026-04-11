# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **AI Weapon Generator** — GMs can generate fully-formed CoC7 weapon items from a natural-language description directly inside FoundryVTT.
- **AI NPC Generator** — GMs can generate fully-formed CoC7 NPC actors from a natural-language prompt, with full stat block (8 characteristics), AI-curated skills, and narrative prose (appearance, personality, background).
- Three LLM providers: Anthropic (Claude), OpenAI (GPT), Google Gemini.
- Module settings for provider selection, API key, endpoint URL, and model.
- In-place transformation of the native Create Item and Create Actor dialogs with prompt textarea.
- Lightweight confirmation dialog for weapons with editable name and read-only stats preview.
- Rich read-only confirmation dialog for NPC previews, showing characteristics grid, skills list, and narrative sections before creation.
- NPC skills are resolved against the official CoC7 skills compendium when available, preserving proper skill flags and identifiers. Unknown skills are created with specialization parsing via the CoC7 system.
- AI sparkle button only appears when a supported type is selected in the creation dialog (weapon for items, NPC for actors).
- Live endpoint/model update when switching providers in settings.

### Fixed

- API key stored client-side (localStorage) to prevent exposure to players.
- API key input obfuscated as password field in settings.
- Buttons missing after AI transform due to detached footer element.
- Confirmation dialog buttons laid out in a row instead of stacked.
- AI generation button no longer appears on the Create Actor dialog when only weapon generation was supported.
- Guard against `Actor.create()` returning null (e.g. when a pre-create hook cancels creation).
- HTML escaping for LLM-generated narrative content to prevent XSS.

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
