/**
 * Pure helpers for the Close All Cards feature. No Foundry globals, so they can
 * be unit-tested (test/card-closing.test.js). The Foundry wiring lives in
 * close-all-cards.js.
 */

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
