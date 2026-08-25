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
 * @returns {boolean} false when the section was already restructured (DialogV2 re-render).
 */
export function restructureRestTargets (section, { typeOf, labels }) {
  if (section.dataset.coc7qolGrouped) return false
  section.dataset.coc7qolGrouped = 'true'

  const doc = section.ownerDocument
  const rows = [...section.querySelectorAll(':scope > div.flexrow')]

  const byType = new Map(GROUP_ORDER.map(type => [type, []]))
  const strays = []
  for (const row of rows) {
    const input = row.querySelector(`input[name^="${INPUT_PREFIX}"]`)
    const type = typeOf(input.name.slice(INPUT_PREFIX.length))
    if (byType.has(type)) byType.get(type).push(row)
    else strays.push(row)
  }

  for (const type of GROUP_ORDER) {
    const groupRows = byType.get(type)
    if (groupRows.length > 0) section.append(buildGroup(doc, type, labels[type], groupRows))
  }
  section.append(...strays)
  return true
}

/** One collapsible <details> per actor type, with a select-all toggle in its <summary>. */
function buildGroup (doc, type, label, rows) {
  const isDefault = type === DEFAULT_OPEN_TYPE
  if (isDefault) setChecked(rows, true)

  const toggle = doc.createElement('input')
  toggle.type = 'checkbox'
  toggle.name = `${GROUP_TOGGLE_PREFIX}${type}`
  toggle.addEventListener('change', () => setChecked(rows, toggle.checked))

  toggle.setAttribute('aria-label', label)

  // Deliberately no <label> around the text: clicking the group name should
  // expand/collapse the group, and only the checkbox should change the selection.
  const text = doc.createElement('span')
  text.textContent = `${label} (${rows.length})`
  const summary = doc.createElement('summary')
  summary.append(toggle, text)

  const details = doc.createElement('details')
  details.className = 'coc7qol-rest-group'
  details.dataset.actorType = type
  details.open = isDefault
  details.append(summary, ...sortByLabel(rows))

  const sync = () => syncToggle(toggle, rows)
  sync()
  for (const row of rows) row.querySelector('input').addEventListener('change', sync)
  return details
}

/** Mirror the rows onto the group toggle: all → checked, none → unchecked, mixed → indeterminate. */
function syncToggle (toggle, rows) {
  const checkedCount = rows.filter(row => row.querySelector('input').checked).length
  toggle.checked = checkedCount === rows.length
  toggle.indeterminate = checkedCount > 0 && checkedCount < rows.length
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base' })

function sortByLabel (rows) {
  return [...rows].sort((a, b) => collator.compare(labelOf(a), labelOf(b)))
}

function labelOf (row) {
  return row.querySelector('label')?.textContent.trim() ?? ''
}

function setChecked (rows, checked) {
  for (const row of rows) row.querySelector('input').checked = checked
}
