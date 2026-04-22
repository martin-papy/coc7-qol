const SYSTEM_PROMPT = `You are a Call of Cthulhu 7th Edition game master assistant. Generate a CoC7 weapon item based on the user's description.

Respond with ONLY a valid JSON object. No explanation, no markdown fences, no extra text — raw JSON only.

Required fields (must always be present):
- name: string — the weapon name
- damage: string — dice expression (e.g. "1d8", "1d6+1", "1d10+db")
- skill: string — the CoC7 skill name (e.g. "Firearms (Handgun)", "Fighting (Brawl)", "Firearms (Rifle/Shotgun)", "Throw")

Optional fields (omit or use null if not applicable):
- description: string — flavour text and physical description (default "")
- range: integer or null — effective range as a plain integer with NO unit (e.g. 15, 30); null for melee weapons
- usesPerRound: string — attacks per round (e.g. "1", "2")
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
          normal: data.usesPerRound || '1',
          max: null,
          burst: null
        },
        bullets: data.bullets ?? null,
        ammo: 0,
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
