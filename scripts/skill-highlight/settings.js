import { normalizeThreshold, DEFAULT_THRESHOLD, MIN_THRESHOLD, MAX_THRESHOLD } from './highlight.js'

const MODULE = 'coc7-qol'

export const ENABLED_SETTING = 'skill-highlight-enabled'
export const THRESHOLD_SETTING = 'skill-highlight-threshold'

/**
 * Register the world-scoped settings for strong-skill highlighting: one choice for the
 * whole table. Call once during the 'init' hook.
 * @param {() => void} onChange  Called on every connected client when a GM changes either setting.
 * @returns {void}
 */
export function registerSkillHighlightSettings (onChange) {
  game.settings.register(MODULE, ENABLED_SETTING, {
    name: 'COC7QOL.SkillHighlight.EnabledName',
    hint: 'COC7QOL.SkillHighlight.EnabledHint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true,
    onChange
  })

  game.settings.register(MODULE, THRESHOLD_SETTING, {
    name: 'COC7QOL.SkillHighlight.ThresholdName',
    hint: 'COC7QOL.SkillHighlight.ThresholdHint',
    scope: 'world',
    config: true,
    type: Number,
    default: DEFAULT_THRESHOLD,
    range: { min: MIN_THRESHOLD, max: MAX_THRESHOLD, step: 1 },
    onChange
  })
}

/**
 * Guarded so a not-yet-registered or unreadable setting can never throw into a hook.
 * @returns {number | null} The normalized threshold, or null when the feature is off or cannot be read.
 */
export function activeThreshold () {
  try {
    if (game.settings.get(MODULE, ENABLED_SETTING) !== true) return null
    return normalizeThreshold(game.settings.get(MODULE, THRESHOLD_SETTING))
  } catch (_) {
    return null
  }
}
