# CoC7 QoL Improvements

A companion module for the [Call of Cthulhu 7th Edition](https://github.com/Miskatonic-Investigative-Society/CoC7-FoundryVTT) system on [FoundryVTT](https://foundryvtt.com/).

## Features

### AI Weapon Generator (GM only)

GMs can generate fully-formed CoC7 weapon items from a natural-language description, directly inside FoundryVTT.

1. Click the sparkle icon next to **Create Item** in the Items sidebar
2. Describe your weapon in plain language (e.g. *"A worn 1920s revolver, .38 calibre, 6-shot cylinder, wood grip"*)
3. Click **Generate** — the module calls your configured LLM and fills in all CoC7 weapon fields
4. Review the stats (name, damage, skill, range, ammo…), edit the name if needed, then click **Accept**
5. The item is created in your world and its sheet opens immediately

Supports **Anthropic (Claude)**, **OpenAI (GPT)**, and **Google Gemini**. Configure your provider, API key, endpoint, and model under **Settings → Module Settings → CoC7 QoL Improvements**.

### Item Image Popout

Players can click on any item image (weapons, spells, books, skills, etc.) to view the full-size illustration in a draggable, resizable popout window. GMs retain the default file picker behavior.

### Possession Tab Item Image Popout

Players and GMs can click on the small item icon in the Gear & Cash tab of the character sheet to view the full-size illustration in a popout window. Works for all item types shown in that tab: items, weapons, books, spells, armor, talents, and statuses.

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
- **System:** Call of Cthulhu 7th Edition (CoC7) - v8.x

## License

[MIT](LICENSE)
