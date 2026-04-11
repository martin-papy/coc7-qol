# AI Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an AI-powered weapon generator to coc7-qol that transforms the native "Create Item" dialog in-place, calls a configurable LLM provider (Anthropic/OpenAI/Gemini), and creates a CoC7 weapon item after GM review.

**Architecture:** Render-hook approach — `Hooks.on('renderDialog', ...)` detects the "Create Item" dialog and injects an AI sparkle button. Clicking it swaps the form in-place to a prompt textarea. On generation, a lightweight `ApplicationV2` confirmation dialog shows the weapon stats before `Item.create()` is called. Provider and mapper layers are extensible registries.

**Tech Stack:** Vanilla JS ES modules, FoundryVTT v13+ API (`ApplicationV2`, `game.settings`, `Item.create()`), browser `fetch()` for LLM calls. No build step.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `module.json` | Modify | Add `scripts/ai-generator/index.js` to `esmodules` |
| `scripts/ai-generator/index.js` | Create | Entry point — imports + hook registration |
| `scripts/ai-generator/settings.js` | Create | `game.settings.register()` calls + provider `onChange` |
| `scripts/ai-generator/providers/registry.js` | Create | `{ register, get }` — provider registry |
| `scripts/ai-generator/providers/anthropic.js` | Create | Anthropic Claude API provider |
| `scripts/ai-generator/providers/openai.js` | Create | OpenAI API provider |
| `scripts/ai-generator/providers/gemini.js` | Create | Google Gemini API provider |
| `scripts/ai-generator/mappers/registry.js` | Create | `{ register, get }` — mapper registry |
| `scripts/ai-generator/mappers/weapon.js` | Create | System prompt + validate + toFoundryData |
| `scripts/ai-generator/generation-dialog.js` | Create | `ApplicationV2` confirmation dialog |
| `scripts/ai-generator/dialog-injector.js` | Create | Render hook, DOM transformation, generate flow |

---

## Task 1: Scaffold — index.js + module.json

**Files:**
- Create: `scripts/ai-generator/index.js`
- Modify: `module.json`

- [ ] **Step 1: Create the index.js stub**

```js
// scripts/ai-generator/index.js
// Entry point for the AI Generator feature.
// All other files in this directory are imported from here.
// Only this file is listed in module.json esmodules.

import { registerSettings } from './settings.js'
import * as providers from './providers/registry.js'
import AnthropicProvider from './providers/anthropic.js'
import OpenAIProvider from './providers/openai.js'
import GeminiProvider from './providers/gemini.js'
import * as mappers from './mappers/registry.js'
import WeaponMapper from './mappers/weapon.js'
import { injectAIButton } from './dialog-injector.js'

// Register providers and mappers at module load time (pure in-memory, no Foundry API needed)
providers.register('anthropic', AnthropicProvider)
providers.register('openai', OpenAIProvider)
providers.register('gemini', GeminiProvider)
mappers.register('weapon', WeaponMapper)

// Settings must be registered during the 'init' hook
Hooks.once('init', registerSettings)

// Inject the AI button whenever any dialog renders — injectAIButton checks internally
// whether the dialog is the "Create Item" dialog before doing anything.
Hooks.on('renderDialog', injectAIButton)
```

- [ ] **Step 2: Update module.json**

Add `"scripts/ai-generator/index.js"` to the `esmodules` array:

```json
"esmodules": [
  "scripts/item-image-popout.js",
  "scripts/possession-item-image-popout.js",
  "scripts/ai-generator/index.js"
]
```

- [ ] **Step 3: Create placeholder stubs for all imported files so the module loads**

Create `scripts/ai-generator/settings.js`:
```js
export function registerSettings() {}
```

Create `scripts/ai-generator/providers/registry.js`:
```js
const _providers = new Map()
export function register(id, cls) { _providers.set(id, cls) }
export function get(id) { return _providers.get(id) }
```

Create `scripts/ai-generator/providers/anthropic.js`:
```js
export default class AnthropicProvider {}
```

Create `scripts/ai-generator/providers/openai.js`:
```js
export default class OpenAIProvider {}
```

