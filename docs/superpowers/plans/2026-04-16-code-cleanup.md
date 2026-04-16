# Code Cleanup & Optimisation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract all inline CSS into dedicated stylesheet files, deduplicate the dialog-injector prompt-view functions, and consolidate the copy-pasted `escapeHtml` helper into a shared utility.

**Architecture:** No build step — plain ES modules loaded directly by FoundryVTT. New CSS files are registered in `module.json → "styles"` and loaded automatically. A new `scripts/utils.js` ES module is registered in `"esmodules"` and imported by the three files that currently duplicate `escapeHtml`. The dialog-injector deduplication uses a config-object pattern to parameterise the two near-identical prompt-view flows.

**Tech Stack:** Vanilla JS ES modules, plain CSS, FoundryVTT v13 ApplicationV2 API.

---

## File Map

| File | Action |
|---|---|
| `scripts/utils.js` | **Create** — exports `escapeHtml` |
| `styles/close-all-cards.css` | **Create** — rules extracted from `close-all-cards.js` |
| `styles/ai-generator.css` | **Create** — rules extracted from all AI generator files |
| `module.json` | **Modify** — add `"styles"` array; add `utils.js` to `"esmodules"` |
| `scripts/close-all-cards.js` | **Modify** — import `escapeHtml`; remove `<style>` injection |
| `scripts/item-image-popout.js` | **Modify** — `img.classList.add` instead of `img.style.cursor` |
| `scripts/possession-item-image-popout.js` | **Modify** — same |
| `scripts/ai-generator/dialog-injector.js` | **Modify** — merge 4 functions into 2; remove inline styles |
| `scripts/ai-generator/generation-dialog.js` | **Modify** — import `escapeHtml`; remove private method; remove inline style |
| `scripts/ai-generator/npc-confirmation-dialog.js` | **Modify** — import `escapeHtml`; remove private method; add CSS class names |

---

## Task 1: Create the `develop` branch

**Files:** none

- [ ] **Step 1: Create and switch to the develop branch**

```bash
git checkout -b develop
```

Expected output: `Switched to a new branch 'develop'`

- [ ] **Step 2: Verify**

```bash
git branch
```

Expected: `* develop` is listed.

---

## Task 2: Create `scripts/utils.js` and wire up all consumers

**Files:**
- Create: `scripts/utils.js`
- Modify: `scripts/close-all-cards.js`
- Modify: `scripts/ai-generator/generation-dialog.js`
- Modify: `scripts/ai-generator/npc-confirmation-dialog.js`
- Modify: `module.json`

- [ ] **Step 1: Create `scripts/utils.js`**

```js
// scripts/utils.js

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

- [ ] **Step 2: Update `scripts/close-all-cards.js`**

Add the import as the very first line of the file:

```js
import { escapeHtml } from './utils.js'
```

Remove the private `#escapeHtml` method (lines 52–58):

```js
  #escapeHtml (str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
```

Replace every call `this.#escapeHtml(` with `escapeHtml(` (there are 5 occurrences in `_renderHTML`).

- [ ] **Step 3: Update `scripts/ai-generator/generation-dialog.js`**

Add import at the top of the file (after any existing imports, or as the first line since there are none currently):

```js
import { escapeHtml } from '../utils.js'
```

Remove the private `#escapeHtml` method (lines 65–71):

```js
  #escapeHtml (str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }
```

Replace every call `this.#escapeHtml(` with `escapeHtml(` (6 occurrences inside `_renderHTML`).

- [ ] **Step 4: Update `scripts/ai-generator/npc-confirmation-dialog.js`**

Add import at the top of the file:

```js
import { escapeHtml } from '../utils.js'
```

Remove the private `#esc` method (lines 110–116):

```js
  #esc (str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }
```

Replace every call `this.#esc(` with `escapeHtml(` (9 occurrences inside `_renderHTML`).

- [ ] **Step 5: Register `utils.js` in `module.json`**

Add `"scripts/utils.js"` as the **first** entry in the `"esmodules"` array so it is loaded before the files that import it:

