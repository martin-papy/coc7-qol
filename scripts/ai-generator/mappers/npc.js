// scripts/ai-generator/mappers/npc.js
// NPC mapper — converts LLM output into CoC7 NPC actor data.
// Skill resolution (compendium lookup) is handled by resolveSkills() called from the injector
// after the mapper produces the base actor data.

const SYSTEM_PROMPT = `You are a Call of Cthulhu 7th Edition game master assistant. Generate a CoC7 NPC based on the user's description.

The NPC should be a believable person with enough depth to be credible in a tabletop RPG session. Pick characteristics, skills, and narrative details that are internally consistent with the described occupation, age, and personality.

Respond with ONLY a valid JSON object. No explanation, no markdown fences, no extra text — raw JSON only.

Required fields (must always be present):
- name: string — full name of the NPC
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
- occupation: string — the NPC's job or role (e.g. "Pharmacist", "Dockworker", "Professor")
- age: number — age in years
- physicalDescription: string — 1-2 sentences describing appearance
- personalityTraits: string — 1-2 sentences describing personality and demeanour
- background: string — 2-3 sentences of relevant background, hooks, or secrets useful to a GM`

const REQUIRED_CHARACTERISTICS = ['str', 'con', 'siz', 'dex', 'app', 'int', 'pow', 'edu']

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
      ? `<p><strong>Personality:</strong> ${data.personalityTraits}</p>`
      : ''
    const backgroundHtml = data.background
      ? `<p><strong>Background:</strong> ${data.background}</p>`
      : ''

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
            personalDescription: { value: data.physicalDescription ?? '' }
          },
          description: {
            keeper: personalityHtml + backgroundHtml
          }
        }
      },
      skillsRaw: data.skills,
      llmData: data
    }
  }
}
