# NPC Random Characteristics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Random characteristics" checkbox to the NPC generation prompt area; when checked, the generated actor stores rulebook dice formulas in its characteristic fields instead of AI-chosen integers, so CoC7 rolls them fresh on each token drop.

**Architecture:** The NPC mapper exports `CHARACTERISTIC_FORMULAS` and `applyRandomCharacteristics()` so formula knowledge stays co-located with the mapper. The dialog injector reads the checkbox and calls the helper after `toFoundryData()`. The confirmation dialog renders formula strings when `npcData.randomCharacteristics` is true.

**Tech Stack:** Vanilla JS ES modules, no build step. FoundryVTT v13+, CoC7 8.1+.

---

> **Note on testing:** This project has no automated test suite. Each task ends with manual verification instructions for a running FoundryVTT instance with the CoC7 system.

---

## File map

| File | Change |
|------|--------|
| `scripts/ai-generator/mappers/npc.js` | Add `CHARACTERISTIC_FORMULAS` and `applyRandomCharacteristics` named exports |
| `scripts/ai-generator/dialog-injector.js` | Add `extraHTML` to `NPC_PROMPT_CONFIG`; render it in `_transformToPromptView`; import and call `applyRandomCharacteristics` in `_runNPCGeneration` |
| `scripts/ai-generator/npc-confirmation-dialog.js` | Import `CHARACTERISTIC_FORMULAS`; render formula strings when `randomCharacteristics` is true |

---

## Task 1: Add named exports to the NPC mapper

**Files:**
- Modify: `scripts/ai-generator/mappers/npc.js:33-35`

- [ ] **Step 1: Add the exports**

  Open `scripts/ai-generator/mappers/npc.js`. After line 33 (`const REQUIRED_CHARACTERISTICS = [...]`) and before line 36 (`export default {`), insert:

  ```js
  export const CHARACTERISTIC_FORMULAS = {
    str: '5*(3d6)',
    con: '5*(3d6)',
    dex: '5*(3d6)',
    app: '5*(3d6)',
    pow: '5*(3d6)',
    int: '5*(2d6+6)',
    siz: '5*(2d6+6)',
    edu: '5*(2d6+6)'
  }

  export function applyRandomCharacteristics (npcData) {
    for (const [key, formula] of Object.entries(CHARACTERISTIC_FORMULAS)) {
      npcData.actorData.system.characteristics[key] = { formula, value: 0 }
    }
    npcData.randomCharacteristics = true
  }
  ```

  The `export default { ... }` block at line 36 is untouched.

- [ ] **Step 2: Verify manually**

  In FoundryVTT, open the browser console and run:

  ```js
  const mod = await import('/modules/coc7-qol/scripts/ai-generator/mappers/npc.js')
  console.log(mod.CHARACTERISTIC_FORMULAS)
  // Expected: { str: '5*(3d6)', con: '5*(3d6)', dex: '5*(3d6)', app: '5*(3d6)', pow: '5*(3d6)', int: '5*(2d6+6)', siz: '5*(2d6+6)', edu: '5*(2d6+6)' }
  const fakeNpc = { actorData: { system: { characteristics: { str: { value: 65 }, con: { value: 50 }, siz: { value: 55 }, dex: { value: 60 }, app: { value: 45 }, int: { value: 70 }, pow: { value: 55 }, edu: { value: 75 } } } }, skillsRaw: [], llmData: {} }
  mod.applyRandomCharacteristics(fakeNpc)
  console.log(fakeNpc.actorData.system.characteristics.str)
  // Expected: { formula: '5*(3d6)', value: 0 }
  console.log(fakeNpc.randomCharacteristics)
  // Expected: true
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add scripts/ai-generator/mappers/npc.js
  git commit -m "feat: export CHARACTERISTIC_FORMULAS and applyRandomCharacteristics from npc mapper"
  ```

---

## Task 2: Add the checkbox to the NPC prompt area

**Files:**
- Modify: `scripts/ai-generator/dialog-injector.js:37-44` (NPC_PROMPT_CONFIG)
- Modify: `scripts/ai-generator/dialog-injector.js:149-161` (_transformToPromptView — promptArea.innerHTML)

