/**
 * Pure rules for the Group Luck roll: which investigators can be offered, which are
 * ticked by default, and who rolls for the group. Never reads Foundry globals.
 */

/** @typedef {{ id: string, name: string, luck: number, ownerIds: string[] }} Investigator  ownerIds: non-GM users with OWNER permission */
/** @typedef {{ id: string, isActive: boolean, characterId: string|null }} Player           non-GM users only */
/** @typedef {Investigator & { isOnline: boolean, isDefault: boolean }} Candidate */
/** @typedef {{ roller: Candidate|null, tied: Candidate[], presentCount: number }} Resolution */

/**
 * Ids ticked by default: for each connected player, the assigned character when it is
 * listed, otherwise every listed investigator the player owns.
 * @param {Investigator[]} kept
 * @param {Player[]} players
 * @returns {Set<string>}
 */
function defaultIds (kept, players) {
  const keptIds = new Set(kept.map(investigator => investigator.id))
  const defaults = new Set()
  for (const player of players.filter(p => p.isActive)) {
    if (keptIds.has(player.characterId)) {
      defaults.add(player.characterId)
      continue
    }
    for (const investigator of kept) {
      if (investigator.ownerIds.includes(player.id)) defaults.add(investigator.id)
    }
  }
  return defaults
}

/**
 * Build the list of rows offered in the Group Luck dialog.
 * @param {Investigator[]} investigators
 * @param {Player[]} players
 * @param {{ locale?: string }} [options]
 * @returns {Candidate[]}
 */
export function buildCandidates (investigators, players, { locale } = {}) {
  const playerIds = new Set(players.map(player => player.id))
  const activeIds = new Set(players.filter(player => player.isActive).map(player => player.id))
  const kept = investigators.filter(investigator =>
    Number.isFinite(investigator.luck) && investigator.ownerIds.some(id => playerIds.has(id)))
  const defaults = defaultIds(kept, players)
  const collator = new Intl.Collator(locale, { sensitivity: 'base' })
  return kept
    .map(investigator => ({
      ...investigator,
      isOnline: investigator.ownerIds.some(id => activeIds.has(id)),
      isDefault: defaults.has(investigator.id)
    }))
    .sort((a, b) =>
      Number(b.isDefault) - Number(a.isDefault) ||
      a.luck - b.luck ||
      collator.compare(a.name, b.name))
}

/**
 * Decide who rolls: the ticked candidate with the lowest Luck.
 * @param {Candidate[]} candidates
 * @param {Iterable<string>} tickedIds
 * @param {string|null} [preferredId] wins a tie when it is among the tied rows
 * @returns {Resolution}
 */
export function resolveRoller (candidates, tickedIds, preferredId = null) {
  const ticked = new Set(tickedIds)
  const present = candidates.filter(candidate => ticked.has(candidate.id))
  const lowest = Math.min(...present.map(candidate => candidate.luck))
  const tied = present.filter(candidate => candidate.luck === lowest)
  const roller = tied.find(candidate => candidate.id === preferredId) ?? tied[0] ?? null
  return { roller, tied, presentCount: present.length }
}
