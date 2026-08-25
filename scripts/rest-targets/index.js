import { t } from '../utils.js'
import { actorGroupLabels } from '../actor-groups.js'
import { restructureRestTargets, findRestTargetsSection, GROUP_ORDER } from './restructure.js'

/** DialogV2 id assigned by CoC7Utilities.restTargets() (CoC7 8.x). */
const REST_DIALOG_ID = 'CoC7RestTargets'

Hooks.on('renderDialogV2', (dialog, element) => {
  if (dialog.id !== REST_DIALOG_ID) return

  // Secondary signal — the system's flat row list is what we regroup.
  const section = findRestTargetsSection(element)
  if (!section) return

  restructureRestTargets(section, {
    typeOf: actorId => game.actors.get(actorId)?.type,
    labels: actorGroupLabels(GROUP_ORDER, t),
    locale: game.i18n.lang
  })
})
