# Implementation Plan: Roll Visibility Controls

## Requirements Restatement

Add a **Roll Visibility** selector directly inside the CoC7 bonus-selection dialog (the dialog that already shows bonus/penalty dice, difficulty, etc.). Players can choose:

- **Public** — visible to all players
- **Private** — visible only to the rolling player + GM (`gmroll`)
- **Blind** — visible only to the GM (`blindroll`)

The selector defaults to whatever is currently set in the core FoundryVTT roll mode setting (backward-compatible). No CoC7 system files are touched — pure hook-based.

---

## Technical Approach

The CoC7 roll dialog is `CoC7RollDialog extends DialogV2`, rendered with CSS class `bonus-selection`. FoundryVTT fires `renderDialogV2` whenever it renders, which we already use for the AI generator feature.

The roll mode flows like this today:

```
CoC7RollDialog.create() → CoC7Check constructor reads core rollMode setting → check.toMessage() → ChatMessage.create()
```

Our injected flow:

```
renderDialogV2 → inject select into bonus-selection dialog
               → capture selected value on OK click → pendingRollMode variable
preCreateChatMessage → apply pendingRollMode via ChatMessage.applyRollMode() → clear variable
```

This avoids monkey-patching any CoC7 method while reliably intercepting 100% of rolls that go through the dialog.

---

## Implementation Phases

### Phase 1 — Create `scripts/roll-visibility.js`

Single self-contained ES module. Responsibilities:

1. **Hook `renderDialogV2`**: check `dialog.options?.classes?.includes('bonus-selection')` to target only CoC7 roll dialogs
2. **Inject UI**: append a `<div class="form-group">` with a `<select name="coc7qol-rollMode">` containing 3 options (Public / Private / Blind); default value = `game.settings.get('core', 'rollMode')`
3. **Capture on OK**: add a capture-phase click listener on the `[data-action="ok"]` button that stores the selected value in a module-level `pendingRollMode` variable
4. **Hook `preCreateChatMessage`**: if `pendingRollMode` is set, call `ChatMessage.applyRollMode(data, pendingRollMode)` then clear the variable

~60 lines total, no external dependencies.

### Phase 2 — Register in `module.json`

Add `"scripts/roll-visibility.js"` to the `esmodules` array.

### Phase 3 — Styling (within the same file)

The injected form group inherits CoC7 dialog styles automatically (`form-group` + the `.coc7.dialog` parent). Add a small inline `<style>` block if the visibility of the selected option needs a visual hint (e.g., color-coding or a FontAwesome icon prefix). Keep it minimal.

---

## Dependencies

- None — uses only existing FoundryVTT globals (`game.settings`, `ChatMessage.applyRollMode`, `Hooks`)
- No new npm packages, no build step

---

## Risks

| Level | Risk | Mitigation |
|-------|------|------------|
| MEDIUM | CoC7 renames the `bonus-selection` CSS class in a future update | Also check for `[name="poolModifier"]` as a secondary signal (bonus dice range input is always present) |
| LOW | CoC7 creates multiple chat messages per roll | If it happens, `preCreateChatMessage` fires multiple times; first call clears `pendingRollMode`, subsequent calls fall through harmlessly |
| LOW | Player opens dialog, doesn't click OK (cancels) | `pendingRollMode` stays null; `preCreateChatMessage` is a no-op |

---

## Estimated Complexity: LOW

- Implementation: ~30 min
- Manual testing in FoundryVTT: ~15 min (test Public / Private / Blind / cancel / multiple rolls in sequence)
- Total: ~45 min
