/**
 * Pure helpers for the Close All Cards feature. No Foundry globals, so they can
 * be unit-tested (test/card-closing.test.js). The Foundry wiring lives in
 * index.js, dialog.js and system-close.js.
 */

// Maps CoC7 card classes (flags.CoC7.load.as) to i18n keys. Only the cards whose
// cardOpen flag CoC7 clears itself are listed. Chase obstacle, melee, ranged,
// damage and CON cards carry the flag too, but the system never sets it to
// false: every such card ever posted would be listed, and closing it would
// change nothing on screen.
const CARD_TYPE_KEYS = {
  CoC7Check: 'COC7QOL.CloseAllCards.CardType.SkillCheck',
  CoC7SanCheckCard: 'COC7QOL.CloseAllCards.CardType.SanityCheck',
  CoC7ChatOpposedMessage: 'COC7QOL.CloseAllCards.CardType.OpposedRoll',
  CoC7ChatCombinedMessage: 'COC7QOL.CloseAllCards.CardType.CombinedRoll'
}

/**
 * How far along an open card is.
 * - PENDING: a standby check still waiting for someone to click Roll.
 * - IN_PROGRESS: started but not finished (an opposed or combined roll with
 *   dice left to roll, a sanity check mid-way, a winner yet to roll damage).
 * - RESOLVED: finished. The card shows the system's own Close card button.
 * @enum {string}
 */
export const CARD_STATE = Object.freeze({
  PENDING: 'pending',
  IN_PROGRESS: 'inProgress',
  RESOLVED: 'resolved'
})

const CARD_STATE_KEYS = {
  [CARD_STATE.PENDING]: 'COC7QOL.CloseAllCards.State.Pending',
  [CARD_STATE.IN_PROGRESS]: 'COC7QOL.CloseAllCards.State.InProgress',
  [CARD_STATE.RESOLVED]: 'COC7QOL.CloseAllCards.State.Resolved'
}

/** The system's own "Close card" button (roll-result.hbs, combined-roll.hbs, opposed-roll.hbs). */
export const CLOSE_BUTTON_SELECTOR = 'button[data-action="toggleValue"][data-set="cardOpen"]'

/**
 * The state of an open card. CoC7 renders its Close card button exactly when it
 * considers the card finished, so the stored HTML is the reference; the flags
 * only tell a standby check apart from the other unfinished cards.
 * @param {object} load  flags.CoC7.load of the message
 * @param {ParentNode} root  The parsed card content
 * @returns {string}  One of CARD_STATE
 */
export function cardState (load, root) {
  if (root.querySelector(CLOSE_BUTTON_SELECTOR)) return CARD_STATE.RESOLVED
  if (load?.as === 'CoC7Check' && load.isStandby === true) return CARD_STATE.PENDING
  return CARD_STATE.IN_PROGRESS
}

/**
 * @typedef {object} OpenCard
 * @property {string} messageId
 * @property {string} type        Localised card type.
 * @property {string} actor       Who the card is about, or the localised "unknown" label.
 * @property {string} timestamp   Display time of the message.
 * @property {string} state       One of CARD_STATE.
 * @property {string} stateLabel  Localised state.
 */

/**
 * The chat cards CoC7 still holds open (flags.CoC7.load.cardOpen), as the dialog lists them.
 * @param {Iterable<object>} messages  ChatMessage documents (or plain objects of the same shape).
 * @param {object} deps
 * @param {(uuid: string) => string | null | undefined} deps.resolveName  Display name of an actor uuid.
 * @param {(key: string) => string} deps.localize
 * @param {(timestamp: number) => string} deps.formatTime
 * @param {(html: string) => ParentNode} deps.parseHtml  Parse card content into a detached tree.
 * @returns {OpenCard[]}
 */
export function listOpenCards (messages, { resolveName, localize, formatTime, parseHtml }) {
  const open = []
  for (const message of messages) {
    const load = message.flags?.CoC7?.load
    if (load?.cardOpen !== true || !Object.hasOwn(CARD_TYPE_KEYS, load.as)) continue
    const actor = cardActorName({
      speakerAlias: message.speaker?.alias,
      // Multi-actor cards (opposed, combined) store actorUuids; the others a single actorUuid.
      actorUuids: Array.isArray(load.actorUuids) ? load.actorUuids : [load.actorUuid],
      resolveName
    })
    const state = cardState(load, parseHtml(message.content ?? ''))
    open.push({
      messageId: message.id,
      type: localize(CARD_TYPE_KEYS[load.as]),
      actor: actor ?? localize('COC7QOL.CloseAllCards.UnknownActor'),
      timestamp: formatTime(message.timestamp),
      state,
      stateLabel: localize(CARD_STATE_KEYS[state])
    })
  }
  return open
}

/**
 * The Regular / Hard / Extreme / Critical buttons of an unknown-difficulty
 * check. The system keeps them on a closed card: they are how the Keeper
 * adjudicates the roll afterwards.
 */
const DIFFICULTY_BUTTON_SELECTOR = 'button[data-action="setValue"][data-set="difficulty"]'

