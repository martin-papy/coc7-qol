// scripts/close-all-cards.js

import { escapeHtml, t, tf } from './utils.js'

// Maps CoC7 card template class names to i18n keys.
// Values are keys — resolved via t() at use-time (game.i18n not available at load time).
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

function getOpenCards () {
  const open = [];
  for (const message of game.messages) {
    const load = message.flags?.CoC7?.load;
    if (load?.cardOpen === true) {
      const typeKey = CARD_TYPE_KEYS[load.as]
      open.push({
        messageId: message.id,
        type: typeKey ? t(typeKey) : t('COC7QOL.CloseAllCards.UnknownCardType'),
        actor: message.speaker?.alias ?? t('COC7QOL.CloseAllCards.UnknownActor'),
        timestamp: new Date(message.timestamp).toLocaleTimeString()
      });
    }
  }
  return open;
}

class CloseAllCardsDialog extends foundry.applications.api.ApplicationV2 {
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

      // Strip the Close Card button from the stored HTML so the
      // re-rendered message reflects the closed state visually.
      const parser = new DOMParser();
      const doc = parser.parseFromString(message.content, 'text/html');
      doc.querySelectorAll('button[data-action="toggleValue"][data-set="cardOpen"]').forEach(btn => {
        // Remove the parent .coc7-card-buttons container if it only held this button.
        const container = btn.closest('.coc7-card-buttons');
        if (container && container.querySelectorAll('button').length === 1) {
          container.remove();
        } else {
          btn.remove();
        }
      });
      const newContent = doc.body.innerHTML;

      await message.update({
        content: newContent,
        'flags.CoC7.load.cardOpen': false
      });
      closed++;
    }

    ui.notifications.info(tf(closed === 1 ? 'COC7QOL.CloseAllCards.Notification.Closed' : 'COC7QOL.CloseAllCards.Notification.ClosedPlural', { count: closed }));
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

Hooks.on('getSceneControlButtons', (controls) => {
  const coc7menu = Array.isArray(controls)
    ? controls.find(c => c.name === 'coc7menu')
    : controls.coc7menu;
  if (!coc7menu) return;

  const tool = {
    button: true,
    icon: 'fa-solid fa-xmarks-lines',
    name: 'coc7-close-all-cards',
    title: t('COC7QOL.CloseAllCards.Title'),
    onChange: () => {
      const openCards = getOpenCards();
      if (openCards.length === 0) {
        ui.notifications.info(t('COC7QOL.CloseAllCards.Notification.NoCardsFound'));
        return;
      }
      new CloseAllCardsDialog(openCards).render(true);
    }
  };

  if (Array.isArray(coc7menu.tools)) {
    coc7menu.tools.push(tool);
  } else {
    coc7menu.tools['coc7-close-all-cards'] = tool;
  }
});
