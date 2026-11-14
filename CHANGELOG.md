# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- **Group Luck roll request** — A **Group Luck** button in the Keeper's tools lists the investigators present, highlights the lowest Luck, and whispers that player a Luck check link, or rolls it for the Keeper if they are offline (CoC7 issue [#1984](https://github.com/Miskatonic-Investigative-Society/CoC7-FoundryVTT/issues/1984)).
- **Resizable NPC and Creature sheets** — The sheets can be resized, scroll inside their window, and stay on screen when sections open (CoC7 issues [#1416](https://github.com/Miskatonic-Investigative-Society/CoC7-FoundryVTT/issues/1416) and [#1621](https://github.com/Miskatonic-Investigative-Society/CoC7-FoundryVTT/issues/1621)). Setting: *Resizable*.
- **NPC skills in columns** — NPC and Creature skills read down each column like the investigator sheet, with more columns on a wider sheet (CoC7 issue [#1622](https://github.com/Miskatonic-Investigative-Society/CoC7-FoundryVTT/issues/1622)). Setting: *Skills in columns*.
- **Cast spells from the actor sheet** — Each spell row has a cast icon; the Keeper can right-click it to cast hidden (CoC7 issue [#926](https://github.com/Miskatonic-Investigative-Society/CoC7-FoundryVTT/issues/926)).
- **Strong skills highlighted** — Skills at 50% or more stand out on all actor sheets (CoC7 issue [#1884](https://github.com/Miskatonic-Investigative-Society/CoC7-FoundryVTT/issues/1884)). Settings: *Highlight strong skills*, *Strong skill threshold*.

### Changed

- **Module settings grouped into sections** — One heading per feature, with shorter labels.
- **CoC7 8.16 or later is required.**

### Removed

- **Hidden Initiative Rolls** — Fixed in CoC7 itself (issue [#2149](https://github.com/Miskatonic-Investigative-Society/CoC7-FoundryVTT/issues/2149)).

### Fixed

- **Roll visibility leaking onto the next message** — The visibility picked in the roll dialog now applies only to that roll's card.
- **Empty module page in a player's settings** — The API key setting is now listed for GMs only.
- **AI Generator: missing French strings** — Twelve strings of the NPC review dialog are now translated.
- **AI Generator: retired default models** — The Gemini default `gemini-2.0-flash` was shut down by Google. Defaults are now `gemini-3.8-flash`, `gpt-6.1-terra` (was `gpt-4o`) and `claude-sonnet-5-5` (was `claude-sonnet-4-6`). Worlds that already stored a model keep it.
- **AI Generator: unknown model error** — A retired or mistyped model now points to the *Model* setting instead of showing the raw provider error.
- **AI Generator: weapon description shown as HTML** — Markup in a generated weapon's description now shows as text ([#61](https://github.com/martin-papy/coc7-qol/issues/61)).
- **AI Generator: provider change wrote settings from every client** — Changing the provider no longer fails on players' clients or overwrites a custom endpoint entered at the same time ([#43](https://github.com/martin-papy/coc7-qol/issues/43)).
- **Keeper-only highlights setting reloaded every client** — Toggling it no longer reloads anyone; the Keeper's open chat cards and item sheets update at once ([#56](https://github.com/martin-papy/coc7-qol/issues/56)).
- **Cast control missing on NPC and Creature sheets on CoC7 8.16** ([#44](https://github.com/martin-papy/coc7-qol/issues/44)).
- **README: manual install** — The steps now extract into a `Data/modules/coc7-qol/` folder ([#45](https://github.com/martin-papy/coc7-qol/issues/45)).
- **Module description** — The manifest and README intro now list every feature ([#46](https://github.com/martin-papy/coc7-qol/issues/46)).

## [0.8.0] - 2026-11-11

### Fixed

- **Close All Cards left closed cards actionable** — *Push* and bonus/penalty-die buttons are now removed too.
- **Close All Cards listed some cards under "Unknown"** — Cards without a speaker now show their actor.
- **Blind and private rolls could turn public on Foundry v14 with CoC7 9.x.**
- **Roll visibility row misaligned in the CoC7 9.x roll dialog.**

### Changed

- **CoC7 9.x compatibility** — All features checked against CoC7 9.1 and Foundry v14; no more v14 deprecation warnings.

## [0.7.1] - 2026-10-12

### Changed

- **Hidden Initiative Rolls defer to CoC7 8.16** — On CoC7 8.16+, which fixes issue [#2149](https://github.com/Miskatonic-Investigative-Society/CoC7-FoundryVTT/issues/2149), the module only hides the "*privately rolled some dice*" placeholder.

## [0.7.0] - 2026-08-25

### Added

- **Grouped Trade / Store Targets** — The **Trade / Store Item** dropdown is grouped by actor type, sorted by name, and requires an explicit choice.
- **Grouped Rest Targets** — The **Start Rest** dialog groups actors by type, pre-selects the investigators, and adds a select-all box per group.
- **Hidden Initiative Rolls** — Initiative rolls of hidden combatants are whispered to the GMs instead of revealed to players (CoC7 issue [#2149](https://github.com/Miskatonic-Investigative-Society/CoC7-FoundryVTT/issues/2149)).

## [0.6.0] - 2026-07-29

### Fixed

- **AI-generated NPCs were over-skilled** — Skills now follow the rulebook's expertise ladder.
- **Skill values changed on the NPC sheet** — The sheet now matches the review dialog.
- **NPC native language was a placeholder** — It is now named, e.g. `Language (English)`.
- **Auto-added weapon skills could sit below their base value.**

### Added

- **Expertise tiers in the NPC review dialog** — Skills above the NPC's declared tier are flagged.

## [0.5.1] - 2026-07-29

### Fixed

- **GM-only highlighting missed the damage/heal buttons on plain roll cards.**

## [0.5.0] - 2026-06-18

### Added

- **GM-only visibility highlighting** — Highlights, for Keepers, the parts of item sheets and chat cards players cannot see (crimson) or cannot change (amber). On by default.

## [0.4.9] - 2026-06-01

### Fixed

- **AI generator dialogs unusable on small displays** — The review dialogs now scroll, keep their buttons visible, and are resizable ([#8](https://github.com/martin-papy/coc7-qol/issues/8)).

## [0.4.8] - 2026-05-22

### Fixed

- **Roll visibility with 'Self' chat mode** — Blind and private rolls now reach the GM.

### Changed

- CI: `actions/checkout` bumped to v5.

## [0.4.7] - 2026-05-19

### Changed

- Documentation updates and housekeeping.

## [0.4.6] - 2026-05-17

### Added

- **AI NPC equipment** — Generated NPCs come with weapons and possessions, which can be toggled before accepting.
- **AI NPC warnings** — The review dialog lists issues raised by the generator.
- **Language-aware prompts** — NPC output follows the world's language.
- **Roll visibility selector** — A public / private / blind / self dropdown in the CoC7 roll dialog, remembered per user.

### Fixed

- Weapons on AI NPCs now bring their missing skill.
- Civilian NPCs no longer get weapons by default.
- Multi-shot weapons and default ammo now map correctly.
- NPC review dialog: escaping and duplicate listener fixes.

## [0.4.5] - 2026-05-13

### Security

- Stricter HTML escaping (full OWASP set).
- Gemini API key sent in a header instead of the URL.
- Provider error responses sanitized before display.
- API key hint warns that the key is sent from the browser.

### Fixed

- 60 s timeout on all AI provider requests.
- Long Anthropic responses no longer truncated.
- Weapon range always stored as a number.
- French strings with apostrophes render correctly.

### Changed

- Requires FoundryVTT v13+ (verified v14) and CoC7 v8+.

## [0.4.4] - 2026-04-17

### Added

- **Internationalization** — English and French translations.

## [0.4.3] - 2026-04-16

### Added

- **NPC random characteristics** — AI NPCs can use dice formulas, rolled on token drop.

### Fixed

- Errors when characteristic data was missing.
- Double-escaped formulas in the review dialog.

## [0.4.2] - 2026-04-16

### Changed

- Internal refactoring: styles moved to CSS files, shared helpers deduplicated.

### Fixed

- Generation config propagation.

## [0.4.1] - 2026-04-15

### Fixed

- Better console logging of AI generation failures.

## [0.4.0] - 2026-04-15

### Added

- **AI Weapon Generator** — Generate weapon items from a description.
- **AI NPC Generator** — Generate NPCs with characteristics, skills and narrative.
- **Close All Cards** — Bulk-close open chat cards from the Keeper toolbar.
- Anthropic, OpenAI and Gemini providers, configured in the module settings.

### Fixed

- NPC skills resolved against the CoC7 compendium.
- AI-generated content HTML-escaped.

## [0.3.0] - 2026-04-08

### Added

- **Possession Tab Item Image Popout** — Click an item icon in the Gear & Cash tab to view its image.

## [0.2.0] - 2026-04-08

### Added

- CoC7 8.x compatibility.

### Fixed

- Item image popout on CoC7 8.x sheets.

## [0.1.0] - 2026-03-28

### Added

- **Item Image Popout** — Players can click an item image to view it full size.
