import { test } from 'node:test'
import assert from 'node:assert/strict'
import weaponMapper from '../scripts/ai-generator/mappers/weapon.js'

const MARKUP = '<img src=x onerror="alert(1)">'

const llmWeapon = overrides => ({ name: 'Colt .45', damage: '1D10+2', skill: 'Handgun', ...overrides })

test('toFoundryData stores markup in the LLM description as text, not HTML', () => {
  const data = weaponMapper.toFoundryData(llmWeapon({ description: `A sidearm ${MARKUP}` }))

  const value = data.system.description.value
  assert.equal(value.includes('<'), false)
  assert.equal(value.includes('&lt;img'), true)
  assert.equal(value.startsWith('A sidearm '), true)
})

test('toFoundryData keeps an empty description when the LLM gives none', () => {
  const data = weaponMapper.toFoundryData(llmWeapon())

  assert.equal(data.system.description.value, '')
})