/**
 * Remove from a parsed chat card everything that lets someone keep acting on it.
 *
 * This is the fallback for a finished card the system could not close itself
 * (see system-close.js). CoC7 closes a card by re-rendering its template with
 * cardOpen = false, which drops the action buttons (push, luck, bonus/penalty
 * dice, reveal, force pass, …); here the stored HTML is edited to the same
 * visible effect. It is not the same thing: the system's Close also flags the
 * winning skills of an opposed or combined roll for development, and this
 * does not.
 *
 * Only cards that carry the system's Close card button are touched — that
 * button is what marks a card as finished. Unfinished cards have none and are
 * left exactly as they are.
 *
 * Deliberately kept:
 *  - the difficulty buttons of an unknown-difficulty check, which the system
 *    keeps on a closed card too;
 *  - disabled buttons — on an opposed card the locked Attacker/Defender marker
 *    is a disabled button, and the system keeps it on a closed card too;
 *  - anything that is not a <button> (content links, core's roll-expansion
 *    toggle, …).
 *
 * @param {ParentNode} root  Parsed, detached card content. Mutated in place.
 * @returns {boolean} false when the card has no Close card button (left untouched)
 */
export function stripCardControls (root) {
  if (!root.querySelector(CLOSE_BUTTON_SELECTOR)) return false

  root.querySelectorAll('button[data-action]:not([disabled])').forEach(button => {
    if (!button.matches(DIFFICULTY_BUTTON_SELECTOR)) button.remove()
  })

  // Rows that only existed to hold those buttons. Rows still holding something
  // (a disabled marker, talent links) stay.
  root.querySelectorAll('.coc7-card-buttons').forEach(row => {
    if (row.childElementCount === 0) row.remove()
  })

  // An opposed card stores the advantage twice: as Keeper-only buttons and as
  // tags for everyone else (.not-keeper-block, which the system strips from the
  // Keeper's view). With the buttons gone the tags are the only record left, so
  // let the Keeper see them as well — a card the system closed shows them to all.
  root.querySelectorAll('.coc7-tags.not-keeper-block').forEach(tags => tags.classList.remove('not-keeper-block'))

  return true
}

/**
 * The update that closes a card without the system's help: the flag, plus the
 * stripped content when the card is a finished one.
 * @param {{id: string, content?: string}} message
 * @param {(html: string) => HTMLElement} parseHtml  Parse card content into a detached element
 * @returns {object}  One entry for ChatMessage.updateDocuments
 */
export function closeUpdate (message, parseHtml) {
  const update = { _id: message.id, 'flags.CoC7.load.cardOpen': false }
  const root = parseHtml(message.content ?? '')
  if (stripCardControls(root)) update.content = root.innerHTML
  return update
}

/**
 * @typedef {object} CloseResult
 * @property {string[]} closed  Ids of the cards that are now closed.
 * @property {string[]} failed  Ids of the cards that are still open.
 * @property {unknown} [error]  What the bulk update threw, when it did.
 */

/**
 * Close the selected cards, each the best way available.
 *
 * A finished card is handed to the system's own Close card button, so the
 * result is the system's, development flags included. Everything else — the
 * unfinished cards, and any finished card the system did not close — goes into
 * one bulk update. Nothing here throws: a failure is reported in the result, so
 * the caller can always tell the user what happened.
 *
 * @param {Pick<OpenCard, 'messageId' | 'state'>[]} cards
 * @param {object} deps
 * @param {(messageId: string) => Promise<boolean>} deps.systemClose  Close a finished card through the system; false when it did not happen
 * @param {(messageIds: string[]) => Promise<string[]>} deps.bulkClose  Close cards in one update; resolves with the ids actually updated
 * @returns {Promise<CloseResult>}
 */
export async function closeCards (cards, { systemClose, bulkClose }) {
  const ids = cards.map(card => card.messageId)
  const finished = cards.filter(card => card.state === CARD_STATE.RESOLVED).map(card => card.messageId)

  const outcomes = await Promise.all(finished.map(id => systemClose(id).then(Boolean, () => false)))
  const closed = finished.filter((_, index) => outcomes[index])

  const remaining = ids.filter(id => !closed.includes(id))
  let error
  if (remaining.length > 0) {
    try {
      closed.push(...await bulkClose(remaining))
    } catch (err) {
      error = err
    }
  }

  const result = { closed, failed: ids.filter(id => !closed.includes(id)) }
  return error === undefined ? result : { ...result, error }
}

/**
 * The name to list a card under: the speaker alias when the card has one,
 * otherwise the actor(s) recorded in the card's own flags. CoC7 strips the
 * speaker from a Keeper's "Self" rolls (whisper target owners/everyone), which
 * used to leave those cards listed as "Unknown".
 *
 * @param {object} params
 * @param {string|null} [params.speakerAlias]  message.speaker.alias
 * @param {unknown[]} [params.actorUuids]  flags.CoC7.load.actorUuids, or [actorUuid]
 * @param {(uuid: string) => string|null|undefined} params.resolveName  Resolve an actor uuid to a display name
 * @returns {string|null}  null when nothing identifies the card
 */
export function cardActorName ({ speakerAlias, actorUuids, resolveName }) {
  if (speakerAlias) return speakerAlias

  const names = []
  for (const uuid of actorUuids ?? []) {
    if (typeof uuid !== 'string' || uuid === '') continue
    const name = safeResolve(resolveName, uuid)
    if (name && !names.includes(name)) names.push(name)
  }
  return names.length ? names.join(', ') : null
}

/**
 * A uuid that no longer resolves (deleted actor, unloaded compendium, malformed
 * flag) must not break the dialog: the card is simply listed without that name.
 */
function safeResolve (resolveName, uuid) {
  try {
    return resolveName(uuid) ?? null
  } catch (_) {
    return null
  }
}
