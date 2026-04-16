# Design: Code Cleanup & Optimisation

**Date:** 2026-04-16
**Branch:** develop

## Goal

Remove all inline CSS from JS files, eliminate duplicated code, and extract shared utilities — without changing any user-visible behaviour.

---

## 1. CSS Extraction

### New files

| File | Registered in `module.json` |
|---|---|
| `styles/close-all-cards.css` | Yes, under `"styles"` |
| `styles/ai-generator.css` | Yes, under `"styles"` |

FoundryVTT loads files listed in `module.json → "styles"` automatically for all clients.

### `styles/close-all-cards.css`

Contains all rules currently injected as a `<style>` element inside `CloseAllCardsDialog._renderHTML` (lines 101–157 of `close-all-cards.js`). The `<style>` element creation and `container.appendChild(style)` call are deleted. No class name changes needed — they are already well-named BEM-style classes.

### `styles/ai-generator.css`

Contains:

- **`.coc7-ai-generate-btn`** — replaces `aiBtn.style.cssText = 'flex:0 0 auto; min-width:2rem; padding:0.25rem 0.5rem'` in `dialog-injector.js` (set on both the item and actor AI buttons).
- **`.coc7-ai-prompt-area`** — replaces `promptArea.style.cssText = 'display:flex;flex-direction:column;gap:0.25rem;padding:0.5rem 0'` in `dialog-injector.js`.
- **`.coc7-ai-prompt-area label`** — replaces `style="font-weight:bold"` on the prompt label.
- **`.coc7-ai-prompt-area textarea`** — replaces `style="width:100%;resize:vertical;box-sizing:border-box"` on the textarea.
- **`.coc7-ai-error`** — replaces the colour/spacing part of `style="display:none;color:var(--color-text-dark-error,red);margin-top:0.25rem;font-size:0.875em"`. The `display:none` initial state moves into CSS. JS continues to set `errorDiv.style.display = 'block'` / `'none'` to show/hide it — no new modifier class needed.
- **`.coc7-btn-generate`** — replaces `style="flex:1"` on the Generate button.
- **`.coc7-ai-generation-dialog .form-footer`** — replaces `style="display:flex;flex-direction:row;gap:0.5rem;margin-top:0.5rem"` in `generation-dialog.js`.
- **NPC dialog classes** (all new, replacing every `style=` attribute in `npc-confirmation-dialog.js`):
  - `.coc7-npc-identity` — dark header bar with name/occupation/age
  - `.coc7-npc-identity-name`
  - `.coc7-npc-identity-meta`
  - `.coc7-npc-section` — shared padding + bottom border for each panel
  - `.coc7-npc-section-label` — small uppercase label
  - `.coc7-npc-chars-grid` — 4-column grid
  - `.coc7-npc-char-cell` — individual characteristic box
  - `.coc7-npc-char-label`
  - `.coc7-npc-char-value`
  - `.coc7-npc-skills-grid` — 2-column grid
  - `.coc7-npc-skill-row`
  - `.coc7-npc-skill-name`
  - `.coc7-npc-skill-value`
  - `.coc7-npc-narrative` — narrative text paragraph
  - `.coc7-ai-npc-dialog .form-footer` — button row padding
- **`.item-image-popout-trigger`** — `cursor: pointer`, replaces `img.style.cursor = 'pointer'` in both `item-image-popout.js` and `possession-item-image-popout.js`. The class is added to `img` via `img.classList.add('item-image-popout-trigger')`.

---

## 2. Deduplication: `dialog-injector.js`

### Problem

`_transformToPromptView` and `_transformToNPCPromptView` are ~80% identical. So are `_restoreOriginalForm` and `_restoreOriginalNPCForm`. The only differences are label text, textarea `name`/`id`, placeholder text, and pre-fill prefix.

### Solution

Collapse to two shared functions, each accepting a `config` object:

```js
// Weapon config
const WEAPON_PROMPT_CONFIG = {
  label: 'Describe your weapon',
  textareaName: 'ai-prompt',
  textareaId: 'coc7-ai-prompt',
  placeholder: 'e.g. "A worn 1920s revolver, .38 calibre, 6-shot cylinder, wood grip"',
  prefillPrefix: 'A weapon called',
  runGeneration: _runGeneration
}

// NPC config
const NPC_PROMPT_CONFIG = {
  label: 'Describe your NPC',
  textareaName: 'ai-npc-prompt',
  textareaId: 'coc7-ai-npc-prompt',
  placeholder: 'e.g. "A nervous pharmacist in 1920s Arkham, middle-aged, hides a secret"',
  prefillPrefix: 'An NPC named',
  runGeneration: _runNPCGeneration
}
```

**`_transformToPromptView(dialog, html, nameInput, aiBtn, config)`**
Unified function. Builds the prompt area, wires Cancel (calls `_restoreOriginalForm`) and Generate (calls `config.runGeneration`).

**`_restoreOriginalForm(form, buttonRow, promptArea, originalFieldNodes, originalButtonHTML, aiBtn, dialog, html, config)`**
Unified restore. Re-attaches the sparkle click listener by calling `_transformToPromptView(..., config)` again.

`injectAIButton` passes `WEAPON_PROMPT_CONFIG`; `injectNPCButton` passes `NPC_PROMPT_CONFIG`.

`_runGeneration` and `_runNPCGeneration` remain separate — they use different mappers and open different confirmation dialogs.

---

## 3. Shared `escapeHtml` Utility

### Problem

The HTML-escaping helper is copy-pasted (with minor name variations: `#escapeHtml`, `#esc`) into three files:
- `scripts/close-all-cards.js`
- `scripts/ai-generator/generation-dialog.js`
- `scripts/ai-generator/npc-confirmation-dialog.js`

### Solution

New file: **`scripts/utils.js`**

```js
/**
 * Escapes a value for safe HTML interpolation.
 * @param {unknown} str
 * @returns {string}
 */
export function escapeHtml (str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
```

- Added to `module.json → "esmodules"` so FoundryVTT loads it.
- `generation-dialog.js` and `npc-confirmation-dialog.js` import it: `import { escapeHtml } from '../utils.js'` / `import { escapeHtml } from './utils.js'`.
- `close-all-cards.js` gains its first `import`: `import { escapeHtml } from './utils.js'`. Private `#escapeHtml` / `#esc` methods are deleted from all three classes.

---

## Files Changed

| File | Change |
|---|---|
| `module.json` | Add `"styles"` array with two entries; add `scripts/utils.js` to `"esmodules"` |
| `styles/close-all-cards.css` | **New** — extracted from `close-all-cards.js` |
| `styles/ai-generator.css` | **New** — extracted from all AI generator files |
| `scripts/utils.js` | **New** — shared `escapeHtml` export |
| `scripts/close-all-cards.js` | Remove `<style>` injection; import `escapeHtml`; add class to cursor images |
| `scripts/item-image-popout.js` | Replace `img.style.cursor` with `img.classList.add` |
| `scripts/possession-item-image-popout.js` | Replace `img.style.cursor` with `img.classList.add` |
| `scripts/ai-generator/dialog-injector.js` | Merge 4 functions into 2; replace inline styles with classes |
| `scripts/ai-generator/generation-dialog.js` | Import `escapeHtml`; remove private method; replace inline styles with classes |
| `scripts/ai-generator/npc-confirmation-dialog.js` | Import `escapeHtml`; remove private method; add CSS class names to all template elements |

---

## Out of Scope

- No changes to game logic, hook registration, provider/mapper registry, or LLM call paths.
- No new features.
- No automated tests (project has none; manual testing in FoundryVTT required).
