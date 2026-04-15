# Close All Open Cards — Design Spec

## Problem

The CoC7 system uses stateful "cards" in the chat log for checks, combat, sanity rolls, and other game mechanics. Each card has a `cardOpen` boolean flag — when open, it displays action buttons for the GM and players. Sometimes an open card blocks new rolls from being initiated.

Currently, the GM must close each card individually by clicking the "Close Card" button on every open card. When many cards accumulate during a session, this becomes tedious and error-prone.

## Solution

Add a "Close All Cards" button to the CoC7 Keeper's scene controls toolbar (the `coc7menu` group). Clicking it opens a confirmation dialog that lists all open cards, lets the GM select which ones to close, and closes them in bulk.

## Architecture

### Approach

Single self-contained ES module (`scripts/close-all-cards.js`) following the existing coc7-qol pattern: register a FoundryVTT hook, inject UI, handle interactions.

### Hook

`getSceneControlButtons` — inject a new button tool into the existing `coc7menu` control group. The `coc7menu` is already `visible: isKeeper` (GM-only), so the button inherits that visibility.

The button is added as a `button: true` tool (non-toggle, fires on click) with an appropriate icon and the `onChange` callback opens the dialog.

### Dialog

A custom `ApplicationV2` subclass that presents the list of open cards with selection controls.

#### Card Discovery

Scan `game.messages` for messages where `message.flags?.CoC7?.load?.cardOpen === true`. This covers all CoC7 card types — they all store state in `flags.CoC7.load`.

#### Dialog Contents

- **Header:** Count of open cards found (e.g., "7 open cards found")
- **Select all / Deselect all:** A master checkbox or toggle at the top
- **Card list:** One row per open card, each with:
  - Checkbox (checked by default)
  - Card type — human-readable name derived from `flags.CoC7.load.as`
  - Actor name — from `message.speaker.alias`
  - Timestamp — relative or absolute from `message.timestamp`
- **Footer buttons:** "Close Selected" (primary) and "Cancel"

#### Card Type Display Names

The `flags.CoC7.load.as` field identifies the card class. Mapping to human-readable names:

| `as` value | Display name |
|---|---|
| `CoC7Check` | Skill/Attribute Check |
| `CoC7SanCheckCard` | Sanity Check |
| `CoC7ConCheck` | Constitution Check |
| `CoC7ChatCombatMelee` | Melee Combat |
| `CoC7ChatCombatRanged` | Ranged Combat |
| `CoC7ChatDamage` | Damage |
| `CoC7ChatOpposedMessage` | Opposed Roll |
| `CoC7ChatCombinedMessage` | Combined Roll |
| `CoC7ChatChaseObstacle` | Chase Obstacle |
| (unknown) | Card |

### Closing Mechanism

For each selected message, parse the stored HTML content, strip the Close Card button (and its `.coc7-card-buttons` container if it's the only button), then update both the content and the flag in a single call:

```js
const parser = new DOMParser();
const doc = parser.parseFromString(message.content, 'text/html');
doc.querySelectorAll('button[data-action="toggleValue"][data-set="cardOpen"]').forEach(btn => {
  const container = btn.closest('.coc7-card-buttons');
  if (container && container.querySelectorAll('button').length === 1) {
    container.remove();
  } else {
    btn.remove();
  }
});
await message.update({
  content: doc.body.innerHTML,
  'flags.CoC7.load.cardOpen': false
});
```

This approach is necessary because the CoC7 system's own close flow uses internal classes with private fields (inaccessible from a companion module) and re-renders the full Handlebars template. Simply updating the flag without updating the HTML `content` leaves the card visually unchanged. Updating both ensures the chat message re-renders correctly via FoundryVTT's document update lifecycle.

**Note:** Programmatically clicking the system's Close Card DOM button was considered but rejected — the CoC7 event handlers are `async` and read `event.currentTarget` after an `await`, which becomes `null` when triggered programmatically.

Updates are issued sequentially (not in parallel) to avoid race conditions with DOM updates.

### Edge Cases

- **No open cards found:** Show a UI notification (`ui.notifications.info`) instead of opening the dialog. No further action needed.
- **Cards closed while dialog is open:** The dialog captures a snapshot of open cards at open time. If a card is closed between dialog open and confirm, the flag update is a no-op (setting `false` to `false`). This is harmless.
- **Permissions:** Only GMs can update chat message flags. The button is only visible to GMs via the `coc7menu` visibility. No additional permission checks needed.
- **Empty selection:** The "Close Selected" button is disabled when no cards are checked, preventing a no-op action.

## File Changes

1. **New file:** `scripts/close-all-cards.js` — hook registration + ApplicationV2 dialog class
2. **Edit:** `module.json` — add `scripts/close-all-cards.js` to the `esmodules` array

## Testing

Manual testing in a running FoundryVTT instance with CoC7 system:

1. As GM, create several check cards (skill checks, san checks, combat) in chat
2. Verify the "Close All Cards" button appears in the Keeper's scene controls menu
3. Click it — verify the dialog lists all open cards with correct types and actor names
4. Test select all / deselect all toggle
5. Test closing a subset of cards
6. Test closing all cards
7. Verify closed cards no longer show action buttons in chat
8. Verify clicking the button with no open cards shows a notification
9. Verify the button is not visible when logged in as a player
