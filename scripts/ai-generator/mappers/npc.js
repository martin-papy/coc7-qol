// scripts/ai-generator/mappers/npc.js
// NPC mapper — converts LLM output into CoC7 NPC actor data.
// Skill resolution (compendium lookup) is handled by resolveSkills() called from the injector
// after the mapper produces the base actor data.

import { escapeHtml } from '../../utils.js'
import weaponMapper from './weapon.js'

const SYSTEM_PROMPT = `You are a Call of Cthulhu 7th Edition game master assistant. Generate a CoC7 NPC based on the user's description.

The NPC should be a believable person with enough depth to be credible in a tabletop RPG session. Pick characteristics, skills, and narrative details that are internally consistent with the described occupation, age, and personality.

Respond with ONLY a valid JSON object. No explanation, no markdown fences, no extra text — raw JSON only.

LANGUAGE RULES:
- Write the free-text narrative fields (physicalDescription, personalityTraits, background, and weapons[].description / possessions[].description) in the SAME LANGUAGE as the user's prompt. If the user wrote in French, write these fields in French. Same for Spanish, German, Japanese, etc.
- The "name" field should be culturally appropriate for the setting/era (use your judgement).
- KEEP THE FOLLOWING IN ENGLISH regardless of prompt language:
  - "occupation" (required for system lookups)
  - every entry in skills[].name (required for compendium lookup — use the official CoC7 English skill names exactly)
- Weapon and possession "name" fields should typically be in English for canonical items (e.g. "Colt 1911", "Pocket notebook"), but use your judgement for culturally specific items.
- If the prompt is mixed-language, pick the dominant language. If the prompt is very short (e.g. "a doctor"), default to English.

Required fields (must always be present):
- name: string — full name of the NPC (language: culturally appropriate, per LANGUAGE RULES above)
- characteristics: object with all 8 integer values:
  - str, con, siz, dex, app, int, pow, edu
  - Values range 15–90 for a typical human, consistent with CoC7 3d6×5 / (2d6+6)×5 generation
  - Calibrate to occupation and age (e.g. elderly librarian: high EDU/INT, lower STR/DEX)
- skills: array of { "name": string, "value": number } — pick skills that fit the character naturally
  - Use official CoC7 skill names (e.g. "Library Use", "Spot Hidden", "Fighting (Brawl)", "Firearms (Handgun)", "Psychology", "Persuade", "First Aid", "Medicine", "Drive Auto", "Dodge", "Listen", "Stealth", "Science (Chemistry)")
  - For specializations use the format "Category (Specialization)" e.g. "Art/Craft (Painting)", "Science (Pharmacy)", "Language (French)"
  - Values 1–99 as percentages
  - Include whatever skills make sense for the character — typically 5–12 skills

Optional fields (include when relevant, omit if not applicable):
- occupation: string — the NPC's job or role, ALWAYS in English (used for system lookup; e.g. "Pharmacist", "Dockworker", "Professor")
- age: number — age in years
- physicalDescription: string — 1-2 sentences describing appearance
- personalityTraits: string — 1-2 sentences describing personality and demeanour
- background: string — 2-3 sentences of relevant background, hooks, or secrets useful to a GM
- weapons: array of weapon objects (0–3 typical, may be omitted entirely for non-combatants). Each weapon:
  - name: string (required) — the weapon name
  - damage: string (required) — dice expression (e.g. "1d8", "1d6+1", "1d10+db")
  - skill: string (required) — the CoC7 skill name (e.g. "Firearms (Handgun)", "Fighting (Brawl)", "Throw")
  - description: string (optional) — flavour text
  - range: integer or null (optional) — effective range as a plain integer with NO unit (e.g. 15, 30); null for melee
  - usesPerRound: integer or string (optional) — BASE attacks per round, just a plain number (e.g. 1, 2). Do NOT use parentheses or burst ranges here.
  - usesPerRoundMax: integer or null (optional) — maximum attacks per round when faster than base (e.g. 3 quick shots from a revolver); null when not applicable
  - bullets: number or null (optional) — magazine/cylinder capacity; null for non-firearms
  - malfunction: number or null (optional) — malfunction threshold 96–100; null for non-firearms
  - properties: object with boolean flags (optional): rngd (ranged), impl (impaling), addb (adds full damage bonus), ahdb (adds half damage bonus)
- possessions: array of possession objects (3–8 typical; may be empty or sparse for situational NPCs). Each possession:
  - name: string (required) — the item name
  - description: string (optional) — short flavour text
  - quantity: integer (optional, default 1) — positive integer

EQUIPMENT GUIDANCE:
- Add 0–3 weapons and 3–8 possessions, all consistent with the NPC's occupation, age, era, and personality.
- A pacifist librarian likely has 0 weapons; a 1920s detective might have a revolver and a few notebooks; a cultist might carry ritual items. Use your judgement.
- For EVERY weapon you include, you MUST also list its "skill" name inside skills[] with a value appropriate to the character (e.g. a thug with a knife → "Fighting (Brawl)" at 50–70; a soldier with a rifle → "Firearms (Rifle/Shotgun)" at 60+). If you forget, a generic default will be auto-added, but it won't reflect the character's actual competence.`

