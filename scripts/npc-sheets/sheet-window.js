/** Actor types whose system sheet gets a resize handle. The Creature sheet extends the NPC sheet. */
const ACTOR_TYPES = ['npc', 'creature']

/**
 * Put on the window of every sheet this module makes resizable; styles/npc-sheets.css keys
 * off it. The system's own `npc` class is no use for that: its container sheet and its
 * summarized investigator sheets carry it too.
 */
export const RESIZABLE_CLASS = 'coc7qol-resizable-sheet'

/**
 * The sheet classes the game system registered for NPCs and Creatures (CoC7 8.x and 9.x,
 * verified against 8.18 and 9.1). Sheets registered by other packages are left alone.
 * @param {Record<string, Record<string, { cls: Function }>>|undefined} sheetClasses  CONFIG.Actor.sheetClasses.
 * @param {string} systemId  game.system.id — sheet ids are `<scope>.<ClassName>`.
 * @returns {Function[]}
 */
export function systemNpcSheetClasses (sheetClasses, systemId) {
  const prefix = `${systemId}.`
  return ACTOR_TYPES.flatMap(type =>
    Object.entries(sheetClasses?.[type] ?? {})
      .filter(([id]) => id.startsWith(prefix))
      .map(([, sheet]) => sheet.cls)
  )
}

/**
 * Turn on the window resize handle for every future instance of a sheet class, and mark its
 * window with RESIZABLE_CLASS.
 * ApplicationV2 only builds the handle when it first renders the window frame, so this has to
 * be set on the class before a sheet is opened; it cannot be added from a render hook.
 * @param {Function} cls  An ApplicationV2 subclass.
 */
export function makeResizable (cls) {
  const own = Object.hasOwn(cls, 'DEFAULT_OPTIONS') ? cls.DEFAULT_OPTIONS : {}
  cls.DEFAULT_OPTIONS = {
    ...own,
    classes: [...(own.classes ?? []), RESIZABLE_CLASS],
    window: { ...own.window, resizable: true }
  }
}

/** Window elements already being watched, so re-renders do not stack observers. */
const watched = new WeakSet()

/**
 * Keep an auto-height sheet on screen while it grows.
 * The system opens a section by animating its height without re-rendering, so Foundry never
 * re-positions the window: a sheet sitting mid-screen grows past the bottom edge. Whenever the
 * window's size changes and it now hangs below the viewport, let Foundry clamp it back in.
 * @param {{ element: HTMLElement|null, minimized: boolean, setPosition: () => unknown }} app  An ApplicationV2.
 * @param {object} [env]  Browser globals, injectable for tests.
 * @param {typeof ResizeObserver} [env.Observer]
 * @param {Document} [env.doc]
 */
export function keepInViewport (app, { Observer = globalThis.ResizeObserver, doc = globalThis.document } = {}) {
  const element = app.element
  if (!element || watched.has(element)) return
  watched.add(element)

  const observer = new Observer(() => {
    if (!element.isConnected) {
      observer.disconnect()
      return
    }
    // A sheet detached into its own browser window (Foundry v14) is sized by that window.
    if (element.ownerDocument !== doc || app.minimized) return
    if (element.getBoundingClientRect().bottom > doc.documentElement.clientHeight) app.setPosition()
  })
  observer.observe(element)
}
