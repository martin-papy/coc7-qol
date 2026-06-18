// scripts/gm-visibility/settings.js

const MODULE = 'coc7-qol'

export const SETTING_KEY = 'highlight-gm-only'
export const ROOT_CLASS = 'coc7qol-gm-highlight'
// Hidden-from-players elements (removed from the player's DOM by the system).
export const MARKER_CLASS = 'coc7qol-gm-only'
// Read-only-for-players controls (visible to players but disabled by the system).
export const READONLY_CLASS = 'coc7qol-gm-readonly'

/**
 * Register the world-scoped on/off setting for GM-visibility highlighting.
 * Call once during the 'init' hook.
 */
export function registerGmVisibilitySettings () {
  game.settings.register(MODULE, SETTING_KEY, {
    name: 'COC7QOL.GmVisibility.SettingName',
    hint: 'COC7QOL.GmVisibility.SettingHint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true
  })
}

/**
 * True only for GMs when the world setting is enabled.
 * Guarded so a not-yet-registered setting can never throw into a render hook.
 * @returns {boolean}
 */
export function isHighlightEnabled () {
  if (!game.user?.isGM) return false
  try {
    return game.settings.get(MODULE, SETTING_KEY) === true
  } catch (_) {
    return false
  }
}
