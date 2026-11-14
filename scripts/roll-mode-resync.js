/**
 * Bringing a CoC7 check in line with a visibility picked in the roll dialog.
 * Pure — no Foundry globals — so it can be unit-tested
 * (test/roll-mode-resync.test.js). The Foundry wiring lives in roll-visibility.js.
 *
 * The dropdown's choice reaches the card in preCreateChatMessage, after CoC7
 * has built the check and rendered the card under the chat box's mode. The
 * message and its flags are then right, but two things CoC7 does with the
 * check it still holds in memory are not (issue #48):
 *
 * - the card's HTML: a check built public and sent blind has no Reveal /
 *   Force pass / Force fail / Flag for development row, and the other way
 *   round a public card carries that row;
 * - skill development: right after creating the message, CoC7 ticks the skill
 *   of a successful non-blind roll. For a roll sent blind, that tick shows the
 *   result on the player's own sheet.
 *
 * Both are fixed from the card's flags, which do hold the chosen mode: the
 * card is rebuilt by CoC7's own "Refresh" action, and for a roll turned blind
 * the tick is refused when CoC7 tries to write it.
 */

/**
 * How long a guard waits for the message to be created, and then for CoC7's
 * decision to tick. CoC7 decides in the same task that receives the created
 * message, so the second wait is over almost at once.
 * @type {number}
 */
export const DECISION_TTL_MS = 5_000

/**
 * How long a guard waits for the tick itself once CoC7 has decided on it. With
 * Dice So Nice the skill is only updated when the dice animation ends.
 * @type {number}
 */
export const DEFERRED_TICK_TTL_MS = 60_000

/**
 * Whether a card about to be created has to be brought in line afterwards,
 * and which way.
 *
 * Only a check whose blindness changes qualifies: public and private cards are
 * rendered and ticked alike. A standby card (the Keeper rolling for a player's
 * investigator) is left alone — it holds no result yet, and CoC7 rebuilds it
 * from its flags when the roll is made.
 *
 * @param {object} params
 * @param {unknown} params.load  flags.CoC7.load of the creation data
 * @param {string|undefined} params.mode  The mode written to the card, in the running version's key
 * @param {string|null} params.blindMode  The running version's key for blind rolls
 * @returns {{toBlind: boolean, skillUuid: string|null}|null}  null when the card needs nothing
 */
export function resyncFor ({ load, mode, blindMode }) {
  if (typeof load !== 'object' || load === null) return null
  if (load.as !== 'CoC7Check' || load.isStandby === true) return null
  if (!mode || !blindMode || typeof load.rollMode !== 'string') return null

  const wasBlind = load.rollMode === blindMode
  const isBlind = mode === blindMode
  if (wasBlind === isBlind) return null

  // CoC7 only ticks a skill rolled as a skill; a weapon roll never ticks.
  const isSkillRoll = load.type === 'skill' && typeof load.key === 'string' && load.key !== ''
  return { toBlind: isBlind, skillUuid: isBlind && isSkillRoll ? load.key : null }
}

/** The leaf paths of a nested update, ignoring the document id and the stats Foundry adds. */
function leafPaths (value, prefix = '') {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [prefix]
  return Object.entries(value)
    .filter(([key]) => prefix !== '' || (key !== '_id' && key !== '_stats'))
    .flatMap(([key, child]) => leafPaths(child, prefix === '' ? key : `${prefix}.${key}`))
}

/** Whether an update does one thing only: set `path` to true. */
function setsOnly (changes, path) {
  const paths = leafPaths(changes)
  if (paths.length !== 1 || paths[0] !== path) return false
  return path.split('.').reduce((node, key) => node?.[key], changes) === true
}

/**
 * Whether an item update is CoC7's development tick and nothing else
 * (coc7/apps/utilities.js, messageRollFlagForDevelopment).
 * @param {unknown} changes  The update data handed to preUpdateItem
 * @returns {boolean}
 */
export function isDevelopmentTick (changes) {
  return setsOnly(changes, 'system.flags.developement')
}

