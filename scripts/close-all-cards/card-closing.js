/**
 * Pure helpers for the Close All Cards feature. No Foundry globals, so they can
 * be unit-tested (test/card-closing.test.js). The Foundry wiring lives in
 * index.js and dialog.js.
 */

// Maps CoC7 card template class names (flags.CoC7.load.as) to i18n keys.
const CARD_TYPE_KEYS = {
  CoC7Check: 'COC7QOL.CloseAllCards.CardType.SkillCheck',
  CoC7SanCheckCard: 'COC7QOL.CloseAllCards.CardType.SanityCheck',
  CoC7ConCheck: 'COC7QOL.CloseAllCards.CardType.ConstitutionCheck',
  CoC7ChatCombatMelee: 'COC7QOL.CloseAllCards.CardType.MeleeCombat',
  CoC7ChatCombatRanged: 'COC7QOL.CloseAllCards.CardType.RangedCombat',
  CoC7ChatDamage: 'COC7QOL.CloseAllCards.CardType.Damage',
  CoC7ChatOpposedMessage: 'COC7QOL.CloseAllCards.CardType.OpposedRoll',
  CoC7ChatCombinedMessage: 'COC7QOL.CloseAllCards.CardType.CombinedRoll',
  CoC7ChatChaseObstacle: 'COC7QOL.CloseAllCards.CardType.ChaseObstacle'
}

/**
 * @typedef {object} OpenCard
 * @property {string} messageId
 * @property {string} type       Localised card type.
 * @property {string} actor      Who the card is about, or the localised "unknown" label.
 * @property {string} timestamp  Display time of the message.
 */

/**
 * The chat cards CoC7 still holds open (flags.CoC7.load.cardOpen), as the dialog lists them.
 * @param {Iterable<object>} messages  ChatMessage documents (or plain objects of the same shape).
 * @param {object} deps
 * @param {(uuid: string) => string | null | undefined} deps.resolveName  Display name of an actor uuid.
 * @param {(key: string) => string} deps.localize
 * @param {(timestamp: number) => string} deps.formatTime
 * @returns {OpenCard[]}
 */
export function listOpenCards (messages, { resolveName, localize, formatTime }) {
  const open = []
  for (const message of messages) {
    const load = message.flags?.CoC7?.load
    if (load?.cardOpen !== true) continue
    const actor = cardActorName({
      speakerAlias: message.speaker?.alias,
      // Multi-actor cards (opposed, combined, damage) store actorUuids; the others a single actorUuid.
      actorUuids: Array.isArray(load.actorUuids) ? load.actorUuids : [load.actorUuid],
      resolveName
    })
    open.push({
      messageId: message.id,
      type: localize(CARD_TYPE_KEYS[load.as] ?? 'COC7QOL.CloseAllCards.UnknownCardType'),
      actor: actor ?? localize('COC7QOL.CloseAllCards.UnknownActor'),
      timestamp: formatTime(message.timestamp)
    })
  }
  return open
}

/** The system's own "Close card" button (roll-result.hbs, combined-roll.hbs, opposed-roll.hbs). */
const CLOSE_BUTTON_SELECTOR = 'button[data-action="toggleValue"][data-set="cardOpen"]'

/**
 * Remove from a parsed chat card everything that lets someone keep acting on it.
 *
 * CoC7 closes a card by re-rendering its template with cardOpen = false, which
 * drops every action button (push, luck, bonus/penalty dice, reveal, force
 * pass, …). The system exposes no way for a module to trigger that re-render,
 * so the stored HTML is edited to the same effect: removing only the
 * "Close card" button would leave a card that is flagged closed yet can still
 * be pushed or have dice added.
 *
 * Only cards that carry the system's Close card button are touched — that
 * button is what marks a card as closable. Standby cards and workflow cards
 * (sanity, damage, combat, …) have none and are left exactly as they are.
 *
 * Deliberately kept:
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

  root.querySelectorAll('button[data-action]:not([disabled])').forEach(button => button.remove())

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