```json
"esmodules": [
  "scripts/utils.js",
  "scripts/item-image-popout.js",
  "scripts/possession-item-image-popout.js",
  "scripts/ai-generator/index.js",
  "scripts/close-all-cards.js"
],
```

- [ ] **Step 6: Commit**

```bash
git add scripts/utils.js scripts/close-all-cards.js scripts/ai-generator/generation-dialog.js scripts/ai-generator/npc-confirmation-dialog.js module.json
git commit -m "refactor: extract shared escapeHtml into scripts/utils.js"
```

---

## Task 3: Create `styles/close-all-cards.css` and remove the `<style>` injection

**Files:**
- Create: `styles/close-all-cards.css`
- Modify: `scripts/close-all-cards.js`
- Modify: `module.json`

- [ ] **Step 1: Create `styles/close-all-cards.css`**

```css
.coc7-qol-close-all-cards {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.5rem;
}

.close-cards-header {
  border-bottom: 1px solid var(--color-border-light-tertiary);
  padding-bottom: 0.5rem;
}

.close-cards-toggle-all {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}

.close-cards-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  max-height: 300px;
  overflow-y: auto;
}

.close-cards-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem;
  cursor: pointer;
  border-radius: 4px;
}

.close-cards-row:hover {
  background: var(--color-hover-bg, rgba(0, 0, 0, 0.05));
}

.close-cards-type {
  font-weight: bold;
  flex: 0 0 auto;
}

.close-cards-actor {
  flex: 1;
  color: var(--color-text-secondary, #666);
}

.close-cards-time {
  flex: 0 0 auto;
  font-size: 0.85em;
  color: var(--color-text-secondary, #666);
}

.close-cards-footer {
  display: flex;
  flex-direction: row;
  gap: 0.5rem;
  margin-top: 0.5rem;
}
```

- [ ] **Step 2: Remove the `<style>` injection from `scripts/close-all-cards.js`**

In `_renderHTML`, delete everything from the `// Inline styles` comment through the `container.appendChild(style)` call (currently lines 100–157). The method should now end with:

```js
    container.appendChild(footer);

    return container;
  }
```

- [ ] **Step 3: Register the stylesheet in `module.json`**

Add a `"styles"` array immediately after `"esmodules"`:

```json
"styles": [
  "styles/close-all-cards.css"
],
```

- [ ] **Step 4: Commit**

```bash
git add styles/close-all-cards.css scripts/close-all-cards.js module.json
git commit -m "refactor: extract close-all-cards styles into dedicated CSS file"
```

---

## Task 4: Replace `img.style.cursor` with a CSS class in both image-popout files

**Files:**
- Modify: `scripts/item-image-popout.js`
- Modify: `scripts/possession-item-image-popout.js`

> The `.item-image-popout-trigger { cursor: pointer; }` rule will be added to `styles/ai-generator.css` in Task 5. For now the class is added to the element; it has no effect until the CSS file is created.

- [ ] **Step 1: Update `scripts/item-image-popout.js`**

Replace:
```js
  img.style.cursor = 'pointer';
```
With:
```js
  img.classList.add('item-image-popout-trigger');
```

- [ ] **Step 2: Update `scripts/possession-item-image-popout.js`**

Replace:
```js
    img.style.cursor = 'pointer';
```
With:
```js
    img.classList.add('item-image-popout-trigger');
```

- [ ] **Step 3: Commit**

```bash
git add scripts/item-image-popout.js scripts/possession-item-image-popout.js
git commit -m "refactor: replace img.style.cursor with CSS class for image popout trigger"
```

---

## Task 5: Deduplicate `dialog-injector.js`

**Files:**
- Modify: `scripts/ai-generator/dialog-injector.js`

The four functions `_transformToPromptView`, `_transformToNPCPromptView`, `_restoreOriginalForm`, and `_restoreOriginalNPCForm` are merged into two. A `config` object carries type-specific strings.

> This task only changes the structure — inline styles stay temporarily. The `style.cssText` / `style=` removals happen in Task 6.

