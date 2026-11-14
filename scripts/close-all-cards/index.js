import { t } from '../utils.js'
import { listOpenCards } from './card-closing.js'
import CloseAllCardsDialog, { parseCardHtml } from './dialog.js'

/**
 * Display name of the actor behind a CoC7 actor uuid. For an unlinked token
 * actor ("Scene.<id>.Token.<id>.Actor.<id>") the token's name is used, which is
 * what a speaker alias would have shown.
 * @param {string} uuid
 * @returns {string|undefined}
 */
function actorDisplayName (uuid) {
  const actor = fromUuidSync(uuid)
  return actor?.token?.name ?? actor?.name
}

function getOpenCards () {
  return listOpenCards(game.messages, {
    resolveName: actorDisplayName,
    localize: t,
    formatTime: timestamp => new Date(timestamp).toLocaleTimeString(),
    parseHtml: parseCardHtml
  })
}

Hooks.on('getSceneControlButtons', (controls) => {
  const coc7menu = controls.coc7menu
  if (!coc7menu) return

  coc7menu.tools['coc7-close-all-cards'] = {
    button: true,
    icon: 'fa-solid fa-xmarks-lines',
    name: 'coc7-close-all-cards',
    title: t('COC7QOL.CloseAllCards.Title'),
    onChange: () => {
      if (getOpenCards().length === 0) {
        ui.notifications.info('COC7QOL.CloseAllCards.Notification.NoCardsFound', { localize: true })
        return
      }
      new CloseAllCardsDialog(getOpenCards).render(true)
    }
  }
})