Create `scripts/ai-generator/providers/gemini.js`:
```js
export default class GeminiProvider {}
```

Create `scripts/ai-generator/mappers/registry.js`:
```js
const _mappers = new Map()
export function register(type, mapper) { _mappers.set(type, mapper) }
export function get(type) { return _mappers.get(type) }
```

Create `scripts/ai-generator/mappers/weapon.js`:
```js
export default {}
```

Create `scripts/ai-generator/generation-dialog.js`:
```js
export default class CoC7AIGenerationDialog {}
```

Create `scripts/ai-generator/dialog-injector.js`:
```js
export function injectAIButton() {}
```

- [ ] **Step 4: Reload Foundry and verify no console errors**

In FoundryVTT, press F5 or run `location.reload()` in the browser console. Open the browser DevTools console (F12). Confirm no errors related to `coc7-qol` or `ai-generator`.

- [ ] **Step 5: Commit**

```bash
git add module.json scripts/ai-generator/
git commit -m "feat: scaffold ai-generator entry point and stub files"
```

---

## Task 2: Settings

**Files:**
- Modify: `scripts/ai-generator/settings.js`

- [ ] **Step 1: Write settings.js with provider defaults and 4 registered settings**

```js
// scripts/ai-generator/settings.js
const MODULE = 'coc7-qol'

export const PROVIDER_DEFAULTS = {
  anthropic: {
    endpoint: 'https://api.anthropic.com/v1/messages',
    model: 'claude-sonnet-4-6'
  },
  openai: {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o'
  },
  gemini: {
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
    model: 'gemini-2.0-flash'
  }
}

export function registerSettings () {
  game.settings.register(MODULE, 'ai-provider', {
    name: 'AI Generator: Provider',
    hint: 'LLM provider used for item generation. Changing this auto-updates the endpoint and model to provider defaults.',
    scope: 'world',
    config: true,
    type: String,
    choices: {
      anthropic: 'Anthropic (Claude)',
      openai: 'OpenAI (GPT)',
      gemini: 'Google (Gemini)'
    },
    default: 'anthropic',
    onChange: (value) => {
      const defaults = PROVIDER_DEFAULTS[value]
      if (!defaults) return
      game.settings.set(MODULE, 'ai-endpoint', defaults.endpoint)
      game.settings.set(MODULE, 'ai-model', defaults.model)
    }
  })

  game.settings.register(MODULE, 'ai-api-key', {
    name: 'AI Generator: API Key',
    hint: 'Your API key for the selected provider. Only visible to GMs.',
    scope: 'world',
    config: true,
    type: String,
    default: ''
  })

  game.settings.register(MODULE, 'ai-endpoint', {
    name: 'AI Generator: Endpoint URL',
    hint: 'API endpoint URL. Updated automatically when changing provider. Override for custom deployments.',
    scope: 'world',
    config: true,
    type: String,
    default: PROVIDER_DEFAULTS.anthropic.endpoint
  })

  game.settings.register(MODULE, 'ai-model', {
    name: 'AI Generator: Model',
    hint: 'Model name. Updated automatically when changing provider. Override for custom or newer models.',
    scope: 'world',
    config: true,
    type: String,
    default: PROVIDER_DEFAULTS.anthropic.model
  })
}
```

- [ ] **Step 2: Reload Foundry and verify settings appear**

1. Press F5 in Foundry
2. Open Settings → Configure Settings → Module Settings
3. Confirm "AI Generator: Provider", "AI Generator: API Key", "AI Generator: Endpoint URL", "AI Generator: Model" all appear under CoC7 QoL Improvements
4. Change Provider from Anthropic to OpenAI, confirm Endpoint URL auto-updates to `https://api.openai.com/v1/chat/completions` and Model to `gpt-4o`
5. Change back to Anthropic, confirm endpoint and model revert to Anthropic defaults

- [ ] **Step 3: Commit**

```bash
git add scripts/ai-generator/settings.js
git commit -m "feat: register ai-generator module settings with provider onChange"
```

---

## Task 3: Provider Registry + Anthropic Provider

