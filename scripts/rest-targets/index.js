import { t } from '../utils.js'
import { restructureRestTargets, findRestTargetsSection, GROUP_ORDER } from './restructure.js'

/** DialogV2 id assigned by CoC7Utilities.restTargets() (CoC7 8.x). */
const REST_DIALOG_ID = 'CoC7RestTargets'

const LABEL_KEYS = {
  character: 'COC7QOL.RestTargets.Group.Investigators',
  npc: 'COC7QOL.RestTargets.Group.Npcs',
  creature: 'COC7QOL.RestTargets.Group.Creatures',
  vehicle: 'COC7QOL.RestTargets.Group.Vehicles'
}

Hooks.on('renderDialogV2', (dialog, element) => {
  if (dialog.id !== REST_DIALOG_ID) return

  // Secondary signal — the system's flat row list is what we regroup.
  const section = findRestTargetsSection(element)
  if (!section) return

  const labels = Object.fromEntries(GROUP_ORDER.map(type => [type, t(LABEL_KEYS[type])]))
  restructureRestTargets(section, {
    typeOf: actorId => game.actors.get(actorId)?.type,
    labels
  })
})