- [ ] **Step 1: Replace the body of `dialog-injector.js`** from the `injectAIButton` export down (keep the top section with imports, constants, and `SPARKLE_SVG` unchanged).

The new code from `injectAIButton` onwards:

```js
// Type-specific configuration for the shared prompt-view flow
const WEAPON_PROMPT_CONFIG = {
  label: 'Describe your weapon',
  textareaName: 'ai-prompt',
  textareaId: 'coc7-ai-prompt',
  placeholder: 'e.g. "A worn 1920s revolver, .38 calibre, 6-shot cylinder, wood grip"',
  prefillPrefix: 'A weapon called',
  runGeneration: _runGeneration
}

const NPC_PROMPT_CONFIG = {
  label: 'Describe your NPC',
  textareaName: 'ai-npc-prompt',
  textareaId: 'coc7-ai-npc-prompt',
  placeholder: 'e.g. "A nervous pharmacist in 1920s Arkham, middle-aged, hides a secret"',
  prefillPrefix: 'An NPC named',
  runGeneration: _runNPCGeneration
}

/**
 * Called on every renderDialogV2 hook. Checks whether the dialog is the
 * "Create Item" dialog before doing any DOM work.
 */
export function injectAIButton (dialog, html) {
  if (!game.user.isGM) return

  const nameInput = html.querySelector('[name="name"]')
  const typeSelect = html.querySelector('[name="type"]')
  if (!nameInput || !typeSelect) return

  const typeValues = [...typeSelect.options].map(o => o.value)
  if (!typeValues.some(v => COC7_ITEM_TYPES.includes(v))) return

  const form = html.querySelector('form') ?? html.querySelector('.dialog-content')
  const buttonRow = _findButtonRow(form, html)
  if (!buttonRow) return

  const aiBtn = document.createElement('button')
  aiBtn.type = 'button'
  aiBtn.className = 'coc7-ai-generate-btn'
  aiBtn.title = 'Generate with AI'
  aiBtn.innerHTML = SPARKLE_SVG
  aiBtn.style.cssText = 'flex:0 0 auto; min-width:2rem; padding:0.25rem 0.5rem'
  buttonRow.appendChild(aiBtn)

  aiBtn.style.display = SUPPORTED_ITEM_TYPES.includes(typeSelect.value) ? '' : 'none'
  typeSelect.addEventListener('change', () => {
    aiBtn.style.display = SUPPORTED_ITEM_TYPES.includes(typeSelect.value) ? '' : 'none'
  })

  aiBtn.addEventListener('click', () => {
    _transformToPromptView(dialog, html, nameInput, aiBtn, WEAPON_PROMPT_CONFIG)
  })
}

/**
 * Called on every renderDialogV2 hook. Checks whether the dialog is the
 * "Create Actor" dialog before doing any DOM work.
 */
export function injectNPCButton (dialog, html) {
  if (!game.user.isGM) return

  const nameInput = html.querySelector('[name="name"]')
  const typeSelect = html.querySelector('[name="type"]')
  if (!nameInput || !typeSelect) return

  const typeValues = [...typeSelect.options].map(o => o.value)
  if (!typeValues.some(v => COC7_ACTOR_TYPES.includes(v))) return

  const form = html.querySelector('form') ?? html.querySelector('.dialog-content')
  const buttonRow = _findButtonRow(form, html)
  if (!buttonRow) return

  const aiBtn = document.createElement('button')
  aiBtn.type = 'button'
  aiBtn.className = 'coc7-ai-generate-btn'
  aiBtn.title = 'Generate NPC with AI'
  aiBtn.innerHTML = SPARKLE_SVG
  aiBtn.style.cssText = 'flex:0 0 auto; min-width:2rem; padding:0.25rem 0.5rem'
  buttonRow.appendChild(aiBtn)

  aiBtn.style.display = SUPPORTED_ACTOR_TYPES.includes(typeSelect.value) ? '' : 'none'
  typeSelect.addEventListener('change', () => {
    aiBtn.style.display = SUPPORTED_ACTOR_TYPES.includes(typeSelect.value) ? '' : 'none'
  })

  aiBtn.addEventListener('click', () => {
    _transformToPromptView(dialog, html, nameInput, aiBtn, NPC_PROMPT_CONFIG)
  })
}

/**
 * Finds the button row element inside form first, then falls back to outer html.
 */
function _findButtonRow (form, html) {
  return (form?.querySelector('.dialog-buttons') ?? form?.querySelector('footer'))
    ?? (html.querySelector('.dialog-buttons') ?? html.querySelector('footer'))
}

/**
 * Replaces Name + Type form fields with a prompt textarea.
 * Works for both weapon and NPC flows via the config object.
 */
function _transformToPromptView (dialog, html, nameInput, aiBtn, config) {
  const capturedName = nameInput.value.trim()

  const form = html.querySelector('form') ?? html.querySelector('.dialog-content') ?? nameInput.closest('div')
  const buttonRow = _findButtonRow(form, html)
  if (!form || !buttonRow) return

  const originalButtonHTML = buttonRow.innerHTML
  const originalFieldNodes = [...form.children]
    .filter(child => child !== buttonRow)
    .map(child => child.cloneNode(true))

  for (const child of [...form.children]) {
    if (child !== buttonRow) child.remove()
  }

  const promptArea = document.createElement('div')
  promptArea.style.cssText = 'display:flex;flex-direction:column;gap:0.25rem;padding:0.5rem 0'
  // Safe static HTML — config values are module-level constants, not user input
  promptArea.innerHTML = `
    <label for="${config.textareaId}" style="font-weight:bold">${config.label}</label>
    <textarea
      id="${config.textareaId}"
      name="${config.textareaName}"
      rows="4"
      placeholder='${config.placeholder}'
      style="width:100%;resize:vertical;box-sizing:border-box"
    ></textarea>
    <div class="coc7-ai-error" style="display:none;color:var(--color-text-dark-error,red);margin-top:0.25rem;font-size:0.875em"></div>
  `
  form.insertBefore(promptArea, buttonRow)

  const promptTextarea = form.querySelector(`[name="${config.textareaName}"]`)
  if (capturedName) promptTextarea.value = `${config.prefillPrefix} "${capturedName}". `

  aiBtn.style.display = 'none'

  buttonRow.innerHTML = `
    <button type="button" class="coc7-btn-generate" style="flex:1">Generate</button>
    <button type="button" class="coc7-btn-back">Cancel</button>
  `

  buttonRow.querySelector('.coc7-btn-back').addEventListener('click', () => {
    _restoreOriginalForm(form, buttonRow, promptArea, originalFieldNodes, originalButtonHTML, aiBtn, dialog, html, config)
  })

  buttonRow.querySelector('.coc7-btn-generate').addEventListener('click', () => {
    config.runGeneration(dialog, html, form, buttonRow, promptArea, originalFieldNodes, originalButtonHTML, aiBtn)
  })
}

/**
 * Restores the form to its original Name + Type state.
 */
function _restoreOriginalForm (form, buttonRow, promptArea, originalFieldNodes, originalButtonHTML, aiBtn, dialog, html, config) {
  promptArea.remove()
  for (const node of originalFieldNodes) {
    form.insertBefore(node, buttonRow)
  }
  buttonRow.innerHTML = originalButtonHTML
  aiBtn.style.display = ''

  const restoredBtn = buttonRow.querySelector('.coc7-ai-generate-btn')
  if (restoredBtn) {
    const newNameInput = form.querySelector('[name="name"]')
    restoredBtn.addEventListener('click', () => {
      _transformToPromptView(dialog, html, newNameInput, restoredBtn, config)
    })
  }
}
```