/**
 * Whether a message update is CoC7 recording that it ticked the skill
 * (coc7/apps/check.js, toMessage).
 * @param {unknown} changes  The update data handed to preUpdateChatMessage
 * @returns {boolean}
 */
export function isAppliedDevelopmentFlag (changes) {
  return setsOnly(changes, 'flags.CoC7.load.appliedDevelopment')
}

/**
 * A single-slot guard against the development tick of a roll that was turned
 * blind in the dialog.
 *
 * CoC7 makes two writes when it ticks: the skill (`system.flags.developement`)
 * and the card (`load.appliedDevelopment`). Without Dice So Nice the skill comes
 * first, with it the card comes first and the skill follows the animation. Both
 * are refused, once each. The card's flag has to stay false as well: it is what
 * lets a later Reveal tick the skill, as it does for a native blind roll.
 *
 * The guard is deliberately narrow so that it cannot swallow a tick made on
 * purpose (the box on the sheet, the Keeper's Flag for development button): it
 * matches one skill, refuses one write of each kind, and gives up after
 * DECISION_TTL_MS unless CoC7 has shown by then that a tick is on its way.
 *
 * @param {object} [options]
 * @param {() => number} [options.now]  Clock in milliseconds, Date.now by default
 */
export function createDevelopmentGuard ({ now = Date.now } = {}) {
  let slot = null

  /**
   * The slot, or null once it has done its work or run out of time. Each wait
   * is measured from the event that starts it: arming, the message's creation,
   * then the refused card flag.
   */
  function live () {
    if (!slot) return null
    const isExpired = now() - slot.since > (slot.hasRefusedCard ? DEFERRED_TICK_TTL_MS : DECISION_TTL_MS)
    if (isExpired || (slot.hasRefusedSkill && slot.hasRefusedCard)) slot = null
    return slot
  }

  return {
    /**
     * Start guarding a skill, replacing any earlier guard.
     * @param {string} skillUuid  flags.CoC7.load.key of the card about to be created
     */
    arm (skillUuid) {
      slot = { skillUuid, messageId: null, since: now(), hasRefusedSkill: false, hasRefusedCard: false }
    },

    /**
     * Tell the guard which message the roll became.
     * @param {string} messageId
     */
    attach (messageId) {
      if (!live()) return
      slot.messageId = messageId
      // CoC7 decides now: the wait for the server's answer does not count.
      slot.since = now()
    },

    /** Drop the guard: a new roll has started. */
    clear () {
      slot = null
    },

    /**
     * Whether an item update must be refused.
     * @param {string} itemUuid
     * @param {unknown} changes
     * @returns {boolean}
     */
    refusesItemUpdate (itemUuid, changes) {
      const guard = live()
      if (!guard || guard.hasRefusedSkill || guard.skillUuid !== itemUuid || !isDevelopmentTick(changes)) return false
      guard.hasRefusedSkill = true
      live()
      return true
    },

    /**
     * Whether a chat message update must be refused.
     * @param {string} messageId
     * @param {unknown} changes
     * @returns {boolean}
     */
    refusesMessageUpdate (messageId, changes) {
      const guard = live()
      if (!guard || guard.hasRefusedCard || guard.messageId !== messageId || !isAppliedDevelopmentFlag(changes)) return false
      guard.hasRefusedCard = true
      // The tick may follow a dice animation: that wait starts here.
      guard.since = now()
      live()
      return true
    }
  }
}

/**
 * CoC7's "Refresh" entry among chat message context options. It rebuilds a
 * card from its flags and is the only route the system offers to do so
 * (coc7/hooks/get-chat-message-context-options.js). The entry is titled
 * `name` on Foundry v13 and `label` on v14.
 * @param {unknown[]} entries  What the getChatMessageContextOptions hook collected
 * @returns {{callback: (li: {dataset: {messageId: string}}) => unknown}|null}
 */
export function findRefreshEntry (entries) {
  return (entries ?? []).find(entry =>
    (entry?.name ?? entry?.label) === 'Refresh' &&
    typeof entry.icon === 'string' && entry.icon.includes('fa-arrow-rotate-left') &&
    typeof entry.callback === 'function') ?? null
}
