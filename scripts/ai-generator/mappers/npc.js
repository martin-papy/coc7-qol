// NPC mapper — converts LLM output into CoC7 NPC actor data.
// Skill resolution (compendium lookup) is handled by resolveSkills() called from the injector
// after the mapper produces the base actor data.

import { escapeHtml } from '../../utils.js'
import { loadPrompt } from '../prompts/loader.js'
import weaponMapper from './weapon.js'
import { SKILL_TIER_KEYS } from '../skill-tiers.js'

const REQUIRED_CHARACTERISTICS = ['str', 'con', 'siz', 'dex', 'app', 'int', 'pow', 'edu']

// 25 is the highest base value among weapon skills (Fighting (Brawl) 25,
// Firearms (Rifle/Shotgun) 25), so this fallback is at or above base for every
// weapon skill. A CoC7 skill may never sit below its base value; the previous
// 20 was illegal for a brawler.
const WEAPON_SKILL_FALLBACK_VALUE = 25

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

/**
 * Resolve a CoC7 skill's base value. `system.base` is either a plain number
 * ("25"), a characteristic reference ("@EDU"), or an expression over one
 * ("1/2*@DEX"). Mirrors the system's own approach at
 * ../CoC7-FoundryVTT-8.x/coc7/apps/utilities.js:995-1021 — substitute @terms
 * from the characteristics, then evaluate and floor.
 *
 * Returns 0 for an absent or unresolvable base, so an unknown formula degrades
 * to "the LLM's value stands" rather than throwing.
 *
 * @param {string|number|undefined} base
 * @param {object} characteristics lowercase-keyed, e.g. { dex: 54, edu: 55 }
 * @returns {Promise<number>}
 */
async function resolveBaseValue (base, characteristics) {
  const raw = String(base ?? '').trim()
  if (raw === '') return 0
  const chars = characteristics ?? {}
  let unresolved = false
  const substituted = raw.replace(/@([a-z.0-9_-]+)/gi, (_match, term) => {
    const value = chars[term.toLowerCase()]
    if (typeof value !== 'number') { unresolved = true; return '0' }
    return String(value)
  })
  if (unresolved) return 0
  try {
    const roll = await new Roll(`(${substituted})`).evaluate()
    const total = Math.floor(Number(roll.total))
    return Number.isFinite(total) && total > 0 ? total : 0
  } catch (err) {
    return 0
  }
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

    if (!SKILL_TIER_KEYS.includes(data.expertiseTier)) {
      errors.push(`expertiseTier (must be one of: ${SKILL_TIER_KEYS.join(', ')})`)
    }

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
    const skillsRaw = this._tagNativeLanguage(
      this._ensureWeaponSkills(data.skills, weaponsData, warnings),
      data.nativeLanguage,
      warnings
    )

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

  async resolveSkills (skillsRaw, characteristics) {
    const pack = game.packs.get('CoC7.skills')
    let compendiumIndex = null
    if (pack) {
      // Load the full index so we can search by name
      compendiumIndex = await pack.getIndex()
    }

    const resolved = []
    for (const { name, value, own } of skillsRaw) {
      const normalized = name.trim().replace(/\s+/g, ' ')
      const skillData = await this._resolveOneSkill(normalized, value, pack, compendiumIndex, own === true, characteristics)
      if (skillData) resolved.push(skillData)
    }
    return resolved
  },

  async _resolveOneSkill (skillName, targetValue, pack, compendiumIndex, isNativeLanguage = false, characteristics = {}) {
    // The mother tongue is built from the `Language (Own)` template, then named.
    // keepbasevalue is true on that template, so `base` stays '@EDU' — CoC7
    // clears the naming flags once a concrete language is chosen.
    if (isNativeLanguage && pack && compendiumIndex) {
      const template = compendiumIndex.find(
        entry => entry.name.toLowerCase() === 'language (own)'
      )
      const templateDoc = template ? await pack.getDocument(template._id) : null
      if (templateDoc) {
        const data = templateDoc.toObject()
        const parts = CONFIG.Item.dataModels.skill.guessNameParts(skillName)
        data.name = parts.name
        data.system.skillName = parts.system.skillName
        data.system.specialization = parts.system.specialization
        data.system.properties = {
          ...data.system.properties,
          requiresname: false,
          picknameonly: false,
          keepbasevalue: false,
          own: true
        }
        const nativeBase = await resolveBaseValue(data.system.base, characteristics)
        data.system.base = String(nativeBase)
        data.system.adjustments = {
          personal: Math.max(0, targetValue - nativeBase),
          base: nativeBase,
          occupation: 0,
          archetype: 0,
          experiencePackage: 0,
          experience: 0
        }
        foundry.utils.setProperty(
          data,
          'flags.CoC7.cocidFlag.id',
          'i.skill.' + parts.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
        )
        delete data._id
        return data
      }
    }

    // Attempt compendium lookup
    if (compendiumIndex) {
      const match = compendiumIndex.find(
        entry => entry.name.toLowerCase() === skillName.toLowerCase()
      )
      if (match && pack) {
        const doc = await pack.getDocument(match._id)
        if (doc) {
          const data = doc.toObject()
          // Resolve the skill's base from the LLM's own characteristics and store
          // only the trained excess, so base + personal equals the LLM's value
          // regardless of whether CoC7 re-resolves the base on creation. Pin
          // system.base to the resolved number too — CoC7 re-resolves it against
          // the actor's OWN characteristics at embed time, which under the
          // random-characteristics option are 0 until a token is dropped, so an
          // unpinned "@DEX"-style formula would evaluate to 0 there. Pinning
          // makes that re-resolution a no-op regardless of what the actor's
          // characteristics happen to be.
          const resolvedBase = await resolveBaseValue(data.system.base, characteristics)
          data.system.base = String(resolvedBase)
          data.system.adjustments = {
            personal: Math.max(0, targetValue - resolvedBase),
            base: resolvedBase,
            occupation: 0,
            archetype: 0,
            experiencePackage: 0,
            experience: 0
          }
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

  /**
   * Mark the NPC's mother tongue so resolveSkills() can build it from the
   * `Language (Own)` compendium template rather than the foreign-language
   * entry of the same name. Only the first match is tagged — an NPC has one
   * native language.
   */
  _tagNativeLanguage (skills, nativeLanguage, warnings) {
    const language = (nativeLanguage ?? '').trim()
    if (!language) return skills
    const target = `language (${language})`.toLowerCase()
    let tagged = false
    const result = skills.map(skill => {
      if (tagged) return skill
      if ((skill?.name ?? '').trim().toLowerCase() !== target) return skill
      tagged = true
      return { ...skill, own: true }
    })
    if (!tagged) {
      warnings.push(`Native language "${language}" has no matching skill — expected an entry named "Language (${language})"`)
    }
    return result
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