Keep `_runGeneration` and `_runNPCGeneration` unchanged at the bottom of the file.

- [ ] **Step 2: Commit**

```bash
git add scripts/ai-generator/dialog-injector.js
git commit -m "refactor: merge duplicate weapon/NPC prompt-view functions in dialog-injector"
```

---

## Task 6: Create `styles/ai-generator.css` and strip all inline styles from JS

**Files:**
- Create: `styles/ai-generator.css`
- Modify: `scripts/ai-generator/dialog-injector.js`
- Modify: `scripts/ai-generator/generation-dialog.js`
- Modify: `scripts/ai-generator/npc-confirmation-dialog.js`
- Modify: `module.json`

- [ ] **Step 1: Create `styles/ai-generator.css`**

```css
/* ─── Shared: AI generate sparkle button ─────────────────────────────────── */

.coc7-ai-generate-btn {
  flex: 0 0 auto;
  min-width: 2rem;
  padding: 0.25rem 0.5rem;
}

/* ─── Shared: prompt area (weapon + NPC) ─────────────────────────────────── */

.coc7-ai-prompt-area {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.5rem 0;
}

.coc7-ai-prompt-area label {
  font-weight: bold;
}

.coc7-ai-prompt-area textarea {
  width: 100%;
  resize: vertical;
  box-sizing: border-box;
}

.coc7-ai-error {
  display: none;
  color: var(--color-text-dark-error, red);
  margin-top: 0.25rem;
  font-size: 0.875em;
}

.coc7-btn-generate {
  flex: 1;
}

/* ─── Weapon review dialog ───────────────────────────────────────────────── */

.coc7-ai-generation-dialog .form-footer {
  display: flex;
  flex-direction: row;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

/* ─── Image popout cursor ────────────────────────────────────────────────── */

.item-image-popout-trigger {
  cursor: pointer;
}

/* ─── NPC review dialog ──────────────────────────────────────────────────── */

.coc7-npc-identity {
  background: var(--color-cool-5, #1a1a2e);
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--color-border-dark, #333);
}

.coc7-npc-identity-name {
  font-size: 1.2rem;
  font-weight: bold;
  color: var(--color-warm-2, #e8d5b7);
  margin-bottom: 0.2rem;
}

.coc7-npc-identity-meta {
  display: flex;
  gap: 1.5rem;
  font-size: 0.85rem;
  color: var(--color-text-light-6, #aaa);
}

.coc7-npc-identity-meta-label {
  color: var(--color-text-light-8, #888);
}

.coc7-npc-section {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--color-border-dark, #333);
}

.coc7-npc-section-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-text-light-8, #888);
  margin-bottom: 0.5rem;
}

.coc7-npc-chars-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.4rem;
}

.coc7-npc-char-cell {
  text-align: center;
  background: var(--color-cool-5-75, #111);
  border-radius: 4px;
  padding: 0.35rem 0;
}

.coc7-npc-char-label {
  font-size: 0.65rem;
  color: var(--color-text-light-8, #888);
}

.coc7-npc-char-value {
  font-size: 1rem;
  font-weight: bold;
  color: var(--color-warm-2, #c9a96e);
}

.coc7-npc-skills-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.25rem 1rem;
  font-size: 0.85rem;
}

.coc7-npc-skill-row {
  display: flex;
  justify-content: space-between;
  border-bottom: 1px solid var(--color-cool-5-75, #1f1f1f);
  padding: 0.15rem 0;
}

.coc7-npc-skill-name {
  color: var(--color-text-light-3, #ccc);
}

.coc7-npc-skill-value {
  color: var(--color-warm-2, #c9a96e);
  font-weight: bold;
}

.coc7-npc-narrative {
  font-size: 0.82rem;
  color: var(--color-text-light-5, #bbb);
  margin: 0;
}

.coc7-ai-npc-dialog .form-footer {
  display: flex;
  flex-direction: row;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
}
```

