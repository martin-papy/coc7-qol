import { escapeHtml } from '../../utils.js'
import { loadPrompt } from '../prompts/loader.js'
import { intInRange, invalidFields, isNonEmptyString, isPlainObject, text } from './coerce.js'

const REQUIRED_STRING_FIELDS = ['name', 'damage', 'skill']
// Generous upper bounds: they only reject nonsense, the prompt asks for realistic values.
const MAX_RANGE = 10_000
const MAX_BULLETS = 1_000
const MALFUNCTION_MIN = 1
const MALFUNCTION_MAX = 100

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
    if (!isPlainObject(data)) throw invalidFields(REQUIRED_STRING_FIELDS)
    const invalid = REQUIRED_STRING_FIELDS.filter(f => !isNonEmptyString(data[f]))
    if (invalid.length) throw invalidFields(invalid)
  },

  /** Expects data that passed validate(). Optional fields of the wrong type are dropped, not rejected. */
  toFoundryData (data) {
    const bullets = intInRange(data.bullets, 0, MAX_BULLETS)
    return {
      name: text(data.name),
      type: 'weapon',
      system: {
        description: {
          // CoC7 renders this as enriched HTML, and 8.16 declares no htmlFields for the server to sanitise.
          value: escapeHtml(text(data.description)),
          special: '',
          keeper: ''
        },
        skill: {
          main: { name: text(data.skill), id: '' },
          alternativ: { name: '', id: '' }
        },
        range: {
          normal: { value: intInRange(data.range, 0, MAX_RANGE), damage: text(data.damage) },
          long: { value: '', damage: '' },
          extreme: { value: '', damage: '' }
        },
        usesPerRound: {
          ...parseUsesPerRound(data.usesPerRound, data.usesPerRoundMax),
          burst: null
        },
        bullets,
        ammo: bullets ?? 0,
        malfunction: intInRange(data.malfunction, MALFUNCTION_MIN, MALFUNCTION_MAX),
        blastRadius: null,
        properties: {
          rngd: data.properties?.rngd === true,
          mnvr: false,
          thrown: false,
          shotgun: false,
          dbrl: false,
          impl: data.properties?.impl === true,
          brst: false,
          auto: false,
          ahdb: data.properties?.ahdb === true,
          addb: data.properties?.addb === true,
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
