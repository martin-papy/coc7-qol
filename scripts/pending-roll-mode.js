/**
 * The hand-off between the CoC7 roll dialog and the chat card it produces, for
 * the roll-visibility feature. Pure — no Foundry globals — so it can be
 * unit-tested (test/pending-roll-mode.test.js). The Foundry wiring lives in
 * roll-visibility.js.
 *
 * Clicking OK arms the chosen visibility; the next CoC7 card created on this
 * client consumes it. Three guards keep a choice from landing on an unrelated
 * message when OK creates no card (issue #41):
 * - only messages carrying CoC7's serialised card data take the choice;
 * - Combined and Opposed card types never arm it — a player's roll is sent to
 *   the Keeper over a socket, and a GM's roll may only update an open card;
 * - an armed choice expires, so a roll that fails after OK cannot leak it into
 *   a later card.
 */
import { VISIBILITY_CHOICES } from './roll-mode-keys.js'

/**
 * How long an armed choice waits for its card. Generous on purpose: a SAN
 * check opens a second dialog (SAN loss and reason) after OK, before the card
 * is created.
 * @type {number}
 */
export const PENDING_TTL_MS = 60_000

/** CoC7 CARD_TYPE.COMBINED and CARD_TYPE.OPPOSED (coc7/apps/roll-normalize.js). */
const GROUP_CARD_TYPES = ['C/CO', 'C/OP']

/**
 * Whether chat message data is a CoC7 roll card. CoC7 serialises every check
 * and SAN card into flags.CoC7.load so it can re-hydrate it later.
 * @param {unknown} data  The creation data of a chat message
 * @returns {boolean}
 */
export function isCoC7Card (data) {
  const load = data?.flags?.CoC7?.load
  return typeof load === 'object' && load !== null
}

/**
 * A single-slot store for the visibility chosen in the roll dialog.
 * @param {object} [options]
 * @param {() => number} [options.now]  Clock in milliseconds, Date.now by default
 * @returns {{
 *   arm: (params: { choice: string, cardType: string|undefined }) => void,
 *   consume: (data: unknown) => string|null
 * }}
 */
export function createPendingRollMode ({ now = Date.now } = {}) {
  let pending = null

  return {
    /**
     * Record the choice made when OK was clicked.
     * @param {object} params
     * @param {string} params.choice  The dropdown value, one of VISIBILITY_CHOICES
     * @param {string|undefined} params.cardType  The dialog's card type, undefined when the dialog has no card-type field
     */
    arm ({ choice, cardType }) {
      if (GROUP_CARD_TYPES.includes(cardType)) {
        pending = null
        return
      }
      if (!VISIBILITY_CHOICES.includes(choice)) return
      pending = { choice, armedAt: now() }
    },

    /**
     * The choice to apply to a message about to be created, or null to leave
     * the message alone. A CoC7 card clears the slot; any other message leaves
     * it armed for the card still on its way.
     * @param {unknown} data  The creation data of the chat message
     * @returns {string|null}
     */
    consume (data) {
      if (!pending) return null
      if (now() - pending.armedAt > PENDING_TTL_MS) {
        pending = null
        return null
      }
      if (!isCoC7Card(data)) return null
      const { choice } = pending
      pending = null
      return choice
    }
  }
}
