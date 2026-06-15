// scripts/ai-generator/mappers/npc.js
// NPC mapper — converts LLM output into CoC7 NPC actor data.
// Skill resolution (compendium lookup) is handled by resolveSkills() called from the injector
// after the mapper produces the base actor data.

import { escapeHtml } from '../../utils.js'
import { loadPrompt } from '../prompts/loader.js'
import weaponMapper from './weapon.js'

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
  async buildSystemPrompt () {
    return loadPrompt('npc-system-prompt')
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
