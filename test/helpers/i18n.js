// A game.i18n stand-in backed by the module's real lang/en.json, so tests assert on the
// English text players actually see. Not a test file itself (no .test.js suffix).

import { readFileSync } from 'node:fs'

const EN = JSON.parse(readFileSync(new URL('../../lang/en.json', import.meta.url), 'utf8'))

/** Install `globalThis.game.i18n` (keeping any other `game` fields); returns an uninstall function. */
export function installEnglishI18n () {
  const previous = globalThis.game
  globalThis.game = {
    ...previous,
    i18n: {
      localize: key => EN[key] ?? key,
      format: (key, data = {}) => (EN[key] ?? key).replace(/\{(\w+)\}/g, (match, name) => (name in data ? String(data[name]) : match))
    }
  }
  return () => {
    if (previous === undefined) delete globalThis.game
    else globalThis.game = previous
  }
}
