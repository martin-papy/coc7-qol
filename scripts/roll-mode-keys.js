/**
 * Roll-visibility vocabulary for the roll-visibility feature. Pure — no Foundry
 * globals — so it can be unit-tested (test/roll-mode-keys.test.js). The Foundry
 * wiring lives in roll-visibility.js.
 *
 * Foundry v14 renamed the roll modes: v13 registers 'publicroll' / 'gmroll' /
 * 'blindroll' in CONFIG.Dice.rollModes, v14 registers 'public' / 'gm' / 'blind'
 * in CONFIG.ChatMessage.modes. CoC7 derives its own CHAT_MESSAGE_MODE constants
 * from whichever registry exists (coc7/constants.js) and, from CoC7 9.0 on,
 * compares and re-applies a check's stored mode strictly in that vocabulary —
 * a v13 key written into a v14 world is no longer recognised and falls back to
 * the user's default mode. Anything handed to Foundry or CoC7 must therefore be
 * translated to the running version's key first.
 */

/**
 * The visibility choices the roll dialog offers. These are the module's own
 * stable keys: they are what the 'last-roll-mode' client setting persists, so
 * they must not change with the Foundry version.
 * @type {string[]}
 */
export const VISIBILITY_CHOICES = ['publicroll', 'gmroll', 'blindroll']

/** Core spellings of each choice, the v14 key first so it wins when both exist. */
const CORE_KEYS = {
  publicroll: ['public', 'publicroll'],
  gmroll: ['gm', 'gmroll'],
  blindroll: ['blind', 'blindroll']
}

/**
 * The key under which the running Foundry version registers a choice.
 * @param {string} choice  One of VISIBILITY_CHOICES
 * @param {object|undefined} modes  CONFIG.ChatMessage.modes (v14) or CONFIG.Dice.rollModes (v13)
 * @returns {string|null}  null when the choice is unknown or the registry does not offer it
 */
export function coreModeKey (choice, modes) {
  const candidates = Object.hasOwn(CORE_KEYS, choice ?? '') ? CORE_KEYS[choice] : []
  return candidates.find(key => Object.hasOwn(modes ?? {}, key)) ?? null
}

/**
 * Build the updateSource payload that retargets a chat message to a choice.
 *
 * @param {object} params
 * @param {string} params.choice  One of VISIBILITY_CHOICES
 * @param {object|undefined} params.modes  The running version's roll-mode registry
 * @param {unknown} params.storedMode  The mode CoC7 serialised on the card (flags.CoC7.load.rollMode), undefined when the card stores none
 * @param {(mode: string) => {whisper?: string[], blind?: boolean}} params.resolveRecipients  Core's own mode logic, given the running version's key
 * @returns {object|null}  null when the running version does not register the choice
 */
export function visibilityUpdate ({ choice, modes, storedMode, resolveRecipients }) {
  const mode = coreModeKey(choice, modes)
  if (!mode) return null

  const { whisper, blind } = resolveRecipients(mode)
  const update = { whisper: whisper ?? [], blind: blind ?? false }
  // Only rewrite the stored mode of cards that have one — never invent the flag.
  // It must be the running version's key: CoC7 9.x matches it against its own
  // CHAT_MESSAGE_MODE constants and hands it to core as is, and core silently
  // falls back to the user's default mode for a key it does not know.
  if (storedMode !== undefined) update['flags.CoC7.load.rollMode'] = mode
  return update
}

/**
 * The dropdown choice a core mode key stands for, whichever version spelled it.
 * @param {string|null|undefined} mode  e.g. 'blind' (v14) or 'blindroll' (v13)
 * @returns {string|null}  null for modes the dropdown does not offer (self, in-character, …)
 */
export function choiceForCoreMode (mode) {
  return VISIBILITY_CHOICES.find(choice => CORE_KEYS[choice].includes(mode)) ?? null
}
