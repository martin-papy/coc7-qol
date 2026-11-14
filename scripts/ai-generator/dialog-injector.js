import * as providers from './providers/registry.js'
import * as mappers from './mappers/registry.js'
import CoC7AIGenerationDialog from './generation-dialog.js'
import CoC7NPCConfirmationDialog from './npc-confirmation-dialog.js'
import { applyRandomCharacteristics } from './mappers/npc.js'
import { stashChildren } from './dialog-flow.js'
import { t, tf } from '../utils.js'
import { LOG_PREFIX, MODULE_ID } from '../constants.js'

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

// Types that currently have AI generation support
const SUPPORTED_ITEM_TYPES = ['weapon']
const SUPPORTED_ACTOR_TYPES = ['npc']

// Type-specific configuration for the shared prompt-view and generation flow
const WEAPON_PROMPT_CONFIG = {
  get label () { return t('COC7QOL.AIGenerator.Weapon.Label') },
  textareaName: 'ai-prompt',
  textareaId: 'coc7qol-ai-prompt',
  get placeholder () { return t('COC7QOL.AIGenerator.Weapon.Placeholder') },
  get prefillPrefix () { return t('COC7QOL.AIGenerator.Weapon.PrefillPrefix') },
  get emptyError () { return t('COC7QOL.AIGenerator.Error.EmptyWeaponDescription') },
  mapperKey: 'weapon',
  ConfirmationDialog: CoC7AIGenerationDialog,
  buildDialogData: (foundryData, _ctx) => ({ itemData: foundryData }),
  /** @returns {Promise<boolean>} whether the item was created */
  onAccept: async (data, { dialog }) => {
    try {
      const item = await Item.create(data)
      if (!item) {
        ui.notifications.error('COC7QOL.AIGenerator.Error.WeaponCreationCancelled', { localize: true })
        return false
      }
      item.sheet?.render(true)
      dialog.close()
      return true
    } catch (err) {
      console.error(LOG_PREFIX, 'Weapon item creation failed:', err)
      ui.notifications.error('COC7QOL.AIGenerator.Error.WeaponCreationFailed', { format: { error: err.message } })
      return false
    }
  },
  logPrefix: 'Weapon'
}

const NPC_PROMPT_CONFIG = {
  get label () { return t('COC7QOL.AIGenerator.NPC.Label') },
  textareaName: 'ai-npc-prompt',
  textareaId: 'coc7qol-ai-npc-prompt',
  get placeholder () { return t('COC7QOL.AIGenerator.NPC.Placeholder') },
  get prefillPrefix () { return t('COC7QOL.AIGenerator.NPC.PrefillPrefix') },
  get emptyError () { return t('COC7QOL.AIGenerator.Error.EmptyNPCDescription') },
  mapperKey: 'npc',
  ConfirmationDialog: CoC7NPCConfirmationDialog,
  get extraHTML () {
    return `<label class="coc7qol-ai-random-chars-label">
      <input type="checkbox" name="ai-random-characteristics">
      ${t('COC7QOL.AIGenerator.NPC.RandomCharsLabel')} <span class="coc7qol-ai-hint">${t('COC7QOL.AIGenerator.NPC.RandomCharsHint')}</span>
    </label>`
  },
  buildDialogData: (npcData, { form }) => {
    const useRandom = form.querySelector('[name="ai-random-characteristics"]')?.checked
    if (useRandom) npcData = applyRandomCharacteristics(npcData)
    return { npcData }
  },
  /**
   * @returns {Promise<boolean>} whether the actor was created. A failure to attach its items
   * still counts as created: the actor exists, and accepting again would duplicate it.
   */
  onAccept: async (data, { mapper, dialog }) => {
    try {
      const resolvedSkills = await mapper.resolveSkills(data.skillsRaw, data.llmData?.characteristics)
      const actor = await Actor.create(data.actorData)
      if (!actor) {
        ui.notifications.error('COC7QOL.AIGenerator.Error.NPCCreationCancelled', { localize: true })
        return false
      }
      const items = [
        ...resolvedSkills,
        ...(data.weaponsData ?? []),
        ...(data.possessionsData ?? [])
      ]
      if (items.length > 0) {
        try {
          await actor.createEmbeddedDocuments('Item', items)
        } catch (itemErr) {
          console.warn(LOG_PREFIX, 'Item attachment failed:', itemErr)
          ui.notifications.warn('COC7QOL.AIGenerator.Error.NPCItemsFailed', { format: { error: itemErr.message } })
        }
      }
      actor.sheet?.render(true)
      dialog.close()
      return true
    } catch (err) {
      console.error(LOG_PREFIX, 'NPC actor creation failed:', err)
      ui.notifications.error('COC7QOL.AIGenerator.Error.NPCCreationFailed', { format: { error: err.message } })
      return false
    }
  },
  logPrefix: 'NPC'
}

