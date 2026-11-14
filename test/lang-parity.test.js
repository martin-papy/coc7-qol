import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

const load = lang => JSON.parse(readFileSync(new URL(`../lang/${lang}.json`, import.meta.url), 'utf8'))
const EN = load('en')
const FR = load('fr')
const placeholders = text => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort()

test('en and fr define the same keys', () => {
  assert.deepEqual(Object.keys(FR).sort(), Object.keys(EN).sort())
})

test('each fr string uses the same {placeholders} as its en string', () => {
  const mismatched = Object.keys(EN).filter(key => key in FR && placeholders(EN[key]).join() !== placeholders(FR[key]).join())
  assert.deepEqual(mismatched, [])
})

/** Every .js file under a directory, recursively. */
function scriptFiles (dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir)
    if (entry.isDirectory()) return scriptFiles(url)
    return entry.name.endsWith('.js') ? [url] : []
  })
}

test('every COC7QOL key the scripts reference is defined', () => {
  const referenced = new Set(scriptFiles(new URL('../scripts/', import.meta.url))
    .flatMap(file => readFileSync(file, 'utf8').match(/COC7QOL\.[A-Za-z0-9_.]+/g) ?? []))
  assert.ok(referenced.size > 0)

  // A reference ending in a dot is the prefix of a key completed at runtime
  // ('COC7QOL.AIGenerator.Tier.' + tier): at least one key must start with it.
  const keys = Object.keys(EN)
  const undefinedKeys = [...referenced].filter(ref => ref.endsWith('.')
    ? !keys.some(key => key.startsWith(ref))
    : !(ref in EN))
  assert.deepEqual(undefinedKeys, [])
})
