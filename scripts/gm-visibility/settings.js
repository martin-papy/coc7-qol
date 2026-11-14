import { MODULE_ID } from '../constants.js'

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
  game.settings.register(MODULE_ID, SETTING_KEY, {
    name: 'COC7QOL.GmVisibility.SettingName',
    hint: 'COC7QOL.GmVisibility.SettingHint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true,
    // No requiresReload: on a world setting it would reload every client, and the setting
    // only affects GMs and is read on each render. Re-rendering what is open is enough.
    onChange: refreshHighlightedViews
  })
}

/**
 * Re-render, on a GM client, the chat messages already shown and the open item sheets, so
 * they follow the new value at once. Players are unaffected, so their clients do nothing.
 * Only messages present in the log are updated: ChatLog#updateMessage posts any it cannot find.
 */
function refreshHighlightedViews () {
  if (!game.user?.isGM) return
  for (const li of ui.chat?.element?.querySelectorAll('.message[data-message-id]') ?? []) {
    const message = game.messages.get(li.dataset.messageId)
    if (message) ui.chat.updateMessage(message)
  }
  for (const app of foundry.applications.instances.values()) {
    if (app.rendered && app.document?.documentName === 'Item') app.render()
  }
}

/**
 * True only for GMs when the world setting is enabled.
 * Guarded so a not-yet-registered setting can never throw into a render hook.
 * @returns {boolean}
 */
export function isHighlightEnabled () {
  if (!game.user?.isGM) return false
  try {
    return game.settings.get(MODULE_ID, SETTING_KEY) === true
  } catch (_) {
    return false
  }
}
