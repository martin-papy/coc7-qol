import { t } from './utils.js'
import { VISIBILITY_CHOICES, choiceForCoreMode, coreModeKey, visibilityUpdate } from './roll-mode-keys.js'
import { createPendingRollMode } from './pending-roll-mode.js'
import { DECISION_TTL_MS, createDevelopmentGuard, findRefreshEntry, resyncFor } from './roll-mode-resync.js'
import { LOG_PREFIX, MODULE_ID } from './constants.js'

const LAST_MODE_SETTING = 'last-roll-mode'
const DEFAULT_CHOICE = 'publicroll'

// The value picked in the CoC7 roll dialog, armed on OK and consumed by the
// next CoC7 card created on this client. Cancelled dialogs never arm it; see
// pending-roll-mode.js for the guards against stale choices.
const pendingRollMode = createPendingRollMode()

// A check whose blindness the dropdown changed is brought in line once its card
// exists (see roll-mode-resync.js): `awaitingResync` describes the card this
// client is about to create, `developmentGuard` refuses the tick of a roll
// turned blind.
const developmentGuard = createDevelopmentGuard()
/** @type {{mode: string, since: number}|null} */
let awaitingResync = null

let unsupportedModeReported = false
let refreshMissingReported = false

Hooks.once('init', () => {
  game.settings.register(MODULE_ID, LAST_MODE_SETTING, {
    scope: 'client',
    config: false,
    type: String,
    default: ''
  })
})

function readLastRollMode () {
  try {
    const stored = game.settings.get(MODULE_ID, LAST_MODE_SETTING)
    if (VISIBILITY_CHOICES.includes(stored)) return stored
  } catch (_) { /* setting not yet registered — fall through */ }
  return null
}

function writeLastRollMode (mode) {
  if (!VISIBILITY_CHOICES.includes(mode)) return
  game.settings.set(MODULE_ID, LAST_MODE_SETTING, mode).catch(err => {
    console.warn(LOG_PREFIX, 'Failed to persist last roll mode:', err)
  })
}

/**
 * The roll-mode registry of the running Foundry version: CONFIG.ChatMessage.modes
 * on v14, CONFIG.Dice.rollModes on v13 (v14 keeps the latter only as a deprecated
 * proxy, so it is never touched there). CoC7 builds its own mode constants from
 * the same expression (coc7/constants.js).
 * @returns {object|undefined}
 */
function registeredModes () {
  return CONFIG.ChatMessage?.modes ?? CONFIG.Dice?.rollModes
}

/**
 * The user's chat-box default as one of the dropdown choices, or null when it
 * is a mode the dropdown does not offer (self, in-character). The setting is
 * 'core.messageMode' on v14 and 'core.rollMode' on v13 — v14 keeps 'rollMode'
 * only as a deprecated shim that logs a compatibility warning. Also null when
 * the setting cannot be read (game.settings.get throws on an unregistered key).
 * @returns {string|null}
 */
function coreDefaultChoice () {
  const key = CONFIG.ChatMessage?.modes ? 'messageMode' : 'rollMode'
  try {
    return choiceForCoreMode(game.settings.get('core', key))
  } catch (_) { /* core setting unreadable — caller falls back to DEFAULT_CHOICE */ }
  return null
}

/**
 * Apply a visibility mode to message data: ChatMessage.applyMode on v14,
 * ChatMessage.applyRollMode on v13 (deprecated on v14).
 * @param {object} messageData  Mutated in place by core
 * @param {string} mode  A key of the running version's registry
 */
function applyVisibility (messageData, mode) {
  if (typeof ChatMessage.applyMode === 'function') ChatMessage.applyMode(messageData, mode)
  else ChatMessage.applyRollMode(messageData, mode)
}

