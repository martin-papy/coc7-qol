import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderNote } from '../scripts/markdown-export/render.js'

const labels = {
  characteristics: 'Characteristics',
  str: 'STR',
  con: 'CON',
  siz: 'SIZ',
  dex: 'DEX',
  app: 'APP',
  int: 'INT',
  pow: 'POW',
  edu: 'EDU',
  hp: 'HP',
  mp: 'MP',
  san: 'SAN',
  luck: 'Luck',
  mov: 'MOV',
  db: 'DB',
  build: 'Build',
  armor: 'Armor value',
  skills: 'Skills',
  skill: 'Skill',
  regular: 'Regular',
  hard: 'Hard',
  extreme: 'Extreme',
  weapons: 'Weapons',
  weapon: 'Weapon',
  damage: 'Damage',
  range: 'Range',
  attacks: 'Attacks',
  ammo: 'Ammo',
  malfunction: 'Malfunction',
  possessions: 'Possessions',
  items: 'Items',
  books: 'Books',
  spells: 'Spells',
  talents: 'Talents',
  armors: 'Armor',
  statuses: 'Status',
  wealth: 'Cash and Assets',
  spendingLevel: 'Spending level',
  cash: 'Cash',
  assets: 'Assets',
  background: 'Background',
  encounters: 'Losses from Strange Entities',
  immune: 'immune',
  keeperNotes: "Keeper's notes"
}

const deps = { labels, today: '2026-11-22', richText: html => html.replace(/<[^>]+>/g, '').trim() }

const harvey = {
  name: 'Harvey Walters',
  infos: {
    occupation: 'Journalist',
    age: '42',
    sex: 'Male',
    residence: 'Arkham',
    birthplace: 'Boston',
    archetype: '',
    organization: '',
    player: 'Martin'
  },
  vitals: { hp: 11, hpMax: 11, mp: 9, mpMax: 9, san: 45, sanMax: 99, luck: 50, mov: 8, build: 0 },
  db: '0',
  armor: '',
  characteristics: { str: 40, con: 55, siz: 60, dex: 50, app: 65, int: 80, pow: 45, edu: 85 },
  skills: [
    { name: 'Accounting', value: 5 },
    { name: 'Art/Craft (Photography)', value: 45 }
  ],
  weapons: [
    { name: '.38 Revolver', skill: 'Handgun 40%', damage: '1D10', range: '15', attacks: '1 (3)', ammo: '6', malfunction: '100' }
  ],
  possessions: { item: ['Camera', 'Notebook'], book: [], spell: [], talent: [], armor: [], status: [] },
  wealth: { spendingLevel: '$10', cash: '$150', assets: '$3750', assetsDetails: 'A town house.' },
  notes: 'Carries a lucky coin.',
  background: [{ title: 'Personal Description', html: '<p>Tall and tired.</p>' }],
  encounters: [{ type: 'Ghoul', totalLoss: 3, immunity: false }, { type: 'Deep One', totalLoss: 0, immunity: true }],
  keeperNotesHtml: '<p>Only in a GM export.</p>'
}

const EXPECTED = `---
type: "investigator"
occupation: "Journalist"
age: "42"
sex: "Male"
residence: "Arkham"
birthplace: "Boston"
player: "Martin"
hp: 11
hp_max: 11
mp: 9
mp_max: 9
san: 45
san_max: 99
luck: 50
tags:
  - coc7/investigator
exported: 2026-11-22
---
# Harvey Walters

## Characteristics

| STR | CON | SIZ | DEX | APP | INT | POW | EDU |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 40 | 55 | 60 | 50 | 65 | 80 | 45 | 85 |

**HP** 11/11 · **MP** 9/9 · **SAN** 45/99 · **Luck** 50 · **MOV** 8 · **DB** 0 · **Build** 0

## Skills

| Skill | Regular | Hard | Extreme |
| --- | --- | --- | --- |
| Accounting | 5 | 2 | 1 |
| Art/Craft (Photography) | 45 | 22 | 9 |

## Weapons

| Weapon | Skill | Damage | Range | Attacks | Ammo | Malfunction |
| --- | --- | --- | --- | --- | --- | --- |
| .38 Revolver | Handgun 40% | 1D10 | 15 | 1 (3) | 6 | 100 |

## Possessions

### Items

- Camera
- Notebook

### Cash and Assets

- **Spending level:** $10
- **Cash:** $150
- **Assets:** $3750

A town house.

Carries a lucky coin.

## Background

### Personal Description

Tall and tired.

## Losses from Strange Entities

- Ghoul (3)
- Deep One (immune)

> [!danger]- Keeper's notes
> Only in a GM export.
`

const noExtras = {
  ...harvey,
  skills: [],
  weapons: [],
  possessions: { item: [], book: [], spell: [], talent: [], armor: [], status: [] },
  wealth: { spendingLevel: '', cash: '', assets: '', assetsDetails: '' },
  notes: '',
  background: [],
  encounters: [],
  keeperNotesHtml: null
}

const render = (data, over = {}) => renderNote(data, { ...deps, ...over })

test('renders the full note', () => {
  assert.equal(render(harvey), EXPECTED)
})

test('blank infos and null vitals drop their property', () => {
  const note = render({ ...harvey, vitals: { ...harvey.vitals, hp: null } })
  assert.doesNotMatch(note, /^archetype:|^organization:|^hp:/m)
  assert.match(note, /^hp_max: 11$/m)
  assert.match(note, /^type: "investigator"$/m)
  assert.match(note, /^tags:\n {2}- coc7\/investigator$/m)
})