- [ ] **Step 2: Update `scripts/ai-generator/dialog-injector.js` — remove inline styles**

In `injectAIButton` and `injectNPCButton`, remove the `aiBtn.style.cssText` line (the class `.coc7-ai-generate-btn` is already set and now carries the CSS):

Remove:
```js
  aiBtn.style.cssText = 'flex:0 0 auto; min-width:2rem; padding:0.25rem 0.5rem'
```

In `_transformToPromptView`, replace the prompt area style with a class:

Replace:
```js
  const promptArea = document.createElement('div')
  promptArea.style.cssText = 'display:flex;flex-direction:column;gap:0.25rem;padding:0.5rem 0'
  // Safe static HTML — config values are module-level constants, not user input
  promptArea.innerHTML = `
    <label for="${config.textareaId}" style="font-weight:bold">${config.label}</label>
    <textarea
      id="${config.textareaId}"
      name="${config.textareaName}"
      rows="4"
      placeholder='${config.placeholder}'
      style="width:100%;resize:vertical;box-sizing:border-box"
    ></textarea>
    <div class="coc7-ai-error" style="display:none;color:var(--color-text-dark-error,red);margin-top:0.25rem;font-size:0.875em"></div>
  `
```

With:
```js
  const promptArea = document.createElement('div')
  promptArea.className = 'coc7-ai-prompt-area'
  // Safe static HTML — config values are module-level constants, not user input
  promptArea.innerHTML = `
    <label for="${config.textareaId}">${config.label}</label>
    <textarea
      id="${config.textareaId}"
      name="${config.textareaName}"
      rows="4"
      placeholder='${config.placeholder}'
    ></textarea>
    <div class="coc7-ai-error"></div>
  `
```

