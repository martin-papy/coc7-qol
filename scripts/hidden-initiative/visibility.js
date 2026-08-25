/**
 * Pure decision logic for the hidden-initiative workaround. No Foundry globals:
 * everything arrives as plain data so it can be unit-tested
 * (test/hidden-initiative.test.js). The Foundry wiring lives in index.js.
 */

/** Roll-mode keys meaning "everyone sees it": 'publicroll' on v13, 'public' on v14. */
export const PUBLIC_MODES = ['public', 'publicroll']

const UUID_TOKEN = /(?:^|\.)Token\.([^.]+)/
const UUID_ACTOR = /(?:^|\.)Actor\.([^.]+)/

/**
 * Who the initiative card is about: the speaker's token/actor when CoC7 kept
 * a speaker, otherwise the actor UUID CoC7 stores in its own flags. The latter
 * is the only identity left when CoC7 strips the speaker (Self Roll mode with
 * a "whisper target" of owners/everyone), e.g.
 *   Scene.<scene>.Token.<token>.Actor.<actor>   (unlinked token actor)
 *   Actor.<actor>                               (linked actor)
 * @param {object} message
 * @returns {{token: string|null, actor: string|null}|null}
 */
export function resolveIdentity (message) {
  const speaker = message?.speaker ?? {}
  const uuid = message?.flags?.CoC7?.load?.actorUuid
  const fromUuid = re => (typeof uuid === 'string' ? uuid.match(re)?.[1] : null) ?? null
  const token = speaker.token ?? fromUuid(UUID_TOKEN)
  const actor = speaker.actor ?? fromUuid(UUID_ACTOR)
  return token || actor ? { token, actor } : null
}

/**
 * Resolve the combatant an identity refers to. Prefers the token match
 * (unlinked NPC tokens — the common case), then the actor match (linked
 * actors, whose speaker may carry a different token than the combatant's).
 * Combats are searched in the order given; pass the active combat first.
 * @param {{token: string|null, actor: string|null}|null} identity
 * @param {Iterable<{combatants: Iterable<object>}>} combats
 * @returns {object|null}
 */
export function findCombatant (identity, combats) {
  if (!identity) return null
  for (const combat of combats ?? []) {
    const combatants = [...(combat?.combatants ?? [])]
    const byToken = identity.token ? combatants.find(c => c.tokenId === identity.token) : null
    if (byToken) return byToken
    // Several combatants may share one linked actor; if any of them is hidden,
    // err on the side of protecting it rather than picking the first match.
    const byActor = identity.actor ? combatants.filter(c => c.actorId === identity.actor) : []
    if (byActor.length) return byActor.find(isHidden) ?? byActor[0]
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
 * True when no player can see the message: a blind roll, or a whisper whose
 * every recipient is a GM. A public message, or one whispered to players
 * (CoC7's Self Roll with "whisper target: everyone"), is not.
 * Accepts whisper as an Array or a Set.
 * @param {object} message
 * @param {string[]} gmIds
 * @returns {boolean}
 */
export function isGmOnly (message, gmIds) {
  if (message.blind === true) return true
  const whisper = [...(message.whisper ?? [])]
  return whisper.length > 0 && whisper.every(id => gmIds.includes(id))
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
 * - 'ignore'     — not an initiative roll, combatant not hidden, nothing to do
 * - 'unresolved' — an initiative roll we cannot tie to any combatant (no speaker,
 *                  no CoC7 actor uuid, or no match): nothing can be protected
 * - 'redundant' — the hidden combatant's roll already reaches only the GMs
 *                 although the roll mode is public and this module did not do
 *                 it: something external (most likely the upstream fix) handles it now
 * - 'no-gm'     — there is nobody to whisper to; the roll is left as is
 * - 'whisper'   — apply `update` to narrow the roll to the GMs
 *
 * The decision only ever tightens visibility: it removes players from the
 * audience and never widens an already GM-only or blind message.
 *
 * @param {object} params
 * @param {object} params.message     The ChatMessage (or plain data): flags, speaker, whisper, blind
 * @param {Iterable} params.combats   Combats to search, active one first
 * @param {string[]} params.gmIds     Ids of the GM users
 * @param {object} [params.modes]     Registered roll modes of this Foundry version
 * @param {string|null} params.rollMode  The user's default chat roll-mode setting (may differ from a per-roll override)
 * @param {boolean} [params.handledByModule=false]  True when a sibling hook of this module already retargeted the message
 * @returns {{kind: 'ignore'}|{kind: 'unresolved'}|{kind: 'redundant'}|{kind: 'no-gm'}|{kind: 'whisper', update: object}}
 */
export function decideInitiativeVisibility ({ message, combats, gmIds, modes, rollMode, handledByModule = false }) {
  const IGNORE = { kind: 'ignore' }
  if (message?.flags?.core?.initiativeRoll !== true) return IGNORE

  const combatant = findCombatant(resolveIdentity(message), combats)
  if (!combatant) return { kind: 'unresolved' }
  if (!isHidden(combatant)) return IGNORE

  const gms = gmIds ?? []
  if (isGmOnly(message, gms)) {
    const external = !handledByModule && PUBLIC_MODES.includes(rollMode)
    return external ? { kind: 'redundant' } : IGNORE
  }
  if (!gms.length) return { kind: 'no-gm' }

  // sound: null — Foundry plays a roll's sound on every client, recipients or
  // not, so a dice clatter per hidden NPC would still give players a head-count.
  const update = { whisper: [...gms], blind: false, sound: null }
  // Keep the visibility if CoC7 re-hydrates the check from its stored flags
  // (same reasoning as roll-visibility.js). Only touch the flag if it exists.
  const mode = gmModeKey(modes)
  if (mode && message.flags?.CoC7?.load?.rollMode !== undefined) {
    update['flags.CoC7.load.rollMode'] = mode
  }
  return { kind: 'whisper', update }
}

/**
 * Foundry renders a whispered or blind ROLL to non-recipients anyway, as a
 * "<user> privately rolled some dice" placeholder — enough for players to
 * count hidden NPCs from their initiative cards. Hide the placeholder when the
 * message is an initiative roll whose content this user is not allowed to see.
 * Purely presentational, on the viewing client; the message itself is untouched.
 * @param {object} params
 * @param {object} params.message        The ChatMessage (or plain data): flags, whisper, blind
 * @param {boolean} params.contentVisible  ChatMessage#isContentVisible for the current user
 * @returns {boolean}
 */
export function shouldHideCard ({ message, contentVisible }) {
  if (message?.flags?.core?.initiativeRoll !== true) return false
  if (contentVisible) return false
  const recipients = [...(message.whisper ?? [])].length
  return recipients > 0 || message.blind === true
}