- [ ] **Step 1: Add `extraHTML` to `NPC_PROMPT_CONFIG`**

  The current `NPC_PROMPT_CONFIG` (lines 37–44) is:

  ```js
  const NPC_PROMPT_CONFIG = {
    label: 'Describe your NPC',
    textareaName: 'ai-npc-prompt',
    textareaId: 'coc7-ai-npc-prompt',
    placeholder: 'e.g. "A nervous pharmacist in 1920s Arkham, middle-aged, hides a secret"',
    prefillPrefix: 'An NPC named',
    runGeneration: _runNPCGeneration
  }
  ```

  Replace it with:

  ```js
  const NPC_PROMPT_CONFIG = {
    label: 'Describe your NPC',
    textareaName: 'ai-npc-prompt',
    textareaId: 'coc7-ai-npc-prompt',
    placeholder: 'e.g. "A nervous pharmacist in 1920s Arkham, middle-aged, hides a secret"',
    prefillPrefix: 'An NPC named',
    runGeneration: _runNPCGeneration,
    extraHTML: `<label class="coc7-ai-random-chars-label">
      <input type="checkbox" name="ai-random-characteristics">
      Random characteristics <span class="coc7-ai-hint">(rulebook formula, rolled on token drop)</span>
    </label>`
  }
  ```

