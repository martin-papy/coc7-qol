import neostandard from 'neostandard'

// Globals that FoundryVTT defines in the browser and the module relies on.
const FOUNDRY_GLOBALS = Object.fromEntries([
  'Actor', 'CONFIG', 'ChatMessage', 'Hooks', 'Item', 'Roll',
  'foundry', 'fromUuid', 'fromUuidSync', 'game', 'ui'
].map(name => [name, 'readonly']))

export default [
  ...neostandard({
    env: ['browser'],
    ignores: ['node_modules/**', 'temp/**', '.playwright-mcp/**']
  }),
  {
    files: ['scripts/**/*.js'],
    languageOptions: { globals: FOUNDRY_GLOBALS }
  },
  {
    files: ['test/**/*.js', 'eslint.config.js'],
    languageOptions: { globals: { ...Object.fromEntries(['process', 'URL'].map(n => [n, 'readonly'])) } }
  }
]
