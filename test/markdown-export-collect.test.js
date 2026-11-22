import { test } from 'node:test'
import assert from 'node:assert/strict'
import { collectSheetData } from '../scripts/markdown-export/collect.js'

const OPTIONS = { isGM: false, oneBlockBackstory: false, displayPlayerName: false, locale: 'en' }

const skillItem = (name, value) => ({ type: 'skill', name, system: { value } })
const plainItem = (type, name) => ({ type, name, system: {} })

const band = (damage, value) => ({ damage, value })

const revolver = (skillMain) => ({
  type: 'weapon',
  name: '.38 Revolver',
  system: {
    skillMain,
    skill: { main: { name: 'Handgun' } },
    range: { normal: band('1D10', '15'), long: band('', ''), extreme: band(null, null) },
    usesPerRound: { normal: 1, max: 3 },
    properties: { rngd: true },
    ammo: 6,
    bullets: 6,
    malfunction: 100
  }
})

const dagger = () => ({
  type: 'weapon',
  name: 'Dagger',
  system: {
    skillMain: skillItem('Fighting (Brawl)', 50),
    skill: { main: { name: 'Fighting (Brawl)' } },
    range: { normal: band('1D8', '10'), long: band('1D4', '20'), extreme: band('', '') },
    usesPerRound: { normal: 1, max: null },
    properties: { rngd: false },
    ammo: 0,
    bullets: null,
    malfunction: null
  }
})

const withGet = (items) => Object.assign([...items], { get: () => undefined })

function fakeActor (overrides = {}) {
  const { items = [], infos = {}, system = {}, ...rest } = overrides
  return {
    name: 'Jane Doe',
    items: withGet(items),
    system: {
      infos: {
        occupation: 'Antiquarian',
        age: '34',
        sex: 'F',
        residence: 'Arkham',
        birthplace: 'Boston',
        archetype: 'Scholar',
        organization: 'Miskatonic',
        playername: 'Alice',
        ...infos
      },
      attribs: {
        hp: { value: 10, max: 12 },
        mp: { value: 8, max: 14 },
        san: { value: 60, max: 99 },
        lck: { value: 55 },
        mov: { value: 8 },
        build: { value: 0 },
        db: { value: '0' },
        armor: { value: 1 }
      },
      characteristics: {
        str: { value: 50 },
        con: { value: 60 },
        siz: { value: 65 },
        dex: { value: 70 },
        app: { value: 55 },
        int: { value: 80 },
        pow: { value: 70 },
        edu: { value: 85 }
      },
      flags: { manualCredit: false },
      monetary: { spendingLevel: 'modest', cash: '12', assets: 'none', assetsDetails: 'A house' },
      formattedMonetaryValue: type => '$' + { spending: 10, cash: 150, assets: 3750 }[type],
      notes: 'Some notes',
      backstory: '<p>Story</p>',
      biography: [],
      sanityLossEvents: [],
      description: { keeper: '' },
      ...system
    },
    ...rest
  }
}

test('collects infos, vitals and characteristics', () => {
  const data = collectSheetData(fakeActor(), OPTIONS)
  assert.equal(data.name, 'Jane Doe')
  assert.deepEqual(data.infos, {
    occupation: 'Antiquarian',
    age: '34',
    sex: 'F',
    residence: 'Arkham',
    birthplace: 'Boston',
    archetype: 'Scholar',
    organization: 'Miskatonic',
    player: 'Alice'
  })
  assert.deepEqual(data.vitals, {
    hp: 10, hpMax: 12, mp: 8, mpMax: 14, san: 60, sanMax: 99, luck: 55, mov: 8, build: 0
  })
  assert.deepEqual(data.characteristics, {
    str: 50, con: 60, siz: 65, dex: 70, app: 55, int: 80, pow: 70, edu: 85
  })
  assert.equal(data.db, '0')
  assert.equal(data.armor, '1')
  assert.equal(data.notes, 'Some notes')
})

test('occupation and archetype items win over the stored text', () => {
  const data = collectSheetData(fakeActor({ occupation: { name: 'Journalist' }, archetype: { name: 'Adventurer' }, infos: { occupation: 'stale' } }), OPTIONS)
  assert.equal(data.infos.occupation, 'Journalist')
  assert.equal(data.infos.archetype, 'Adventurer')
})

test('a blank player name falls back to the owning user only when the setting is on', () => {
  const actor = fakeActor({ infos: { playername: '' }, userOwner: { name: 'Martin' } })
  assert.equal(collectSheetData(actor, OPTIONS).infos.player, '')
  assert.equal(collectSheetData(actor, { ...OPTIONS, displayPlayerName: true }).infos.player, 'Martin')
})

test('skills are sorted by name in the given locale', () => {
  const actor = fakeActor({ items: [skillItem('Écoute', 25), skillItem('Zoologie', 5), skillItem('Anthropologie', 1)] })
  const data = collectSheetData(actor, { ...OPTIONS, locale: 'fr' })
  assert.deepEqual(data.skills.map(s => s.name), ['Anthropologie', 'Écoute', 'Zoologie'])
  assert.deepEqual(data.skills[1], { name: 'Écoute', value: 25 })
})

test('a weapon row shows its linked skill and value', () => {
  const data = collectSheetData(fakeActor({ items: [revolver(skillItem('Handgun', 40))] }), OPTIONS)
  assert.deepEqual(data.weapons[0], {
    name: '.38 Revolver', skill: 'Handgun 40%', damage: '1D10', range: '15', attacks: '1 (3)', ammo: '6/6', malfunction: '100'
  })
})

test('a melee weapon has no ammo, and joins several range bands', () => {
  const data = collectSheetData(fakeActor({ items: [dagger()] }), OPTIONS)
  assert.deepEqual(data.weapons[0], {
    name: 'Dagger', skill: 'Fighting (Brawl) 50%', damage: '1D8 / 1D4', range: '10 / 20', attacks: '1', ammo: '', malfunction: ''
  })
})

