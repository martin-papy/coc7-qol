import { groupByActorType, nameSorter } from '../actor-groups.js'

const INPUT_PREFIX = 'CoC7RestTargets'
/** Our own controls must not share the system's prefix: its submit callback collects every `CoC7RestTargets*` input as an actor id. */
const GROUP_TOGGLE_PREFIX = 'coc7qol-rest-group-'

/** Display order of the actor-type groups. Mirrors CoC7's TARGET_ALLOWED. */
export const GROUP_ORDER = ['character', 'npc', 'creature', 'vehicle']

/** The group the Keeper almost always wants: expanded on open. */
const DEFAULT_OPEN_TYPE = 'character'

/**
 * Locate the system's row list inside a rendered rest dialog.
 *
 * ApplicationV2 wraps the content in its own <section class="window-content">, so a
 * naive `section:has(input)` matches the frame first — walk up from a row instead.
 *
 * @param {HTMLElement} root  The dialog element (or any ancestor of the rows).
 * @returns {HTMLElement|null}
 */
export function findRestTargetsSection (root) {
  const row = root.querySelector(`input[name^="${INPUT_PREFIX}"]:not([name="${INPUT_PREFIX}All"])`)
  return row?.closest('section') ?? null
}

/**
 * Regroup the flat actor checkbox rows rendered by CoC7Utilities.restTargets()
 * into one <details> per actor type.
 *
 * @param {HTMLElement} section  The system's scrollable <section> holding the rows.
 * @param {object} deps
 * @param {(actorId: string) => string|undefined} deps.typeOf  Resolve an actor id to its type.
 * @param {Record<string, string>} deps.labels  Localised group label per actor type.
 * @param {string} [deps.locale]  BCP 47 tag used to sort names (defaults to the host locale).
 * @returns {boolean} false when the section was already restructured (DialogV2 re-render).
 */
export function restructureRestTargets (section, { typeOf, labels, locale }) {
  if (section.dataset.coc7qolGrouped) return false

  const doc = section.ownerDocument
  const rows = [...section.querySelectorAll(':scope > div.flexrow')]
  const { groups: byType, strays } = groupByActorType(rows, {
    order: GROUP_ORDER,
    typeOf: row => {
      const input = row.querySelector(`input[name^="${INPUT_PREFIX}"]`)
      return input ? typeOf(input.name.slice(INPUT_PREFIX.length)) : undefined
    }
  })
  const sortRows = nameSorter(locale)
  const sort = groupRows => sortRows(groupRows, labelOf)
  // Investigators are the group the Keeper almost always wants; open them (pre-selected) when
  // present, otherwise open the first non-empty group so the dialog never opens fully collapsed.
  const hasDefault = byType.get(DEFAULT_OPEN_TYPE).length > 0
  let opened = false
  const groups = []
  for (const type of GROUP_ORDER) {
    const groupRows = byType.get(type)
    if (groupRows.length === 0) continue
    const isDefault = type === DEFAULT_OPEN_TYPE
    const open = isDefault || (!hasDefault && !opened)
    opened ||= open
    const group = buildGroup(doc, { type, label: labels[type] ?? type, rows: sort(groupRows), open, checked: isDefault })
    groups.push(group)
    section.append(group.details)
  }
  section.append(...strays)

  wireSelectionMirrors(section, groups, rows.filter(row => row.querySelector('input')))

  // Mark only once the work is done, so a failure above leaves the section eligible for a retry.
  section.dataset.coc7qolGrouped = 'true'
  return true
}

/**
 * Keep the group toggles and the system's "All Actors" box in step with the rows.
 * Any checkbox change inside the section bubbles up here; the All box (outside the
 * section) acts as the master select-all and is mirrored like a group toggle.
 */
function wireSelectionMirrors (section, groups, allRows) {
  const allBox = section.closest('form')?.querySelector(`[name="${INPUT_PREFIX}All"]`) ?? null
  const refresh = () => {
    for (const group of groups) syncToggle(group.toggle, group.rows)
    if (allBox) syncToggle(allBox, allRows)
  }
  section.addEventListener('change', refresh)
  allBox?.addEventListener('change', () => {
    setChecked(allRows, allBox.checked)
    refresh()
  })
  refresh()
}

/** One collapsible <details> per actor type, with a select-all toggle in its <summary>. */
function buildGroup (doc, { type, label, rows, open, checked }) {
  if (checked) setChecked(rows, true)

  const toggle = doc.createElement('input')
  toggle.type = 'checkbox'
  toggle.name = `${GROUP_TOGGLE_PREFIX}${type}`
  toggle.setAttribute('aria-label', label)
  // Only sets the rows; the mirrors are refreshed by the section-level change listener.
  toggle.addEventListener('change', () => setChecked(rows, toggle.checked))

  // Deliberately no <label> around the text: clicking the group name should
  // expand/collapse the group, and only the checkbox should change the selection.
  const text = doc.createElement('span')
  text.textContent = `${label} (${rows.length})`
  const summary = doc.createElement('summary')
  summary.append(toggle, text)

  const details = doc.createElement('details')
  details.className = 'coc7qol-rest-group'
  details.dataset.actorType = type
  details.open = open
  details.append(summary, ...rows)
  return { details, toggle, rows }
}

/** Mirror the rows onto the group toggle: all → checked, none → unchecked, mixed → indeterminate. */
function syncToggle (toggle, rows) {
  const checkedCount = rows.filter(row => row.querySelector('input').checked).length
  toggle.checked = checkedCount === rows.length
  toggle.indeterminate = checkedCount > 0 && checkedCount < rows.length
}

function labelOf (row) {
  return row.querySelector('label')?.textContent.trim() ?? ''
}

function setChecked (rows, checked) {
  for (const row of rows) row.querySelector('input').checked = checked
}
