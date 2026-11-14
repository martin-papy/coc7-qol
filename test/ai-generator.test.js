import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import weaponMapper from '../scripts/ai-generator/mappers/weapon.js'
import npcMapper from '../scripts/ai-generator/mappers/npc.js'
import { tierForValue, isAboveTier, isAtOrAboveTier, tierCeiling } from '../scripts/ai-generator/skill-tiers.js'

// The mappers localise their messages through game.i18n; echo the key and data so tests can match on them.
before(() => {
  globalThis.game = {
    i18n: {
      localize: key => key,
      format: (key, data) => `${key} ${JSON.stringify(data)}`
    }
  }
})
after(() => { delete globalThis.game })

const MARKUP = '<img src=x onerror="alert(1)">'

const llmWeapon = overrides => ({ name: 'Colt .45', damage: '1D10+2', skill: 'Firearms (Handgun)', ...overrides })

const llmNpc = overrides => ({
  name: 'Silas Crane',
  occupation: 'Antiquarian',
  age: 54,
  expertiseTier: 'professional',
  nativeLanguage: 'English',
  characteristics: { str: 45, con: 50, siz: 60, dex: 55, app: 40, int: 75, pow: 65, edu: 80 },
  skills: [
    { name: 'Library Use', value: 60 },
    { name: 'Language (English)', value: 80 },
    { name: 'Spot Hidden', value: 45 }
  ],
  ...overrides
})

const skillNames = result => result.skillsRaw.map(s => s.name)
const throwsInvalid = (fn, field) => assert.throws(fn, err =>
  !(err instanceof TypeError) && err.message.startsWith('COC7QOL.AIGenerator.Error.InvalidFields') && err.message.includes(field))

// --- Skill tiers -------------------------------------------------------------

test('tierForValue maps each tier boundary to its tier', () => {
  const cases = [[1, 'novice'], [5, 'novice'], [6, 'neophyte'], [19, 'neophyte'], [20, 'amateur'], [49, 'amateur'],
    [50, 'professional'], [74, 'professional'], [75, 'expert'], [89, 'expert'], [90, 'master'], [99, 'master']]
  for (const [value, tier] of cases) assert.equal(tierForValue(value), tier, `value ${value}`)
})

test('tierForValue reads values below the ladder as novice and at or above 100 as master', () => {
  assert.equal(tierForValue(0), 'novice')
  assert.equal(tierForValue(-3), 'novice')
  assert.equal(tierForValue(120), 'master')
  assert.equal(tierForValue('not a number'), 'novice')
})

test('tierForValue resolves a fractional value between tiers to the lower tier', () => {
  assert.equal(tierForValue(5.5), 'novice')
  assert.equal(tierForValue(49.5), 'amateur')
  assert.equal(tierForValue(89.5), 'expert')
})

test('isAboveTier flags only values over the tier ceiling, and never for an unknown tier', () => {
  assert.equal(tierCeiling('professional'), 74)
  assert.equal(isAboveTier(74, 'professional'), false)
  assert.equal(isAboveTier(75, 'professional'), true)
  assert.equal(isAboveTier(99, 'unknown'), false)
})

test('isAtOrAboveTier compares tier positions, and never matches an unknown tier', () => {
  assert.equal(isAtOrAboveTier(50, 'professional'), true)
  assert.equal(isAtOrAboveTier(49, 'professional'), false)
  assert.equal(isAtOrAboveTier(95, 'professional'), true)
  assert.equal(isAtOrAboveTier(95, 'unknown'), false)
})

// --- Weapon mapper -----------------------------------------------------------

test('weapon validate accepts a weapon with a name, damage and skill', () => {
  assert.doesNotThrow(() => weaponMapper.validate(llmWeapon()))
})

for (const field of ['name', 'damage', 'skill']) {
  test(`weapon validate rejects a missing ${field}`, () => {
    throwsInvalid(() => weaponMapper.validate(llmWeapon({ [field]: undefined })), field)
  })

  test(`weapon validate rejects a ${field} that is not a string`, () => {
    throwsInvalid(() => weaponMapper.validate(llmWeapon({ [field]: { text: 'x' } })), field)
    throwsInvalid(() => weaponMapper.validate(llmWeapon({ [field]: 12 })), field)
  })
}

test('weapon validate rejects a reply that is not an object without a TypeError', () => {
  for (const value of [null, [], 'a gun']) {
    assert.throws(() => weaponMapper.validate(value), err => !(err instanceof TypeError))
  }
})

test('weapon toFoundryData stores markup in the LLM description as text, not HTML', () => {
  const value = weaponMapper.toFoundryData(llmWeapon({ description: `A sidearm ${MARKUP}` })).system.description.value

  assert.equal(value.includes('<'), false)
  assert.equal(value.includes('&lt;img'), true)
  assert.equal(value.startsWith('A sidearm '), true)
})

test('weapon toFoundryData keeps an empty description when the LLM gives none or a non-string', () => {
  assert.equal(weaponMapper.toFoundryData(llmWeapon()).system.description.value, '')
  assert.equal(weaponMapper.toFoundryData(llmWeapon({ description: { a: 1 } })).system.description.value, '')
})

