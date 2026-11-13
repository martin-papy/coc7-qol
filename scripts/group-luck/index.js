import { t, tf } from '../utils.js'
import { buildCandidates } from './candidates.js'
import { buildRequestMessage } from './request.js'
import GroupLuckDialog from './dialog.js'

const TOOL_NAME = 'coc7-group-luck'

/**
 * Gather the investigators and players from the world and build the dialog rows.
 * @returns {import('./candidates.js').Candidate[]}
 */
function collectCandidates () {
  const users = Array.from(game.users).filter(user => !user.isGM)
  const players = users.map(user => ({
    id: user.id,
    isActive: user.active,
    characterId: user.character?.id ?? null
  }))
  const investigators = game.actors
    .filter(actor => actor.type === 'character')
    .map(actor => ({
      id: actor.id,
      name: actor.name,
      luck: Number.parseInt(actor.system.attribs?.lck?.value, 10),
      ownerIds: users.filter(user => actor.testUserPermission(user, 'OWNER')).map(user => user.id)
    }))
  return buildCandidates(investigators, players, { locale: game.i18n.lang })
}

/**
 * Ask the chosen investigator's players for a Luck roll, or roll it as the Keeper
 * when none of them is connected.
 * @param {{ roller: import('./candidates.js').Candidate, presentCount: number }} choice
 * @returns {Promise<void>}
 */
async function requestRoll ({ roller, presentCount }) {
  const actor = game.actors.get(roller.id)
  if (!actor) {
    ui.notifications.warn('COC7QOL.GroupLuck.Notification.Missing', { format: { name: roller.name } })
    return
  }
  try {
    if (roller.isOnline) {
      await ChatMessage.create(buildRequestMessage(roller, presentCount, { t, tf, userName: game.user.name }))
    } else {
      await actor.attributeCheck('lck')
    }
  } catch (err) {
    console.error('[coc7-qol] Group Luck failed:', err)
    ui.notifications.error('COC7QOL.GroupLuck.Notification.Failed', { format: { name: roller.name, error: err.message } })
  }
}

/** Open the dialog, or tell the Keeper when there is nobody to offer. */
function openDialog () {
  const candidates = collectCandidates()
  if (candidates.length === 0) {
    ui.notifications.info(t('COC7QOL.GroupLuck.Notification.NoInvestigators'))
    return
  }
  new GroupLuckDialog({ candidates, onConfirm: requestRoll }).render(true)
}

Hooks.on('getSceneControlButtons', controls => {
  if (!controls.coc7menu) return
  controls.coc7menu.tools[TOOL_NAME] = {
    button: true,
    icon: 'fa-solid fa-clover',
    name: TOOL_NAME,
    title: t('COC7QOL.GroupLuck.Title'),
    onChange: openDialog
  }
})
