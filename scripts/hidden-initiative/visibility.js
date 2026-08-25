/**
 * Pure decision logic for the hidden-initiative workaround. No Foundry globals:
 * everything arrives as plain data so it can be unit-tested
 * (test/hidden-initiative.test.js). The Foundry wiring lives in index.js.
 */

/** Roll-mode keys meaning "everyone sees it": 'publicroll' on v13, 'public' on v14. */
export const PUBLIC_MODES = ['public', 'publicroll']

/**
 * Resolve the combatant a chat speaker refers to. Prefers the token match
 * (unlinked NPC tokens — the common case), then the actor match (linked
 * actors, whose speaker may carry a different token than the combatant's).
 * Combats are searched in the order given; pass the active combat first.
 * @param {object|null} speaker        ChatMessage speaker data ({token, actor})
 * @param {Iterable<{combatants: Iterable<object>}>} combats
 * @returns {object|null}
 */
export function findCombatant (speaker, combats) {
  if (!speaker) return null
  for (const combat of combats ?? []) {
    const combatants = [...(combat?.combatants ?? [])]
    const byToken = speaker.token ? combatants.find(c => c.tokenId === speaker.token) : null
    if (byToken) return byToken
    const byActor = speaker.actor ? combatants.find(c => c.actorId === speaker.actor) : null
    if (byActor) return byActor
  }
  return null
}

/**
 * Hidden in the combat tracker OR hidden on the canvas. Core's own rule only
 * checks the tracker flag; the canvas check is strictly more protective.
 * @param {object|null} combatant
 * @returns {boolean}
 */
export function isHidden (combatant) {
  return combatant?.hidden === true || combatant?.token?.hidden === true
}

/**
 * True when nobody has been excluded from seeing the message yet.
 * Accepts whisper as an Array or a Set.
 * @param {object} message
 * @returns {boolean}
 */
export function isPublic (message) {
  const whisper = message.whisper ?? []
  const recipients = whisper.size ?? whisper.length ?? 0
  return recipients === 0 && message.blind !== true
}

/**
 * The GM-only mode key of the running Foundry version ('gm' on v14,
 * 'gmroll' on v13), or null if neither is registered.
 * @param {object|undefined} modes  CONFIG.ChatMessage.modes (v14) or CONFIG.Dice.rollModes (v13)
 * @returns {string|null}
 */
export function gmModeKey (modes) {
  return Object.keys(modes ?? {}).find(k => k === 'gm' || k === 'gmroll') ?? null
}

/**
 * Decide what to do with a chat message about to be created.
 *
 * - 'ignore'    — not an initiative roll, combatant not hidden, nothing to do
 * - 'redundant' — the hidden combatant's roll already arrived private although
 *                 the roll mode is public and this module did not do it:
 *                 something external (most likely the upstream fix) handles it now
 * - 'no-gm'     — there is nobody to whisper to; the roll stays public
 * - 'whisper'   — apply `update` to make the roll GM-only
 *
 * The decision only ever tightens visibility; it never loosens an already
 * whispered or blind message.
 *
 * @param {object} params
 * @param {object} params.message     The ChatMessage (or plain data): flags, speaker, whisper, blind
 * @param {Iterable} params.combats   Combats to search, active one first
 * @param {string[]} params.gmIds     Ids of the GM users
 * @param {object} [params.modes]     Registered roll modes of this Foundry version
 * @param {string|null} params.rollMode  The user's default chat roll-mode setting (may differ from a per-roll override)
 * @param {boolean} [params.handledByModule=false]  True when a sibling hook of this module already retargeted the message
 * @returns {{kind: 'ignore'}|{kind: 'redundant'}|{kind: 'no-gm'}|{kind: 'whisper', update: object}}
 */
export function decideInitiativeVisibility ({ message, combats, gmIds, modes, rollMode, handledByModule = false }) {
  const IGNORE = { kind: 'ignore' }
  if (message?.flags?.core?.initiativeRoll !== true) return IGNORE

  const combatant = findCombatant(message.speaker, combats)
  if (!isHidden(combatant)) return IGNORE

  if (!isPublic(message)) {
    const external = !handledByModule && PUBLIC_MODES.includes(rollMode)
    return external ? { kind: 'redundant' } : IGNORE
  }
  if (!gmIds?.length) return { kind: 'no-gm' }

  const update = { whisper: [...gmIds], blind: false }
  // Keep the visibility if CoC7 re-hydrates the check from its stored flags
  // (same reasoning as roll-visibility.js). Only touch the flag if it exists.
  const mode = gmModeKey(modes)
  if (mode && message.flags?.CoC7?.load?.rollMode !== undefined) {
    update['flags.CoC7.load.rollMode'] = mode
  }
  return { kind: 'whisper', update }
}
