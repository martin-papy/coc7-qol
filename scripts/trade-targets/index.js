import { t } from '../utils.js'
import { actorGroupLabels } from '../actor-groups.js'
import { restructureTradeTargets, findTradeTargetSelect, GROUP_ORDER } from './restructure.js'

/** Window title key CoC7Utilities.tradeItem() gives its DialogV2 (CoC7 8.x). The dialog has no id. */
const TRADE_DIALOG_TITLE = 'CoC7.MessageTitleSelectUserToGiveTo'

Hooks.on('renderDialogV2', (dialog, element) => {
  if (dialog.options?.window?.title !== TRADE_DIALOG_TITLE) return

  // Secondary signal — the actor <select> is what we regroup.
  const select = findTradeTargetSelect(element)
  if (!select) return

  restructureTradeTargets(select, {
    typeOf: uuid => fromUuidSync(uuid)?.type,
    labels: actorGroupLabels(GROUP_ORDER, t),
    locale: game.i18n.lang
  })
})
