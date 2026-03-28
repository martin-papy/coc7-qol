# Item Image Popout — Design Spec

## Overview

The `coc7-qol` FoundryVTT module adds a click-to-view behavior on item sheet images for non-GM players. Clicking the item portrait opens FoundryVTT's built-in `ImagePopout` window showing the full-size image in a draggable, resizable floating window.

## Context

In the CoC7 system, item sheet images (`img[data-edit="img"]`) are wired to open a file picker on click — useful for GMs who want to change the image, but useless for players who cannot edit. Players currently have no way to view item art at full size.

## Module Structure

```
coc7-qol/
├── module.json              # Module manifest
└── scripts/
    └── item-image-popout.js # Single ES module with hook registration
```

## module.json

- **id:** `coc7-qol`
- **title:** `CoC7 QoL Improvements`
- **system:** `CoC7` (only activates when the CoC7 system is active)
- **compatibility:** minimum FoundryVTT v12, verified v13
- **esmodules:** `["scripts/item-image-popout.js"]`

## Behavior

### Hook

`renderItemSheet` — fires for every item sheet type in CoC7.

### Target Element

`img[data-edit="img"]` within the rendered sheet HTML.

This selector was chosen over class-based selectors (`.photo`, `.profile`, `.profile-img`) because all CoC7 item sheet templates use the `data-edit="img"` attribute on their portrait image, regardless of which CSS class they use.

### Guard

Only activates when `game.user.isGM` is `false`.

### Non-GM Behavior

1. Find `img[data-edit="img"]` in the rendered sheet HTML element.
2. Remove the `data-edit="img"` attribute so Foundry's built-in file picker handler does not intercept the click.
3. Set `cursor: pointer` on the image to indicate it is clickable.
4. Attach a click handler that calls:
   ```js
   new ImagePopout(img.getAttribute("src"), { title: sheet.object.name }).render(true);
   ```

### GM Behavior

Unchanged. The GM retains the default file picker behavior provided by FoundryVTT core.

## Scope

### Included (all item sheets)

Weapons, spells, books, skills, armor, talents, occupations, archetypes, statuses, setups, experience packages, chases, and the generic item sheet (item-sheetV2).

### Excluded

Actor sheets (characters, NPCs, creatures, vehicles, containers) are not affected.

## Technical Notes

- `ImagePopout` is a built-in FoundryVTT Application class — no external dependencies needed.
- The `renderItemSheet` hook provides `(sheet, html, data)` where `html` is a jQuery object (v12) or HTMLElement (v13) of the rendered sheet. The implementation must handle both.
- No settings or configuration UI is needed for this feature.
