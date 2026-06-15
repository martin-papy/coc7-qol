import { loadPrompt } from '../prompts/loader.js'

const REQUIRED_FIELDS = ['name', 'damage', 'skill']

/**
 * Split the LLM's usesPerRound into the CoC7 schema's separate normal/max strings.
 *
 * Accepts: a plain number ("1", 2), CoC7's display idiom ("1(3)", "1 (3)"),
 * a slash form ("1/3"), or a separate explicit `rawMax`. Explicit max wins.
 * Falls back to normal="1", max=null for anything unparseable (e.g. "burst").
 */
function parseUsesPerRound (raw, rawMax) {
  const baseStr = raw == null ? '' : String(raw).trim()
  const maxStr = rawMax == null ? '' : String(rawMax).trim()
  let normal = '1'
  let max = null

  const combined = baseStr.match(/^(\d+)\s*[(/]\s*(\d+)\s*\)?$/)
  if (combined) {
    normal = combined[1]
    max = combined[2]
  } else if (/^\d+$/.test(baseStr)) {
    normal = baseStr
  }

  if (/^\d+$/.test(maxStr)) max = maxStr
  return { normal, max }
}

export default {
  async buildSystemPrompt () {
    return loadPrompt('weapon-system-prompt')
  },

  validate (data) {
    const missing = REQUIRED_FIELDS.filter(f => !data[f])
    if (missing.length) {
      throw new Error(`LLM response missing required fields: ${missing.join(', ')}`)
    }
  },

  toFoundryData (data) {
    return {
      name: data.name,
      type: 'weapon',
      system: {
        description: {
          value: data.description || '',
          special: '',
          keeper: ''
        },
        skill: {
          main: { name: data.skill || '', id: '' },
          alternativ: { name: '', id: '' }
        },
        range: {
          normal: { value: Number.isFinite(data.range) ? data.range : null, damage: data.damage || '' },
          long: { value: '', damage: '' },
          extreme: { value: '', damage: '' }
        },
        usesPerRound: {
          ...parseUsesPerRound(data.usesPerRound, data.usesPerRoundMax),
          burst: null
        },
        bullets: data.bullets ?? null,
        ammo: (typeof data.bullets === 'number' && Number.isFinite(data.bullets) && data.bullets > 0) ? data.bullets : 0,
        malfunction: data.malfunction ?? null,
        blastRadius: null,
        properties: {
          rngd: data.properties?.rngd ?? false,
          mnvr: false,
          thrown: false,
          shotgun: false,
          dbrl: false,
          impl: data.properties?.impl ?? false,
          brst: false,
          auto: false,
          ahdb: data.properties?.ahdb ?? false,
          addb: data.properties?.addb ?? false,
          slnt: false,
          spcl: false,
          mont: false,
          blst: false,
          stun: false,
          rare: false,
          burn: false
        }
      }
    }
  }
}