**Files:**
- Modify: `scripts/ai-generator/providers/registry.js` (already correct from Task 1 stub)
- Modify: `scripts/ai-generator/providers/anthropic.js`

- [ ] **Step 1: Implement the Anthropic provider**

The Anthropic browser API requires the `anthropic-dangerous-direct-browser-access: true` header to allow direct browser-to-API calls.

```js
// scripts/ai-generator/providers/anthropic.js
const MODULE = 'coc7-qol'

export default class AnthropicProvider {
  async generate (systemPrompt, userPrompt) {
    const apiKey = game.settings.get(MODULE, 'ai-api-key')
    const endpoint = game.settings.get(MODULE, 'ai-endpoint')
    const model = game.settings.get(MODULE, 'ai-model')

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Anthropic API error ${response.status}: ${error}`)
    }

    const data = await response.json()
    const text = data.content?.[0]?.text
    if (!text) throw new Error('Anthropic returned an empty response')
    return JSON.parse(text)
  }
}
```

- [ ] **Step 2: Verify in the browser console**

With a valid Anthropic API key configured in module settings, run this in the browser console:

```js
const { default: AnthropicProvider } = await import('/modules/coc7-qol/scripts/ai-generator/providers/anthropic.js')
const p = new AnthropicProvider()
const result = await p.generate(
  'Respond with only a JSON object: {"hello": "world"}',
  'Say hello'
)
console.log(result) // should log { hello: "world" }
```

- [ ] **Step 3: Commit**

```bash
git add scripts/ai-generator/providers/anthropic.js scripts/ai-generator/providers/registry.js
git commit -m "feat: implement provider registry and Anthropic provider"
```

---

## Task 4: OpenAI + Gemini Providers

**Files:**
- Modify: `scripts/ai-generator/providers/openai.js`
- Modify: `scripts/ai-generator/providers/gemini.js`

- [ ] **Step 1: Implement the OpenAI provider**

```js
// scripts/ai-generator/providers/openai.js
const MODULE = 'coc7-qol'

export default class OpenAIProvider {
  async generate (systemPrompt, userPrompt) {
    const apiKey = game.settings.get(MODULE, 'ai-api-key')
    const endpoint = game.settings.get(MODULE, 'ai-endpoint')
    const model = game.settings.get(MODULE, 'ai-model')

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`OpenAI API error ${response.status}: ${error}`)
    }

    const data = await response.json()
    const text = data.choices?.[0]?.message?.content
    if (!text) throw new Error('OpenAI returned an empty response')
    return JSON.parse(text)
  }
}
```

- [ ] **Step 2: Implement the Gemini provider**

Note: The Gemini endpoint template contains `{model}` which is interpolated at call time. The API key is passed as a URL query parameter.

```js
// scripts/ai-generator/providers/gemini.js
const MODULE = 'coc7-qol'

export default class GeminiProvider {
  async generate (systemPrompt, userPrompt) {
    const apiKey = game.settings.get(MODULE, 'ai-api-key')
    const endpointTemplate = game.settings.get(MODULE, 'ai-endpoint')
    const model = game.settings.get(MODULE, 'ai-model')
    const endpoint = endpointTemplate.replace('{model}', model)

    const response = await fetch(`${endpoint}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: userPrompt }] }],
        generationConfig: { responseMimeType: 'application/json' }
      })
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Gemini API error ${response.status}: ${error}`)
    }

    const data = await response.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) throw new Error('Gemini returned an empty response')
    return JSON.parse(text)
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add scripts/ai-generator/providers/openai.js scripts/ai-generator/providers/gemini.js
git commit -m "feat: implement OpenAI and Gemini providers"
```

---

## Task 5: Weapon Mapper

**Files:**
- Modify: `scripts/ai-generator/mappers/registry.js` (already correct from Task 1 stub)
- Modify: `scripts/ai-generator/mappers/weapon.js`

- [ ] **Step 1: Implement the weapon mapper**

The mapper owns the system prompt, validation, and the CoC7 schema mapping. The `system` object mirrors `CoC7ModelsItemWeaponSystem.defineSchema()` from the CoC7 source at `../CoC7-FoundryVTT-8.x/coc7/models/item/weapon-system.js`.

```js
// scripts/ai-generator/mappers/weapon.js

