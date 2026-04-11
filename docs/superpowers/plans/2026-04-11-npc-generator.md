# NPC Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable GMs to generate fully-formed CoC7 NPC actors from natural-language prompts, using the existing AI generator provider/registry architecture.

**Architecture:** Extends the v1 AI generator by adding an NPC mapper (`mappers/npc.js`), an NPC confirmation dialog (`npc-confirmation-dialog.js`), and NPC detection in the existing dialog injector. No changes to providers, settings, or the weapon flow. Skills are resolved against the CoC7 skills compendium before falling back to fresh item creation.

**Tech Stack:** Vanilla JS ES modules, FoundryVTT v13+ ApplicationV2 API, CoC7 system data models.

---

### Task 1: Bug Fix — Tighten Item Dialog Detection

**Files:**
- Modify: `scripts/ai-generator/dialog-injector.js:21-28`

The current `injectAIButton` matches any dialog with `[name="name"]` and `[name="type"]`, which false-positives on the Create Actor dialog. Add a type-value check so it only fires for item creation.

- [ ] **Step 1: Add item-type guard to `injectAIButton`**

In `scripts/ai-generator/dialog-injector.js`, replace the existing detection block:

```js
export function injectAIButton (dialog, html) {
  if (!game.user.isGM) return  // only GMs may trigger LLM generation

  const nameInput = html.querySelector('[name="name"]')
  const typeSelect = html.querySelector('[name="type"]')
  if (!nameInput || !typeSelect) return // not the Create Item dialog
```

with:

```js
// CoC7 item types — used to distinguish the Create Item dialog from Create Actor
const COC7_ITEM_TYPES = ['weapon', 'skill', 'book', 'spell', 'chase', 'archetype', 'armor',
  'experiencePackage', 'item', 'occupation', 'setup', 'status', 'talent']

export function injectAIButton (dialog, html) {
  if (!game.user.isGM) return

  const nameInput = html.querySelector('[name="name"]')
  const typeSelect = html.querySelector('[name="type"]')
  if (!nameInput || !typeSelect) return

  // Only inject on the Create Item dialog — not Create Actor
  const typeValues = [...typeSelect.options].map(o => o.value)
  if (!typeValues.some(v => COC7_ITEM_TYPES.includes(v))) return
```

- [ ] **Step 2: Manual test in Foundry**

1. Open the Items sidebar, click `+` to open "Create Item" — sparkle button should appear.
2. Open the Actors sidebar, click `+` to open "Create Actor" — sparkle button should NOT appear.
3. Create a normal item (non-AI) — should still work as before.

- [ ] **Step 3: Commit**

```bash
git add scripts/ai-generator/dialog-injector.js
git commit -m "fix: restrict AI button injection to Create Item dialog only

Check type select options for CoC7 item types before injecting.
Previously matched Create Actor dialog too."
```

---

### Task 2: NPC Mapper — System Prompt, Validation, Foundry Data Mapping

**Files:**
- Create: `scripts/ai-generator/mappers/npc.js`
- Modify: `scripts/ai-generator/index.js`

Build the NPC mapper following the same interface as `mappers/weapon.js`: `buildSystemPrompt()`, `validate()`, `toFoundryData()`. This task covers the core data mapping but not skill resolution — that is added in Task 3.

- [ ] **Step 1: Create `scripts/ai-generator/mappers/npc.js`**

```js
// scripts/ai-generator/mappers/npc.js
// NPC mapper — converts LLM output into CoC7 NPC actor data.
// Skill resolution (compendium lookup) is handled by resolveSkills() called from the injector
// after the mapper produces the base actor data.

const SYSTEM_PROMPT = `You are a Call of Cthulhu 7th Edition game master assistant. Generate a CoC7 NPC based on the user's description.

The NPC should be a believable person with enough depth to be credible in a tabletop RPG session. Pick characteristics, skills, and narrative details that are internally consistent with the described occupation, age, and personality.

Respond with ONLY a valid JSON object. No explanation, no markdown fences, no extra text — raw JSON only.

