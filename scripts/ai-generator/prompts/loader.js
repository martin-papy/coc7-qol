// Loads AI system-prompt Markdown files at runtime and caches them per session.

const cache = new Map()
const MODULE_ID = 'coc7-qol'

/**
 * Fetch a system-prompt Markdown file by base name (no extension).
 * Cached by name, so repeated calls fetch at most once per session.
 *
 * @param {string} name e.g. 'weapon-system-prompt'
 * @returns {Promise<string>} the raw Markdown text
 */
export async function loadPrompt (name) {
  if (cache.has(name)) return cache.get(name)
  const path = foundry.utils.getRoute(`modules/${MODULE_ID}/scripts/ai-generator/prompts/${name}.md`)
  const response = await fetch(path)
  if (!response.ok) {
    throw new Error(`Failed to load AI prompt "${name}": ${response.status} ${response.statusText}`)
  }
  const text = await response.text()
  cache.set(name, text)
  return text
}