Hooks.on('renderDialogV2', (dialog, element) => {
  if (!dialog.options?.classes?.includes('bonus-selection')) return

  // Secondary signal — bonus dice range input is the stable backbone of the form
  const poolModifier = element.querySelector('[name="poolModifier"]')
  if (!poolModifier) return

  // Guard against re-renders
  if (element.querySelector('[name="coc7qol-rollMode"]')) return

  const currentMode = readLastRollMode() ?? coreDefaultChoice() ?? DEFAULT_CHOICE

  // Same row markup as CoC7 9.x's own rows (templates/apps/bonus.hbs): the system
  // stylesheet gives a bare <label> `flex: 0 0 auto` inside its dialogs, so the
  // label needs .flex-single to line up with the other rows. Both classes are
  // inert on CoC7 8.x, where the select simply fills its wrapper.
  const group = document.createElement('div')
  group.className = 'form-group'
  group.innerHTML = `
    <label class="flex-single">${t('COC7QOL.RollVisibility.Label')}</label>
    <div class="form-value">
      <select name="coc7qol-rollMode">
        <option value="publicroll" ${currentMode === 'publicroll' ? 'selected' : ''}>${t('COC7QOL.RollVisibility.Public')}</option>
        <option value="gmroll" ${currentMode === 'gmroll' ? 'selected' : ''}>${t('COC7QOL.RollVisibility.Private')}</option>
        <option value="blindroll" ${currentMode === 'blindroll' ? 'selected' : ''}>${t('COC7QOL.RollVisibility.Blind')}</option>
      </select>
    </div>
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
    if (!select) return
    pendingRollMode.arm({
      choice: select.value,
      cardType: element.querySelector('[name="cardType"]')?.value
    })
    writeLastRollMode(select.value)
  }, true)
})

Hooks.on('preCreateChatMessage', (document, data) => {
  // Only the first CoC7 card generated after the dialog is retargeted (e.g. the
  // skill check card). Later messages (damage, follow-ups) keep their default
  // roll mode, and non-CoC7 messages are never touched.
  const choice = pendingRollMode.consume(data)
  if (!choice) return

  // The dropdown speaks the module's own keys; Foundry and CoC7 speak the keys
  // of the running version ('blindroll' on v13, 'blind' on v14) — the
  // translation, and the payload, are built in roll-mode-keys.js.
  //
  // storedMode: when a CoC7 standby card is created (GM rolls on a player-owned
  // actor), the check is serialized into flags.CoC7.load and later re-hydrated
  // when the player/GM clicks "Roll" — and again on every later update of the
  // card. Without rewriting the stored rollMode, the re-hydrated check rolls
  // under whatever core mode is currently active — making blind/private results
  // leak as public. Rewriting the flag keeps the chosen visibility on every
  // subsequent message produced by this check.
  const update = visibilityUpdate({
    choice,
    modes: registeredModes(),
    storedMode: data.flags?.CoC7?.load?.rollMode,
    resolveRecipients: mode => {
      const messageData = foundry.utils.deepClone(data)
      // Core preserves any pre-existing whisper recipients for private/blind
      // rolls (ChatMessage.applyRollMode on v13, ChatMessage.applyMode on v14).
      // When the chat-box mode is 'self', CoC7 has already populated whisper
      // with [self.id], so core keeps it instead of switching to GMs — the GM
      // never sees the blind/private roll. Reset whisper first so the chosen
      // mode determines recipients unambiguously.
      messageData.whisper = []
      applyVisibility(messageData, mode)
      return messageData
    }
  })

  if (!update) {
    if (!unsupportedModeReported) {
      unsupportedModeReported = true
      console.warn(LOG_PREFIX, `Roll visibility "${choice}" is not a registered message mode on this Foundry version — the roll was left as is.`)
    }
    return
  }

  document.updateSource(update)

  // A new roll supersedes whatever the previous one left pending.
  developmentGuard.clear()
  const resync = resyncFor({
    load: data.flags?.CoC7?.load,
    mode: update['flags.CoC7.load.rollMode'],
    blindMode: coreModeKey('blindroll', registeredModes())
  })
  awaitingResync = resync ? { mode: update['flags.CoC7.load.rollMode'], since: Date.now() } : null
  if (resync?.skillUuid) developmentGuard.arm(resync.skillUuid)
})

/**
 * Rebuild a CoC7 card from its flags with the system's own "Refresh" action.
 * CoC7 exposes it only as a chat message context option, so the option is
 * collected the way the chat log does and its callback is called.
 * @param {ChatMessage} message
 */
async function refreshCard (message) {
  const entries = []
  Hooks.callAll('getChatMessageContextOptions', ui.chat, entries)
  const refresh = findRefreshEntry(entries)
  if (!refresh) {
    if (!refreshMissingReported) {
      refreshMissingReported = true
      console.warn(LOG_PREFIX, 'CoC7\'s "Refresh" chat option was not found — a roll whose visibility was changed in the dialog keeps the card it was created with.')
    }
    return
  }
  try {
    await refresh.callback({ dataset: { messageId: message.id } })
  } catch (err) {
    console.warn(LOG_PREFIX, 'Could not refresh the card of a roll whose visibility was changed in the dialog:', err)
  }
}

Hooks.on('createChatMessage', (message, options, userId) => {
  if (!awaitingResync || userId !== game.user.id) return
  const load = message.flags?.CoC7?.load
  if (load?.as !== 'CoC7Check') return
  // The card must be the one announced in preCreateChatMessage. If that one was
  // never created (cancelled by another module, refused by the server), a later
  // check must not be taken for it.
  const { mode, since } = awaitingResync
  awaitingResync = null
  if (load.rollMode !== mode || Date.now() - since > DECISION_TTL_MS) return
  developmentGuard.attach(message.id)
  refreshCard(message)
})

// Returning false cancels the update. CoC7 does not await a result from either
// write, so a refused one is simply not made.
Hooks.on('preUpdateItem', (item, changes) => {
  if (developmentGuard.refusesItemUpdate(item.uuid, changes)) return false
})

Hooks.on('preUpdateChatMessage', (message, changes) => {
  if (developmentGuard.refusesMessageUpdate(message.id, changes)) return false
})