Required fields (must always be present):
- name: string — full name of the NPC
- characteristics: object with all 8 integer values:
  - str, con, siz, dex, app, int, pow, edu
  - Values range 15–90 for a typical human, consistent with CoC7 3d6×5 / (2d6+6)×5 generation
  - Calibrate to occupation and age (e.g. elderly librarian: high EDU/INT, lower STR/DEX)
- skills: array of { "name": string, "value": number } — pick skills that fit the character naturally
  - Use official CoC7 skill names (e.g. "Library Use", "Spot Hidden", "Fighting (Brawl)", "Firearms (Handgun)", "Psychology", "Persuade", "First Aid", "Medicine", "Drive Auto", "Dodge", "Listen", "Stealth", "Science (Chemistry)")
  - For specializations use the format "Category (Specialization)" e.g. "Art/Craft (Painting)", "Science (Pharmacy)", "Language (French)"
  - Values 1–99 as percentages
  - Include whatever skills make sense for the character — typically 5–12 skills

Optional fields (include when relevant, omit if not applicable):
- occupation: string — the NPC's job or role (e.g. "Pharmacist", "Dockworker", "Professor")
- age: number — age in years
- physicalDescription: string — 1-2 sentences describing appearance
- personalityTraits: string — 1-2 sentences describing personality and demeanour
- background: string — 2-3 sentences of relevant background, hooks, or secrets useful to a GM`

const REQUIRED_CHARACTERISTICS = ['str', 'con', 'siz', 'dex', 'app', 'int', 'pow', 'edu']

export default {
  buildSystemPrompt () {
    return SYSTEM_PROMPT
  },

  validate (data) {
    const errors = []

    if (!data.name) errors.push('name')

    if (!data.characteristics || typeof data.characteristics !== 'object') {
      errors.push('characteristics')
    } else {
      const missing = REQUIRED_CHARACTERISTICS.filter(c => typeof data.characteristics[c] !== 'number')
      if (missing.length) errors.push(`characteristics.${missing.join(', characteristics.')}`)
    }

    if (!Array.isArray(data.skills) || data.skills.length === 0) {
      errors.push('skills (must be a non-empty array)')
    }

    if (errors.length) {
      throw new Error(`LLM response missing required fields: ${errors.join(', ')}`)
    }
  },

  toFoundryData (data) {
    const personalityHtml = data.personalityTraits
      ? `<p><strong>Personality:</strong> ${data.personalityTraits}</p>`
      : ''
    const backgroundHtml = data.background
      ? `<p><strong>Background:</strong> ${data.background}</p>`
      : ''

    return {
      actorData: {
        name: data.name,
        type: 'npc',
        system: {
          characteristics: {
            str: { value: data.characteristics.str },
            con: { value: data.characteristics.con },
            siz: { value: data.characteristics.siz },
            dex: { value: data.characteristics.dex },
            app: { value: data.characteristics.app },
            int: { value: data.characteristics.int },
            pow: { value: data.characteristics.pow },
            edu: { value: data.characteristics.edu }
          },
          infos: {
            occupation: data.occupation ?? '',
            age: String(data.age ?? ''),
            type: '',
            organization: ''
          },
          biography: {
            personalDescription: { value: data.physicalDescription ?? '' }
          },
          description: {
            keeper: personalityHtml + backgroundHtml
          }
        }
      },
      skillsRaw: data.skills,
      llmData: data
    }
  }
}
```

- [ ] **Step 2: Register the NPC mapper in `index.js`**

In `scripts/ai-generator/index.js`, add the import after the WeaponMapper import line and the registration after the weapon registration:

Add this import after `import WeaponMapper from './mappers/weapon.js'`:

```js
import NPCMapper from './mappers/npc.js'
```

Add this registration after `mappers.register('weapon', WeaponMapper)`:

```js
mappers.register('npc', NPCMapper)
```

- [ ] **Step 3: Verify the mapper loads without errors**

Open a Foundry world with the module active. Open the browser console. There should be no new errors. Verify the mapper is registered:

```js
// In browser console:
// No direct way to check from console, but absence of load errors confirms registration.
```

- [ ] **Step 4: Commit**

```bash
git add scripts/ai-generator/mappers/npc.js scripts/ai-generator/index.js
git commit -m "feat: add NPC mapper with system prompt, validation, and data mapping"
```

