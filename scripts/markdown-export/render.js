/**
 * Turns a `SheetData` object (see collect.js) into the Markdown note for an Obsidian vault.
 * Pure: no Foundry globals, no DOM. Never mutates `data`.
 */
import { yamlString, tableCell, inlineText } from './format.js'

/**
 * @typedef {object} RenderDeps
 * @property {Record<string, string>} labels localized headings and labels
 * @property {string} today local date, YYYY-MM-DD
 * @property {(html: string) => string} richText rich text to Markdown, '' when nothing shows
 */

const INFO_KEYS = ['occupation', 'age', 'sex', 'residence', 'birthplace', 'archetype', 'organization', 'player']
const VITAL_PROPERTIES = [['hp', 'hp'], ['hp_max', 'hpMax'], ['mp', 'mp'], ['mp_max', 'mpMax'], ['san', 'san'], ['san_max', 'sanMax'], ['luck', 'luck']]
const CHARACTERISTIC_KEYS = ['str', 'con', 'siz', 'dex', 'app', 'int', 'pow', 'edu']
const POSSESSION_GROUPS = [
  ['item', 'items'], ['book', 'books'], ['spell', 'spells'],
  ['talent', 'talents'], ['armor', 'armors'], ['status', 'statuses']
]
const WEAPON_COLUMNS = ['weapon', 'skill', 'damage', 'range', 'attacks', 'ammo', 'malfunction']
const WEALTH_FIELDS = ['spendingLevel', 'cash', 'assets']
const SKILL_HARD_DIVISOR = 2
const SKILL_EXTREME_DIVISOR = 5
const SEPARATOR = ' · '

const isBlank = value => value === null || value === undefined || String(value).trim() === ''
const isNumber = value => typeof value === 'number' && Number.isFinite(value)
const joinBlocks = blocks => blocks.filter(block => block !== '').join('\n\n')
const section = (heading, body) => (body === '' ? '' : `${heading}\n\n${body}`)
const row = cells => `| ${cells.join(' | ')} |`
const table = (headers, rows) => [row(headers), row(headers.map(() => '---')), ...rows.map(row)].join('\n')

/** Plain text kept as paragraphs, one per non-blank line. */
const plainParagraphs = value => String(value ?? '')
  .split(/\r?\n/)
  .map(inlineText)
  .filter(line => line !== '')
  .join('\n\n')

const bullets = lines => lines.map(line => `- ${line}`).join('\n')

function renderProperties (data, today) {
  const lines = ['type: "investigator"']
  for (const key of INFO_KEYS) {
    if (!isBlank(data.infos?.[key])) lines.push(`${key}: ${yamlString(data.infos[key])}`)
  }
  for (const [key, field] of VITAL_PROPERTIES) {
    if (isNumber(data.vitals?.[field])) lines.push(`${key}: ${data.vitals[field]}`)
  }
  lines.push('tags:', '  - coc7/investigator', `exported: ${today}`)
  return `---\n${lines.join('\n')}\n---`
}

function vitalPart (label, value, max) {
  if (!isNumber(value)) return null
  return `**${label}** ${isNumber(max) ? `${value}/${max}` : value}`
}

function vitalsLine (data, labels) {
  const v = data.vitals ?? {}
  const parts = [
    vitalPart(labels.hp, v.hp, v.hpMax),
    vitalPart(labels.mp, v.mp, v.mpMax),
    vitalPart(labels.san, v.san, v.sanMax),
    vitalPart(labels.luck, v.luck),
    vitalPart(labels.mov, v.mov)
  ]
  if (!isBlank(data.db)) parts.push(`**${labels.db}** ${inlineText(data.db)}`)
  parts.push(vitalPart(labels.build, v.build))
  if (!isBlank(data.armor)) parts.push(`**${labels.armor}** ${inlineText(data.armor)}`)
  return parts.filter(part => part !== null).join(SEPARATOR)
}

function renderCharacteristics (data, labels) {
  const values = data.characteristics ?? {}
  const hasAny = CHARACTERISTIC_KEYS.some(key => isNumber(values[key]))
  const grid = hasAny
    ? table(
      CHARACTERISTIC_KEYS.map(key => tableCell(labels[key])),
      [CHARACTERISTIC_KEYS.map(key => (isNumber(values[key]) ? String(values[key]) : ''))]
    )
    : ''
  return section(`## ${inlineText(labels.characteristics)}`, joinBlocks([grid, vitalsLine(data, labels)]))
}

