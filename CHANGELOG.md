# Changelog

All notable changes to this project will be documented in this file.

## [0.7.0] - 2026-08-25

### Added

- **Grouped Rest Targets** — The Keeper's **Start Rest** dialog used to list every actor in the world as one flat, unticked list, so resting just the party meant scrolling past every NPC and creature. Actors are now grouped into Investigators / NPCs / Creatures / Vehicles (empty groups hidden), the Investigators come pre-selected with their group expanded, and each group heading carries its own select-all checkbox that mirrors the group's state. The system's **All Actors** box now ticks and unticks every row (and shows a partial state) instead of silently overriding them. The rest itself is unchanged.
- **Hidden Initiative Rolls** — With CoC7's *Optional* initiative rule, the initiative roll of a combatant hidden in the tracker or on the canvas was posted publicly, revealing the hidden NPC's name and result to every player (CoC7 issue [#2149](https://github.com/Miskatonic-Investigative-Society/CoC7-FoundryVTT/issues/2149); Foundry core keeps these rolls GM-only, but the system's initiative override drops that rule). The module now whispers such rolls to the GMs. It only ever tightens visibility — a roll that already reaches only the GMs (GM whisper or blind) is left alone, while one CoC7 whispers to the players (*Self Roll* with *whisper target: everyone*) is narrowed to the GMs — so it cannot conflict with the upstream fix once it ships, and it prints a console note the day it notices it has become redundant.

## [0.6.0] - 2026-07-29

### Fixed

- **AI-generated NPCs were systematically over-skilled** — A beat constable came out with Fighting (Brawl) at 60%, the range for someone who fights for a living, with every other skill bunched in the same band. The generator now follows the rulebook's expertise ladder: an NPC declares its peak competence, only the two-to-four skills its occupation is actually built on may reach it, and combat skills stay amateur unless the role is genuinely violent. Base values act as a floor, and the 14 core skills are always present.
- **Skill values did not survive to the NPC sheet** — Every generated skill arrived inflated by its own base value (Spot Hidden 40% became 65%; Dodge and the native language doubled), so the sheet disagreed with the review dialog. They now match.
- **The NPC's native language was a placeholder** — A native English speaker now gets `Language (English)` at EDU, marked as their own tongue, instead of the unnamed `Language (Own)` template.
- **Auto-added weapon skills could sit below their base value** — The 20% fallback was illegal for Fighting (Brawl), whose base is 25%.

### Added

- **Expertise tiers in the NPC review dialog** — Skills at or above the NPC's declared peak are labelled with their tier, anything overshooting it is flagged, and the count appears in the warnings box, so an over-tuned skill is visible before you accept.

## [0.5.1] - 2026-07-29

### Fixed

- **GM-only highlighting missed the damage/heal buttons on plain roll cards** — The Keeper's-view highlight never marked the `Set as damage/heal` and `Remove from <resource>` buttons, so the Keeper had no cue that players see neither. 

## [0.5.0] - 2026-06-18

### Added

- **GM-only visibility highlighting** — For Keepers, a new world setting (on by default) highlights the parts of item sheets and chat cards that players cannot see. On item sheets, the non-obvious GM-only tabs (a book's Details/Content/Spells) get a crimson label and a tinted content panel, while the self-explanatory Keeper-notes tab is left alone. On chat cards, sections the player cannot see at all get a solid crimson outline/tint + eye-slash badge, while controls the player can see but not change (read-only) get a dashed amber outline + lock icon. Toggle it in the module settings (page reload applies the change to existing chat messages).

## [0.4.9] - 2026-06-01

### Fixed

- **AI generator dialogs unusable on small displays** — The AI NPC review dialog (and the weapon review dialog) could grow taller than the viewport, and because Foundry caps ApplicationV2 windows at the screen height while clipping `.window-content` overflow, the Accept / Regenerate / Cancel buttons fell off-screen with no scrollbar — making NPC creation impossible. The dialog content now fills the window and scrolls internally, the action footer is pinned so it stays visible while scrolling, and both dialogs are resizable. ([#8](https://github.com/martin-papy/coc7-qol/issues/8))

## [0.4.8] - 2026-05-22

### Fixed

- **Roll visibility with 'Self' chat mode** — Blind and private rolls now correctly reach the GM when the Foundry chat box is set to `Self`. Foundry v13's `ChatMessage.applyRollMode` preserves pre-existing whisper recipients, so CoC7's `[self.id]` pre-population was overriding the GM list for `blindroll` and `gmroll`. The whisper array is now reset before applying the chosen roll mode.

### Changed

- CI: bumped `actions/checkout` to v5 for Node.js 24 support in the release workflow.

## [0.4.7] - 2026-05-19

### Changed

- Small updates in documentation and various housekeeping

## [0.4.6] - 2026-05-17

### Added

- **AI NPC equipment** — NPC generation now returns weapons and possessions alongside characteristics and skills. Weapons render in a dedicated section of the confirmation dialog (name, skill, damage, range, ammo); possessions render as a flat list. Items can be toggled on/off before acceptance and are created in a single batch on accept.
- **AI NPC warnings** — A warnings section in the confirmation dialog surfaces non-blocking issues raised by the generator (e.g. ambiguous skill, suspicious value) so the GM can review them before creating the actor.
- **Language-aware prompts** — The NPC system prompt now instructs the model to honour the world locale for names and prose, so output matches the language of the campaign.
- **Roll visibility selector** — A roll visibility dropdown (public / private / blind / self) is now embedded in the CoC7 bonus dialog. The last choice is remembered per user and persisted through CoC7 standby flags so it survives the standby → resolve roundtrip.

### Fixed

- AI-generated NPCs that reference a weapon now also get the matching skill auto-added when it is missing from the skills list (e.g. *Pocket Knife* → *Fighting (Brawl)*), with a fallback skill value of 20.
- Civilian NPCs default to 0 weapons unless the role is explicitly combat — pharmacists no longer ship with revolvers.
- Weapon `usesPerRound` split into `normal` and `max` so multi-shot weapons map correctly to CoC7's data model, and default ammo now falls back to magazine capacity instead of zero.
- Weapon detail span in the NPC confirmation dialog is HTML-escaped, and remove listeners are deduplicated to avoid double-firing on re-render.

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