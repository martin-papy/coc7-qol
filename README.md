# CoC7 QoL Improvements

 A module for the Call of Cthulhu 7th Edition (CoC7) system on FoundryVTT. Adds easy setting of dice roll visibility, image popouts, AI-powered weapon and NPC generation, and bulk card management for GMs.

## What's inside

| Feature | What it does | For |
|---|---|---|
| [🎲 Roll Visibility Selector](#-roll-visibility-selector) | Easily pick public / private / blind per roll — and remember your last choice | Everyone |
| [🗂️ Close All Cards](#-close-all-cards) | Sweep stale chat cards out of the way in one click | GM |
| [🖼️ Item Image Popouts](#-item-image-popouts) | Click any item portrait to see it full size, draggable, resizable | Everyone |
| [✨ AI Generation](#-ai-generation) | Conjure fully-statted weapons and NPCs from a one-line description | GM |

---

## 🎲 Roll Visibility Selector

The CoC7 bonus/penalty dialog now sports a **visibility** dropdown — public, private, or blind. Makes the use Private/Blind rolls way easier. Your last choice sticks per user and is preserved across the standby.

Small change. Big difference once you've made fifty rolls in a session.

![Roll Visibility Selector](images/Roll-Visibility.png)

[**Read more →**](docs/features/roll-visibility.md)

---

## 🗂️ Close All Cards

Open the Keeper's toolbar (the tentacle-strike icon), click **Close All Cards**, and pick exactly which lingering chat cards to dismiss — listed by type, actor, and timestamp. Particularly useful when accumulated open cards start blocking new rolls.

![Close All Cards selection dialog](images/Close-Cards-2.png)

[**Read more →**](docs/features/close-all-cards.md)

---

## 🖼️ Item Image Popouts

Players can finally click on an item's portrait and see the actual art — no GM-only file picker getting in the way. Works on the item sheet itself and on the small icons in the Gear & Cash tab. GMs keep their default editing behavior where it makes sense.

![Item image popout from the Gear & Cash tab](images/Popup-Image.png)

[**Read more →**](docs/features/item-image-popouts.md)

---

## ✨ AI Generation

Open the Create Item dialog, pick **Weapon**, and a sparkle icon appears. Type *"A worn 1920s revolver, .38 calibre, 6-shot cylinder, wood grip"* and get a fully-statted CoC7 weapon back — skill, damage, range, ammo, malfunction. Or pick **NPC** in the Create Actor dialog and describe a character (*"A nervous pharmacist in 1920s Arkham, middle-aged, hides a laudanum habit"*) to get the full stat block, skills resolved against the official CoC7 compendium, weapons, possessions, biography, and Keeper notes — ready to drop on the canvas.

Plug in your own key for **Anthropic Claude**, **OpenAI GPT**, or **Google Gemini** under **Settings → Module Settings → CoC7 QoL Improvements**. Your prompt goes straight to the provider you chose — the module doesn't proxy your traffic.

![Generated weapon stats](images/Create-Weapon-3.png)

[**Read the full walkthrough →**](docs/features/ai-generation.md)

---

## Internationalization

All user-visible strings flow through FoundryVTT's i18n system. Currently shipping with:

- **English** (en)
- **Français** (fr)

Dialogs, buttons, settings, and notifications follow your configured Foundry language. PRs for additional languages are very welcome.

## Installation

### From FoundryVTT

1. Go to **Settings > Manage Modules > Install Module**
2. Paste the manifest URL:
   ```
   https://github.com/martin-papy/coc7-qol/releases/latest/download/module.json
   ```
3. Click **Install**

### Manual

1. Download the latest release from the [Releases](https://github.com/martin-papy/coc7-qol/releases) page
2. Extract into your `Data/modules/` directory
3. Restart FoundryVTT

## Compatibility

- **FoundryVTT:** v13+
- **System:** Call of Cthulhu 7th Edition (CoC7) — v8.x

## License

[MIT](LICENSE)