const liveWeapon = (name, skillName, skillValue, ranges) => ({
  type: 'weapon',
  name,
  system: {
    skillMain: skillItem(skillName, skillValue),
    range: ranges,
    usesPerRound: { normal: 1, max: null },
    properties: { rngd: false }
  }
})

test('range bands CoC7 stores as "0" are left out of the range cell', () => {
  const punch = liveWeapon('Punch', 'Fighting (Brawl)', 31, { normal: band('1D3', '0'), long: band('', '0'), extreme: band('', '0') })
  const revolver32 = liveWeapon('.32 Revolver', 'Firearms (Handgun)', 34, { normal: band('1D8', '15'), long: band('', '0'), extreme: band('', '0') })
  const dynamite = liveWeapon('Dynamite Stick', 'Throw', 20, { normal: band('4D10', '@STR/5'), long: band('', '0'), extreme: band('', '0') })
  const data = collectSheetData(fakeActor({ items: [punch, revolver32, dynamite] }), OPTIONS)
  assert.deepEqual(data.weapons.map(w => [w.range, w.damage]), [['', '1D3'], ['15', '1D8'], ['@STR/5', '4D10']])
})

test('a zero range band is blank in any spelling, and its damage is left out too', () => {
  const ranges = { normal: band('1D6', '10'), long: band('1D4', ' 0.0 '), extreme: band('1D2', 0) }
  const data = collectSheetData(fakeActor({ items: [liveWeapon('Bow', 'Archery', 30, ranges)] }), OPTIONS)
  assert.equal(data.weapons[0].range, '10')
  assert.equal(data.weapons[0].damage, '1D6')
})

test('a weapon whose linked skill is gone falls back to the stored skill name', () => {
  const data = collectSheetData(fakeActor({ items: [revolver(undefined)] }), OPTIONS)
  assert.equal(data.weapons[0].skill, 'Handgun')
})

test('possessions are grouped by item type', () => {
  const actor = fakeActor({
    items: [
      plainItem('item', 'Lantern'),
      plainItem('book', 'Necronomicon'),
      plainItem('spell', 'Shrivelling'),
      plainItem('talent', 'Quick Healer'),
      plainItem('armor', 'Leather Coat'),
      plainItem('status', 'Poisoned'),
      plainItem('item', 'Rope'),
      plainItem('occupation', 'Antiquarian'),
      skillItem('Library Use', 60)
    ]
  })
  assert.deepEqual(collectSheetData(actor, OPTIONS).possessions, {
    item: ['Lantern', 'Rope'],
    book: ['Necronomicon'],
    spell: ['Shrivelling'],
    talent: ['Quick Healer'],
    armor: ['Leather Coat'],
    status: ['Poisoned']
  })
})

test('wealth uses the computed values unless manual credit is on', () => {
  const computed = collectSheetData(fakeActor(), OPTIONS)
  const manual = collectSheetData(fakeActor({ system: { flags: { manualCredit: true } } }), OPTIONS)
  assert.deepEqual(computed.wealth, { spendingLevel: '$10', cash: '$150', assets: '$3750', assetsDetails: 'A house' })
  assert.deepEqual(manual.wealth, { spendingLevel: 'modest', cash: '12', assets: 'none', assetsDetails: 'A house' })
})

test('background follows the one-block setting', () => {
  const actor = fakeActor({
    system: {
      backstory: '<p>Story</p>',
      biography: [{ title: 'Traits', value: '<p>Bold</p>' }, { title: 'Empty', value: '' }]
    }
  })
  const sections = collectSheetData(actor, OPTIONS)
  const oneBlock = collectSheetData(actor, { ...OPTIONS, oneBlockBackstory: true })
  assert.deepEqual(sections.background, [{ title: 'Traits', html: '<p>Bold</p>' }])
  assert.deepEqual(oneBlock.background, [{ title: '', html: '<p>Story</p>' }])
})

test('encounters are passed through', () => {
  const events = [{ type: 'Ghoul', totalLoss: 4, immunity: false }]
  const data = collectSheetData(fakeActor({ system: { sanityLossEvents: events } }), OPTIONS)
  assert.deepEqual(data.encounters, events)
})

test('Keeper notes are collected for a GM only', () => {
  const actor = fakeActor({ system: { description: { keeper: '<p>He is a cultist</p>' } } })
  assert.equal(collectSheetData(actor, OPTIONS).keeperNotesHtml, null)
  assert.equal(collectSheetData(actor, { ...OPTIONS, isGM: true }).keeperNotesHtml, '<p>He is a cultist</p>')
})

test('incomplete actor data does not throw', () => {
  const bare = { name: 'Nobody', items: [], system: { infos: {}, attribs: {}, characteristics: {}, flags: {}, monetary: {}, description: {} } }
  const data = collectSheetData(bare, OPTIONS)
  assert.equal(data.vitals.hp, null)
  assert.deepEqual(data.skills, [])
  assert.deepEqual(data.background, [])
  assert.deepEqual(data.encounters, [])
  assert.deepEqual(data.wealth, { spendingLevel: '', cash: '', assets: '', assetsDetails: '' })
  assert.equal(data.keeperNotesHtml, null)
})

test('a bare weapon with no linked skill and no ranges does not throw', () => {
  const bare = { name: 'Nobody', items: [{ type: 'weapon', name: 'Fist', system: {} }], system: {} }
  const data = collectSheetData(bare, OPTIONS)
  assert.deepEqual(data.weapons[0], { name: 'Fist', skill: '', damage: '', range: '', attacks: '', ammo: '', malfunction: '' })
})
