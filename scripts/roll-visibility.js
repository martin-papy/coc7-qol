// scripts/roll-visibility.js

import { t } from './utils.js'

const ROLL_MODES = ['publicroll', 'gmroll', 'blindroll']

// Module-level state: the last value picked in the CoC7 roll dialog,
// consumed by the next preCreateChatMessage. Cancelled dialogs leave it null.
let pendingRollMode = null

Hooks.on('renderDialogV2', (dialog, element) => {
  if (!dialog.options?.classes?.includes('bonus-selection')) return

  // Secondary signal — bonus dice range input is the stable backbone of the form
  const poolModifier = element.querySelector('[name="poolModifier"]')
  if (!poolModifier) return

  // Guard against re-renders
  if (element.querySelector('[name="coc7qol-rollMode"]')) return

  const coreMode = game.settings.get('core', 'rollMode')
  const currentMode = ROLL_MODES.includes(coreMode) ? coreMode : 'publicroll'

  const group = document.createElement('div')
  group.className = 'form-group'
  group.innerHTML = `
    <label>${t('COC7QOL.RollVisibility.Label')}</label>
    <select name="coc7qol-rollMode">
      <option value="publicroll" ${currentMode === 'publicroll' ? 'selected' : ''}>${t('COC7QOL.RollVisibility.Public')}</option>
      <option value="gmroll" ${currentMode === 'gmroll' ? 'selected' : ''}>${t('COC7QOL.RollVisibility.Private')}</option>
      <option value="blindroll" ${currentMode === 'blindroll' ? 'selected' : ''}>${t('COC7QOL.RollVisibility.Blind')}</option>
    </select>
  `

  const bonusSelector = poolModifier.closest('.bonus-penalty-selector')
  if (bonusSelector?.parentNode) {
    bonusSelector.parentNode.insertBefore(group, bonusSelector)
  } else {
    const form = element.querySelector('form') ?? element.querySelector('.flexcol') ?? element
    form.appendChild(group)
  }

  // Capture-phase so we record the choice before DialogV2's own submit handler
  // closes the dialog and tears down the form.
  const okButton = element.querySelector('[data-action="ok"]')
  okButton?.addEventListener('click', () => {
    const select = element.querySelector('[name="coc7qol-rollMode"]')
    if (select && ROLL_MODES.includes(select.value)) {
      pendingRollMode = select.value
    }
  }, true)
})

Hooks.on('preCreateChatMessage', (document, data) => {
  if (!pendingRollMode) return

  // Consume immediately — only the first message generated after the dialog
  // should be retargeted (e.g. the skill check card). Subsequent messages
  // (damage, follow-ups) fall back to their default roll mode.
  const mode = pendingRollMode
  pendingRollMode = null

  const messageData = foundry.utils.deepClone(data)
  ChatMessage.applyRollMode(messageData, mode)

  document.updateSource({
    whisper: messageData.whisper ?? [],
    blind: messageData.blind ?? false,
    rollMode: messageData.rollMode ?? mode
  })
})