test('weapon toFoundryData splits usesPerRound into normal and max', () => {
  const upr = raw => weaponMapper.toFoundryData(llmWeapon(raw)).system.usesPerRound
  assert.deepEqual(upr({ usesPerRound: 1 }), { normal: '1', max: null, burst: null })
  assert.deepEqual(upr({ usesPerRound: '1(3)' }), { normal: '1', max: '3', burst: null })
  assert.deepEqual(upr({ usesPerRound: '1 (3)' }), { normal: '1', max: '3', burst: null })
  assert.deepEqual(upr({ usesPerRound: '1/3' }), { normal: '1', max: '3', burst: null })
  assert.deepEqual(upr({ usesPerRound: 1, usesPerRoundMax: 2 }), { normal: '1', max: '2', burst: null })
  assert.deepEqual(upr({ usesPerRound: 'burst' }), { normal: '1', max: null, burst: null })
})

test('weapon toFoundryData coerces numeric strings and drops non-numeric bullets, range and malfunction', () => {
  const coerced = weaponMapper.toFoundryData(llmWeapon({ bullets: '6', range: '15', malfunction: '100' })).system
  assert.equal(coerced.bullets, 6)
  assert.equal(coerced.ammo, 6)
  assert.equal(coerced.range.normal.value, 15)
  assert.equal(coerced.malfunction, 100)

  const dropped = weaponMapper.toFoundryData(llmWeapon({ bullets: 'six', range: 'far', malfunction: 'often' })).system
  assert.equal(dropped.bullets, null)
  assert.equal(dropped.ammo, 0)
  assert.equal(dropped.range.normal.value, null)
  assert.equal(dropped.malfunction, null)
})

test('weapon toFoundryData drops negative bullets and range and an out-of-range malfunction', () => {
  const s = weaponMapper.toFoundryData(llmWeapon({ bullets: -2, range: -10, malfunction: 250 })).system
  assert.equal(s.bullets, null)
  assert.equal(s.range.normal.value, null)
  assert.equal(s.malfunction, null)
})

test('weapon toFoundryData only sets a property flag for a literal true', () => {
  const p = weaponMapper.toFoundryData(llmWeapon({ properties: { rngd: 'yes', impl: true } })).system.properties
  assert.equal(p.rngd, false)
  assert.equal(p.impl, true)
})

// --- NPC mapper: validate ----------------------------------------------------

test('npc validate accepts a well-formed NPC', () => {
  assert.doesNotThrow(() => npcMapper.validate(llmNpc()))
})

test('npc validate rejects a reply that is not an object without a TypeError', () => {
  for (const value of [null, [], 'an npc']) {
    assert.throws(() => npcMapper.validate(value), err => !(err instanceof TypeError))
  }
})

test('npc validate rejects a name that is not a string', () => {
  throwsInvalid(() => npcMapper.validate(llmNpc({ name: { first: 'Silas' } })), 'name')
})

test('npc validate rejects an unknown expertise tier', () => {
  throwsInvalid(() => npcMapper.validate(llmNpc({ expertiseTier: 'legendary' })), 'expertiseTier')
})

test('npc validate rejects a missing or non-numeric characteristic', () => {
  throwsInvalid(() => npcMapper.validate(llmNpc({ characteristics: { ...llmNpc().characteristics, edu: '80' } })), 'characteristics.edu')
  throwsInvalid(() => npcMapper.validate(llmNpc({ characteristics: { ...llmNpc().characteristics, pow: Number.NaN } })), 'characteristics.pow')
})

test('npc validate rejects an empty skill list and a malformed skill entry', () => {
  throwsInvalid(() => npcMapper.validate(llmNpc({ skills: [] })), 'skills')
  throwsInvalid(() => npcMapper.validate(llmNpc({ skills: [{ name: 7, value: 50 }] })), 'skills[0]')
})

// --- NPC mapper: toFoundryData -----------------------------------------------

test('npc toFoundryData clamps and rounds characteristics into 1-99', () => {
  const result = npcMapper.toFoundryData(llmNpc({ characteristics: { str: 5000, con: 50, siz: 60, dex: -20, app: 40, int: 75, pow: 65, edu: 33.7 } }))
  const chars = result.actorData.system.characteristics

  assert.equal(chars.str.value, 99)
  assert.equal(chars.dex.value, 1)
  assert.equal(chars.edu.value, 34)
  assert.equal(result.llmData.characteristics.str, 99, 'the review dialog shows the corrected value')
  assert.ok(result.warnings.some(w => w.includes('CharacteristicClamped') && w.includes('"STR"')))
})

test('npc toFoundryData clamps and rounds skill values into 0-99', () => {
  const result = npcMapper.toFoundryData(llmNpc({
    skills: [{ name: 'Spot Hidden', value: 250 }, { name: 'Stealth', value: -5 }, { name: 'Listen', value: 42.6 }]
  }))
  const byName = Object.fromEntries(result.skillsRaw.map(s => [s.name, s.value]))

  assert.equal(byName['Spot Hidden'], 99)
  assert.equal(byName.Stealth, 0)
  assert.equal(byName.Listen, 43)
  assert.deepEqual(result.llmData.skills.map(s => s.value), [99, 0, 43])
})