const REQUIRED_CHARACTERISTICS = ['str', 'con', 'siz', 'dex', 'app', 'int', 'pow', 'edu']

const WEAPON_SKILL_FALLBACK_VALUE = 20

export const CHARACTERISTIC_FORMULAS = {
  str: '5*(3d6)',
  con: '5*(3d6)',
  dex: '5*(3d6)',
  app: '5*(3d6)',
  pow: '5*(3d6)',
  int: '5*(2d6+6)',
  siz: '5*(2d6+6)',
  edu: '5*(2d6+6)'
}

export function applyRandomCharacteristics (npcData) {
  const chars = npcData?.actorData?.system?.characteristics
  if (!chars) return npcData
  const newChars = { ...chars }
  for (const [key, formula] of Object.entries(CHARACTERISTIC_FORMULAS)) {
    newChars[key] = { formula, value: 0 }
  }
  return {
    ...npcData,
    randomCharacteristics: true,
    actorData: {
      ...npcData.actorData,
      system: {
        ...npcData.actorData.system,
        characteristics: newChars
      }
    }
  }
}

export default {
  buildSystemPrompt () {
    return SYSTEM_PROMPT
  },

  validate (data) {
    const errors = []

    if (!data.name) errors.push('name')

    if (!data.characteristics || typeof data.characteristics !== 'object') {
      errors.push('characteristics')
    } else {
      const missing = REQUIRED_CHARACTERISTICS.filter(c => typeof data.characteristics[c] !== 'number')
      if (missing.length) errors.push(`characteristics.${missing.join(', characteristics.')}`)
    }

    if (!Array.isArray(data.skills) || data.skills.length === 0) {
      errors.push('skills (must be a non-empty array)')
    }

    if (errors.length) {
      throw new Error(`LLM response missing required fields: ${errors.join(', ')}`)
    }
  },

  toFoundryData (data) {
    const personalityHtml = data.personalityTraits
      ? `<p><strong>Personality:</strong> ${escapeHtml(data.personalityTraits)}</p>`
      : ''
    const backgroundHtml = data.background
      ? `<p><strong>Background:</strong> ${escapeHtml(data.background)}</p>`
      : ''

    const warnings = []
    const weaponsData = this._validateAndMapWeapons(data.weapons, warnings)
    const possessionsData = this._mapPossessions(data.possessions)
    const skillsRaw = this._ensureWeaponSkills(data.skills, weaponsData, warnings)

    return {
      actorData: {
        name: data.name,
        type: 'npc',
        system: {
          characteristics: {
            str: { value: data.characteristics.str },
            con: { value: data.characteristics.con },
            siz: { value: data.characteristics.siz },
            dex: { value: data.characteristics.dex },
            app: { value: data.characteristics.app },
            int: { value: data.characteristics.int },
            pow: { value: data.characteristics.pow },
            edu: { value: data.characteristics.edu }
          },
          infos: {
            occupation: data.occupation ?? '',
            age: String(data.age ?? ''),
            type: '',
            organization: ''
          },
          biography: {
            personalDescription: { value: escapeHtml(data.physicalDescription) }
          },
          description: {
            keeper: personalityHtml + backgroundHtml
          }
        }
      },
      skillsRaw,
      weaponsData,
      possessionsData,
      warnings,
      llmData: data
    }
  },

  async resolveSkills (skillsRaw) {
    const pack = game.packs.get('CoC7.skills')
    let compendiumIndex = null
    if (pack) {
      // Load the full index so we can search by name
      compendiumIndex = await pack.getIndex()
    }

    const resolved = []
    for (const { name, value } of skillsRaw) {
      const normalized = name.trim().replace(/\s+/g, ' ')
      const skillData = await this._resolveOneSkill(normalized, value, pack, compendiumIndex)
      if (skillData) resolved.push(skillData)
    }
    return resolved
  },

  async _resolveOneSkill (skillName, targetValue, pack, compendiumIndex) {
    // Attempt compendium lookup
    if (compendiumIndex) {
      const match = compendiumIndex.find(
        entry => entry.name.toLowerCase() === skillName.toLowerCase()
      )
      if (match && pack) {
        const doc = await pack.getDocument(match._id)
        if (doc) {
          const data = doc.toObject()
          // Set adjustments.personal to the target value so personal alone determines the skill value
          data.system.adjustments = data.system.adjustments ?? {}
          data.system.adjustments.personal = targetValue
          // Zero out other adjustment fields so the total is deterministic
          data.system.adjustments.base = 0
          data.system.adjustments.occupation = 0
          data.system.adjustments.experience = 0
          data.system.adjustments.archetype = 0
          data.system.adjustments.experiencePackage = 0
          // Remove _id so Foundry creates a new embedded document
          delete data._id
          return data
        }
      }
    }

    // Fallback: create a fresh skill item using CoC7's name parser
    const nameParts = CONFIG.Item.dataModels.skill.guessNameParts(skillName)
    return {
      name: nameParts.name,
      type: 'skill',
      system: {
        skillName: nameParts.system.skillName,
        specialization: nameParts.system.specialization,
        properties: {
          ...nameParts.system.properties,
          push: !(nameParts.system.properties.fighting || nameParts.system.properties.firearm || nameParts.system.properties.ranged)
        },
        adjustments: {
          personal: targetValue,
          base: 0,
          occupation: 0,
          archetype: 0,
          experiencePackage: 0,
          experience: 0
        }
      }
    }
  },

  _ensureWeaponSkills (rawSkills, weaponsData, warnings) {
    const existing = Array.isArray(rawSkills) ? [...rawSkills] : []
    if (!Array.isArray(weaponsData) || weaponsData.length === 0) return existing
    const presentLowercase = new Set(
      existing.map(s => (s?.name ?? '').trim().toLowerCase()).filter(Boolean)
    )
    for (const weapon of weaponsData) {
      const skillName = (weapon?.system?.skill?.main?.name ?? '').trim()
      if (!skillName) continue
      const key = skillName.toLowerCase()
      if (presentLowercase.has(key)) continue
      existing.push({ name: skillName, value: WEAPON_SKILL_FALLBACK_VALUE })
      presentLowercase.add(key)
      warnings.push(`Auto-added skill "${skillName}" at ${WEAPON_SKILL_FALLBACK_VALUE}% (referenced by a weapon but missing from skills)`)
    }
    return existing
  },

  _validateAndMapWeapons (rawWeapons, warnings) {
    if (!Array.isArray(rawWeapons)) return []
    const mapped = []
    for (const raw of rawWeapons) {
      if (!raw || typeof raw !== 'object' || !raw.name) continue  // drop silently
      try {
        weaponMapper.validate(raw)
      } catch (err) {
        warnings.push(`Weapon "${raw.name}": ${err.message}`)
        continue
      }
      mapped.push(weaponMapper.toFoundryData(raw))
    }
    return mapped
  },

  _mapPossessions (rawPossessions) {
    if (!Array.isArray(rawPossessions)) return []
    const mapped = []
    for (const raw of rawPossessions) {
      if (!raw || typeof raw !== 'object' || !raw.name) continue  // drop silently
      const n = Math.floor(Number(raw.quantity))
      const quantity = Number.isFinite(n) && n > 0 ? n : 1
      mapped.push({
        name: raw.name,
        type: 'item',
        system: {
          description: { value: escapeHtml(raw.description ?? '') },
          quantity
        }
      })
    }
    return mapped
  }
}
