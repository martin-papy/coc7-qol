import { t } from '../utils.js'
import { addSettingsSections } from './sections.js'
import { AI_SETTING_KEYS } from '../ai-generator/settings.js'
import { SETTING_KEY as GM_HIGHLIGHT_SETTING } from '../gm-visibility/settings.js'
import { RESIZABLE_SETTING, SKILL_COLUMNS_SETTING } from '../npc-sheets/settings.js'
import { ENABLED_SETTING, THRESHOLD_SETTING } from '../skill-highlight/settings.js'
import { MODULE_ID } from '../constants.js'

/**
 * The module's page of the settings window, section by section. A setting shown in the
 * window (`config: true`) that is not listed here is moved above the first section, under
 * no heading: add it to a section, or give it one.
 */
const SECTIONS = [
  { id: 'ai-generator', titleKey: 'COC7QOL.SettingsSection.AIGenerator', keys: AI_SETTING_KEYS },
  { id: 'gm-visibility', titleKey: 'COC7QOL.SettingsSection.GmVisibility', keys: [GM_HIGHLIGHT_SETTING] },
  { id: 'npc-sheets', titleKey: 'COC7QOL.SettingsSection.NpcSheets', keys: [RESIZABLE_SETTING, SKILL_COLUMNS_SETTING] },
  { id: 'skill-highlight', titleKey: 'COC7QOL.SettingsSection.SkillHighlight', keys: [ENABLED_SETTING, THRESHOLD_SETTING] }
]

Hooks.on('renderSettingsConfig', (_app, element) => {
  addSettingsSections(element, SECTIONS.map(({ id, titleKey, keys }) => ({
    id,
    title: t(titleKey),
    settings: keys.map(key => `${MODULE_ID}.${key}`)
  })))
})
