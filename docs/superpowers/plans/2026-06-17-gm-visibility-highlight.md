# GM-Visibility Highlight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** For GMs only, visually highlight (outline + tint + eye-slash badge) the chat-card regions/controls and item-sheet tabs that players cannot see, gated by a world-scoped setting.

**Architecture:** A small feature directory `scripts/gm-visibility/`. JS render hooks detect GM-only elements and stamp a marker class + badge; a single CSS file (driven by tunable custom properties) does all styling; a world-scoped boolean setting gates everything via an `isHighlightEnabled()` helper that also checks `game.user.isGM`.

**Tech Stack:** Vanilla ES modules loaded directly by FoundryVTT v13+ (no build step). FoundryVTT Hooks API (`renderChatMessageHTML`, `renderItemSheetV2`), `game.settings`, `game.i18n`. CoC7 system as the host.

---

## Testing note (project reality)

This project has **no automated test runner** (see `CLAUDE.md`). The standard TDD red/green file cycle does not apply. Instead, each task's verification step uses one of:

- **Static checks** — `node --check` for JS syntax, `python3 -m json.tool` for JSON validity.
- **Playwright against the live Foundry instance** at `http://localhost:30000` (module is symlinked into Foundry's `Data/modules/coc7-qol`, so working-tree edits are live; JS and CSS both apply on page reload). Use the Playwright MCP server when available.

If no Foundry instance is running, perform the Playwright steps manually and check the box once verified. Do not skip verification silently.

## File Structure

- Create: `scripts/gm-visibility/settings.js` — world setting registration, shared constants, `isHighlightEnabled()`.
- Create: `scripts/gm-visibility/badge.js` — eye-slash badge element factory + idempotent insertion helper.
- Create: `scripts/gm-visibility/tab-rules.js` — per-item-type GM-only tab registry + `gmOnlyTabKeys(doc)` resolver (incl. book read-state logic).
- Create: `scripts/gm-visibility/chat-cards.js` — `highlightChatCard(message, html)`.
- Create: `scripts/gm-visibility/item-sheets.js` — `highlightItemSheet(application, element)`.
- Create: `scripts/gm-visibility/index.js` — registers the setting at `init` and wires both render hooks.
- Create: `styles/gm-visibility.css` — tunable accent variables + all marker styling.
- Modify: `module.json` — add the esmodule entry and the style entry.
- Modify: `lang/en.json`, `lang/fr.json` — three `COC7QOL.GmVisibility.*` keys each.

---

### Task 1: World setting + i18n + module wiring skeleton

**Files:**
- Create: `scripts/gm-visibility/settings.js`
- Create: `scripts/gm-visibility/index.js`
- Modify: `module.json` (esmodules array)
- Modify: `lang/en.json` (add 3 keys)
- Modify: `lang/fr.json` (add 3 keys)

- [ ] **Step 1: Create the settings module**

Create `scripts/gm-visibility/settings.js`:

```js
// scripts/gm-visibility/settings.js

const MODULE = 'coc7-qol'

export const SETTING_KEY = 'highlight-gm-only'
export const ROOT_CLASS = 'coc7qol-gm-highlight'
export const MARKER_CLASS = 'coc7qol-gm-only'

/**
 * Register the world-scoped on/off setting for GM-visibility highlighting.
 * Call once during the 'init' hook.
 */
export function registerGmVisibilitySettings () {
  game.settings.register(MODULE, SETTING_KEY, {
    name: 'COC7QOL.GmVisibility.SettingName',
    hint: 'COC7QOL.GmVisibility.SettingHint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true
  })
}

/**
 * True only for GMs when the world setting is enabled.
 * Guarded so a not-yet-registered setting can never throw into a render hook.
 * @returns {boolean}
 */
export function isHighlightEnabled () {
  if (!game.user?.isGM) return false
  try {
    return game.settings.get(MODULE, SETTING_KEY) === true
  } catch (_) {
    return false
  }
}
```

- [ ] **Step 2: Create the index module (settings wiring only for now)**

Create `scripts/gm-visibility/index.js`:

```js
// scripts/gm-visibility/index.js

import { registerGmVisibilitySettings } from './settings.js'

Hooks.once('init', registerGmVisibilitySettings)
```

- [ ] **Step 3: Register the esmodule in module.json**

In `module.json`, add `"scripts/gm-visibility/index.js"` as the last entry of the `esmodules` array. The array becomes:

```json
  "esmodules": [
    "scripts/utils.js",
    "scripts/item-image-popout.js",
    "scripts/possession-item-image-popout.js",
    "scripts/ai-generator/index.js",
    "scripts/close-all-cards.js",
    "scripts/roll-visibility.js",
    "scripts/gm-visibility/index.js"
  ]
```

- [ ] **Step 4: Add i18n keys to lang/en.json**

Insert these three lines immediately after the opening `{` (before `"COC7QOL.CloseAllCards.Title"`):

```json
  "COC7QOL.GmVisibility.SettingName": "Highlight GM-only sections",
  "COC7QOL.GmVisibility.SettingHint": "When enabled, the Keeper sees a red outline, tint, and badge marking the parts of item sheets and chat cards that players cannot see.",
  "COC7QOL.GmVisibility.BadgeTooltip": "Only the Keeper can see this.",
```

- [ ] **Step 5: Add i18n keys to lang/fr.json**

Insert these three lines immediately after the opening `{` (before `"COC7QOL.CloseAllCards.Title"`):

```json
  "COC7QOL.GmVisibility.SettingName": "Surligner les sections réservées au Gardien",
  "COC7QOL.GmVisibility.SettingHint": "Lorsque cette option est activée, le Gardien voit un contour rouge, une teinte et un badge indiquant les parties des fiches d'objets et des cartes de chat que les joueurs ne peuvent pas voir.",
  "COC7QOL.GmVisibility.BadgeTooltip": "Seul le Gardien peut voir ceci.",
```

- [ ] **Step 6: Verify JS syntax and JSON validity**

Run:
```bash
node --check scripts/gm-visibility/settings.js
node --check scripts/gm-visibility/index.js
python3 -m json.tool module.json > /dev/null && echo "module.json OK"
python3 -m json.tool lang/en.json > /dev/null && echo "en.json OK"
python3 -m json.tool lang/fr.json > /dev/null && echo "fr.json OK"
```
Expected: no errors; three `OK` lines printed.

- [ ] **Step 7: Verify the setting appears in Foundry (Playwright, as Gamemaster)**

Reload `http://localhost:30000`, then in `browser_evaluate`:
```js
game.settings.settings.get('coc7-qol.highlight-gm-only')?.name
```
Expected: `"COC7QOL.GmVisibility.SettingName"` (or its localised value), and:
```js
game.settings.get('coc7-qol', 'highlight-gm-only')
```
Expected: `true`.

- [ ] **Step 8: Commit**

```bash
git add scripts/gm-visibility/settings.js scripts/gm-visibility/index.js module.json lang/en.json lang/fr.json
git commit -m "feat: add GM-visibility world setting and module wiring"
```

---

### Task 2: Styling + badge helper

**Files:**
- Create: `styles/gm-visibility.css`
- Create: `scripts/gm-visibility/badge.js`
- Modify: `module.json` (styles array)

- [ ] **Step 1: Create the stylesheet**

Create `styles/gm-visibility.css`:

```css
/* styles/gm-visibility.css */

:root {
  --coc7qol-gm-accent: crimson;
  --coc7qol-gm-tint: rgb(220 20 60 / 0.08);
}

/* GM-only buttons / controls */
.coc7qol-gm-highlight button.coc7qol-gm-only,
.coc7qol-gm-highlight .keeper-only-control.coc7qol-gm-only {
  outline: 2px solid var(--coc7qol-gm-accent);
  outline-offset: 1px;
}

/* GM-only regions (chat blocks) and sheet tab panels */
.coc7qol-gm-highlight .keeper-only-block.coc7qol-gm-only,
.coc7qol-gm-highlight section.tab.coc7qol-gm-only {
  border-left: 3px solid var(--coc7qol-gm-accent);
  background-color: var(--coc7qol-gm-tint);
}

/* GM-only tab nav buttons */
.coc7qol-gm-highlight nav.sheet-tabs a.coc7qol-gm-only {
  color: var(--coc7qol-gm-accent);
}

/* Eye-slash badge */
.coc7qol-gm-badge {
  margin-left: 0.35em;
  color: var(--coc7qol-gm-accent);
  font-size: 0.85em;
}
```

- [ ] **Step 2: Register the stylesheet in module.json**

In `module.json`, add `"styles/gm-visibility.css"` as the last entry of the `styles` array:

```json
  "styles": [
    "styles/close-all-cards.css",
    "styles/ai-generator.css",
    "styles/gm-visibility.css"
  ],
```

- [ ] **Step 3: Create the badge helper**

Create `scripts/gm-visibility/badge.js`:

```js
// scripts/gm-visibility/badge.js

import { t } from '../utils.js'

const BADGE_CLASS = 'coc7qol-gm-badge'

/**
 * Build the eye-slash badge element marking a GM-only element.
 * @returns {HTMLElement}
 */
export function createGmBadge () {
  const badge = document.createElement('i')
  badge.className = `fa-solid fa-eye-slash ${BADGE_CLASS}`
  const tip = t('COC7QOL.GmVisibility.BadgeTooltip')
  badge.setAttribute('data-tooltip', tip)
  badge.setAttribute('aria-label', tip)
  return badge
}

/**
 * Insert a badge into target unless one is already present (idempotent on re-render).
 * @param {HTMLElement} target
 * @param {'append'|'prepend'} [position='append']
 */
export function addBadgeOnce (target, position = 'append') {
  if (!target || target.querySelector(`.${BADGE_CLASS}`)) return
  const badge = createGmBadge()
  if (position === 'prepend') target.prepend(badge)
  else target.append(badge)
}
```

- [ ] **Step 4: Verify JS syntax and JSON validity**

Run:
```bash
node --check scripts/gm-visibility/badge.js
python3 -m json.tool module.json > /dev/null && echo "module.json OK"
```
Expected: no errors; `module.json OK`.

- [ ] **Step 5: Verify the stylesheet loads in Foundry (Playwright, as Gamemaster)**

Reload `http://localhost:30000`, then in `browser_evaluate`:
```js
getComputedStyle(document.documentElement).getPropertyValue('--coc7qol-gm-accent').trim()
```
Expected: `"crimson"`.

- [ ] **Step 6: Commit**

```bash
git add styles/gm-visibility.css scripts/gm-visibility/badge.js module.json
git commit -m "feat: add GM-visibility stylesheet and badge helper"
```

---

### Task 3: Chat-card highlighting

**Files:**
- Create: `scripts/gm-visibility/chat-cards.js`
- Modify: `scripts/gm-visibility/index.js` (add chat hook)

- [ ] **Step 1: Create the chat-card handler**

Create `scripts/gm-visibility/chat-cards.js`:

```js
// scripts/gm-visibility/chat-cards.js

import { isHighlightEnabled, ROOT_CLASS, MARKER_CLASS } from './settings.js'
import { addBadgeOnce } from './badge.js'

/**
 * Mark GM-only regions and standalone controls on a rendered chat card.
 * Targets the system's stable .keeper-only-block / .keeper-only-control markers.
 * Deliberately ignores .owner-and-keeper-block (owners see those too).
 * @param {ChatMessage} message
 * @param {HTMLElement} html
 */
export function highlightChatCard (message, html) {
  if (!isHighlightEnabled()) return
  try {
    const blocks = html.querySelectorAll('.keeper-only-block')
    const looseControls = html.querySelectorAll('.keeper-only-control')
    if (!blocks.length && !looseControls.length) return

    html.classList.add(ROOT_CLASS)

    blocks.forEach(block => {
      if (block.classList.contains(MARKER_CLASS)) return
      block.classList.add(MARKER_CLASS)
      addBadgeOnce(block, 'prepend')
    })

    looseControls.forEach(control => {
      // Controls inside a flagged block are already covered by the block styling.
      if (control.closest('.keeper-only-block')) return
      control.classList.add(MARKER_CLASS)
    })
  } catch (err) {
    console.warn('[coc7-qol] GM-visibility chat highlight failed:', err)
  }
}
```

- [ ] **Step 2: Wire the chat hook in index.js**

Edit `scripts/gm-visibility/index.js` to add the import and hook. The full file becomes:

```js
// scripts/gm-visibility/index.js

import { registerGmVisibilitySettings } from './settings.js'
import { highlightChatCard } from './chat-cards.js'

Hooks.once('init', registerGmVisibilitySettings)

Hooks.on('renderChatMessageHTML', (message, html) => highlightChatCard(message, html))
```

- [ ] **Step 3: Verify JS syntax**

Run:
```bash
node --check scripts/gm-visibility/chat-cards.js
node --check scripts/gm-visibility/index.js
```
Expected: no errors.

- [ ] **Step 4: Verify on a real chat card (Playwright, as Gamemaster)**

Reload `http://localhost:30000`. Produce a CoC7 combat/damage card (or locate an existing one with GM-only buttons). In `browser_evaluate`, inspect the latest chat message element:
```js
const li = [...document.querySelectorAll('#chat-log .chat-message, .chat-message')].at(-1)
const block = li.querySelector('.keeper-only-block')
const res = {
  rootClass: li.classList.contains('coc7qol-gm-highlight'),
  blockMarked: block?.classList.contains('coc7qol-gm-only') ?? null,
  badge: !!block?.querySelector('.coc7qol-gm-badge'),
  borderLeft: block ? getComputedStyle(block).borderLeftWidth : null,
  ownerBlockMarked: li.querySelector('.owner-and-keeper-block')?.classList.contains('coc7qol-gm-only') ?? 'none'
}
res
```
Expected: `rootClass: true`, `blockMarked: true`, `badge: true`, `borderLeft` is `"3px"`, and `ownerBlockMarked` is `false` or `"none"` (never `true`). Capture a screenshot for visual confirmation.

- [ ] **Step 5: Commit**

```bash
git add scripts/gm-visibility/chat-cards.js scripts/gm-visibility/index.js
git commit -m "feat: highlight GM-only chat-card regions and controls"
```

---

### Task 4: Item-sheet tab rules registry

**Files:**
- Create: `scripts/gm-visibility/tab-rules.js`

- [ ] **Step 1: Create the tab-rules module**

Create `scripts/gm-visibility/tab-rules.js`:

```js
// scripts/gm-visibility/tab-rules.js

/**
 * A book's Content/Spells tabs are GM-only only while the owning actor has not
 * read the book. World items (no actor) and any lookup failure are treated as
 * unread — understating (not flagging) is safer than wrongly flagging.
 * @param {Item} doc
 * @returns {boolean}
 */
function bookUnread (doc) {
  try {
    const known = doc.actor?.system?.getBook?.(doc)
    return !(known?.initialReading ?? false)
  } catch (_) {
    return true
  }
}

// Applied to every item type.
const DEFAULT_RULES = [{ key: 'keeper', always: true }]

// Additional GM-only tab rules per item.type.
const TYPE_RULES = {
  book: [
    { key: 'details', always: true },
    { key: 'content', when: bookUnread },
    { key: 'spells', when: bookUnread }
  ],
  spell: [{ key: 'details', always: true }]
}

/**
 * Resolve the tab keys that are GM-only for this item document.
 * @param {Item} doc
 * @returns {string[]}
 */
export function gmOnlyTabKeys (doc) {
  const rules = [...DEFAULT_RULES, ...(TYPE_RULES[doc?.type] ?? [])]
  return rules
    .filter(rule => rule.always === true || (typeof rule.when === 'function' && rule.when(doc)))
    .map(rule => rule.key)
}
```

- [ ] **Step 2: Verify JS syntax**

Run:
```bash
node --check scripts/gm-visibility/tab-rules.js
```
Expected: no errors.

- [ ] **Step 3: Verify resolver logic in Foundry (Playwright, as Gamemaster)**

Reload `http://localhost:30000`, then in `browser_evaluate`:
```js
const { gmOnlyTabKeys } = await import('/modules/coc7-qol/scripts/gm-visibility/tab-rules.js')
// A world book item that has no owning actor → unread → content/spells flagged.
const book = game.items.find(i => i.type === 'book')
const weapon = game.items.find(i => i.type === 'weapon')
const out = {
  book: book ? gmOnlyTabKeys(book) : 'no-book',
  weapon: weapon ? gmOnlyTabKeys(weapon) : 'no-weapon'
}
out
```
Expected: for a world `book`, the array contains `keeper`, `details`, `content`, and (if mythos/occult) `spells`; for a `weapon`, exactly `["keeper"]`. (If no such items exist, create one via the directory first.)

- [ ] **Step 4: Commit**

```bash
git add scripts/gm-visibility/tab-rules.js
git commit -m "feat: add GM-only item-sheet tab rules registry"
```

---

### Task 5: Item-sheet highlighting

**Files:**
- Create: `scripts/gm-visibility/item-sheets.js`
- Modify: `scripts/gm-visibility/index.js` (add item-sheet hook)

- [ ] **Step 1: Create the item-sheet handler**

Create `scripts/gm-visibility/item-sheets.js`:

```js
// scripts/gm-visibility/item-sheets.js

import { isHighlightEnabled, ROOT_CLASS, MARKER_CLASS } from './settings.js'
import { gmOnlyTabKeys } from './tab-rules.js'
import { addBadgeOnce } from './badge.js'

/**
 * Mark GM-only tabs (nav button + panel) on a rendered item sheet.
 * @param {ItemSheetV2} application
 * @param {HTMLElement} element
 */
export function highlightItemSheet (application, element) {
  if (!isHighlightEnabled()) return
  try {
    const keys = gmOnlyTabKeys(application.document)
    if (!keys.length) return

    let marked = false
    keys.forEach(key => {
      const nav = element.querySelector(`nav.sheet-tabs a[data-tab="${key}"]`)
      if (nav && !nav.classList.contains(MARKER_CLASS)) {
        nav.classList.add(MARKER_CLASS)
        addBadgeOnce(nav.querySelector('span') ?? nav, 'append')
        marked = true
      }
      const panel = element.querySelector(`section.tab[data-tab="${key}"]`)
      if (panel && !panel.classList.contains(MARKER_CLASS)) {
        panel.classList.add(MARKER_CLASS)
        marked = true
      }
    })

    if (marked) element.classList.add(ROOT_CLASS)
  } catch (err) {
    console.warn('[coc7-qol] GM-visibility item-sheet highlight failed:', err)
  }
}
```

- [ ] **Step 2: Wire the item-sheet hook in index.js**

Edit `scripts/gm-visibility/index.js` to add the import and hook. The full file becomes:

```js
// scripts/gm-visibility/index.js

import { registerGmVisibilitySettings } from './settings.js'
import { highlightChatCard } from './chat-cards.js'
import { highlightItemSheet } from './item-sheets.js'

Hooks.once('init', registerGmVisibilitySettings)

Hooks.on('renderChatMessageHTML', (message, html) => highlightChatCard(message, html))

Hooks.on('renderItemSheetV2', (application, element) => highlightItemSheet(application, element))
```

- [ ] **Step 3: Verify JS syntax**

Run:
```bash
node --check scripts/gm-visibility/item-sheets.js
node --check scripts/gm-visibility/index.js
```
Expected: no errors.

- [ ] **Step 4: Verify on a world book sheet (Playwright, as Gamemaster)**

Reload `http://localhost:30000`. Open a world (unowned) **book** item sheet, then in `browser_evaluate`:
```js
const app = [...foundry.applications.instances.values()].find(a => a.document?.type === 'book')
const el = app.element
const tabState = key => ({
  navMarked: el.querySelector(`nav.sheet-tabs a[data-tab="${key}"]`)?.classList.contains('coc7qol-gm-only') ?? null,
  badge: !!el.querySelector(`nav.sheet-tabs a[data-tab="${key}"] .coc7qol-gm-badge`),
  panelMarked: el.querySelector(`section.tab[data-tab="${key}"]`)?.classList.contains('coc7qol-gm-only') ?? null
})
({ keeper: tabState('keeper'), details: tabState('details'), content: tabState('content'), description: tabState('description') })
```
Expected: `keeper`, `details`, and `content` each show `navMarked: true`, `badge: true`, `panelMarked: true`; `description` shows `navMarked: false`/`null` (the player-visible tab is never flagged). Capture a screenshot.

- [ ] **Step 5: Verify read-state on an owned, read book (Playwright, as Gamemaster)**

Open a **book** embedded on an actor that has already read it (a `getBook(...)?.initialReading === true` book). Re-run the Step 4 snippet against that sheet. Expected: `keeper` and `details` still `navMarked: true`, but `content` shows `navMarked: false`/`null` and `panelMarked: false`/`null` (the player can see it once read). If no read book exists, mark an actor's book as read via the CoC7 UI first.

- [ ] **Step 6: Commit**

```bash
git add scripts/gm-visibility/item-sheets.js scripts/gm-visibility/index.js
git commit -m "feat: highlight GM-only item-sheet tabs"
```

---

### Task 6: End-to-end verification matrix

**Files:** none (verification + any fixes surfaced).

- [ ] **Step 1: Toggle-off behaviour (Playwright, as Gamemaster)**

In `browser_evaluate`, disable the setting and re-render:
```js
await game.settings.set('coc7-qol', 'highlight-gm-only', false)
```
Reload the page, reopen a book sheet and a GM-only chat card. Confirm:
```js
[...document.querySelectorAll('.coc7qol-gm-highlight, .coc7qol-gm-only, .coc7qol-gm-badge')].length
```
Expected: `0`. Then restore the setting:
```js
await game.settings.set('coc7-qol', 'highlight-gm-only', true)
```

- [ ] **Step 2: Player sees no markers (Playwright, as a player user)**

Navigate to `/join`, set `select[name="userid"]` to a non-GM player, click `button[name="join"]`, wait for `game.ready`. Open any item sheet the player can open and view a chat card. Confirm:
```js
[...document.querySelectorAll('.coc7qol-gm-highlight, .coc7qol-gm-only, .coc7qol-gm-badge')].length
```
Expected: `0` (players never get the markers; `isHighlightEnabled()` returns false for non-GMs, and the GM-only DOM is absent anyway).

- [ ] **Step 3: Console cleanliness**

While performing Steps 1–2, watch the browser console. Expected: **no** `[coc7-qol] GM-visibility ... failed` warnings during normal operation.

- [ ] **Step 4: Final commit (only if fixes were needed)**

If any defect was found and fixed during this task, commit it:
```bash
git add -A
git commit -m "fix: address GM-visibility verification findings"
```
If nothing needed fixing, skip this step.

---

## Self-review

**Spec coverage:**
- World setting, GM-gated → Task 1 (`settings.js`, `isHighlightEnabled`). ✓
- Chat cards `.keeper-only-block` / `.keeper-only-control`, ignore owner-and-keeper → Task 3. ✓
- Item sheets keeper/details always, content/spells read-state → Tasks 4 + 5. ✓
- Both tab nav button and panel marked → Task 5 Step 1. ✓
- Outline + tint + badge via CSS variables → Task 2. ✓
- i18n en + fr → Task 1 Steps 4–5. ✓
- Error handling (try/catch + `[coc7-qol]` warn), re-render guards → Tasks 3 & 5 handlers; Task 6 Step 3 checks it. ✓
- Testing via Playgright/live Foundry → every task's verification step + Task 6 matrix. ✓
- Out of scope (actor sheets, owner-and-keeper, toolbar toggle) → not implemented; `owner-and-keeper` explicitly excluded and asserted in Task 3 Step 4. ✓

**Placeholder scan:** No TBD/TODO; every code step contains complete code; every command has expected output.

**Type/name consistency:** `ROOT_CLASS` (`coc7qol-gm-highlight`), `MARKER_CLASS` (`coc7qol-gm-only`), and badge class `coc7qol-gm-badge` are defined once in `settings.js`/`badge.js` and reused via import in `chat-cards.js` and `item-sheets.js`. CSS selectors match these exact literals. Hook names (`renderChatMessageHTML`, `renderItemSheetV2`) and the setting id (`coc7-qol.highlight-gm-only`) are consistent across tasks. `gmOnlyTabKeys` / `addBadgeOnce` / `createGmBadge` signatures match their call sites.