Replace the generate button HTML:

Replace:
```js
  buttonRow.innerHTML = `
    <button type="button" class="coc7-btn-generate" style="flex:1">Generate</button>
    <button type="button" class="coc7-btn-back">Cancel</button>
  `
```

With:
```js
  buttonRow.innerHTML = `
    <button type="button" class="coc7-btn-generate">Generate</button>
    <button type="button" class="coc7-btn-back">Cancel</button>
  `
```

- [ ] **Step 3: Update `scripts/ai-generator/generation-dialog.js` — remove inline style from form footer**

In `_renderHTML`, change the form footer div from:
```js
      <div class="form-footer" style="display:flex;flex-direction:row;gap:0.5rem;margin-top:0.5rem">
```
To:
```js
      <div class="form-footer">
```

- [ ] **Step 4: Update `scripts/ai-generator/npc-confirmation-dialog.js` — replace all `style=` with CSS classes**

Replace the entire `_renderHTML` method body with:

```js
  async _renderHTML (_context, _options) {
    const llm = this.#npcData.llmData ?? {}
    const chars = llm.characteristics ?? {}
    const skills = llm.skills ?? []

    const div = document.createElement('div')
    div.className = 'coc7-ai-npc-dialog'

    // --- Identity bar ---
    const identityHtml = `
      <div class="coc7-npc-identity">
        <div class="coc7-npc-identity-name">${escapeHtml(llm.name)}</div>
        <div class="coc7-npc-identity-meta">
          ${llm.occupation ? `<span><span class="coc7-npc-identity-meta-label">Occupation</span>&nbsp;${escapeHtml(llm.occupation)}</span>` : ''}
          ${llm.age ? `<span><span class="coc7-npc-identity-meta-label">Age</span>&nbsp;${escapeHtml(String(llm.age))}</span>` : ''}
        </div>
      </div>`

    // --- Characteristics grid ---
    const charLabels = ['STR', 'CON', 'SIZ', 'DEX', 'APP', 'INT', 'POW', 'EDU']
    const charKeys = ['str', 'con', 'siz', 'dex', 'app', 'int', 'pow', 'edu']
    const charCells = charKeys.map((k, i) => `
      <div class="coc7-npc-char-cell">
        <div class="coc7-npc-char-label">${charLabels[i]}</div>
        <div class="coc7-npc-char-value">${escapeHtml(String(chars[k] ?? '—'))}</div>
      </div>`).join('')

    const charsHtml = `
      <div class="coc7-npc-section">
        <div class="coc7-npc-section-label">Characteristics</div>
        <div class="coc7-npc-chars-grid">${charCells}</div>
      </div>`

    // --- Skills list ---
    const skillRows = skills.map(s => `
      <div class="coc7-npc-skill-row">
        <span class="coc7-npc-skill-name">${escapeHtml(s.name)}</span>
        <span class="coc7-npc-skill-value">${escapeHtml(String(s.value))}%</span>
      </div>`).join('')

    const skillsHtml = skills.length ? `
      <div class="coc7-npc-section">
        <div class="coc7-npc-section-label">Skills</div>
        <div class="coc7-npc-skills-grid">${skillRows}</div>
      </div>` : ''

    // --- Narrative sections ---
    const narrativeSection = (label, text) => {
      if (!text) return ''
      return `
        <div class="coc7-npc-section">
          <div class="coc7-npc-section-label">${label}</div>
          <p class="coc7-npc-narrative">${escapeHtml(text)}</p>
        </div>`
    }

    // --- Buttons ---
    const buttonsHtml = `
      <div class="form-footer">
        <button type="button" data-action="accept" class="bright">Accept</button>
        <button type="button" data-action="regenerate">Regenerate</button>
        <button type="button" data-action="cancel">Cancel</button>
      </div>`

    div.innerHTML = identityHtml + charsHtml + skillsHtml
      + narrativeSection('Appearance', llm.physicalDescription)
      + narrativeSection('Personality', llm.personalityTraits)
      + narrativeSection('Background', llm.background)
      + buttonsHtml

    return div
  }
```