- [ ] **Step 2: Render `extraHTML` in `_transformToPromptView`**

  In `_transformToPromptView` (around line 152), the current `promptArea.innerHTML` assignment is:

  ```js
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

  Replace it with:

  ```js
  promptArea.innerHTML = `
      <label for="${config.textareaId}">${config.label}</label>
      <textarea
        id="${config.textareaId}"
        name="${config.textareaName}"
        rows="4"
        placeholder='${config.placeholder}'
      ></textarea>
      ${config.extraHTML ?? ''}
      <div class="coc7-ai-error"></div>
    `
  ```

- [ ] **Step 3: Verify manually**

  In FoundryVTT as GM:
  1. Open **Actors** → **Create Actor**
  2. Click the AI sparkle button (✦) next to the Create button
  3. Confirm the prompt area now shows a checkbox labelled "Random characteristics (rulebook formula, rolled on token drop)" below the textarea
  4. Confirm the checkbox is absent from the weapon generation flow (Items → Create Item → weapon type → ✦)

- [ ] **Step 4: Commit**

  ```bash
  git add scripts/ai-generator/dialog-injector.js
  git commit -m "feat: add Random characteristics checkbox to NPC prompt area"
  ```

---

## Task 3: Apply random characteristics when checkbox is checked

**Files:**
- Modify: `scripts/ai-generator/dialog-injector.js:2-5` (imports)
- Modify: `scripts/ai-generator/dialog-injector.js` (`_runNPCGeneration` — after `toFoundryData`)

- [ ] **Step 1: Import `applyRandomCharacteristics`**

  The current import block at the top of `dialog-injector.js` (lines 2–5) is:

  ```js
  import * as providers from './providers/registry.js'
  import * as mappers from './mappers/registry.js'
  import CoC7AIGenerationDialog from './generation-dialog.js'
  import CoC7NPCConfirmationDialog from './npc-confirmation-dialog.js'
  ```

  Add one line:

  ```js
  import * as providers from './providers/registry.js'
  import * as mappers from './mappers/registry.js'
  import CoC7AIGenerationDialog from './generation-dialog.js'
  import CoC7NPCConfirmationDialog from './npc-confirmation-dialog.js'
  import { applyRandomCharacteristics } from './mappers/npc.js'
  ```

- [ ] **Step 2: Read checkbox and call helper in `_runNPCGeneration`**

  In `_runNPCGeneration`, find the block:

  ```js
  mapper.validate(llmData)
  const npcData = mapper.toFoundryData(llmData)

  new CoC7NPCConfirmationDialog({
  ```

  Replace it with:

  ```js
  mapper.validate(llmData)
  const npcData = mapper.toFoundryData(llmData)

  const randomChars = form.querySelector('[name="ai-random-characteristics"]')?.checked
  if (randomChars) applyRandomCharacteristics(npcData)

  new CoC7NPCConfirmationDialog({
  ```

- [ ] **Step 3: Verify manually**

  In FoundryVTT as GM:
  1. Open **Actors** → **Create Actor** → type **NPC** → click ✦
  2. Check **Random characteristics**, type a description (e.g. "A dockworker"), click **Generate**
  3. After generation, open the browser console and run:

     ```js
     // While the confirmation dialog is open, inspect the last-created npcData
     // (easiest: set a breakpoint on the `new CoC7NPCConfirmationDialog` line,
     //  or add a temporary console.log(npcData) just before it)
     ```

     Confirm `npcData.actorData.system.characteristics.str` is `{ formula: '5*(3d6)', value: 0 }`.
  4. Generate again **without** the checkbox — confirm characteristics are integers.

- [ ] **Step 4: Commit**

  ```bash
  git add scripts/ai-generator/dialog-injector.js
  git commit -m "feat: read random-characteristics checkbox and apply formulas to npcData"
  ```

---

## Task 4: Show formula strings in the confirmation dialog

**Files:**
- Modify: `scripts/ai-generator/npc-confirmation-dialog.js:4` (imports)
- Modify: `scripts/ai-generator/npc-confirmation-dialog.js:55-62` (charCells mapping in `_renderHTML`)

- [ ] **Step 1: Import `CHARACTERISTIC_FORMULAS`**

  The current import at line 4 of `npc-confirmation-dialog.js`:

  ```js
  import { escapeHtml } from '../utils.js'
  ```

  Replace with:

  ```js
  import { escapeHtml } from '../utils.js'
  import { CHARACTERISTIC_FORMULAS } from './mappers/npc.js'
  ```

- [ ] **Step 2: Render formula strings in `_renderHTML`**

  In `_renderHTML`, find the `charCells` mapping (around line 55):

  ```js
  const charCells = charKeys.map((k, i) => `
        <div class="coc7-npc-char-cell">
          <div class="coc7-npc-char-label">${charLabels[i]}</div>
          <div class="coc7-npc-char-value">${escapeHtml(String(chars[k] ?? '—'))}</div>
        </div>`).join('')
  ```

  Replace with:

  ```js
  const isRandom = this.#npcData.randomCharacteristics ?? false
  const charCells = charKeys.map((k, i) => {
    const displayValue = isRandom
      ? CHARACTERISTIC_FORMULAS[k]
      : escapeHtml(String(chars[k] ?? '—'))
    return `
        <div class="coc7-npc-char-cell">
          <div class="coc7-npc-char-label">${charLabels[i]}</div>
          <div class="coc7-npc-char-value">${escapeHtml(displayValue)}</div>
        </div>`
  }).join('')
  ```

- [ ] **Step 3: Verify manually — random mode**

  In FoundryVTT as GM:
  1. Open **Actors** → **Create Actor** → type **NPC** → click ✦
  2. Check **Random characteristics**, describe an NPC, click **Generate**
  3. Confirm the characteristics grid shows formula strings: STR/CON/DEX/APP/POW show `5*(3d6)`, INT/SIZ/EDU show `5*(2d6+6)`
  4. Click **Accept**
  5. Confirm the actor is created and its sheet opens
  6. In the console: `game.actors.getName('<npc name>').system.characteristics.str` — confirm `{ formula: '5*(3d6)', value: 0 }`

- [ ] **Step 4: Verify manually — fixed mode (regression)**

  1. Repeat the flow **without** the checkbox
  2. Confirm the characteristics grid shows integers as before
  3. Accept and confirm the created actor has integer values with no formula field

- [ ] **Step 5: Verify token drop behaviour**

  1. Drag the random-characteristics NPC onto a scene
  2. Confirm the CoC7 dialog appears: "Roll / Average / Ignore"
  3. Click **Roll** — confirm the characteristics are resolved to integers and a chat message is posted
  4. Open the actor sheet — confirm characteristics now have numeric values

- [ ] **Step 6: Commit**

  ```bash
  git add scripts/ai-generator/npc-confirmation-dialog.js
  git commit -m "feat: display formula strings in NPC confirmation dialog for random characteristics"
  ```