const SYSTEM_PROMPT = `You are a Call of Cthulhu 7th Edition game master assistant. Generate a CoC7 weapon item based on the user's description.

Respond with ONLY a valid JSON object. No explanation, no markdown fences, no extra text — raw JSON only.

Required fields (must always be present):
- name: string — the weapon name
- damage: string — dice expression (e.g. "1d8", "1d6+1", "1d10+db")
- skill: string — the CoC7 skill name (e.g. "Firearms (Handgun)", "Fighting (Brawl)", "Firearms (Rifle/Shotgun)", "Throw")

Optional fields (omit or use null if not applicable):
- description: string — flavour text and physical description (default "")
- range: string — effective range (e.g. "15m", "30 yards") or "" for melee weapons
- usesPerRound: string — attacks per round (e.g. "1", "2")
- bullets: number or null — magazine/cylinder capacity; null for non-firearms
- malfunction: number or null — malfunction threshold 96–100; null for non-firearms
- properties: object with boolean flags:
  - rngd: true if ranged weapon
  - impl: true if impaling (piercing) weapon
  - addb: true if adds full damage bonus (DB) to damage
  - ahdb: true if adds half damage bonus to damage

Common CoC7 skills: "Fighting (Brawl)", "Fighting (Sword)", "Fighting (Axe)", "Fighting (Spear)", "Fighting (Whip)", "Firearms (Handgun)", "Firearms (Rifle/Shotgun)", "Firearms (Submachine Gun)", "Firearms (Machine Gun)", "Throw", "Explosives"
Common damage bonus usage: melee weapons typically use "addb" or "ahdb"; firearms do not.`

const REQUIRED_FIELDS = ['name', 'damage', 'skill']

export default {
  buildSystemPrompt () {
    return SYSTEM_PROMPT
  },

  validate (data) {
    const missing = REQUIRED_FIELDS.filter(f => !data[f])
    if (missing.length) {
      throw new Error(`LLM response missing required fields: ${missing.join(', ')}`)
    }
  },

  toFoundryData (data) {
    return {
      name: data.name,
      type: 'weapon',
      system: {
        description: {
          value: data.description || '',
          special: '',
          keeper: ''
        },
        skill: {
          main: { name: data.skill || '', id: '' },
          alternativ: { name: '', id: '' }
        },
        range: {
          normal: { value: data.range || '', damage: data.damage || '' },
          long: { value: '', damage: '' },
          extreme: { value: '', damage: '' }
        },
        usesPerRound: {
          normal: data.usesPerRound || '1',
          max: null,
          burst: null
        },
        bullets: data.bullets ?? null,
        ammo: 0,
        malfunction: data.malfunction ?? null,
        blastRadius: null,
        properties: {
          rngd: data.properties?.rngd ?? false,
          mnvr: false,
          thrown: false,
          shotgun: false,
          dbrl: false,
          impl: data.properties?.impl ?? false,
          brst: false,
          auto: false,
          ahdb: data.properties?.ahdb ?? false,
          addb: data.properties?.addb ?? false,
          slnt: false,
          spcl: false,
          mont: false,
          blst: false,
          stun: false,
          rare: false,
          burn: false
        }
      }
    }
  }
}
```

- [ ] **Step 2: Verify mapper in the browser console**

```js
const mapper = await import('/modules/coc7-qol/scripts/ai-generator/mappers/weapon.js')
const mockLLM = {
  name: 'Test Revolver',
  damage: '1d8',
  skill: 'Firearms (Handgun)',
  range: '15m',
  usesPerRound: '1',
  bullets: 6,
  malfunction: 96,
  properties: { rngd: true, impl: false, addb: false, ahdb: false }
}
mapper.default.validate(mockLLM) // should not throw
console.log(mapper.default.toFoundryData(mockLLM))
// should log a { name, type: 'weapon', system: { ... } } object
```

- [ ] **Step 3: Commit**

```bash
git add scripts/ai-generator/mappers/weapon.js scripts/ai-generator/mappers/registry.js
git commit -m "feat: implement weapon mapper with system prompt, validation, and CoC7 schema mapping"
```

---

## Task 6: Generation Dialog (ApplicationV2)

**Files:**
- Modify: `scripts/ai-generator/generation-dialog.js`

- [ ] **Step 1: Implement the confirmation dialog**

This is an `ApplicationV2` subclass that shows the generated weapon stats for GM review. It accepts three callback functions — `onAccept`, `onRegenerate`, `onCancel` — so the dialog-injector controls what happens next.

```js
// scripts/ai-generator/generation-dialog.js

