// scripts/ai-generator/dialog-injector.js
import * as providers from './providers/registry.js'
import * as mappers from './mappers/registry.js'
import CoC7AIGenerationDialog from './generation-dialog.js'
import CoC7NPCConfirmationDialog from './npc-confirmation-dialog.js'

const MODULE = 'coc7-qol'

// Inline sparkle SVG icon — represents AI generation
const SPARKLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
  <path d="M12 2 13.5 8.5 20 10 13.5 11.5 12 18 10.5 11.5 4 10 10.5 8.5Z"/>
  <path d="M19 2 19.8 4.2 22 5 19.8 5.8 19 8 18.2 5.8 16 5 18.2 4.2Z"/>
  <path d="M5 15 5.5 16.5 7 17 5.5 17.5 5 19 4.5 17.5 3 17 4.5 16.5Z"/>
</svg>`

// CoC7 item types — used to distinguish the Create Item dialog from Create Actor
const COC7_ITEM_TYPES = ['weapon', 'skill', 'book', 'spell', 'chase', 'archetype', 'armor',
  'experiencePackage', 'item', 'occupation', 'setup', 'status', 'talent']

// CoC7 actor types — used to detect the Create Actor dialog
const COC7_ACTOR_TYPES = ['character', 'npc', 'creature', 'vehicle', 'container']

/**
 * Called on every renderDialogV2 hook. Checks whether the dialog is the
 * "Create Item" dialog before doing any DOM work.
 * @param {Dialog} dialog
 * @param {HTMLElement} html
 */
export function injectAIButton (dialog, html) {
  if (!game.user.isGM) return  // only GMs may trigger LLM generation

  const nameInput = html.querySelector('[name="name"]')
  const typeSelect = html.querySelector('[name="type"]')
  if (!nameInput || !typeSelect) return // not the Create Item dialog

  // Only inject on the Create Item dialog — not Create Actor
  const typeValues = [...typeSelect.options].map(o => o.value)
  if (!typeValues.some(v => COC7_ITEM_TYPES.includes(v))) return

  // Find the button row — may live inside the form or directly in the window-content
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

  aiBtn.addEventListener('click', () => {
    _transformToPromptView(dialog, html, nameInput, aiBtn)
  })
}

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

/**
 * Finds the button row element. Searches inside the form first (DialogV2
 * renders the footer inside the form), then falls back to the outer html.
 */
function _findButtonRow (form, html) {
  return (form?.querySelector('.dialog-buttons') ?? form?.querySelector('footer'))
    ?? (html.querySelector('.dialog-buttons') ?? html.querySelector('footer'))
}

/**
 * Replaces Name + Type form fields with a prompt textarea in-place.
 * Keeps the button row attached to the DOM by only removing the field nodes —
 * replacing the entire form.innerHTML would detach the footer and make any
 * subsequent buttonRow.innerHTML assignment invisible.
 */
function _transformToPromptView (dialog, html, nameInput, aiBtn) {
  const capturedName = nameInput.value.trim()

  const form = html.querySelector('form') ?? html.querySelector('.dialog-content') ?? nameInput.closest('div')
  const buttonRow = _findButtonRow(form, html)
  if (!form || !buttonRow) return

  // Snapshot the original button row HTML and form field nodes for restoration
  const originalButtonHTML = buttonRow.innerHTML
  const originalFieldNodes = [...form.children]
    .filter(child => child !== buttonRow)
    .map(child => child.cloneNode(true))

  // Remove only the form field nodes — leave buttonRow in the DOM so it stays attached
  for (const child of [...form.children]) {
    if (child !== buttonRow) child.remove()
  }

  // Build the prompt area and insert it before the still-attached button row
  const promptArea = document.createElement('div')
  promptArea.style.cssText = 'display:flex;flex-direction:column;gap:0.25rem;padding:0.5rem 0'
  // Safe static HTML — no user content interpolated here
  promptArea.innerHTML = `
    <label for="coc7-ai-prompt" style="font-weight:bold">Describe your weapon</label>
    <textarea
      id="coc7-ai-prompt"
      name="ai-prompt"
      rows="4"
      placeholder='e.g. "A worn 1920s revolver, .38 calibre, 6-shot cylinder, wood grip"'
      style="width:100%;resize:vertical;box-sizing:border-box"
    ></textarea>
    <div class="coc7-ai-error" style="display:none;color:var(--color-text-dark-error,red);margin-top:0.25rem;font-size:0.875em"></div>
  `
  form.insertBefore(promptArea, buttonRow)

  // Set textarea value safely via DOM property (not innerHTML) to avoid XSS
  const promptTextarea = form.querySelector('[name="ai-prompt"]')
  if (capturedName) promptTextarea.value = `A weapon called "${capturedName}". `

  aiBtn.style.display = 'none'

  // Inject Generate / Cancel into the still-attached button row
  buttonRow.innerHTML = `
    <button type="button" class="coc7-btn-generate" style="flex:1">Generate</button>
    <button type="button" class="coc7-btn-back">Cancel</button>
  `

  // Cancel: restore original form fields and buttons
  buttonRow.querySelector('.coc7-btn-back').addEventListener('click', () => {
    _restoreOriginalForm(form, buttonRow, promptArea, originalFieldNodes, originalButtonHTML, aiBtn, dialog, html)
  })

  buttonRow.querySelector('.coc7-btn-generate').addEventListener('click', () => {
    _runGeneration(dialog, html, form, buttonRow, promptArea, originalFieldNodes, originalButtonHTML, aiBtn)
  })
}

/**
 * Restores the form to its original Name + Type state.
 */
function _restoreOriginalForm (form, buttonRow, promptArea, originalFieldNodes, originalButtonHTML, aiBtn, dialog, html) {
  promptArea.remove()
  for (const node of originalFieldNodes) {
    form.insertBefore(node, buttonRow)
  }
  buttonRow.innerHTML = originalButtonHTML
  aiBtn.style.display = ''

  // Re-attach the sparkle click listener (the restored button is a fresh DOM node)
  const restoredBtn = buttonRow.querySelector('.coc7-ai-generate-btn')
  if (restoredBtn) {
    const newNameInput = form.querySelector('[name="name"]')
    restoredBtn.addEventListener('click', () => {
      _transformToPromptView(dialog, html, newNameInput, restoredBtn)
    })
  }
}

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
          if (!actor) {
            ui.notifications.error('CoC7 AI Generator: Actor creation was cancelled.')
            return
          }

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

/**
 * Calls the LLM provider and opens the confirmation dialog on success.
 */
async function _runGeneration (dialog, html, form, buttonRow, promptArea, originalFieldNodes, originalButtonHTML, aiBtn) {
  const textarea = form.querySelector('[name="ai-prompt"]')
  const userPrompt = textarea?.value?.trim()
  const errorDiv = form.querySelector('.coc7-ai-error')
  const generateBtn = buttonRow.querySelector('.coc7-btn-generate')

  if (!userPrompt) {
    errorDiv.textContent = 'Please describe the weapon before generating.'
    errorDiv.style.display = 'block'
    return
  }

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
        _restoreOriginalForm(form, buttonRow, promptArea, originalFieldNodes, originalButtonHTML, aiBtn, dialog, html)
      }
    }).render({ force: true })

  } catch (err) {
    errorDiv.textContent = err.message
    errorDiv.style.display = 'block'
    generateBtn.disabled = false
    generateBtn.textContent = 'Retry'
  }
}
