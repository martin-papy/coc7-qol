# Possession Tab Item Image Popout

**Date:** 2026-04-08
**Status:** Approved

## Overview

Players and GMs can click the small item icon in the Gear & Cash (Possession) tab of the CoC7 investigator sheet to open a full-size image popout. This complements the existing `item-image-popout.js` feature, which handles the item's own sheet header image.

## Context

The Possession tab renders each inventory entry (items, weapons, books, spells, armor, talents, statuses) as:

```html
<li class="item flexrow" data-item-uuid="{{item.uuid}}">
  <div class="item-image" style="background-image: url('...')"></div>
  <div class="item-name show-detail">...</div>
  <div class="item-controls">...</div>
</li>
```

The `.item-image` div has no existing click behaviour — it is purely decorative. The `.item-name.show-detail` div has existing click (summary toggle) and double-click (edit sheet) handlers; these are unaffected.

## Hook & Guard

- **Hook:** `renderActorSheetV2` — fires for all AppV2 actor sheets; cascades through the CoC7 class hierarchy, so covers `CoC7ModelsActorCharacterSheetV2`, `CoC7ModelsActorCharacterSheetV3`, and their summarized variants automatically.
- **Guard:** `application instanceof foundry.applications.sheets.ActorSheetV2` (safety) + `application.document.type === 'character'` (skip NPC sheets).
- **No GM guard** — both GM and players get the behaviour.

## Behaviour

For each `div.item-image` inside `.inventory`:

1. Set `cursor: pointer` so the element signals interactivity.
2. On click: resolve the item via `fromUuid(li.dataset.itemUuid)`, then open:
   ```js
   new foundry.applications.apps.ImagePopout({
     src: item.img,
     window: { title: item.name }
   }).render(true)
   ```

`fromUuid` is used (rather than parsing the CSS `background-image` string) because it is cleaner, handles URL-encoded paths, and is consistent with how CoC7 itself resolves items from the same `data-item-uuid` attribute.

## Files

| File | Change |
|---|---|
| `scripts/possession-item-image-popout.js` | New — contains the hook registration |
| `module.json` | Add new file to `esmodules` array |

The new file is self-contained and does not share state with `scripts/item-image-popout.js`.

## Out of Scope

- NPC actor sheets (guarded out by `document.type === 'character'`)
- Modifying CoC7 templates
- Any behaviour on the item label or action buttons
