import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

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
