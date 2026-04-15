// scripts/close-all-cards.js

const CARD_TYPE_LABELS = {
  CoC7Check: 'Skill/Attribute Check',
  CoC7SanCheckCard: 'Sanity Check',
  CoC7ConCheck: 'Constitution Check',
  CoC7ChatCombatMelee: 'Melee Combat',
  CoC7ChatCombatRanged: 'Ranged Combat',
  CoC7ChatDamage: 'Damage',
  CoC7ChatOpposedMessage: 'Opposed Roll',
  CoC7ChatCombinedMessage: 'Combined Roll',
  CoC7ChatChaseObstacle: 'Chase Obstacle'
};

function getOpenCards () {
  const open = [];
  for (const message of game.messages) {
    const load = message.flags?.CoC7?.load;
    if (load?.cardOpen === true) {
      open.push({
        messageId: message.id,
        type: CARD_TYPE_LABELS[load.as] ?? 'Card',
        actor: message.speaker?.alias ?? 'Unknown',
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
    window: { title: 'Close All Cards' },
    position: { width: 420, height: 'auto' },
    actions: {
      closeSelected: CloseAllCardsDialog.#handleCloseSelected,
      cancel: CloseAllCardsDialog.#handleCancel,
      toggleAll: CloseAllCardsDialog.#handleToggleAll,
      toggleCard: CloseAllCardsDialog.#handleToggleCard
    }
  };

  #cards;

  constructor (cards, options = {}) {
    super(options);
    this.#cards = cards;
  }

  #escapeHtml (str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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
        <strong>${this.#cards.length} open card${this.#cards.length === 1 ? '' : 's'}</strong>
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
        <input type="checkbox" data-action="toggleCard" data-message-id="${this.#escapeHtml(card.messageId)}" checked>
        <span class="close-cards-type">${this.#escapeHtml(card.type)}</span>
        <span class="close-cards-actor">${this.#escapeHtml(card.actor)}</span>
        <span class="close-cards-time">${this.#escapeHtml(card.timestamp)}</span>
      `;
      list.appendChild(row);
    }
    container.appendChild(list);

    // Footer buttons
    const footer = document.createElement('div');
    footer.className = 'close-cards-footer';
    footer.innerHTML = `
      <button type="button" data-action="closeSelected" class="bright">Close Selected</button>
      <button type="button" data-action="cancel">Cancel</button>
    `;
    container.appendChild(footer);

    // Inline styles
    const style = document.createElement('style');
    style.textContent = `
      .coc7-qol-close-all-cards {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        padding: 0.5rem;
      }
      .close-cards-header {
        border-bottom: 1px solid var(--color-border-light-tertiary);
        padding-bottom: 0.5rem;
      }
      .close-cards-toggle-all {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        cursor: pointer;
      }
      .close-cards-list {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        max-height: 300px;
        overflow-y: auto;
      }
      .close-cards-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.25rem;
        cursor: pointer;
        border-radius: 4px;
      }
      .close-cards-row:hover {
        background: var(--color-hover-bg, rgba(0, 0, 0, 0.05));
      }
      .close-cards-type {
        font-weight: bold;
        flex: 0 0 auto;
      }
      .close-cards-actor {
        flex: 1;
        color: var(--color-text-secondary, #666);
      }
      .close-cards-time {
        flex: 0 0 auto;
        font-size: 0.85em;
        color: var(--color-text-secondary, #666);
      }
      .close-cards-footer {
        display: flex;
        flex-direction: row;
        gap: 0.5rem;
        margin-top: 0.5rem;
      }
    `;
    container.appendChild(style);

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
      // Try clicking the system's Close Card button for a full HTML re-render.
      const msgEl = document.querySelector(`li.chat-message[data-message-id="${id}"]`);
      const closeBtn = msgEl?.querySelector('button[data-action="toggleValue"][data-set="cardOpen"]');
      if (closeBtn) {
        closeBtn.click();
      }
      // Always update the flag directly as a safety net.
      const message = game.messages.get(id);
      if (message) {
        await message.update({ 'flags.CoC7.load.cardOpen': false });
        closed++;
      }
    }

    ui.notifications.info(`Closed ${closed} card${closed === 1 ? '' : 's'}.`);
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
    title: 'Close All Cards',
    onChange: () => {
      const openCards = getOpenCards();
      if (openCards.length === 0) {
        ui.notifications.info('No open cards found.');
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
