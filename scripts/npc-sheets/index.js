import { systemNpcSheetClasses, makeResizable, keepInViewport } from './sheet-window.js'

/** Sheet classes made resizable at ready; render hooks only touch instances of these. */
const npcSheetClasses = new Set()

const isNpcSheet = app => [...npcSheetClasses].some(cls => app instanceof cls)

// Foundry queues sheet registrations and only fills CONFIG.Actor.sheetClasses between
// 'setup' and 'ready' (v13 and v14), so 'ready' is the first hook that can see the classes.
// The option is read when a sheet is instantiated, which happens on first open, after this.
Hooks.once('ready', () => {
  for (const cls of systemNpcSheetClasses(CONFIG.Actor.sheetClasses, game.system.id)) {
    makeResizable(cls)
    npcSheetClasses.add(cls)
  }
})

Hooks.on('renderActorSheetV2', app => {
  if (!isNpcSheet(app)) return
  keepInViewport(app)
})
