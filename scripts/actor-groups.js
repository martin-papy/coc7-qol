/**
 * Shared vocabulary for features that regroup a flat list of actors by type
 * (rest-targets, trade-targets). Keeps the group labels and the grouping /
 * sorting rules in one place.
 */

/** Localisation key of the heading shown for each actor type. */
export const ACTOR_GROUP_LABEL_KEYS = {
  character: 'COC7QOL.ActorGroup.Investigators',
  container: 'COC7QOL.ActorGroup.Storage',
  npc: 'COC7QOL.ActorGroup.Npcs',
  creature: 'COC7QOL.ActorGroup.Creatures',
  vehicle: 'COC7QOL.ActorGroup.Vehicles'
}

/**
 * Resolve the localised label of every type in `order`.
 * @param {string[]} order
 * @param {(key: string) => string} localize
 * @returns {Record<string, string>}
 */
export function actorGroupLabels (order, localize) {
  return Object.fromEntries(order.map(type => [type, localize(ACTOR_GROUP_LABEL_KEYS[type])]))
}

/**
 * Bucket items by actor type, preserving `order`; items of any other type go to `strays`.
 * @template T
 * @param {T[]} items
 * @param {object} opts
 * @param {string[]} opts.order  Types to group, in display order.
 * @param {(item: T) => string|undefined} opts.typeOf
 * @returns {{ groups: Map<string, T[]>, strays: T[] }}
 */
export function groupByActorType (items, { order, typeOf }) {
  const groups = new Map(order.map(type => [type, []]))
  const strays = []
  for (const item of items) {
    const bucket = groups.get(typeOf(item))
    if (bucket) bucket.push(item)
    else strays.push(item)
  }
  return { groups, strays }
}

/**
 * Build a name sorter for the given locale (BCP 47 tag; defaults to the host locale).
 * @param {string} [locale]
 * @returns {<T>(items: T[], nameOf: (item: T) => string) => T[]}  Returns a sorted copy.
 */
export function nameSorter (locale) {
  const collator = new Intl.Collator(locale, { sensitivity: 'base' })
  return (items, nameOf) => [...items].sort((a, b) => collator.compare(nameOf(a), nameOf(b)))
}