---

### Task 3: Skill Resolution — Compendium Lookup + Fallback

**Files:**
- Modify: `scripts/ai-generator/mappers/npc.js`

Add `resolveSkills()` to the NPC mapper. This async method takes the raw skills array from the LLM and returns an array of CoC7 skill item data objects ready for `createEmbeddedDocuments()`. It looks up each skill in the `CoC7.skills` compendium pack first, falling back to creating a fresh skill item.

- [ ] **Step 1: Add `resolveSkills()` to the NPC mapper**

In `scripts/ai-generator/mappers/npc.js`, add this method to the exported object, after the `toFoundryData` method:

```js
  async resolveSkills (skillsRaw) {
    const pack = game.packs.get('CoC7.skills')
    let compendiumIndex = null
    if (pack) {
      // Load the full index so we can search by name
      compendiumIndex = await pack.getIndex()
    }

    const resolved = []
    for (const { name, value } of skillsRaw) {
      const normalized = name.trim().replace(/\s+/g, ' ')
      const skillData = await this._resolveOneSkill(normalized, value, pack, compendiumIndex)
      if (skillData) resolved.push(skillData)
    }
    return resolved
  },

  async _resolveOneSkill (skillName, targetValue, pack, compendiumIndex) {
    // Attempt compendium lookup
    if (compendiumIndex) {
      const match = compendiumIndex.find(
        entry => entry.name.toLowerCase() === skillName.toLowerCase()
      )
      if (match && pack) {
        const doc = await pack.getDocument(match._id)
        if (doc) {
          const data = doc.toObject()
          // Set adjustments.personal to the target value so total equals targetValue
          // regardless of how the base formula resolves
          data.system.adjustments = data.system.adjustments ?? {}
          data.system.adjustments.personal = targetValue
          // Zero out other adjustment fields so the total is deterministic
          data.system.adjustments.occupation = 0
          data.system.adjustments.experience = 0
          data.system.adjustments.archetype = 0
          data.system.adjustments.experiencePackage = 0
          // Remove _id so Foundry creates a new embedded document
          delete data._id
          return data
        }
      }
    }

    // Fallback: create a fresh skill item using CoC7's name parser
    const nameParts = CONFIG.Item.dataModels.skill.guessNameParts(skillName)
    return {
      name: nameParts.name,
      type: 'skill',
      system: {
        skillName: nameParts.system.skillName,
        specialization: nameParts.system.specialization,
        properties: {
          ...nameParts.system.properties,
          push: !(nameParts.system.properties.fighting || nameParts.system.properties.firearm || nameParts.system.properties.ranged)
        },
        adjustments: {
          personal: targetValue,
          base: 0,
          occupation: 0,
          archetype: 0,
          experiencePackage: 0,
          experience: 0
        }
      }
    }
  }
```

- [ ] **Step 2: Manual test in Foundry console**

Open a Foundry world with CoC7 + this module active. Run in the browser console:

```js
const mapper = game.modules.get('coc7-qol') // just verify no load errors
```

A full end-to-end test happens after the dialog flow is wired in Task 5.

- [ ] **Step 3: Commit**

```bash
git add scripts/ai-generator/mappers/npc.js
git commit -m "feat: add skill resolution with compendium lookup and fallback"
```

---

### Task 4: NPC Confirmation Dialog

**Files:**
- Create: `scripts/ai-generator/npc-confirmation-dialog.js`

Build the rich read-only confirmation dialog as an ApplicationV2 subclass. Shows: identity bar, 8 characteristics in a 4×2 grid, derived attributes row (HP/MP/SAN/MOV/DB — computed placeholders since we cannot derive them client-side without creating the actor), skills list, narrative sections, and Accept/Regenerate/Cancel buttons.

Note: derived attributes (HP, MP, SAN, MOV, DB) cannot be pre-computed in the preview without duplicating CoC7's internal formulas. The dialog shows the 8 raw characteristics only. Derived values appear on the NPC sheet after creation.

- [ ] **Step 1: Create `scripts/ai-generator/npc-confirmation-dialog.js`**

