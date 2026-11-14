/**
 * The cast control added to spell rows on actor sheets. Pure DOM — no Foundry
 * globals — so it can be unit-tested (test/spell-cast.test.js). The Foundry
 * wiring lives in index.js.
 */

/** Marks the control this module adds; also what keeps a row from getting a second one. */
export const CAST_CONTROL_CLASS = 'coc7qol-cast-spell'

/**
 * The control's data-action. CoC7 9.x collapses every `.item-control` that has no
 * data-action (it uses those as invisible spacers), so the control needs one; it is
 * the module's own name so that neither the system nor the sheet has a handler for it.
 */
export const CAST_ACTION = 'coc7qol-cast-spell'

/**
 * Item rows in the investigator Possessions tab and the NPC / Creature inventory panels. The tag
 * is left out on purpose: the NPC / Creature rows are `<div>` on CoC7 8.16 and `<li>` on 9.1.
 * Rows that are not spells are skipped by `findSpell`.
 */
const ITEM_ROW_SELECTOR = '.item[data-item-uuid]'
const CONTROLS_SELECTOR = '.item-controls'
const ICON_CLASSES = ['fa-solid', 'fa-hand-sparkles', 'fa-fw']

/**
 * The system's own label keys for the two cast buttons of the spell item sheet
 * (templates/items/spell-header.hbs): a spell with a cost list is cast for real,
 * one without only posts its description to chat.
 * @param {boolean} hasAutomatedCosts
 * @returns {{ cast: string, hidden: string }}
 */
export function castLabelKeys (hasAutomatedCosts) {
  return hasAutomatedCosts
    ? { cast: 'CoC7.Cast', hidden: 'CoC7.CastHidden' }
    : { cast: 'CoC7.MessageCast', hidden: 'CoC7.MessageCastHidden' }
}

/**
 * @template Spell
 * @typedef {object} CastControlDeps
 * @property {(uuid: string) => Spell | undefined} findSpell   The spell a row stands for, or undefined for any other item.
 * @property {(spell: Spell) => string} tooltipFor             Localised label of the control for that spell.
 * @property {boolean} canCastHidden                          Whether a right-click casts hidden.
 * @property {(spell: Spell, hidden: boolean) => void} cast    Cast the spell.
 */

/**
 * Build the control for one spell. The system binds its handlers per element
 * before the render hook runs, so it never sees this one; the click is stopped
 * here so ApplicationV2's delegated [data-action] handler does not see it either.
 * @template Spell
 * @param {Document} doc
 * @param {Spell} spell
 * @param {CastControlDeps<Spell>} deps
 * @returns {HTMLButtonElement}
 */
function buildCastControl (doc, spell, { tooltipFor, canCastHidden, cast }) {
  const label = tooltipFor(spell)
  // A native button, so it can be reached with Tab and activated with Enter or Space.
  const control = doc.createElement('button')
  control.type = 'button'
  control.classList.add('item-control', CAST_CONTROL_CLASS)
  control.dataset.action = CAST_ACTION
  control.dataset.tooltip = label
  control.setAttribute('aria-label', label)

  const icon = doc.createElement('i')
  icon.classList.add(...ICON_CLASSES)
  control.append(icon)

  control.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    cast(spell, false)
  })
  if (canCastHidden) {
    control.addEventListener('contextmenu', (event) => {
      event.preventDefault()
      event.stopPropagation()
      cast(spell, true)
    })
  }
  return control
}

/**
 * Add a cast control as the first control of every spell row under `root`.
 * Safe to call on every render: a row that already has the control is left alone.
 * @template Spell
 * @param {HTMLElement} root
 * @param {CastControlDeps<Spell>} deps
 * @returns {void}
 */
export function addCastControls (root, deps) {
  for (const row of root.querySelectorAll(ITEM_ROW_SELECTOR)) {
    const spell = deps.findSpell(row.dataset.itemUuid)
    if (!spell) continue

    const controls = row.querySelector(CONTROLS_SELECTOR)
    if (!controls || controls.querySelector(`.${CAST_CONTROL_CLASS}`)) continue

    controls.prepend(buildCastControl(root.ownerDocument, spell, deps))
  }
}