test('a null hp_max drops its property too', () => {
  const note = render({ ...harvey, vitals: { ...harvey.vitals, hpMax: null } })
  assert.doesNotMatch(note, /^hp_max:/m)
  assert.match(note, /^hp: 11$/m)
})

test('a hostile occupation cannot break the properties block', () => {
  const note = render({ ...harvey, infos: { ...harvey.infos, occupation: 'x"\ny: z' } })
  assert.match(note, /^occupation: "x\\" y: z"$/m)
})

test('empty sections leave no heading', () => {
  const note = render(noExtras)
  assert.doesNotMatch(note, /^## (Skills|Weapons|Possessions|Background|Losses)/m)
  assert.doesNotMatch(note, /Cash and Assets/)
})

test('an empty possession group is skipped, a filled one is listed', () => {
  const note = render({ ...noExtras, possessions: { ...noExtras.possessions, book: ['Necronomicon'] } })
  assert.match(note, /^## Possessions\n\n### Books\n\n- Necronomicon$/m)
  assert.doesNotMatch(note, /^### (Items|Spells)/m)
})

test('skill rows compute hard and extreme', () => {
  const note = render({ ...noExtras, skills: [{ name: 'Art/Craft (Photography)', value: 45 }] })
  assert.match(note, /^\| Art\/Craft \(Photography\) \| 45 \| 22 \| 9 \|$/m)
})

test('a skill without a value renders empty cells, not NaN', () => {
  const note = render({ ...noExtras, skills: [{ name: 'Broken', value: undefined }] })
  assert.match(note, /^\| Broken \| {2}\| {2}\| {2}\|$/m)
  assert.doesNotMatch(note, /NaN/)
})

test('names cannot break tables or create links', () => {
  const note = render({
    ...noExtras,
    skills: [{ name: 'Lore|Occult', value: 10 }],
    possessions: { ...noExtras.possessions, item: ['[[Trap]]\nsecond line'] }
  })
  assert.match(note, /^\| Lore\\\|Occult \|/m)
  assert.match(note, /^- \\\[\\\[Trap]] second line$/m)
})

test('a background section whose rich text is empty is skipped', () => {
  const note = render({ ...noExtras, background: [{ title: 'Traits', html: '<p></p>' }] })
  assert.doesNotMatch(note, /^## Background|^### Traits/m)
})

test('an untitled background section has no sub-heading', () => {
  const note = render({ ...noExtras, background: [{ title: '', html: '<p>Story</p>' }] })
  assert.match(note, /^## Background\n\nStory$/m)
})

test('encounters show the loss or the immunity', () => {
  const note = render(harvey)
  assert.match(note, /^- Ghoul \(3\)$/m)
  assert.match(note, /^- Deep One \(immune\)$/m)
})

test('armor joins the vitals line when it has a value', () => {
  const note = render({ ...harvey, armor: '2' })
  assert.match(note, /· \*\*Build\*\* 0 · \*\*Armor value\*\* 2$/m)
})

test('Keeper notes sit in one folded callout', () => {
  const note = render(harvey, { richText: () => 'First.\n\nSecond.' })
  assert.match(note, /^> \[!danger\]- Keeper's notes\n> First\.\n>\n> Second\.$/m)
})

test('no Keeper notes means no callout and no Keeper label', () => {
  for (const keeperNotesHtml of [null, '', '<p></p>']) {
    assert.doesNotMatch(render({ ...harvey, keeperNotesHtml }), /danger|Keeper/)
  }
})

test('rendering does not mutate the data', () => {
  const copy = structuredClone(harvey)
  render(harvey)
  assert.deepEqual(harvey, copy)
})

test('plain-text lines cannot become headings, quotes or lists', () => {
  const note = render({
    ...noExtras,
    wealth: { ...noExtras.wealth, assetsDetails: '# big\n> quote\n- item\n1. item\n---' },
    notes: '## notes heading'
  })
  assert.doesNotMatch(note, /^(#+ (big|notes)|> quote|- item|1\. item)$/m)
  assert.match(note, /^\\# big\n\n\\> quote\n\n\\- item\n\n1\\\. item\n\n\\---\n\n\\## notes heading$/m)
})

test('names cannot inject raw HTML', () => {
  const note = render({
    ...noExtras,
    skills: [{ name: '<b>Spot</b>', value: 10 }],
    possessions: { ...noExtras.possessions, item: ['<img src=x onerror=alert(1)>'] },
    background: [{ title: '<i>T</i>', html: '<p>Story</p>' }]
  })
  assert.doesNotMatch(note, /<[a-z/!]/i)
  assert.match(note, /^- &lt;img src=x onerror=alert\(1\)>$/m)
})

test('a name at the start of a bullet cannot nest a heading, quote or list in it', () => {
  const note = render({
    ...noExtras,
    possessions: { ...noExtras.possessions, item: ['# Heading item', '> quote item', '- [ ] task', '2. second'] },
    encounters: [{ type: '# Ghoul', totalLoss: 3, immunity: false }]
  })
  assert.match(note, /^- \\# Heading item\n- \\> quote item\n- \\- \[ \] task\n- 2\\\. second$/m)
  assert.match(note, /^- \\# Ghoul \(3\)$/m)
})
