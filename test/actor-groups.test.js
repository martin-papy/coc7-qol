import { test } from 'node:test'
import assert from 'node:assert/strict'
import { actorGroupLabels, groupByActorType, nameSorter, ACTOR_GROUP_LABEL_KEYS } from '../scripts/actor-groups.js'

test('actorGroupLabels localises every known type through the given function', () => {
  const labels = actorGroupLabels(['character', 'container'], key => `L:${key}`)
  assert.deepEqual(labels, {
    character: `L:${ACTOR_GROUP_LABEL_KEYS.character}`,
    container: `L:${ACTOR_GROUP_LABEL_KEYS.container}`
  })
})

test('actorGroupLabels falls back to the raw type for a type without a key', () => {
  const labels = actorGroupLabels(['character', 'spaceship'], key => `L:${key}`)
  assert.equal(labels.spaceship, 'spaceship')
})

test('groupByActorType buckets in order and collects strays', () => {
  const { groups, strays } = groupByActorType(['a:npc', 'b:character', 'c:vehicle', 'd:npc'], {
    order: ['character', 'npc'],
    typeOf: item => item.split(':')[1]
  })
  assert.deepEqual([...groups.entries()], [['character', ['b:character']], ['npc', ['a:npc', 'd:npc']]])
  assert.deepEqual(strays, ['c:vehicle'])
})

test('nameSorter returns a sorted copy without mutating the input', () => {
  const input = ['b', 'A', 'c']
  const sorted = nameSorter('en')(input, x => x)
  assert.deepEqual(sorted, ['A', 'b', 'c'])
  assert.deepEqual(input, ['b', 'A', 'c'])
})
