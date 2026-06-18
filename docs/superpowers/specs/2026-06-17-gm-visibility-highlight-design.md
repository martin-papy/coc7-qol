# GM-Visibility Highlight — Design

**Date:** 2026-06-17
**Status:** Approved (pending implementation plan)
**Branch:** `feature-gm-visibility-highlight`

## Problem

In the Call of Cthulhu 7th Edition (CoC7) system, a Keeper (GM) cannot easily tell,
while looking at the UI, which parts of an element are visible to players and which
are GM-only. Two surfaces make this confusing:

- **Item sheets** — e.g. a Book item shows the player only the *Description* tab,
  while the GM additionally sees *Content*, *Details*, *Spells*, and *Keeper notes*.
- **Chat cards** — some buttons/blocks are GM-only and are removed from the player's
  view entirely.

The GM has no visual cue distinguishing "the player sees this too" from "only I see
this," which leads to accidental information leaks or wasted second-guessing.

## Goal

For GMs only, visually highlight the UI elements that are GM-only, so the Keeper can
tell at a glance what a player cannot see. Scope for v1: **chat cards** and **item
sheets**.

## How CoC7 marks GM-only content (research findings)

- **Chat cards** use reliable, stable marker classes in their Handlebars templates:
  - `.keeper-only-block` — a region only the Keeper sees. The system's
    `render-chat-message-html.js` hook `.remove()`s these for non-GM viewers and
    keeps them for GMs.
  - `.keeper-only-control` — an individual control (button/slider) disabled for
    non-GMs.
  - `.owner-and-keeper-block` — visible to the actor's **owner too**, therefore
    **not** strictly GM-only.
  - `.not-keeper-block` — removed for GMs, so a GM never sees it.
- **Item sheets** have **no** marker class. GM-only tabs are added conditionally in
  each sheet model's `_prepareContext` based on `game.user.isGM`. The consistent
  pattern across nearly all item sheets:
  - `keeper` tab — gated by `if (game.user.isGM)` — **always GM-only** (present on
    book, weapon, armor, skill, talent, occupation, archetype, status, setup,
    experience-package, chase, generic item).
  - `details` tab — GM-only on **book** and **spell** sheets.
  - `content` / `spells` tabs (book only) — gated by
    `game.user.isGM || (knownBook?.initialReading ?? false)`, i.e. GM-only **only
    when the actor has not read the book**. Once read, players see them too.
- **Rendered DOM contract** (Foundry v13 ApplicationV2 + core
  `templates/generic/tab-navigation.hbs`):
  - Tab nav button: `<a data-action="tab" data-group="primary" data-tab="<key>"><span>label</span></a>`
  - Tab panel: `<section class="tab ..." data-group="primary" data-tab="<key>">`

## Decisions (from brainstorming)

1. **Scope:** chat cards + item sheets.
2. **Activation:** a single **world-scoped** boolean setting (GM-configurable),
   default on. No toolbar toggle.
3. **Visual treatment:** outline + faint tint + icon badge, driven by shared CSS
   custom properties so the accent is easy to retune.
4. **Conditional book tabs:** compute the book read-state accurately so `content`
   and `spells` are flagged only when genuinely GM-only.
5. **Architecture:** small feature directory (`scripts/gm-visibility/`).
6. **Tabs:** mark **both** the nav button and its panel.

## Architecture

A small feature directory mirroring the `ai-generator/` registry style. JS detects
GM-only elements and stamps a marker class + badge; CSS does all styling; a world
setting gates everything.

```
scripts/gm-visibility/
├── index.js          # registers the setting + wires both render hooks
├── settings.js       # world-scoped boolean setting registration + accessor
├── chat-cards.js     # renderChatMessageHTML hook
├── item-sheets.js    # renderItemSheetV2 hook
└── tab-rules.js      # per-item-type GM-only tab registry + read-state logic
styles/gm-visibility.css
```

`module.json`: add `scripts/gm-visibility/index.js` to `esmodules` and
`styles/gm-visibility.css` to `styles`.

### 1. Activation & gating (`settings.js`)

- Register `highlight-gm-only` at `init`: `scope: 'world'`, `config: true`,
  `type: Boolean`, `default: true`, name/hint localised.
- Export a helper `isHighlightEnabled()` that returns
  `game.user.isGM && game.settings.get('coc7-qol', 'highlight-gm-only')`,
  guarded against the setting not yet being registered.
- When enabled, hooks add a root marker class `coc7qol-gm-highlight` to the rendered
  element so the CSS only activates when the feature is on.

### 2. Chat cards (`chat-cards.js`)