```js
// scripts/ai-generator/npc-confirmation-dialog.js
// Rich read-only preview dialog for AI-generated NPC actors.

export default class CoC7NPCConfirmationDialog extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    tag: 'div',
    window: { title: 'CoC7 AI Generator — Review NPC' },
    position: { width: 520, height: 'auto' },
    actions: {
      accept: CoC7NPCConfirmationDialog.#handleAccept,
      regenerate: CoC7NPCConfirmationDialog.#handleRegenerate,
      cancel: CoC7NPCConfirmationDialog.#handleCancel
    }
  }

  #npcData      // { actorData, skillsRaw, llmData } from mapper.toFoundryData()
  #acceptCallback
  #regenerateCallback
  #cancelCallback

  constructor ({ npcData, onAccept, onRegenerate, onCancel } = {}, options = {}) {
    super(options)
    this.#npcData = npcData ?? {}
    this.#acceptCallback = onAccept ?? (() => {})
    this.#regenerateCallback = onRegenerate ?? (() => {})
    this.#cancelCallback = onCancel ?? (() => {})
  }

  get npcData () {
    return this.#npcData
  }

  async _renderHTML (_context, _options) {
    const llm = this.#npcData.llmData ?? {}
    const chars = llm.characteristics ?? {}
    const skills = llm.skills ?? []

    const div = document.createElement('div')
    div.className = 'coc7-ai-npc-dialog'

    // --- Identity bar ---
    const identityHtml = `
      <div class="coc7-npc-identity" style="background:var(--color-cool-5,#1a1a2e);padding:0.75rem 1rem;border-bottom:1px solid var(--color-border-dark,#333)">
        <div style="font-size:1.2rem;font-weight:bold;color:var(--color-warm-2,#e8d5b7);margin-bottom:0.2rem">${this.#esc(llm.name)}</div>
        <div style="display:flex;gap:1.5rem;font-size:0.85rem;color:var(--color-text-light-6,#aaa)">
          ${llm.occupation ? `<span><span style="color:var(--color-text-light-8,#888)">Occupation</span>&nbsp;${this.#esc(llm.occupation)}</span>` : ''}
          ${llm.age ? `<span><span style="color:var(--color-text-light-8,#888)">Age</span>&nbsp;${this.#esc(String(llm.age))}</span>` : ''}
        </div>
      </div>`

    // --- Characteristics grid ---
    const charLabels = ['STR', 'CON', 'SIZ', 'DEX', 'APP', 'INT', 'POW', 'EDU']
    const charKeys = ['str', 'con', 'siz', 'dex', 'app', 'int', 'pow', 'edu']
    const charCells = charKeys.map((k, i) => `
      <div style="text-align:center;background:var(--color-cool-5-75,#111);border-radius:4px;padding:0.35rem 0">
        <div style="font-size:0.65rem;color:var(--color-text-light-8,#888)">${charLabels[i]}</div>
        <div style="font-size:1rem;font-weight:bold;color:var(--color-warm-2,#c9a96e)">${this.#esc(String(chars[k] ?? '—'))}</div>
      </div>`).join('')

    const charsHtml = `
      <div style="padding:0.75rem 1rem;border-bottom:1px solid var(--color-border-dark,#333)">
        <div style="font-size:0.7rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--color-text-light-8,#888);margin-bottom:0.5rem">Characteristics</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0.4rem">${charCells}</div>
      </div>`

    // --- Skills list ---
    const skillRows = skills.map(s => `
      <div style="display:flex;justify-content:space-between;border-bottom:1px solid var(--color-cool-5-75,#1f1f1f);padding:0.15rem 0">
        <span style="color:var(--color-text-light-3,#ccc)">${this.#esc(s.name)}</span>
        <span style="color:var(--color-warm-2,#c9a96e);font-weight:bold">${this.#esc(String(s.value))}%</span>
      </div>`).join('')

    const skillsHtml = skills.length ? `
      <div style="padding:0.75rem 1rem;border-bottom:1px solid var(--color-border-dark,#333)">
        <div style="font-size:0.7rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--color-text-light-8,#888);margin-bottom:0.5rem">Skills</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.25rem 1rem;font-size:0.85rem">${skillRows}</div>
      </div>` : ''

    // --- Narrative sections ---
    const narrativeSection = (label, text) => {
      if (!text) return ''
      return `
        <div style="padding:0.75rem 1rem;border-bottom:1px solid var(--color-border-dark,#333)">
          <div style="font-size:0.7rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--color-text-light-8,#888);margin-bottom:0.4rem">${label}</div>
          <p style="font-size:0.82rem;color:var(--color-text-light-5,#bbb);margin:0">${this.#esc(text)}</p>
        </div>`
    }

    // --- Buttons ---
    const buttonsHtml = `
      <div class="form-footer" style="display:flex;flex-direction:row;gap:0.5rem;padding:0.75rem 1rem">
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

  _replaceHTML (result, content, _options) {
    content.replaceChildren(result)
  }

  #esc (str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  static async #handleAccept (_event, _target) {
    await this.#acceptCallback(this.#npcData)
    this.close()
  }

  static async #handleRegenerate (_event, _target) {
    this.#regenerateCallback()
    this.close()
  }

  static async #handleCancel (_event, _target) {
    this.#cancelCallback()
    this.close()
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/ai-generator/npc-confirmation-dialog.js
git commit -m "feat: add NPC confirmation dialog with rich read-only preview"
```

---

### Task 5: Wire NPC Injection into Dialog Injector

**Files:**
- Modify: `scripts/ai-generator/dialog-injector.js`

Add NPC detection alongside the existing item detection. When the Create Actor dialog is detected, inject the sparkle button. On click, transform the form to a prompt textarea, call the LLM with the NPC mapper, open the NPC confirmation dialog, and handle Accept/Regenerate/Cancel.

- [ ] **Step 1: Add NPC imports at the top of `dialog-injector.js`**

Add this import after the existing `CoC7AIGenerationDialog` import:

```js
import CoC7NPCConfirmationDialog from './npc-confirmation-dialog.js'
```

- [ ] **Step 2: Add `COC7_ACTOR_TYPES` constant and `injectNPCButton` function**

Add these after the `COC7_ITEM_TYPES` constant (added in Task 1) and after the closing brace of `injectAIButton`:

```js
// CoC7 actor types — used to detect the Create Actor dialog
const COC7_ACTOR_TYPES = ['character', 'npc', 'creature', 'vehicle', 'container']

/**
 * Called on every renderDialogV2 hook. Checks whether the dialog is the
 * "Create Actor" dialog before doing any DOM work.
 * @param {Dialog} dialog
 * @param {HTMLElement} html
 */
export function injectNPCButton (dialog, html) {
  if (!game.user.isGM) return

  const nameInput = html.querySelector('[name="name"]')
  const typeSelect = html.querySelector('[name="type"]')
  if (!nameInput || !typeSelect) return

  // Only inject on the Create Actor dialog — not Create Item
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

  aiBtn.addEventListener('click', () => {
    _transformToNPCPromptView(dialog, html, nameInput, aiBtn)
  })
}
```

- [ ] **Step 3: Add `_transformToNPCPromptView` function**

Add this function after the existing `_restoreOriginalForm` function:

```js
/**
 * Replaces Name + Type form fields with a prompt textarea for NPC generation.
 */
function _transformToNPCPromptView (dialog, html, nameInput, aiBtn) {
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
  promptArea.innerHTML = `
    <label for="coc7-ai-npc-prompt" style="font-weight:bold">Describe your NPC</label>
    <textarea
      id="coc7-ai-npc-prompt"
      name="ai-npc-prompt"
      rows="4"
      placeholder='e.g. "A nervous pharmacist in 1920s Arkham, middle-aged, hides a secret"'
      style="width:100%;resize:vertical;box-sizing:border-box"
    ></textarea>
    <div class="coc7-ai-error" style="display:none;color:var(--color-text-dark-error,red);margin-top:0.25rem;font-size:0.875em"></div>
  `
  form.insertBefore(promptArea, buttonRow)

  const promptTextarea = form.querySelector('[name="ai-npc-prompt"]')
  if (capturedName) promptTextarea.value = `An NPC named "${capturedName}". `

  aiBtn.style.display = 'none'

  buttonRow.innerHTML = `
    <button type="button" class="coc7-btn-generate" style="flex:1">Generate</button>
    <button type="button" class="coc7-btn-back">Cancel</button>
  `

  buttonRow.querySelector('.coc7-btn-back').addEventListener('click', () => {
    _restoreOriginalNPCForm(form, buttonRow, promptArea, originalFieldNodes, originalButtonHTML, aiBtn, dialog, html)
  })

  buttonRow.querySelector('.coc7-btn-generate').addEventListener('click', () => {
    _runNPCGeneration(dialog, html, form, buttonRow, promptArea, originalFieldNodes, originalButtonHTML, aiBtn)
  })
}
```

- [ ] **Step 4: Add `_restoreOriginalNPCForm` function**

Add after `_transformToNPCPromptView`:

```js
/**
 * Restores the Create Actor form to its original Name + Type state.
 */
function _restoreOriginalNPCForm (form, buttonRow, promptArea, originalFieldNodes, originalButtonHTML, aiBtn, dialog, html) {
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
      _transformToNPCPromptView(dialog, html, newNameInput, restoredBtn)
    })
  }
}
```

- [ ] **Step 5: Add `_runNPCGeneration` function**

Add after `_restoreOriginalNPCForm`:

```js
/**
 * Calls the LLM provider with the NPC mapper and opens the NPC confirmation dialog.
 */