export default class CoC7AIGenerationDialog extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: 'coc7-ai-generation-dialog',
    tag: 'div',
    window: { title: 'CoC7 AI Generator — Review Weapon' },
    position: { width: 480, height: 'auto' },
    actions: {
      accept: CoC7AIGenerationDialog.#handleAccept,
      regenerate: CoC7AIGenerationDialog.#handleRegenerate,
      cancel: CoC7AIGenerationDialog.#handleCancel
    }
  }

  #itemData
  #acceptCallback
  #regenerateCallback
  #cancelCallback

  constructor ({ itemData, onAccept, onRegenerate, onCancel } = {}, options = {}) {
    super(options)
    this.#itemData = itemData
    this.#acceptCallback = onAccept
    this.#regenerateCallback = onRegenerate
    this.#cancelCallback = onCancel
  }

  async _renderHTML (context, options) {
    const s = this.#itemData.system
    const div = document.createElement('div')
    div.className = 'coc7-ai-generation-dialog'
    div.innerHTML = `
      <div class="form-group">
        <label>Name</label>
        <input type="text" name="ai-item-name" value="${this.#escapeHtml(this.#itemData.name)}">
      </div>
      <dl class="ai-item-stats">
        <div><dt>Damage</dt><dd>${this.#escapeHtml(s.range.normal.damage)}</dd></div>
        <div><dt>Skill</dt><dd>${this.#escapeHtml(s.skill.main.name)}</dd></div>
        <div><dt>Range</dt><dd>${this.#escapeHtml(s.range.normal.value || '—')}</dd></div>
        <div><dt>Uses/Round</dt><dd>${this.#escapeHtml(s.usesPerRound.normal)}</dd></div>
        <div><dt>Bullets</dt><dd>${s.bullets ?? '—'}</dd></div>
        <div><dt>Malfunction</dt><dd>${s.malfunction ?? '—'}</dd></div>
      </dl>
      <div class="ai-item-description">
        <p>${this.#escapeHtml(s.description.value)}</p>
      </div>
      <div class="form-footer">
        <button type="button" data-action="accept" class="bright">Accept</button>
        <button type="button" data-action="regenerate">Regenerate</button>
        <button type="button" data-action="cancel">Cancel</button>
      </div>
    `
    return div
  }

  _replaceHTML (result, content, options) {
    content.replaceChildren(result)
  }

  get itemData () {
    const nameInput = this.element?.querySelector('[name="ai-item-name"]')
    if (nameInput?.value?.trim()) this.#itemData.name = nameInput.value.trim()
    return this.#itemData
  }

  #escapeHtml (str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  static async #handleAccept (event, target) {
    await this.#acceptCallback(this.itemData)
    this.close()
  }

  static async #handleRegenerate (event, target) {
    this.#regenerateCallback()
    this.close()
  }

  static async #handleCancel (event, target) {
    this.#cancelCallback()
    this.close()
  }
}
```

- [ ] **Step 2: Verify the dialog renders in the browser console**

```js
const { default: CoC7AIGenerationDialog } = await import('/modules/coc7-qol/scripts/ai-generator/generation-dialog.js')
const dlg = new CoC7AIGenerationDialog({
  itemData: {
    name: 'Test Revolver',
    type: 'weapon',
    system: {
      description: { value: 'A worn 1920s revolver.' },
      skill: { main: { name: 'Firearms (Handgun)' } },
      range: { normal: { value: '15m', damage: '1d8' } },
      usesPerRound: { normal: '1' },
      bullets: 6,
      malfunction: 96
    }
  },
  onAccept: (data) => console.log('Accept', data),
  onRegenerate: () => console.log('Regenerate'),
  onCancel: () => console.log('Cancel')
})
dlg.render(true)
```

Confirm the dialog appears with correct stats. Click each button and verify the correct message logs to console.

- [ ] **Step 3: Commit**

```bash
git add scripts/ai-generator/generation-dialog.js
git commit -m "feat: implement ApplicationV2 generation confirmation dialog"
```

---

## Task 7: Dialog Injector

**Files:**
- Modify: `scripts/ai-generator/dialog-injector.js`

This is the core integration layer. It detects the "Create Item" dialog, injects the AI button, handles the form transformation, calls the LLM, and wires up the confirmation dialog callbacks.

- [ ] **Step 1: Identify the correct render hook for the Create Item dialog**

Before writing code, verify which hook fires when the "Create Item" dialog opens. In the browser console:

```js
Hooks.on('renderDialog', (...args) => console.log('renderDialog', args))
Hooks.on('renderDialogV2', (...args) => console.log('renderDialogV2', args))
```

Then click the Create Item button in the Items sidebar. Observe which hook fires and note the parameter signature. The dialog element will contain a `[name="name"]` input and a `[name="type"]` select.

**Expected:** `renderDialog` fires with `(dialogInstance, htmlElement, data)`.
**If `renderDialogV2` fires instead:** change `Hooks.on('renderDialog', injectAIButton)` in `index.js` to `Hooks.on('renderDialogV2', injectAIButton)`.

- [ ] **Step 2: Implement the dialog injector**

```js
// scripts/ai-generator/dialog-injector.js
import * as providers from './providers/registry.js'
import * as mappers from './mappers/registry.js'
import CoC7AIGenerationDialog from './generation-dialog.js'

