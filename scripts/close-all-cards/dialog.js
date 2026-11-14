import { escapeHtml, t, tf } from '../utils.js'
import { LOG_PREFIX } from '../constants.js'
import { CARD_STATE, closeCards, closeUpdate } from './card-closing.js'
import { closeWithSystemButton } from './system-close.js'

/** Parse stored card content into a detached element. */
export function parseCardHtml (html) {
  return new DOMParser().parseFromString(html, 'text/html').body
}

/**
 * Close cards in a single update: the flag, plus the stripped content of a
 * finished card the system did not close itself.
 * @param {string[]} messageIds
 * @returns {Promise<string[]>}  The ids that are closed afterwards (a card deleted meanwhile counts: it is not open)
 */
async function bulkClose (messageIds) {
  const updates = messageIds
    .map(id => game.messages.get(id))
    .filter(message => message?.flags?.CoC7?.load?.cardOpen === true)
    .map(message => closeUpdate(message, parseCardHtml))
  if (updates.length > 0) await ChatMessage.implementation.updateDocuments(updates)
  return messageIds.filter(id => game.messages.get(id)?.flags?.CoC7?.load?.cardOpen !== true)
}

export default class CloseAllCardsDialog extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: 'coc7qol-close-all-cards',
    tag: 'div',
    window: {},
    position: { width: 520, height: 'auto' },
    actions: {
      closeSelected: CloseAllCardsDialog.#handleCloseSelected,
      cancel: CloseAllCardsDialog.#handleCancel,
      toggleAll: CloseAllCardsDialog.#handleToggleAll,
      toggleCard: CloseAllCardsDialog.#handleToggleCard
    }
  }

  get title () { return t('COC7QOL.CloseAllCards.Title') }

  #cards
  #listCards
  #selectedIds
  #isClosing = false

  /**
   * @param {() => import('./card-closing.js').OpenCard[]} listCards  The cards open right now; called again after a partial failure
   * @param {object} [options]
   */
  constructor (listCards, options = {}) {
    super(options)
    this.#listCards = listCards
    this.#cards = listCards()
    // Only finished cards start selected: closing an unfinished one abandons its roll.
    this.#selectedIds = new Set(this.#cards.filter(card => card.state === CARD_STATE.RESOLVED).map(card => card.messageId))
  }

  async _renderHTML (context, options) {
    const container = document.createElement('div')
    container.className = 'coc7qol-close-all-cards'

    // Header with count and select-all
    const header = document.createElement('div')
    header.className = 'coc7qol-close-cards-header'
    const isSelected = card => this.#selectedIds.has(card.messageId)
    const hasUnfinished = this.#cards.some(card => card.state !== CARD_STATE.RESOLVED)
    header.innerHTML = `
      <label class="coc7qol-close-cards-toggle-all">
        <input type="checkbox" data-action="toggleAll" ${this.#cards.every(isSelected) ? 'checked' : ''}>
        <strong>${tf(this.#cards.length === 1 ? 'COC7QOL.CloseAllCards.Header.OpenCard' : 'COC7QOL.CloseAllCards.Header.OpenCards', { count: this.#cards.length })}</strong>
      </label>
    `
    container.appendChild(header)

    // Card list
    const list = document.createElement('div')
    list.className = 'coc7qol-close-cards-list'
    for (const card of this.#cards) {
      const row = document.createElement('label')
      row.className = 'coc7qol-close-cards-row'
      row.innerHTML = `
        <input type="checkbox" data-action="toggleCard" data-message-id="${escapeHtml(card.messageId)}" ${isSelected(card) ? 'checked' : ''}>
        <span class="coc7qol-close-cards-type">${escapeHtml(card.type)}</span>
        <span class="coc7qol-close-cards-actor">${escapeHtml(card.actor)}</span>
        <span class="coc7qol-close-cards-state coc7qol-is-${escapeHtml(card.state)}">${escapeHtml(card.stateLabel)}</span>
        <span class="coc7qol-close-cards-time">${escapeHtml(card.timestamp)}</span>
      `
      list.appendChild(row)
    }
    container.appendChild(list)

    if (hasUnfinished) {
      const hint = document.createElement('p')
      hint.className = 'coc7qol-close-cards-hint'
      hint.textContent = t('COC7QOL.CloseAllCards.Hint')
      container.appendChild(hint)
    }

    // Footer buttons
    const footer = document.createElement('div')
    footer.className = 'coc7qol-close-cards-footer'
    footer.innerHTML = `
      <button type="button" data-action="closeSelected" class="bright" ${this.#cards.some(isSelected) ? '' : 'disabled'}>${t('COC7QOL.CloseAllCards.Button.CloseSelected')}</button>
      <button type="button" data-action="cancel">${t('COC7QOL.CloseAllCards.Button.Cancel')}</button>
    `
    container.appendChild(footer)

    return container
  }

  _replaceHTML (result, content, options) {
    content.replaceChildren(result)
  }

  /** Record what is ticked, so the selection survives a re-render. */
  #syncSelection () {
    const checkboxes = this.element.querySelectorAll('.coc7qol-close-cards-row input[type="checkbox"]:checked')
    this.#selectedIds = new Set(Array.from(checkboxes).map(cb => cb.dataset.messageId))
  }

  #getSelectedCards () {
    return this.#cards.filter(card => this.#selectedIds.has(card.messageId))
  }

  /** Lock the form while the cards are being closed, so a second click cannot start a second run. */
  #setBusy (isBusy) {
    this.#isClosing = isBusy
    this.element.querySelectorAll('input[type="checkbox"], [data-action="closeSelected"]').forEach(control => {
      control.disabled = isBusy
    })
  }

  #updateCloseButton () {
    const anyChecked = this.element.querySelector('.coc7qol-close-cards-row input[type="checkbox"]:checked')
    const closeBtn = this.element.querySelector('[data-action="closeSelected"]')
    if (closeBtn) closeBtn.disabled = !anyChecked
  }

  #updateToggleAll () {
    const allCheckboxes = this.element.querySelectorAll('.coc7qol-close-cards-row input[type="checkbox"]')
    const allChecked = Array.from(allCheckboxes).every(cb => cb.checked)
    const toggleAll = this.element.querySelector('[data-action="toggleAll"]')
    if (toggleAll) toggleAll.checked = allChecked
  }

  static async #handleCloseSelected (event, target) {
    if (this.#isClosing) return
    const cards = this.#getSelectedCards()
    if (cards.length === 0) return

    this.#setBusy(true)
    const { closed, failed, error } = await closeCards(cards, {
      systemClose: id => closeWithSystemButton(game.messages.get(id)),
      bulkClose
    })

    if (failed.length === 0) {
      ui.notifications.info(closed.length === 1 ? 'COC7QOL.CloseAllCards.Notification.Closed' : 'COC7QOL.CloseAllCards.Notification.ClosedPlural', { format: { count: closed.length } })
      this.close()
      return
    }

    // Some cards are still open. Say so, and show what is left instead of closing on a half-done job.
    console.error(LOG_PREFIX, `Close All Cards: ${failed.length} of ${cards.length} cards could not be closed.`, error ?? '')
    ui.notifications.error('COC7QOL.CloseAllCards.Notification.Failed', { format: { closed: closed.length, failed: failed.length }, permanent: true })
    this.#cards = this.#listCards()
    // Keep the user's selection: the cards that failed stay ticked, and nothing they had
    // unticked comes back ticked for the retry.
    const openIds = new Set(this.#cards.map(card => card.messageId))
    this.#selectedIds = new Set(failed.filter(id => openIds.has(id)))
    this.#isClosing = false
    if (this.#cards.length === 0) this.close()
    else this.render()
  }

  static #handleCancel (event, target) {
    this.close()
  }

  static #handleToggleAll (event, target) {
    const checked = target.checked
    const checkboxes = this.element.querySelectorAll('.coc7qol-close-cards-row input[type="checkbox"]')
    checkboxes.forEach(cb => { cb.checked = checked })
    this.#syncSelection()
    this.#updateCloseButton()
  }

  static #handleToggleCard (event, target) {
    this.#syncSelection()
    this.#updateToggleAll()
    this.#updateCloseButton()
  }
}
