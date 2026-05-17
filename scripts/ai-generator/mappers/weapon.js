const SYSTEM_PROMPT = `You are a Call of Cthulhu 7th Edition game master assistant. Generate a CoC7 weapon item based on the user's description.

Respond with ONLY a valid JSON object. No explanation, no markdown fences, no extra text — raw JSON only.

Required fields (must always be present):
- name: string — the weapon name
- damage: string — dice expression (e.g. "1d8", "1d6+1", "1d10+db")
- skill: string — the CoC7 skill name (e.g. "Firearms (Handgun)", "Fighting (Brawl)", "Firearms (Rifle/Shotgun)", "Throw")

Optional fields (omit or use null if not applicable):
- description: string — flavour text and physical description (default "")
- range: integer or null — effective range as a plain integer with NO unit (e.g. 15, 30); null for melee weapons
- usesPerRound: integer or string — BASE attacks per round, just a plain number (e.g. 1, 2). Do NOT use parentheses or burst ranges here.
- usesPerRoundMax: integer or null — maximum attacks per round when faster than base (e.g. 3 quick shots from a revolver); null when not applicable. CoC7 displays this as "normal(max)".
- bullets: number or null — magazine/cylinder capacity; null for non-firearms
- malfunction: number or null — malfunction threshold 96–100; null for non-firearms
- properties: object with boolean flags:
  - rngd: true if ranged weapon
  - impl: true if impaling (piercing) weapon
  - addb: true if adds full damage bonus (DB) to damage
  - ahdb: true if adds half damage bonus to damage

Common CoC7 skills: "Fighting (Brawl)", "Fighting (Sword)", "Fighting (Axe)", "Fighting (Spear)", "Fighting (Whip)", "Firearms (Handgun)", "Firearms (Rifle/Shotgun)", "Firearms (Submachine Gun)", "Firearms (Machine Gun)", "Throw", "Explosives"
Common damage bonus usage: melee weapons typically use "addb" or "ahdb"; firearms do not.`

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
  buildSystemPrompt () {
    return SYSTEM_PROMPT
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