async function _runNPCGeneration (dialog, html, form, buttonRow, promptArea, originalFieldNodes, originalButtonHTML, aiBtn) {
  const textarea = form.querySelector('[name="ai-npc-prompt"]')
  const userPrompt = textarea?.value?.trim()
  const errorDiv = form.querySelector('.coc7-ai-error')
  const generateBtn = buttonRow.querySelector('.coc7-btn-generate')

  if (!userPrompt) {
    errorDiv.textContent = 'Please describe the NPC before generating.'
    errorDiv.style.display = 'block'
    return
  }

  const apiKey = game.settings.get(MODULE, 'ai-api-key')
  if (!apiKey) {
    errorDiv.textContent = 'No API key configured — set it in Module Settings → CoC7 QoL Improvements.'
    errorDiv.style.display = 'block'
    return
  }

  generateBtn.disabled = true
  generateBtn.textContent = 'Generating…'
  errorDiv.style.display = 'none'

  try {
    const providerId = game.settings.get(MODULE, 'ai-provider')
    const ProviderClass = providers.get(providerId)
    if (!ProviderClass) throw new Error(`Unknown provider: ${providerId}`)

    const mapper = mappers.get('npc')
    const systemPrompt = mapper.buildSystemPrompt()

    const provider = new ProviderClass()
    const llmData = await provider.generate(systemPrompt, userPrompt)

    mapper.validate(llmData)
    const npcData = mapper.toFoundryData(llmData)

    new CoC7NPCConfirmationDialog({
      npcData,

      onAccept: async (data) => {
        try {
          // Resolve skills against compendium
          const resolvedSkills = await mapper.resolveSkills(data.skillsRaw)

          // Create actor
          const actor = await Actor.create(data.actorData)

          // Attach skills
          if (resolvedSkills.length > 0) {
            try {
              await actor.createEmbeddedDocuments('Item', resolvedSkills)
            } catch (skillErr) {
              ui.notifications.warn(`CoC7 AI Generator: NPC created but some skills failed — ${skillErr.message}`)
            }
          }

          actor?.sheet?.render(true)
          dialog.close()
        } catch (err) {
          ui.notifications.error(`CoC7 AI Generator: Failed to create NPC — ${err.message}`)
        }
      },

      onRegenerate: () => {
        generateBtn.disabled = false
        generateBtn.textContent = 'Generate'
        textarea.focus()
      },

      onCancel: () => {
        _restoreOriginalNPCForm(form, buttonRow, promptArea, originalFieldNodes, originalButtonHTML, aiBtn, dialog, html)
      }
    }).render({ force: true })

  } catch (err) {
    errorDiv.textContent = err.message
    errorDiv.style.display = 'block'
    generateBtn.disabled = false
    generateBtn.textContent = 'Retry'
  }
}
```

- [ ] **Step 6: Register the NPC hook in `index.js`**

In `scripts/ai-generator/index.js`, update the import to include the new function:

Change:
```js
import { injectAIButton } from './dialog-injector.js'
```

to:
```js
import { injectAIButton, injectNPCButton } from './dialog-injector.js'
```

Then add a new hook registration after the existing one:

```js
Hooks.on('renderDialogV2', injectNPCButton)
```

- [ ] **Step 7: Commit**

```bash
git add scripts/ai-generator/dialog-injector.js scripts/ai-generator/index.js
git commit -m "feat: wire NPC generation into Create Actor dialog

