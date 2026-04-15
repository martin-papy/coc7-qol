# Close All Open Cards — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Keeper toolbar button that opens a dialog listing all open CoC7 chat cards, letting the GM select and close them in bulk.

**Architecture:** Single ES module hooks into `getSceneControlButtons` to inject a button into the `coc7menu` group. The button opens an `ApplicationV2` dialog that scans `game.messages` for open cards and presents them as a checkbox list. Closing parses each message's stored HTML to strip the Close Card button, then updates both `content` and `flags.CoC7.load.cardOpen` in a single `message.update()` call to ensure visual and data consistency.

**Tech Stack:** Vanilla JS ES modules, FoundryVTT v13 ApplicationV2 API, FoundryVTT scene controls hook.

**Spec:** `docs/superpowers/specs/2026-04-15-close-all-cards-design.md`

---

### Task 1: Create the close-all-cards module with hook registration

**Files:**
- Create: `scripts/close-all-cards.js`

This task creates the file, registers the `getSceneControlButtons` hook, and injects the button into the existing `coc7menu` control group. No dialog yet — just the button that logs to console on click.

- [ ] **Step 1: Create `scripts/close-all-cards.js` with the hook and button injection**

```js
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
}

function getOpenCards () {
  const open = []
  for (const message of game.messages) {
    const load = message.flags?.CoC7?.load
    if (load?.cardOpen === true) {
      open.push({
        messageId: message.id,
        type: CARD_TYPE_LABELS[load.as] ?? 'Card',
        actor: message.speaker?.alias ?? 'Unknown',
        timestamp: new Date(message.timestamp).toLocaleTimeString()
      })
    }
  }
  return open
}

Hooks.on('getSceneControlButtons', (controls) => {
  const coc7menu = Array.isArray(controls)
    ? controls.find(c => c.name === 'coc7menu')
    : controls.coc7menu
  if (!coc7menu) return

  const tool = {
    button: true,
    icon: 'fa-solid fa-xmarks-lines',
    name: 'coc7-close-all-cards',
    title: 'Close All Cards',
    onChange: () => {
      const openCards = getOpenCards()
      if (openCards.length === 0) {
        ui.notifications.info('No open cards found.')
        return
      }
      new CloseAllCardsDialog(openCards).render(true)
    }
  }

  if (Array.isArray(coc7menu.tools)) {
    coc7menu.tools.push(tool)
  } else {
    coc7menu.tools['coc7-close-all-cards'] = tool
  }
})
```

Note: The `CloseAllCardsDialog` class is defined in Task 2. For now, the `onChange` callback calls `getOpenCards()` and either shows a notification or will open the dialog.

- [ ] **Step 2: Register the module in `module.json`**

Add `"scripts/close-all-cards.js"` to the `esmodules` array in `module.json`. The array should become:

```json
"esmodules": [
  "scripts/item-image-popout.js",
  "scripts/possession-item-image-popout.js",
  "scripts/ai-generator/index.js",
  "scripts/close-all-cards.js"
]
```

- [ ] **Step 3: Manual test — button appears**

1. Launch FoundryVTT, load a world with CoC7 system and coc7-qol module enabled
2. Log in as GM
3. Click the tentacle-strike icon in the scene controls toolbar
4. Verify "Close All Cards" button appears in the menu with the `fa-xmarks-lines` icon
5. Click the button with no open cards — verify "No open cards found." notification appears
6. Log in as a player — verify the button is NOT visible

- [ ] **Step 4: Commit**

```bash
git add scripts/close-all-cards.js module.json
git commit -m "feat: add close-all-cards button to Keeper toolbar"
```

---

### Task 2: Build the ApplicationV2 dialog with card list and checkboxes

**Files:**
- Modify: `scripts/close-all-cards.js`

Add the `CloseAllCardsDialog` class — an `ApplicationV2` subclass that renders a checkbox list of open cards with select/deselect all, and a "Close Selected" button.

- [ ] **Step 1: Add the `CloseAllCardsDialog` class to `scripts/close-all-cards.js`**

Insert this class definition above the `Hooks.on` call:

