const MODULE = 'coc7-qol'

export const SKILL_COLUMNS_SETTING = 'npc-skill-columns'
/** Set on the sheet window; styles/npc-sheets.css keys the column layout off it. */
export const SKILL_COLUMNS_CLASS = 'coc7qol-skill-columns'

/**
 * Register the world-scoped on/off setting for column-ordered NPC skills. World-scoped
 * because NPC and Creature sheets are mostly the Keeper's: one choice for the whole table.
 * Call once during the 'init' hook.
 * @param {(enabled: boolean) => void} onChange  Called on every connected client with the new value when a GM changes it.
 */
export function registerNpcSheetSettings (onChange) {
  game.settings.register(MODULE, SKILL_COLUMNS_SETTING, {
    name: 'COC7QOL.NpcSheets.SkillColumnsName',
    hint: 'COC7QOL.NpcSheets.SkillColumnsHint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true,
    onChange
  })
}

/**
 * Guarded so a not-yet-registered setting can never throw into a render hook.
 * @returns {boolean}
 */
export function isSkillColumnsEnabled () {
  try {
    return game.settings.get(MODULE, SKILL_COLUMNS_SETTING) === true
  } catch (_) {
    return false
  }
}
