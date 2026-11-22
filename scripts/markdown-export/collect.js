/**
 * Reads a CoC7 investigator into the plain `SheetData` object the Markdown renderer consumes.
 * Pure: everything it needs arrives through its two arguments (no Foundry globals).
 */

const POSSESSION_TYPES = ['item', 'book', 'spell', 'talent', 'armor', 'status']
const CHARACTERISTICS = ['str', 'con', 'siz', 'dex', 'app', 'int', 'pow', 'edu']
const RANGE_BANDS = ['normal', 'long', 'extreme']

const text = value => (value === null || value === undefined ? '' : String(value))
const isBlank = value => text(value).trim() === ''
const num = value => (typeof value === 'number' && Number.isFinite(value) ? value : null)
const itemsOf = actor => [...(actor.items ?? [])]

function collectInfos (actor, options) {
  const infos = actor.system?.infos ?? {}
  const owner = options.displayPlayerName ? text(actor.userOwner?.name) : ''
  return {
    occupation: text(actor.occupation?.name ?? infos.occupation),
    age: text(infos.age),
    sex: text(infos.sex),
    residence: text(infos.residence),
    birthplace: text(infos.birthplace),
    archetype: text(actor.archetype?.name ?? infos.archetype),
    organization: text(infos.organization),
    player: isBlank(infos.playername) ? owner : text(infos.playername)
  }
}

function collectVitals (system) {
  const a = system?.attribs ?? {}
  return {
    hp: num(a.hp?.value),
    hpMax: num(a.hp?.max),
    mp: num(a.mp?.value),
    mpMax: num(a.mp?.max),
    san: num(a.san?.value),
    sanMax: num(a.san?.max),
    luck: num(a.lck?.value),
    mov: num(a.mov?.value),
    build: num(a.build?.value)
  }
}

function collectCharacteristics (system) {
  const source = system?.characteristics ?? {}
  return Object.fromEntries(CHARACTERISTICS.map(key => [key, num(source[key]?.value)]))
}

function collectSkills (actor, locale) {
  return itemsOf(actor)
    .filter(item => item.type === 'skill')
    .map(item => ({ name: text(item.name), value: item.system?.value }))
    .sort((a, b) => a.name.localeCompare(b.name, locale))
}

function weaponSkill (system) {
  const main = system.skillMain
  if (main) return `${text(main.name)} ${text(main.system?.value)}%`
  return text(system.skill?.main?.name)
}

/** CoC7 stores `"0"` in the range bands a weapon does not use: such a band is not listed. */
const isUnusedRange = value => isBlank(value) || Number(text(value).trim()) === 0

/**
 * The bands a weapon uses, in order. The normal band is always there, because a melee weapon has
 * a damage and no range; the long and extreme bands only when they have a range.
 */
function usedBands (system) {
  return RANGE_BANDS
    .map(name => ({ name, ...system.range?.[name] }))
    .filter(band => band.name === 'normal' || !isUnusedRange(band.value))
}

function joinBands (system, field) {
  return usedBands(system)
    .map(band => band[field])
    .filter(value => !(field === 'value' ? isUnusedRange(value) : isBlank(value)))
    .map(text)
    .join(' / ')
}

function weaponAttacks (usesPerRound) {
  const normal = text(usesPerRound?.normal)
  const max = usesPerRound?.max
  return isBlank(max) ? normal : `${normal} (${text(max)})`
}

function weaponAmmo (system) {
  if (!system.properties?.rngd) return ''
  const ammo = text(system.ammo)
  return system.bullets === null || system.bullets === undefined ? ammo : `${ammo}/${text(system.bullets)}`
}

function collectWeapons (actor) {
  return itemsOf(actor)
    .filter(item => item.type === 'weapon')
    .map(item => {
      const system = item.system ?? {}
      return {
        name: text(item.name),
        skill: weaponSkill(system),
        damage: joinBands(system, 'damage'),
        range: joinBands(system, 'value'),
        attacks: weaponAttacks(system.usesPerRound),
        ammo: weaponAmmo(system),
        malfunction: text(system.malfunction)
      }
    })
}

/** As the sheet prints it: `3 x Flare`. A quantity of 1, or none that is a number, leaves the bare name. */
function possessionName (item) {
  const quantity = item.system?.quantity
  if (item.type !== 'item' || num(quantity) === null || quantity === 1) return text(item.name)
  return `${quantity} x ${text(item.name)}`
}

function collectPossessions (actor) {
  const items = itemsOf(actor)
  return Object.fromEntries(POSSESSION_TYPES.map(type => [
    type,
    items.filter(item => item.type === type).map(possessionName)
  ]))
}

/**
 * The values the sheet shows. Spent is typed by hand on the sheet, so it is read as it is either way.
 * @returns {{spendingLevel: string, cash: string, spent: string, assets: string, assetsDetails: string}}
 */
function collectWealth (system) {
  const monetary = system?.monetary ?? {}
  const assetsDetails = text(monetary.assetsDetails)
  const spent = text(monetary.spent)
  if (system?.flags?.manualCredit) {
    return {
      spendingLevel: text(monetary.spendingLevel),
      cash: text(monetary.cash),
      spent,
      assets: text(monetary.assets),
      assetsDetails
    }
  }
  const format = type => (typeof system?.formattedMonetaryValue === 'function' ? text(system.formattedMonetaryValue(type)) : '')
  return { spendingLevel: format('spending'), cash: format('cash'), spent, assets: format('assets'), assetsDetails }
}

function collectBackground (system, oneBlockBackstory) {
  if (oneBlockBackstory) {
    return isBlank(system?.backstory) ? [] : [{ title: '', html: text(system.backstory) }]
  }
  return (system?.biography ?? [])
    .filter(entry => !isBlank(entry.value))
    .map(entry => ({ title: text(entry.title), html: text(entry.value) }))
}

/**
 * @param {object} actor a CoC7 character actor
 * @param {{isGM: boolean, oneBlockBackstory: boolean, displayPlayerName: boolean, locale: string}} options
 */
export function collectSheetData (actor, options) {
  const system = actor.system ?? {}
  return {
    name: text(actor.name),
    infos: collectInfos(actor, options),
    vitals: collectVitals(system),
    db: text(system.attribs?.db?.value),
    armor: text(system.attribs?.armor?.value),
    characteristics: collectCharacteristics(system),
    skills: collectSkills(actor, options.locale),
    weapons: collectWeapons(actor),
    possessions: collectPossessions(actor),
    wealth: collectWealth(system),
    notes: text(system.notes),
    background: collectBackground(system, options.oneBlockBackstory),
    encounters: system.sanityLossEvents ?? [],
    keeperNotesHtml: options.isGM ? text(system.description?.keeper) : null
  }
}