```js
class CloseAllCardsDialog extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    tag: 'div',
    window: { title: 'Close All Cards' },
    position: { width: 420, height: 'auto' },
    actions: {
      closeSelected: CloseAllCardsDialog.#handleCloseSelected,
      cancel: CloseAllCardsDialog.#handleCancel,
      toggleAll: CloseAllCardsDialog.#handleToggleAll,
      toggleCard: CloseAllCardsDialog.#handleToggleCard
    }
  }

  #cards

  constructor (cards, options = {}) {
    super(options)
    this.#cards = cards
  }

  async _renderHTML (context, options) {
    const container = document.createElement('div')
    container.className = 'coc7-qol-close-all-cards'

    // Header with count and select-all
    const header = document.createElement('div')
    header.className = 'close-cards-header'
    header.innerHTML = `
      <label class="close-cards-toggle-all">
        <input type="checkbox" data-action="toggleAll" checked>
        <strong>${this.#cards.length} open card${this.#cards.length === 1 ? '' : 's'}</strong>
      </label>
    `
    container.appendChild(header)

    // Card list
    const list = document.createElement('div')
    list.className = 'close-cards-list'
    for (const card of this.#cards) {
      const row = document.createElement('label')
      row.className = 'close-cards-row'
      row.innerHTML = `
        <input type="checkbox" data-action="toggleCard" data-message-id="${card.messageId}" checked>
        <span class="close-cards-type">${card.type}</span>
        <span class="close-cards-actor">${card.actor}</span>
        <span class="close-cards-time">${card.timestamp}</span>
      `
      list.appendChild(row)
    }
    container.appendChild(list)

    // Footer buttons
    const footer = document.createElement('div')
    footer.className = 'close-cards-footer'
    footer.innerHTML = `
      <button type="button" data-action="closeSelected" class="bright">Close Selected</button>
      <button type="button" data-action="cancel">Cancel</button>
    `
    container.appendChild(footer)

    return container
  }

  _replaceHTML (result, content, options) {
    content.replaceChildren(result)
  }

  #getSelectedMessageIds () {
    const checkboxes = this.element.querySelectorAll('.close-cards-row input[type="checkbox"]:checked')
    return Array.from(checkboxes).map(cb => cb.dataset.messageId)
  }

  #updateCloseButton () {
    const anyChecked = this.element.querySelector('.close-cards-row input[type="checkbox"]:checked')
    const closeBtn = this.element.querySelector('[data-action="closeSelected"]')
    if (closeBtn) closeBtn.disabled = !anyChecked
  }

  #updateToggleAll () {
    const allCheckboxes = this.element.querySelectorAll('.close-cards-row input[type="checkbox"]')
    const allChecked = Array.from(allCheckboxes).every(cb => cb.checked)
    const toggleAll = this.element.querySelector('[data-action="toggleAll"]')
    if (toggleAll) toggleAll.checked = allChecked
  }

  static async #handleCloseSelected (event, target) {
    const ids = this.#getSelectedMessageIds()
    if (ids.length === 0) return

    let closed = 0
    for (const id of ids) {
      const message = game.messages.get(id)
      if (!message) continue

      // Strip the Close Card button from the stored HTML so the
      // re-rendered message reflects the closed state visually.
      const parser = new DOMParser()
      const doc = parser.parseFromString(message.content, 'text/html')
      doc.querySelectorAll('button[data-action="toggleValue"][data-set="cardOpen"]').forEach(btn => {
        const container = btn.closest('.coc7-card-buttons')
        if (container && container.querySelectorAll('button').length === 1) {
          container.remove()
        } else {
          btn.remove()
        }
      })
      const newContent = doc.body.innerHTML

      await message.update({
        content: newContent,
        'flags.CoC7.load.cardOpen': false
      })
      closed++
    }

    ui.notifications.info(`Closed ${closed} card${closed === 1 ? '' : 's'}.`)
    this.close()
  }

  static #handleCancel (event, target) {
    this.close()
  }

  static #handleToggleAll (event, target) {
    const checked = target.checked
    const checkboxes = this.element.querySelectorAll('.close-cards-row input[type="checkbox"]')
    checkboxes.forEach(cb => { cb.checked = checked })
    this.#updateCloseButton()
  }

  static #handleToggleCard (event, target) {
    this.#updateToggleAll()
    this.#updateCloseButton()
  }
}
```

- [ ] **Step 2: Add inline styles to the dialog**

Add a `style` element in `_renderHTML` before the return, after the footer is appended. Insert this before the `return container` line:

```js
    const style = document.createElement('style')
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
    `
    container.appendChild(style)
```

- [ ] **Step 3: Manual test — dialog functionality**

1. As GM, trigger several skill checks, san checks, and/or combat rolls to create open cards in chat
2. Click the "Close All Cards" button in the Keeper toolbar
3. Verify the dialog opens showing the correct count and lists each open card
4. Verify each card shows its type, actor name, and timestamp
5. Test the "Select All" checkbox — toggling it on/off should check/uncheck all cards
6. Test unchecking a single card — "Select All" should uncheck; "Close Selected" should remain enabled
7. Test unchecking all cards — "Close Selected" should become disabled
8. Select a subset of cards, click "Close Selected" — verify only those cards close in chat (buttons disappear, "Card Resolved" tag appears)
9. Re-open the dialog — verify the remaining open cards still appear
10. Click "Cancel" — verify nothing happens and the dialog closes

- [ ] **Step 4: Commit**

```bash
git add scripts/close-all-cards.js
git commit -m "feat: add card selection dialog for close-all-cards"
```

---

### Task 3: Final integration and cleanup

**Files:**
- Modify: `scripts/close-all-cards.js` (if any issues found during testing)
- Verify: `module.json`

This task is the final round of end-to-end testing and any polish needed.

- [ ] **Step 1: End-to-end test — full workflow**

1. Start a fresh FoundryVTT session as GM with CoC7 + coc7-qol
2. Create a mix of card types: skill checks, san checks, melee combat, opposed rolls
3. Close some cards manually using the system's own "Close Card" button
4. Open the "Close All Cards" dialog — verify only genuinely open cards appear
5. Select all, click "Close Selected" — verify all cards close
6. Open the dialog again — verify "No open cards found." notification appears
7. Verify the chat log renders correctly with all cards in resolved state

- [ ] **Step 2: Test as player**

1. Log in as a player
2. Verify the Keeper toolbar's tentacle-strike icon does not show the "Close All Cards" button (the entire `coc7menu` is GM-only)

- [ ] **Step 3: Commit if any fixes were made**

```bash
git add scripts/close-all-cards.js
git commit -m "fix: close-all-cards polish from integration testing"
```

Only commit if changes were made. Skip this step if no fixes were needed.
