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
