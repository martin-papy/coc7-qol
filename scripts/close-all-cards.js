// scripts/close-all-cards.js

const CARD_TYPE_LABELS = {
  CoC7Check: 'Skill/Attribute Check',
  CoC7SanCheckCard: 'Sanity Check',
  CoC7ConCheck: 'Constitution Check',
  CoC7ChatCombatMelee: 'Melee Combat',
  CoC7ChatCombatRanged: 'Ranged Combat',
  CoC7ChatDamage: 'Damage',
  CoC7ChatOpposedMessage: 'Opposed Roll',
  CoC7ChatCombinedMessage: 'Combined Roll',
  CoC7ChatChaseObstacle: 'Chase Obstacle'
}

function getOpenCards () {
  const open = []
  for (const message of game.messages) {
    const load = message.flags?.CoC7?.load
    if (load?.cardOpen === true) {
      open.push({
        messageId: message.id,
        type: CARD_TYPE_LABELS[load.as] ?? 'Card',
        actor: message.speaker?.alias ?? 'Unknown',
        timestamp: new Date(message.timestamp).toLocaleTimeString()
      })
    }
  }
  return open
}

Hooks.on('getSceneControlButtons', (controls) => {
  const coc7menu = Array.isArray(controls)
    ? controls.find(c => c.name === 'coc7menu')
    : controls.coc7menu
  if (!coc7menu) return

  const tool = {
    button: true,
    icon: 'fa-solid fa-xmarks-lines',
    name: 'coc7-close-all-cards',
    title: 'Close All Cards',
    onChange: () => {
      const openCards = getOpenCards()
      if (openCards.length === 0) {
        ui.notifications.info('No open cards found.')
        return
      }
      new CloseAllCardsDialog(openCards).render(true)
    }
  }

  if (Array.isArray(coc7menu.tools)) {
    coc7menu.tools.push(tool)
  } else {
    coc7menu.tools['coc7-close-all-cards'] = tool
  }
})
