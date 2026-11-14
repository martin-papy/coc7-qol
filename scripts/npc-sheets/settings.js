import { MODULE_ID } from '../constants.js'

export const RESIZABLE_SETTING = 'npc-sheets-resizable'
export const SKILL_COLUMNS_SETTING = 'npc-skill-columns'
/** Set on the sheet window; styles/npc-sheets.css keys the column layout off it. */
export const SKILL_COLUMNS_CLASS = 'coc7qol-skill-columns'

/**
 * Register the world-scoped on/off settings for NPC and Creature sheets. World-scoped
 * because these sheets are mostly the Keeper's: one choice for the whole table.
 * Call once during the 'init' hook.
 * @param {(enabled: boolean) => void} onSkillColumnsChange  Called on every connected client with the new value when a GM changes the skill layout.
 */
export function registerNpcSheetSettings (onSkillColumnsChange) {
  // The sheet classes are made resizable once, at ready, and Foundry builds the handle with
  // the window frame, so switching this takes a reload rather than a live update.
  game.settings.register(MODULE_ID, RESIZABLE_SETTING, {
    name: 'COC7QOL.NpcSheets.ResizableName',
    hint: 'COC7QOL.NpcSheets.ResizableHint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true
  })

  game.settings.register(MODULE_ID, SKILL_COLUMNS_SETTING, {
    name: 'COC7QOL.NpcSheets.SkillColumnsName',
    hint: 'COC7QOL.NpcSheets.SkillColumnsHint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true,
    onChange: onSkillColumnsChange
  })
}

/**
 * Guarded so a not-yet-registered setting can never throw into a hook.
 * @param {string} key
 * @returns {boolean}
 */
function isEnabled (key) {
  try {
    return game.settings.get(MODULE_ID, key) === true
  } catch (_) {
    return false
  }
}

/** @returns {boolean} */
export const isResizableEnabled = () => isEnabled(RESIZABLE_SETTING)

/** @returns {boolean} */
export const isSkillColumnsEnabled = () => isEnabled(SKILL_COLUMNS_SETTING)
