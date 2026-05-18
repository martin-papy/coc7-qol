# ✨ AI Generation

> Generate CoC7 weapons and NPCs from natural-language descriptions, directly inside FoundryVTT. **GM only.**

The AI Generator lives where you'd naturally be creating content anyway: the standard Create Item / Create Actor dialogs. Pick a supported type, click the sparkle, describe what you want, review what came back, accept. No external app, no copy-pasting, no leaving Foundry.

## Setup

Configure your provider under **Settings → Module Settings → CoC7 QoL Improvements**:

- **Anthropic Claude**
- **OpenAI GPT**
- **Google Gemini**

You provide the API key, endpoint, and model. The module never proxies your traffic — your prompt goes straight from your Foundry client to the provider you chose.

---

## Weapon Generation

1. Open the Items sidebar and click **Create Item**
2. Select **Weapon** as the type — a sparkle icon appears

   ![Create Item dialog with sparkle button](../../images/Create-Weapon-1.png)

3. Click the sparkle, then describe your weapon in plain language (e.g. *"A worn 1920s revolver, .38 calibre, 6-shot cylinder, wood grip"*)
4. Click **Generate** — the module calls your configured LLM and fills in all CoC7 weapon fields

   ![Weapon description prompt](../../images/Create-Weapon-2.png)

5. Review the stats (name, damage, skill, range, ammo…), edit the name if needed, then click **Accept**

   ![Review Weapon dialog showing generated .44 Magnum stats](../../images/Create-Weapon-3.png)

6. The item is created in your world and its sheet opens immediately

---

## NPC Generation

1. Open the Actors sidebar and click **Create Actor**
2. Select **NPC** as the type — a sparkle icon appears

   ![Create Actor dialog with sparkle button](../../images/Create-NPC-1.png)

3. Click the sparkle, then describe your NPC in plain language (e.g. *"A nervous pharmacist in 1920s Arkham, middle-aged, hides a laudanum habit"*)
4. Optionally tick **Random characteristics** — the AI returns rulebook dice formulas (e.g. `5*(3d6)`) instead of fixed values, so each characteristic is rolled fresh when the token is dropped on the canvas
5. Click **Generate** — the LLM creates a complete NPC with characteristics, skills, and backstory

   ![NPC description prompt with Random characteristics option](../../images/Create-NPC-2.png)

6. Review the full stat block (STR/CON/SIZ/DEX/APP/INT/POW/EDU), skills list, and narrative (appearance, personality, background), then click **Accept**

   <table><tr>
     <td><img src="../../images/Create-NPC-3a.png" alt="Review NPC dialog — random characteristics"/></td>
     <td><img src="../../images/Create-NPC-3b.png" alt="Review NPC dialog — fixed characteristics"/></td>
   </tr></table>

7. The NPC actor is created with all characteristics set, skills resolved from the CoC7 compendium, weapons and possessions added as items, and narrative text populated in the biography and Keeper notes

### What you get, for free

- **Compendium-matched skills** — wherever possible, skills resolve against the official CoC7 skills compendium so flags and identifiers stay clean. Skills not in the compendium fall back to the system's name-parts guesser.
- **Auto-armed combat NPCs** — if an NPC has a weapon, the matching combat skill is added when missing (e.g. a pocket knife pulls in *Fighting (Brawl)*)
- **Civilian-aware** — combat-role NPCs get armed; civilians default to no weapons, the way you'd expect
- **Derived attributes** — HP, MP, SAN, MOV, Build, Damage Bonus are computed by the system itself, so nothing drifts from the rules
- **Localized prose** — names and narrative follow the configured world language

---

[← Back to README](../../README.md)