const MODULE = 'coc7-qol'

// Inline sparkle SVG icon — represents AI generation
const SPARKLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
  <path d="M12 2 13.5 8.5 20 10 13.5 11.5 12 18 10.5 11.5 4 10 10.5 8.5Z"/>
  <path d="M19 2 19.8 4.2 22 5 19.8 5.8 19 8 18.2 5.8 16 5 18.2 4.2Z"/>
  <path d="M5 15 5.5 16.5 7 17 5.5 17.5 5 19 4.5 17.5 3 17 4.5 16.5Z"/>
</svg>`

/**
 * Called on every renderDialog hook. Checks whether the dialog is the
 * "Create Item" dialog before doing any DOM work.
 * @param {Dialog} dialog
 * @param {HTMLElement} html
 */
export function injectAIButton (dialog, html) {
  const nameInput = html.querySelector('[name="name"]')
  const typeSelect = html.querySelector('[name="type"]')
  if (!nameInput || !typeSelect) return // not the Create Item dialog

  // Find the button row (Foundry renders it as .dialog-buttons or a footer)
  const buttonRow = html.querySelector('.dialog-buttons') ?? html.querySelector('footer')
  if (!buttonRow) return

  const aiBtn = document.createElement('button')
  aiBtn.type = 'button'
  aiBtn.className = 'coc7-ai-generate-btn'
  aiBtn.title = 'Generate with AI'
  aiBtn.innerHTML = SPARKLE_SVG
  aiBtn.style.cssText = 'flex:0 0 auto; min-width:2rem; padding:0.25rem 0.5rem'
  buttonRow.appendChild(aiBtn)

  aiBtn.addEventListener('click', () => {
    _transformToPromptView(dialog, html, nameInput, aiBtn)
  })
}

/**
 * Replaces Name + Type form fields with a prompt textarea in-place.
 */
function _transformToPromptView (dialog, html, nameInput, aiBtn) {
  const capturedName = nameInput.value.trim()

  // Find the area that contains the form fields
  const formArea = html.querySelector('form') ?? html.querySelector('.dialog-content') ?? nameInput.closest('div')
  const buttonRow = html.querySelector('.dialog-buttons') ?? html.querySelector('footer')

  const originalFormHTML = formArea.innerHTML
  const originalButtonHTML = buttonRow.innerHTML

  // Swap form fields for prompt textarea
  formArea.innerHTML = `
    <div class="form-group" style="display:flex;flex-direction:column;gap:0.25rem">
      <label for="coc7-ai-prompt">Describe your weapon</label>
      <textarea
        id="coc7-ai-prompt"
        name="ai-prompt"
        rows="4"
        placeholder='e.g. "A worn 1920s revolver, .38 calibre, 6-shot cylinder, wood grip"'
        style="width:100%;resize:vertical"
      >${capturedName ? `A weapon called "${capturedName}". ` : ''}</textarea>
    </div>
    <div class="coc7-ai-error" style="display:none;color:var(--color-text-dark-error,red);margin-top:0.25rem;font-size:0.875em"></div>
  `

  aiBtn.style.display = 'none'

  // Swap buttons
  buttonRow.innerHTML = `
    <button type="button" class="coc7-btn-generate" style="flex:1">Generate</button>
    <button type="button" class="coc7-btn-back">Cancel</button>
  `

  // Cancel: restore original form
  buttonRow.querySelector('.coc7-btn-back').addEventListener('click', () => {
    formArea.innerHTML = originalFormHTML
    buttonRow.innerHTML = originalButtonHTML
    aiBtn.style.display = ''
    // Re-attach the AI button click (the restored button is a new element)
    const restoredBtn = buttonRow.querySelector('.coc7-ai-generate-btn')
    if (restoredBtn) {
      const newNameInput = formArea.querySelector('[name="name"]')
      restoredBtn.addEventListener('click', () => {
        _transformToPromptView(dialog, html, newNameInput, restoredBtn)
      })
    }
  })

  buttonRow.querySelector('.coc7-btn-generate').addEventListener('click', () => {
    _runGeneration(dialog, html, formArea, buttonRow, originalFormHTML, originalButtonHTML, aiBtn)
  })
}

/**
 * Calls the LLM provider and opens the confirmation dialog on success.
 */
async function _runGeneration (dialog, html, formArea, buttonRow, originalFormHTML, originalButtonHTML, aiBtn) {
  const textarea = formArea.querySelector('[name="ai-prompt"]')
  const userPrompt = textarea?.value?.trim()
  if (!userPrompt) return

  const errorDiv = formArea.querySelector('.coc7-ai-error')
  const generateBtn = buttonRow.querySelector('.coc7-btn-generate')

  // Guard: require API key before calling out
  const apiKey = game.settings.get(MODULE, 'ai-api-key')
  if (!apiKey) {
    errorDiv.textContent = 'No API key configured — set it in Module Settings → CoC7 QoL Improvements.'
    errorDiv.style.display = 'block'
    return
  }

  // Loading state
  generateBtn.disabled = true
  generateBtn.textContent = 'Generating…'
  errorDiv.style.display = 'none'

  try {
    const providerId = game.settings.get(MODULE, 'ai-provider')
    const ProviderClass = providers.get(providerId)
    if (!ProviderClass) throw new Error(`Unknown provider: ${providerId}`)

    const mapper = mappers.get('weapon')
    const systemPrompt = mapper.buildSystemPrompt()

    const provider = new ProviderClass()
    const llmData = await provider.generate(systemPrompt, userPrompt)

    mapper.validate(llmData)
    const foundryData = mapper.toFoundryData(llmData)

    // Open confirmation dialog
    new CoC7AIGenerationDialog({
      itemData: foundryData,

      onAccept: async (itemData) => {
        try {
          const item = await Item.create(itemData)
          item?.sheet?.render(true)
          dialog.close()
        } catch (err) {
          ui.notifications.error(`CoC7 AI Generator: Failed to create item — ${err.message}`)
        }
      },

      onRegenerate: () => {
        // Return focus to the prompt textarea; restore generate button
        generateBtn.disabled = false
        generateBtn.textContent = 'Generate'
        textarea.focus()
      },

      onCancel: () => {
        // Restore original Name + Type form
        formArea.innerHTML = originalFormHTML
        buttonRow.innerHTML = originalButtonHTML
        aiBtn.style.display = ''
        const restoredBtn = buttonRow.querySelector('.coc7-ai-generate-btn')
        if (restoredBtn) {
          const newNameInput = formArea.querySelector('[name="name"]')
          restoredBtn.addEventListener('click', () => {
            _transformToPromptView(dialog, html, newNameInput, restoredBtn)
          })
        }
      }
    }).render(true)

  } catch (err) {
    errorDiv.textContent = err.message
    errorDiv.style.display = 'block'
    generateBtn.disabled = false
    generateBtn.textContent = 'Retry'
  }
}
```

