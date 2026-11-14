/**
 * Sections for the module's page of Foundry's settings window. Pure DOM — no Foundry
 * globals — so it can be unit-tested (test/settings-sections.test.js). The sections
 * themselves and the Foundry wiring live in index.js.
 */

/** The group wrapped around a section's heading and settings; styles/settings-sections.css hides it when it shows no setting. */
export const SECTION_CLASS = 'coc7qol-settings-section'
/** The heading of a section. */
export const HEADING_CLASS = 'coc7qol-settings-heading'

/** Foundry's own bordered heading (h1–h4.border), the one the CoC7 system uses for its sections. */
const FOUNDRY_HEADING_CLASS = 'border'
const HEADING_TAG = 'h4'
/** A setting as the settings window renders it (v13 and v14): one .form-group around the named field. */
const SETTING_ROW_SELECTOR = '.form-group'

/**
 * @typedef {object} SettingsSection
 * @property {string} id          Stable id of the section; a second run finds the section it built by it.
 * @property {string} title       Heading text, already localised.
 * @property {string[]} settings  Field names of the section's settings (`<namespace>.<key>`), in display order.
 */

/**
 * The rows of a section that are in the window, in the section's order. A setting the user
 * may not see (a world setting, for a player) has no row.
 * @param {Element} root
 * @param {string[]} settings
 * @returns {Element[]}
 */
function shownRows (root, settings) {
  const rows = settings.map(name => root.querySelector(`[name="${name}"]`)?.closest(SETTING_ROW_SELECTOR))
  return [...new Set(rows.filter(Boolean))]
}

/**
 * The section a previous run left in the window, if any.
 * @param {Element} root
 * @param {string} id
 * @returns {HTMLElement|undefined}
 */
function existingSection (root, id) {
  return [...root.querySelectorAll(`.${SECTION_CLASS}`)].find(section => section.dataset.section === id)
}

/**
 * A new, empty section: a group named by its heading.
 * @param {Document} doc
 * @param {SettingsSection} section
 * @returns {HTMLElement}
 */
function buildSection (doc, { id, title }) {
  const heading = doc.createElement(HEADING_TAG)
  heading.classList.add(FOUNDRY_HEADING_CLASS, HEADING_CLASS)
  heading.id = `${SECTION_CLASS}-${id}`
  heading.textContent = title

  const group = doc.createElement('div')
  group.classList.add(SECTION_CLASS)
  group.dataset.section = id
  group.setAttribute('role', 'group')
  group.setAttribute('aria-labelledby', heading.id)
  group.append(heading)
  return group
}

/**
 * Put one section in the window, where its first shown setting was, holding all of its
 * shown settings in order. A section with no shown setting is not built, and one left by a
 * previous run is removed.
 * @param {Element} root
 * @param {SettingsSection} section
 * @returns {HTMLElement|null}  The section, or null when it has no shown setting.
 */
function placeSection (root, section) {
  const rows = shownRows(root, section.settings)
  const existing = existingSection(root, section.id)
  if (rows.length === 0) {
    existing?.remove()
    return null
  }
  const group = existing ?? buildSection(root.ownerDocument, section)
  if (!existing) rows[0].before(group)
  group.append(...rows)
  return group
}

/**
 * Group the module's settings into sections, each under a heading. The settings of a
 * section are brought together whatever order they were registered in, and the settings on
 * the same page that belong to no section are gathered above the first one, so that no
 * setting reads as part of a section it is not in. Safe to run on every render of the window.
 * @param {Element} root  The settings window, or any ancestor of the setting rows.
 * @param {SettingsSection[]} sections
 */
export function addSettingsSections (root, sections) {
  const [placed] = sections.map(section => placeSection(root, section)).filter(Boolean)
  if (!placed) return
  const page = placed.parentElement
  const topSection = page.querySelector(`:scope > .${SECTION_CLASS}`)
  topSection.before(...[...page.children].filter(child => child.matches(SETTING_ROW_SELECTOR)))
}
