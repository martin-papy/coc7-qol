import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, statSync } from 'node:fs'

// Foundry loads whatever module.json declares and reports a missing file only
// in the browser console, so a renamed script or stylesheet would ship broken.
const ROOT = new URL('../', import.meta.url)
const MANIFEST = JSON.parse(readFileSync(new URL('module.json', ROOT), 'utf8'))

/** Whether a path of the manifest, relative to the module root, is a file. */
function isFile (path) {
  try {
    return statSync(new URL(path, ROOT)).isFile()
  } catch (_) {
    return false
  }
}

const missing = paths => paths.filter(path => !isFile(path))

test('every esmodules entry of module.json is a file', () => {
  assert.ok(MANIFEST.esmodules.length > 0)
  assert.deepEqual(missing(MANIFEST.esmodules), [])
})

test('every styles entry of module.json is a file', () => {
  assert.ok(MANIFEST.styles.length > 0)
  assert.deepEqual(missing(MANIFEST.styles.map(style => style.src)), [])
})

test('every languages entry of module.json is a file', () => {
  assert.ok(MANIFEST.languages.length > 0)
  assert.deepEqual(missing(MANIFEST.languages.map(language => language.path)), [])
})

test('every manifest path is inside a folder the release zip ships', () => {
  // The release workflow zips module.json, LICENSE, scripts/, styles/ and lang/.
  const paths = [
    ...MANIFEST.esmodules,
    ...MANIFEST.styles.map(style => style.src),
    ...MANIFEST.languages.map(language => language.path)
  ]
  assert.deepEqual(paths.filter(path => !/^(scripts|styles|lang)\//.test(path)), [])
})