- [ ] **Step 5: Add `styles/ai-generator.css` to `module.json`**

The `"styles"` array (added in Task 3) should now contain both files:

```json
"styles": [
  "styles/close-all-cards.css",
  "styles/ai-generator.css"
],
```

- [ ] **Step 6: Commit**

```bash
git add styles/ai-generator.css scripts/ai-generator/dialog-injector.js scripts/ai-generator/generation-dialog.js scripts/ai-generator/npc-confirmation-dialog.js module.json
git commit -m "refactor: extract AI generator styles into dedicated CSS file"
```

---

## Task 7: Manual verification in FoundryVTT

> No automated tests exist. All verification requires a running FoundryVTT instance with the CoC7 system and the module active. Reload the module between checks (`CTRL+F5` or `F5`).

- [ ] **Close All Cards button:** As GM, click the CoC7 menu → Close All Cards tool. Confirm the dialog renders correctly (header, card list, footer buttons, hover style on rows).

- [ ] **Item sheet image popout:** As a non-GM player, open any item sheet. Confirm clicking the item image opens the `ImagePopout`. Confirm cursor changes to pointer on hover.

- [ ] **Possession image popout:** As a non-GM player, open a character actor sheet. Confirm clicking a possession image in the inventory opens the `ImagePopout`.

- [ ] **Weapon AI generation:** As GM, open Create Item, select Weapon type. Confirm the sparkle button appears. Click it — confirm the prompt view renders (label, textarea, Generate/Cancel buttons). Type a description, click Generate, confirm the weapon review dialog appears with correct layout and dark-theme colours.

- [ ] **NPC AI generation:** As GM, open Create Actor, select NPC type. Confirm sparkle button appears. Click it — confirm prompt view. Generate an NPC, confirm the NPC review dialog renders with identity bar, characteristics grid, skills, and narrative sections all styled correctly.

- [ ] **Cancel / back flows:** In both weapon and NPC flows, confirm Cancel restores the original Create dialog form and re-attaches the sparkle button click listener.

- [ ] **No console errors:** Check the browser console for any JS errors throughout all flows.

---

## Final commit summary

After verification, confirm the branch is ready:

```bash
git log --oneline develop
```

Expected: 6 commits ahead of `main`:
1. `refactor: extract shared escapeHtml into scripts/utils.js`
2. `refactor: extract close-all-cards styles into dedicated CSS file`
3. `refactor: replace img.style.cursor with CSS class for image popout trigger`
4. `refactor: merge duplicate weapon/NPC prompt-view functions in dialog-injector`
5. `refactor: extract AI generator styles into dedicated CSS file`
6. (docs commit already on main)