Injects sparkle button, transforms to prompt textarea, calls LLM
with NPC mapper, opens confirmation dialog, creates actor + skills."
```

---

### Task 6: Update Module Metadata

**Files:**
- Modify: `module.json`

Update the module description to mention NPC generation.

- [ ] **Step 1: Update `module.json` description**

In `module.json`, change:

```json
"description": "Quality of life improvements for the Call of Cthulhu 7th Edition system. Adds image popouts and AI-powered weapon generation for GMs.",
```

to:

```json
"description": "Quality of life improvements for the Call of Cthulhu 7th Edition system. Adds image popouts, AI-powered weapon generation, and AI-powered NPC generation for GMs.",
```

No changes to `esmodules` — `index.js` is already the sole entry point and it imports all new files internally.

- [ ] **Step 2: Commit**

```bash
git add module.json
git commit -m "docs: update module description to mention NPC generation"
```

---

### Task 7: End-to-End Manual Testing

**Files:** none (testing only)

No automated tests — all features require manual testing in a running FoundryVTT instance with the CoC7 system. Test as GM.

- [ ] **Step 1: Test bug fix — Create Item dialog**

1. Open Items sidebar → click `+`
2. Verify sparkle button appears
3. Click sparkle → verify textarea says "Describe your weapon"
4. Cancel → verify form restores correctly
5. Generate a weapon → verify it works as before

- [ ] **Step 2: Test bug fix — Create Actor dialog no longer shows item sparkle**

1. Open Actors sidebar → click `+`
2. Verify there is exactly ONE sparkle button (the NPC one, not the weapon one)

- [ ] **Step 3: Test NPC generation flow**

1. Open Actors sidebar → click `+`
2. Click the sparkle button
3. Verify the form transforms: textarea with "Describe your NPC" label
4. Enter a prompt: "A nervous pharmacist in 1920s Arkham, middle-aged, hides a laudanum habit"
5. Click Generate
6. Verify the NPC confirmation dialog opens with:
   - Name, occupation, age in the identity bar
   - 8 characteristics in a grid
   - Skills list with names and percentages
   - Narrative sections (appearance, personality, background)
7. Click Accept
8. Verify the NPC actor is created and its sheet opens
9. On the NPC sheet, verify:
   - Characteristics match the preview
   - Skills are present as embedded items
   - Biography and keeper notes contain the narrative text
   - Derived attributes (HP, MP, SAN, MOV) are auto-computed

- [ ] **Step 4: Test Regenerate flow**

1. Generate an NPC
2. In the confirmation dialog, click Regenerate
3. Verify the dialog closes and the prompt textarea is still visible with the original text
4. Click Generate again — verify a new NPC is generated

- [ ] **Step 5: Test Cancel flow**

1. Generate an NPC
2. In the confirmation dialog, click Cancel
3. Verify the Create Actor dialog restores to its original Name + Type form

- [ ] **Step 6: Test error cases**

1. Remove the API key from settings → click Generate → verify "No API key" error
2. Enter a nonsensical prompt with API key set → verify error handling if LLM returns bad data
3. Verify the Retry button works after an error

- [ ] **Step 7: Test skill compendium resolution**

1. Generate an NPC and accept it
2. Open the created NPC's sheet
3. Check a common skill (e.g. Dodge, Spot Hidden) — it should have the correct icon and properties from the compendium
4. If the LLM returned an unusual skill not in the compendium, verify it was created as a fallback skill item

- [ ] **Step 8: Commit any fixes from testing**

If testing reveals issues, fix them and commit:

```bash
git add -A
git commit -m "fix: address issues found during NPC generator manual testing"
```
