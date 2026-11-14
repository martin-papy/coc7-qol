import { escapeHtml, t, tf } from '../utils.js'
import { stripCardControls } from './card-closing.js'

export default class CloseAllCardsDialog extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: 'coc7-close-all-cards',
    tag: 'div',
    window: {},
    position: { width: 420, height: 'auto' },
    actions: {
      closeSelected: CloseAllCardsDialog.#handleCloseSelected,
      cancel: CloseAllCardsDialog.#handleCancel,
      toggleAll: CloseAllCardsDialog.#handleToggleAll,
      toggleCard: CloseAllCardsDialog.#handleToggleCard
    }
  };

  get title () { return t('COC7QOL.CloseAllCards.Title') }

  #cards;

  constructor (cards, options = {}) {
    super(options);
    this.#cards = cards;
  }

  async _renderHTML (context, options) {
    const container = document.createElement('div');
    container.className = 'coc7-qol-close-all-cards';

    // Header with count and select-all
    const header = document.createElement('div');
    header.className = 'close-cards-header';
    header.innerHTML = `
      <label class="close-cards-toggle-all">
        <input type="checkbox" data-action="toggleAll" checked>
        <strong>${tf(this.#cards.length === 1 ? 'COC7QOL.CloseAllCards.Header.OpenCard' : 'COC7QOL.CloseAllCards.Header.OpenCards', { count: this.#cards.length })}</strong>
      </label>
    `;
    container.appendChild(header);

    // Card list
    const list = document.createElement('div');
    list.className = 'close-cards-list';
    for (const card of this.#cards) {
      const row = document.createElement('label');
      row.className = 'close-cards-row';
      row.innerHTML = `
        <input type="checkbox" data-action="toggleCard" data-message-id="${escapeHtml(card.messageId)}" checked>
        <span class="close-cards-type">${escapeHtml(card.type)}</span>
        <span class="close-cards-actor">${escapeHtml(card.actor)}</span>
        <span class="close-cards-time">${escapeHtml(card.timestamp)}</span>
      `;
      list.appendChild(row);
    }
    container.appendChild(list);

    // Footer buttons
    const footer = document.createElement('div');
    footer.className = 'close-cards-footer';
    footer.innerHTML = `
      <button type="button" data-action="closeSelected" class="bright">${t('COC7QOL.CloseAllCards.Button.CloseSelected')}</button>
      <button type="button" data-action="cancel">${t('COC7QOL.CloseAllCards.Button.Cancel')}</button>
    `;
    container.appendChild(footer);

    return container;
  }

  _replaceHTML (result, content, options) {
    content.replaceChildren(result);
  }

  #getSelectedMessageIds () {
    const checkboxes = this.element.querySelectorAll('.close-cards-row input[type="checkbox"]:checked');
    return Array.from(checkboxes).map(cb => cb.dataset.messageId);
  }

  #updateCloseButton () {
    const anyChecked = this.element.querySelector('.close-cards-row input[type="checkbox"]:checked');
    const closeBtn = this.element.querySelector('[data-action="closeSelected"]');
    if (closeBtn) closeBtn.disabled = !anyChecked;
  }

  #updateToggleAll () {
    const allCheckboxes = this.element.querySelectorAll('.close-cards-row input[type="checkbox"]');
    const allChecked = Array.from(allCheckboxes).every(cb => cb.checked);
    const toggleAll = this.element.querySelector('[data-action="toggleAll"]');
    if (toggleAll) toggleAll.checked = allChecked;
  }

  static async #handleCloseSelected (event, target) {
    const ids = this.#getSelectedMessageIds();
    if (ids.length === 0) return;

    let closed = 0;
    for (const id of ids) {
      const message = game.messages.get(id);
      if (!message) continue;

      // Strip the card's action buttons from the stored HTML so the re-rendered
      // message matches a card the system closed itself (see card-closing.js).
      // Cards without a Close Card button keep their content as is.
      const update = { 'flags.CoC7.load.cardOpen': false };
      const doc = new DOMParser().parseFromString(message.content, 'text/html');
      if (stripCardControls(doc.body)) update.content = doc.body.innerHTML;

      await message.update(update);
      closed++;
    }

    ui.notifications.info(closed === 1 ? 'COC7QOL.CloseAllCards.Notification.Closed' : 'COC7QOL.CloseAllCards.Notification.ClosedPlural', { format: { count: closed } });
    this.close();
  }

  static #handleCancel (event, target) {
    this.close();
  }

  static #handleToggleAll (event, target) {
    const checked = target.checked;
    const checkboxes = this.element.querySelectorAll('.close-cards-row input[type="checkbox"]');
    checkboxes.forEach(cb => { cb.checked = checked; });
    this.#updateCloseButton();
  }

  static #handleToggleCard (event, target) {
    this.#updateToggleAll();
    this.#updateCloseButton();
  }
}
