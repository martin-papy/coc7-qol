import { escapeHtml } from '../utils.js'

/** The CoC7 chat link that rolls the clicker's Luck, with no label and no difficulty. */
export const LUCK_LINK = '@coc7.check[subtype:attribute,name:lck]'

/**
 * Build the chat message data asking one player to roll Luck for the group.
 * @param {import('./candidates.js').Candidate} roller Investigator who must roll
 * @param {number} presentCount Number of investigators present
 * @param {{ t: (key: string) => string, tf: (key: string, data: object) => string, userName: string }} options
 * @returns {{ speaker: { alias: string }, whisper: string[], content: string }}
 */
export function buildRequestMessage (roller, presentCount, { t, tf, userName }) {
  const name = escapeHtml(roller.name)
  const sentence = presentCount > 1
    ? tf('COC7QOL.GroupLuck.Message.Lowest', { name, luck: roller.luck, count: presentCount })
    : tf('COC7QOL.GroupLuck.Message.Single', { name })
  return {
    speaker: { alias: userName },
    whisper: [...roller.ownerIds],
    content: `<p><strong>${t('COC7QOL.GroupLuck.Title')}</strong> — ${sentence}</p><p>${LUCK_LINK}</p>`
  }
}
