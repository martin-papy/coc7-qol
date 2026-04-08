# CoC7 8.x Compatibility — Design Spec

**Date:** 2026-04-08  
**Module version:** 0.2.0  
**Affects:** `scripts/item-image-popout.js`, `module.json`

## Problem

CoC7 system 8.x migrated all item sheets from ApplicationV1 to ApplicationV2 (FoundryVTT v13 AppV2). This changes the render lifecycle hook from `renderItemSheet` to `renderItemSheetV2` and updates the hook signature. The module's existing `Hooks.on('renderItemSheet', ...)` listener never fires against CoC7 8.x sheets, so the image popout feature is silently broken for all players.

## Root Cause

| Aspect | CoC7 7.x (AppV1) | CoC7 8.x (AppV2) |
|---|---|---|
| Hook name | `renderItemSheet` | `renderItemSheetV2` |
| Hook signature | `(sheet, html, data)` | `(application, element, context, options)` |
| Image attribute | `data-edit="img"` | `data-action="editImage"` + `data-edit="img"` |
| Click dispatch | Foundry file-picker on `data-edit` | AppV2 root action handler on `data-action` |

## Changes

### `scripts/item-image-popout.js`

1. **Hook name:** `renderItemSheet` → `renderItemSheetV2`
2. **Signature:** `(sheet, html, data)` → `(application, element, context, options)`
3. **Guard:** Add `if (!(application instanceof foundry.applications.sheets.ItemSheetV2)) return;` at the top to reject any non-item-sheet AppV2 application that might share the hook.
4. **Selector:** `img[data-edit="img"]` → `img[data-action="editImage"]` (AppV2-idiomatic; all CoC7 8.x item templates use this attribute).
5. **Attribute removal:** Remove `data-action` (not `data-edit`) to prevent the AppV2 root action dispatcher from intercepting the click. Keep `stopPropagation` as a belt-and-suspenders guard.
6. **Popout API:** `foundry.applications.apps.ImagePopout` is unchanged — already targeting AppV2 popout.

### `module.json`

- `version`: `0.1.0` → `0.2.0`
- CoC7 system `minimum`: `7.24` → `8.0`
- CoC7 system `verified`: `7.24` → `8.1`
- `download` URL: update tag from `v0.1.0` → `v0.2.0`

## Out of Scope

- CoC7 7.x backward compatibility (intentionally dropped)
- FoundryVTT v12 support (already dropped in 0.1.0)
- Any other features beyond the image popout

## Testing

Manual test in a FoundryVTT v13 instance with CoC7 8.1:
- As a player (non-GM): open any item sheet → clicking the item image opens `ImagePopout`
- As a GM: opening an item sheet makes no change (GM guard still active, file picker works normally)
- Verify no JS errors in browser console on sheet open
