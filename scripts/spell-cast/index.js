import { t, tf } from '../utils.js'
import { addCastControls, castLabelKeys } from './cast-control.js'
import { LOG_PREFIX } from '../constants.js'

/** Actor types whose sheet lists spells the actor can cast (a container only stores them). */
const CASTER_TYPES = new Set(['character', 'npc', 'creature'])

/**
 * Label of the cast control: the system's own wording, plus the right-click hint for the Keeper.
 * @param {Item} spell
 * @param {boolean} canCastHidden
 * @returns {string}
 */
function castTooltip (spell, canCastHidden) {
  const keys = castLabelKeys(spell.system.costList.length > 0)
  const cast = t(keys.cast)
  return canCastHidden ? tf('COC7QOL.SpellCast.KeeperTooltip', { cast, hidden: t(keys.hidden) }) : cast
}

/**
 * Cast through the same call as the spell item sheet's buttons (CoC7 spell-sheet.js, 'castSpell').
 * @param {Item} spell
 * @param {boolean} hidden
 * @returns {Promise<void>}
 */
async function castSpell (spell, hidden) {
  try {
    await spell.system.cast(hidden)
  } catch (err) {
    console.error(LOG_PREFIX, 'Casting the spell from the actor sheet failed:', err)
    // Passing `format` makes Foundry escape the values: a spell name is user-written text.
    ui.notifications.error('COC7QOL.SpellCast.Failed', { format: { name: spell.name, error: err.message } })
  }
}

Hooks.on('renderActorSheetV2', (app, element) => {
  const actor = app.document
  // Same rule as the item sheet's Cast buttons: owners and the Keeper (who owns everything).
  if (!actor?.isOwner || !CASTER_TYPES.has(actor.type)) return

  const spells = new Map(actor.items.filter(item => item.type === 'spell').map(item => [item.uuid, item]))
  if (spells.size === 0) return

  const canCastHidden = game.user.isGM
  addCastControls(element, {
    findSpell: uuid => spells.get(uuid),
    tooltipFor: spell => castTooltip(spell, canCastHidden),
    canCastHidden,
    cast: castSpell
  })
})