function skillRow (skill) {
  const value = skill.value
  const cells = isNumber(value)
    ? [value, Math.floor(value / SKILL_HARD_DIVISOR), Math.floor(value / SKILL_EXTREME_DIVISOR)].map(String)
    : ['', '', '']
  return [tableCell(skill.name), ...cells]
}

function renderSkills (data, labels) {
  const skills = data.skills ?? []
  if (skills.length === 0) return ''
  const headers = [labels.skill, labels.regular, labels.hard, labels.extreme].map(tableCell)
  return section(`## ${inlineText(labels.skills)}`, table(headers, skills.map(skillRow)))
}

function renderWeapons (data, labels) {
  const weapons = data.weapons ?? []
  if (weapons.length === 0) return ''
  const headers = WEAPON_COLUMNS.map(key => tableCell(labels[key]))
  const rows = weapons.map(weapon => [
    weapon.name, weapon.skill, weapon.damage, weapon.range, weapon.attacks, weapon.ammo, weapon.malfunction
  ].map(tableCell))
  return section(`## ${inlineText(labels.weapons)}`, table(headers, rows))
}

function possessionGroup (names, labelKey, labels) {
  const lines = (names ?? []).map(inlineText).filter(name => name !== '')
  return section(`### ${inlineText(labels[labelKey])}`, bullets(lines))
}

function wealthGroup (data, labels) {
  const wealth = data.wealth ?? {}
  const lines = WEALTH_FIELDS
    .filter(key => !isBlank(wealth[key]))
    .map(key => `**${inlineText(labels[key])}:** ${inlineText(wealth[key])}`)
  const body = joinBlocks([bullets(lines), plainParagraphs(wealth.assetsDetails), plainParagraphs(data.notes)])
  return section(`### ${inlineText(labels.wealth)}`, body)
}

function renderPossessions (data, labels) {
  const groups = POSSESSION_GROUPS.map(([type, labelKey]) => possessionGroup(data.possessions?.[type], labelKey, labels))
  return section(`## ${inlineText(labels.possessions)}`, joinBlocks([...groups, wealthGroup(data, labels)]))
}

function renderBackground (data, labels, richText) {
  const blocks = (data.background ?? []).map(entry => {
    const body = richText(entry.html ?? '')
    if (body === '') return ''
    return isBlank(entry.title) ? body : `### ${inlineText(entry.title)}\n\n${body}`
  })
  return section(`## ${inlineText(labels.background)}`, joinBlocks(blocks))
}

function encounterLine (event, labels) {
  if (isBlank(event.type)) return null
  const loss = event.immunity ? labels.immune : event.totalLoss
  return isBlank(loss) ? inlineText(event.type) : `${inlineText(event.type)} (${inlineText(loss)})`
}

function renderEncounters (data, labels) {
  const lines = (data.encounters ?? []).map(event => encounterLine(event, labels)).filter(line => line !== null)
  return section(`## ${inlineText(labels.encounters)}`, bullets(lines))
}

function renderKeeperNotes (data, labels, richText) {
  if (data.keeperNotesHtml === null || data.keeperNotesHtml === undefined) return ''
  const body = richText(data.keeperNotesHtml)
  if (body === '') return ''
  const quoted = body.split('\n').map(line => (line === '' ? '>' : `> ${line}`))
  return [`> [!danger]- ${inlineText(labels.keeperNotes)}`, ...quoted].join('\n')
}

/**
 * @param {object} data SheetData
 * @param {RenderDeps} deps
 * @returns {string}
 */
export function renderNote (data, { labels, today, richText }) {
  const blocks = [
    `${renderProperties(data, today)}\n# ${inlineText(data.name)}`,
    renderCharacteristics(data, labels),
    renderSkills(data, labels),
    renderWeapons(data, labels),
    renderPossessions(data, labels),
    renderBackground(data, labels, richText),
    renderEncounters(data, labels),
    renderKeeperNotes(data, labels, richText)
  ]
  return `${joinBlocks(blocks)}\n`
}
