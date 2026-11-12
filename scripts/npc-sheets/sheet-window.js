/** Actor types whose system sheet gets a resize handle. The Creature sheet extends the NPC sheet. */
export const ACTOR_TYPES = ['npc', 'creature']

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