Hook `renderChatMessageHTML(message, html, context)` (v13 — `html` is an
`HTMLElement`). When `isHighlightEnabled()`:

- Add `coc7qol-gm-highlight` to the message root.
- Add marker class `coc7qol-gm-only` to every `.keeper-only-block`.
- Add `coc7qol-gm-only` to each `.keeper-only-control` that is **not** already inside
  a flagged `.keeper-only-block` (avoid double-marking).
- Prepend one eye-slash badge per top-level GM-only region.
- Do **not** mark `.owner-and-keeper-block` (owners see those).
- Re-render guard: skip elements already carrying `coc7qol-gm-only`.

### 3. Item sheets (`item-sheets.js` + `tab-rules.js`)

Hook `renderItemSheetV2(application, element, context, options)`. When
`isHighlightEnabled()`:

- Resolve the set of GM-only tab keys for `application.document` via `tab-rules.js`.
- For each key:
  - Nav button `a[data-tab="<key>"]` within the sheet → add `coc7qol-gm-only` and
    append an eye-slash badge to its `<span>`.
  - Panel `section.tab[data-tab="<key>"]` → add `coc7qol-gm-only`.
- Add `coc7qol-gm-highlight` to the sheet root.
- Wrap the whole per-sheet routine in try/catch (see Error handling).

`tab-rules.js` exports a registry:

- A **default** rule applied to every item type: `{ key: 'keeper', always: true }`.
- Per-`item.type` extensions, each rule being either:
  - `{ key, always: true }` — e.g. `details` for `book` and `spell`.
  - `{ key, when: (doc) => boolean }` — e.g. for `book`, `content` and `spells`
    are GM-only when
    `!(doc.actor?.system?.getBook?.(doc)?.initialReading ?? false)`.
- A resolver `gmOnlyTabKeys(doc)` returns the keys whose rule resolves truthy.
- World items (no actor) → `getBook` undefined → `initialReading` false → unread →
  `content`/`spells` flagged. Adding coverage later = one registry entry.

### 4. Styling (`styles/gm-visibility.css`)

Tunable via CSS custom properties:

```css
:root {
  --coc7qol-gm-accent: crimson;
  --coc7qol-gm-tint: rgb(220 20 60 / 0.08);
}
```

- `.coc7qol-gm-highlight button.coc7qol-gm-only`,
  `.coc7qol-gm-highlight .keeper-only-control.coc7qol-gm-only` →
  `outline: 2px solid var(--coc7qol-gm-accent)` + small `outline-offset`.
- `.coc7qol-gm-highlight .coc7qol-gm-only` regions/panels → left border in the accent
  + faint `--coc7qol-gm-tint` background.
- Badge: inline `fa-eye-slash` icon in the accent colour, with a tooltip
  "Only the Keeper can see this." (localised).
- All rules scoped under `.coc7qol-gm-highlight` so they are inert when the setting
  is off (the root class is only added when enabled).

### 5. i18n

New keys under `COC7QOL.GmVisibility.*` in `lang/en.json` and `lang/fr.json`:

- `COC7QOL.GmVisibility.SettingName`
- `COC7QOL.GmVisibility.SettingHint`
- `COC7QOL.GmVisibility.BadgeTooltip` → "Only the Keeper can see this."

### 6. Error handling & resilience

- All sheet detection wrapped in try/catch; a missing `getBook`, unexpected DOM, or
  non-book item must never throw into the system's render pipeline. On failure, log a
  single `console.warn('[coc7-qol] ...', err)` and bail for that render.
- Re-render guards on both surfaces (skip already-marked elements).
- Badge insertion is idempotent (guard against duplicate badges on re-render).

## Testing

No automated tests (project norm). Manual + Playwright against the live Foundry
instance (`http://localhost:30000`, module symlinked — JS applies on reload, CSS on
reload). As **Gamemaster**:

1. World Book item → Content, Details, Spells, Keeper notes tabs all flagged.
2. Actor-owned **read** Book → Content/Spells **not** flagged; Keeper/Details flagged.
3. Combat/damage chat card → `.keeper-only` buttons outlined; `owner-and-keeper`
   buttons **not** outlined.
4. Log in as a **player** → no markers anywhere.
5. Toggle the world setting **off** → all markers gone after re-render.

Assert with real measurements (`getComputedStyle` on outline/border, badge presence)
and capture screenshots at relevant breakpoints.

## Out of scope (v1)

- Actor sheets (NPC/creature/vehicle keeper tabs and GM-only fields).
- Marking `owner-and-keeper` / owner-only chat blocks.
- A scene-controls toolbar toggle (world setting only).
```