- [ ] **Step 3: Reload Foundry and test button injection**

1. Press F5
2. Open the Items tab in the sidebar
3. Click the "Create Item" button
4. Confirm the sparkle icon button appears next to the "Create Item" button in the dialog footer
5. Check the browser console for any errors

- [ ] **Step 4: Test the in-place transformation**

1. Type a name in the Name field (e.g. "Old Revolver")
2. Click the sparkle button
3. Confirm the Name + Type fields are replaced by a textarea pre-filled with `A weapon called "Old Revolver". `
4. Confirm the footer now shows "Generate" and "Cancel" buttons
5. Click Cancel — confirm the original Name + Type form is restored

- [ ] **Step 5: Test the full generation flow (requires a valid API key in settings)**

1. Open the Create Item dialog
2. Click the sparkle button
3. Enter: `A worn 1920s revolver, .38 calibre, 6-shot cylinder, reliable but aging`
4. Click Generate
5. Confirm a loading spinner/disabled state appears on the button
6. Confirm the confirmation dialog opens with weapon stats (name, damage, skill, range, etc.)
7. Verify the Name field in the confirmation dialog is editable
8. Click Accept — confirm a weapon item is created in the Items directory and its sheet opens
9. Click the sparkle button again and test Regenerate — confirm it returns to the prompt textarea
10. Test Cancel from the confirmation dialog — confirm the original Create Item form is restored