/**
 * Called on every renderDialogV2 hook. Checks whether the dialog is the
 * "Create Item" dialog before doing any DOM work.
 */
export function injectAIButton (dialog, html) {
  _injectButton(dialog, html, {
    knownTypes: COC7_ITEM_TYPES,
    supportedTypes: SUPPORTED_ITEM_TYPES,
    buttonTitle: t('COC7QOL.AIGenerator.Button.GenerateWeapon'),
    config: WEAPON_PROMPT_CONFIG
  })
}

/**
 * Called on every renderDialogV2 hook. Checks whether the dialog is the
 * "Create Actor" dialog before doing any DOM work.
 */
export function injectNPCButton (dialog, html) {
  _injectButton(dialog, html, {
    knownTypes: COC7_ACTOR_TYPES,
    supportedTypes: SUPPORTED_ACTOR_TYPES,
    buttonTitle: t('COC7QOL.AIGenerator.Button.GenerateNPC'),
    config: NPC_PROMPT_CONFIG
  })
}

function _injectButton (dialog, html, { knownTypes, supportedTypes, buttonTitle, config }) {
  if (!game.user.isGM) return  // only GMs may trigger LLM generation

  const nameInput = html.querySelector('[name="name"]')
  const typeSelect = html.querySelector('[name="type"]')
  if (!nameInput || !typeSelect) return

  const typeValues = [...typeSelect.options].map(o => o.value)
  if (!typeValues.some(v => knownTypes.includes(v))) return

  const form = html.querySelector('form') ?? html.querySelector('.dialog-content')
  const buttonRow = _findButtonRow(form, html)
  if (!buttonRow) return

  const aiBtn = document.createElement('button')
  aiBtn.type = 'button'
  aiBtn.className = 'coc7qol-ai-generate-btn'
  aiBtn.title = buttonTitle
  aiBtn.innerHTML = SPARKLE_SVG
  buttonRow.appendChild(aiBtn)

  aiBtn.style.display = supportedTypes.includes(typeSelect.value) ? '' : 'none'
  typeSelect.addEventListener('change', () => {
    aiBtn.style.display = supportedTypes.includes(typeSelect.value) ? '' : 'none'
  })

  aiBtn.addEventListener('click', () => {
    _transformToPromptView(dialog, html, nameInput, config)
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
 * Replaces Name + Type form fields with a prompt textarea.
 * Works for both weapon and NPC flows via the config object.
 * The original fields and buttons are detached, not cloned, so Cancel puts back the same
 * nodes: selections, typed values and every listener (Foundry's and this module's) survive.
 */
function _transformToPromptView (dialog, html, nameInput, config) {
  const capturedName = nameInput.value.trim()

  const form = html.querySelector('form') ?? html.querySelector('.dialog-content') ?? nameInput.closest('div')
  const buttonRow = _findButtonRow(form, html)
  if (!form || !buttonRow) return

  const restoreFields = stashChildren(form, buttonRow)
  const restoreButtons = stashChildren(buttonRow)
  const restore = () => {
    restoreButtons()
    restoreFields()
  }

  const promptArea = document.createElement('div')
  promptArea.className = 'coc7qol-ai-prompt-area'
  // Safe static HTML — config values are module-level constants, not user input
  promptArea.innerHTML = `
    <label for="${config.textareaId}">${config.label}</label>
    <textarea
      id="${config.textareaId}"
      name="${config.textareaName}"
      rows="4"
      placeholder="${config.placeholder}"
    ></textarea>
    ${config.extraHTML ?? ''}
    <div class="coc7qol-ai-error"></div>
  `
  form.insertBefore(promptArea, buttonRow)

  const promptTextarea = form.querySelector(`[name="${config.textareaName}"]`)
  if (capturedName) promptTextarea.value = `${config.prefillPrefix} "${capturedName}". `

  buttonRow.innerHTML = `
    <button type="button" class="coc7qol-btn-generate">${t('COC7QOL.AIGenerator.Button.Generate')}</button>
    <button type="button" class="coc7qol-btn-back">${t('COC7QOL.AIGenerator.Button.Cancel')}</button>
  `

  buttonRow.querySelector('.coc7qol-btn-back').addEventListener('click', restore)
  buttonRow.querySelector('.coc7qol-btn-generate').addEventListener('click', () => {
    _run(dialog, form, buttonRow, config, restore)
  })
}

/**
 * Calls the configured LLM provider and opens the type-specific confirmation dialog.
 * @param {() => void} restore  Puts the Create dialog back to its Name + Type state.
 */
async function _run (dialog, form, buttonRow, config, restore) {
  const textarea = form.querySelector(`[name="${config.textareaName}"]`)
  const userPrompt = textarea?.value?.trim()
  const errorDiv = form.querySelector('.coc7qol-ai-error')
  const generateBtn = buttonRow.querySelector('.coc7qol-btn-generate')

  if (!userPrompt) {
    errorDiv.textContent = config.emptyError
    errorDiv.style.display = 'block'
    return
  }

  const apiKey = game.settings.get(MODULE_ID, 'ai-api-key')
  if (!apiKey) {
    errorDiv.textContent = t('COC7QOL.AIGenerator.Error.NoAPIKey')
    errorDiv.style.display = 'block'
    return
  }

  generateBtn.disabled = true
  generateBtn.textContent = t('COC7QOL.AIGenerator.Button.Generating')
  errorDiv.style.display = 'none'

  try {
    const providerId = game.settings.get(MODULE_ID, 'ai-provider')
    const ProviderClass = providers.get(providerId)
    if (!ProviderClass) throw new Error(tf('COC7QOL.AIGenerator.Error.UnknownProvider', { provider: providerId }))

    const mapper = mappers.get(config.mapperKey)
    const systemPrompt = await mapper.buildSystemPrompt()

    const provider = new ProviderClass()
    const llmData = await provider.generate(systemPrompt, userPrompt)

    mapper.validate(llmData)
    const foundryData = mapper.toFoundryData(llmData)

    const dialogData = config.buildDialogData(foundryData, { form })

    // Awaited so a render failure reaches the catch below and re-enables Generate.
    await new config.ConfirmationDialog({
      ...dialogData,

      // Resolves true only when the document was created; the review dialog stays open otherwise.
      onAccept: (data) => config.onAccept(data, { mapper, dialog }),

      onRegenerate: () => {
        generateBtn.disabled = false
        generateBtn.textContent = t('COC7QOL.AIGenerator.Button.Generate')
        textarea.focus()
      },

      // Also called when the review dialog is closed from its header or with Escape.
      onCancel: restore
    }).render({ force: true })

  } catch (err) {
    console.error(LOG_PREFIX, `${config.logPrefix} generation failed:`, err)
    errorDiv.textContent = err.message
    errorDiv.style.display = 'block'
    generateBtn.disabled = false
    generateBtn.textContent = t('COC7QOL.AIGenerator.Button.Retry')
  }
}
