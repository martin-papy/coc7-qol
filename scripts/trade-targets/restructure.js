import { groupByActorType, nameSorter } from '../actor-groups.js'

const ACTOR_UUID_PREFIX = 'Actor.'

/** Display order of the target groups. Mirrors CoC7's TRADE_ALLOWED, ordered for the player. */
export const GROUP_ORDER = ['character', 'container', 'npc', 'creature']

/**
 * Locate the system's actor <select> inside a rendered "Give item to another character" dialog.
 * @param {HTMLElement} root
 * @returns {HTMLSelectElement|null}
 */
export function findTradeTargetSelect (root) {
  const select = root.querySelector('select[name="user"]')
  const isActorList = select && [...select.options].some(option => option.value.startsWith(ACTOR_UUID_PREFIX))
  return isActorList ? select : null
}

/**
 * Regroup the flat <option> list rendered by CoC7Utilities.tradeItem() into one
 * <optgroup> per actor type. Options keep their values, so the system's
 * `form.elements.user.value` callback is unaffected.
 *
 * @param {HTMLSelectElement} select
 * @param {object} deps
 * @param {(uuid: string) => string|undefined} deps.typeOf  Resolve an actor uuid to its type.
 * @param {Record<string, string>} deps.labels  Localised group label per actor type.
 * @param {string} deps.placeholder  Text of the pre-selected "choose a character" entry.
 * @param {string} [deps.locale]  BCP 47 tag used to sort names.
 * @returns {boolean} false when the select was already restructured (re-render).
 */
export function restructureTradeTargets (select, { typeOf, labels, placeholder, locale }) {
  if (select.dataset.coc7qolGrouped) return false

  const doc = select.ownerDocument
  const options = [...select.querySelectorAll(':scope > option')]
  const { groups, strays } = groupByActorType(options, { order: GROUP_ORDER, typeOf: option => typeOf(option.value) })
  const sort = nameSorter(locale)

  for (const type of GROUP_ORDER) {
    const groupOptions = groups.get(type)
    if (groupOptions.length === 0) continue
    const optgroup = doc.createElement('optgroup')
    optgroup.label = labels[type] ?? type
    optgroup.append(...sort(groupOptions, option => option.textContent.trim()))
    select.append(optgroup)
  }
  select.append(...strays)
  select.prepend(buildPlaceholder(doc, placeholder))
  select.selectedIndex = 0
  gateValidateButton(select)

  // Mark only once the work is done, so a failure above leaves the select eligible for a retry.
  select.dataset.coc7qolGrouped = 'true'
  return true
}

/**
 * A disabled, empty-valued first entry: nothing is chosen until the user picks a target, and
 * the entry cannot be re-selected afterwards.
 */
function buildPlaceholder (doc, text) {
  const option = doc.createElement('option')
  option.value = ''
  option.disabled = true
  option.textContent = text
  return option
}

/**
 * DialogV2 routes button clicks straight to its submit handler (no constraint validation),
 * so keep the Validate button disabled while the placeholder is selected. Keeper-side an
 * empty target is a silent no-op — the dialog would close and nothing would move.
 */
function gateValidateButton (select) {
  const validate = select.closest('form')?.querySelector('button[data-action="ok"]')
  if (!validate) return
  const refresh = () => { validate.disabled = select.value === '' }
  select.addEventListener('change', refresh)
  refresh()
}