- [ ] **Step 6: Test error handling**

1. Set the API key to an invalid value in module settings
2. Try to generate — confirm an inline error message appears with a Retry button
3. Clear the API key entirely — confirm the "No API key configured" error appears before calling the API

- [ ] **Step 7: Commit**

```bash
git add scripts/ai-generator/dialog-injector.js
git commit -m "feat: implement dialog injector with AI button, form transformation, and generation flow"
```

---

## Self-Review Notes

**Spec coverage check:**
- [x] Section 2 (scope) — weapon only, 3 providers, in-place dialog transform, confirmation dialog, 4 settings
- [x] Section 3 (file structure) — all files created, only index.js in esmodules
- [x] Section 4 (provider layer) — registry, Anthropic/OpenAI/Gemini with correct defaults and structured output
- [x] Section 5 (settings) — 4 settings, onChange auto-updates endpoint + model
- [x] Section 6 (mapper) — system prompt, validate (name/damage/skill required), toFoundryData with full CoC7 schema
- [x] Section 7 (dialog flow) — injection, transform, generate, confirmation, accept/regenerate/cancel
- [x] Section 8 (error handling) — no API key, network error, unparseable JSON, missing fields, Item.create() failure

**Type consistency check:**
- `providers.get(providerId)` returns a class (not instance) — instantiated with `new ProviderClass()` in dialog-injector ✓
- `mappers.get('weapon')` returns a plain object with methods (`buildSystemPrompt`, `validate`, `toFoundryData`) — not a class ✓
- `mapper.toFoundryData(llmData)` returns `{ name, type, system }` — passed directly to `Item.create()` ✓
- `CoC7AIGenerationDialog` constructor receives `{ itemData, onAccept, onRegenerate, onCancel }` — matches dialog-injector call sites ✓
- `CoC7AIGenerationDialog.itemData` getter returns the (possibly name-edited) item data — called in `#handleAccept` ✓

**Placeholder scan:** No TBDs, no "add appropriate error handling", no "similar to Task N" shortcuts. All code blocks are complete.