test('npc toFoundryData keeps only the first of two skills that differ only by case', () => {
  const result = npcMapper.toFoundryData(llmNpc({
    skills: [{ name: 'Spot Hidden', value: 50 }, { name: 'spot hidden ', value: 70 }]
  }))

  assert.deepEqual(skillNames(result), ['Spot Hidden'])
  assert.equal(result.skillsRaw[0].value, 50)
  assert.ok(result.warnings.some(w => w.includes('DuplicateSkill')))
})

test('npc toFoundryData caps a very long skill list', () => {
  const skills = Array.from({ length: 200 }, (_, i) => ({ name: `Skill ${i}`, value: 30 }))
  const result = npcMapper.toFoundryData(llmNpc({ skills, nativeLanguage: undefined }))

  assert.equal(result.skillsRaw.length, 60)
  assert.ok(result.warnings.some(w => w.includes('TooManySkills')))
})

test('npc toFoundryData caps the weapon and possession lists', () => {
  const weapons = Array.from({ length: 30 }, (_, i) => llmWeapon({ name: `Knife ${i}`, skill: 'Fighting (Brawl)' }))
  const possessions = Array.from({ length: 50 }, (_, i) => ({ name: `Thing ${i}` }))
  const result = npcMapper.toFoundryData(llmNpc({ weapons, possessions }))

  assert.equal(result.weaponsData.length, 10)
  assert.equal(result.possessionsData.length, 20)
})

test('npc toFoundryData ignores a native language that is not a string instead of throwing', () => {
  const result = npcMapper.toFoundryData(llmNpc({ nativeLanguage: 42 }))

  assert.equal(result.skillsRaw.some(s => s.own), false)
  assert.equal(result.llmData.nativeLanguage, '')
})

test('npc toFoundryData treats non-string narrative fields as empty', () => {
  const result = npcMapper.toFoundryData(llmNpc({ occupation: { a: 1 }, physicalDescription: 5, personalityTraits: ['x'], background: null }))
  const system = result.actorData.system

  assert.equal(system.infos.occupation, '')
  assert.equal(system.biography.personalDescription.value, '')
  assert.equal(system.description.keeper, '')
})

test('npc toFoundryData escapes markup in its narrative fields', () => {
  const result = npcMapper.toFoundryData(llmNpc({ physicalDescription: MARKUP, background: MARKUP }))
  const system = result.actorData.system

  assert.equal(system.biography.personalDescription.value.includes('<img'), false)
  assert.equal(system.description.keeper.includes('<img'), false)
})

test('npc toFoundryData drops a weapon whose skill is an object and keeps the rest of the NPC', () => {
  const result = npcMapper.toFoundryData(llmNpc({
    weapons: [llmWeapon({ skill: { name: 'Firearms' } }), llmWeapon({ name: 'Knife', skill: 'Fighting (Brawl)' })]
  }))

  assert.deepEqual(result.weaponsData.map(w => w.name), ['Knife'])
  assert.ok(result.warnings.some(w => w.includes('Colt .45')))
})

test('npc toFoundryData adds a missing weapon skill at the fallback value, once', () => {
  const result = npcMapper.toFoundryData(llmNpc({
    weapons: [llmWeapon(), llmWeapon({ name: 'Derringer' })]
  }))
  const added = result.skillsRaw.filter(s => s.name === 'Firearms (Handgun)')

  assert.equal(added.length, 1)
  assert.equal(added[0].value, 25)
})

test('npc toFoundryData does not add a weapon skill the NPC already has under another case', () => {
  const result = npcMapper.toFoundryData(llmNpc({
    skills: [...llmNpc().skills, { name: 'firearms (handgun)', value: 55 }],
    weapons: [llmWeapon()]
  }))

  assert.equal(result.skillsRaw.filter(s => s.name.toLowerCase() === 'firearms (handgun)').length, 1)
})

test('npc toFoundryData tags only the first matching native-language skill', () => {
  const result = npcMapper.toFoundryData(llmNpc())

  assert.deepEqual(result.skillsRaw.filter(s => s.own).map(s => s.name), ['Language (English)'])
})

test('npc toFoundryData warns when no skill matches the native language', () => {
  const result = npcMapper.toFoundryData(llmNpc({ nativeLanguage: 'French' }))

  assert.equal(result.skillsRaw.some(s => s.own), false)
  assert.ok(result.warnings.some(w => w.includes('French')))
})

test('npc toFoundryData drops unnamed "(any)" specialisations', () => {
  const result = npcMapper.toFoundryData(llmNpc({
    skills: [...llmNpc().skills, { name: 'Survival (any)', value: 30 }, { name: 'Science ( Any )', value: 30 }]
  }))

  assert.equal(skillNames(result).some(n => /any/i.test(n)), false)
  assert.equal(result.warnings.filter(w => w.includes('unnamed specialization')).length, 2)
})
