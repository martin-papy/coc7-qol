/**
 * GM-only initiative rolls for hidden combatants.
 *
 * WORKAROUND for a CoC7 system bug. Foundry core makes the initiative roll of a
 * hidden combatant private to the GM, but CoC7 replaces Combat#rollInitiative
 * wholesale (coc7/hooks/init.js) and its version never looks at the combatant's
 * hidden state. With the "Optional" initiative rule the DEX check card of a
 * hidden NPC is therefore posted publicly, leaking its name and result.
 * Upstream issue: https://github.com/Miskatonic-Investigative-Society/CoC7-FoundryVTT/issues/2149
 *
 * Two hooks:
 *  1. preCreateChatMessage (rolling client) — narrows the card to the GMs.
 *  2. renderChatMessageHTML (every client) — Foundry still shows non-recipients
 *     a "<user> privately rolled some dice" placeholder for whispered rolls,
 *     which lets players count hidden NPCs; the placeholder is hidden for
 *     initiative cards whose content the viewer may not see. Hook 1 also
 *     silences the card's dice sound for the same reason.
 *
 * Designed to coexist with (and be removed after) the upstream fix:
 *  - It only ever TIGHTENS visibility: a card that already reaches only the GMs
 *    (GM whisper or blind roll) is left untouched, whatever made it so. A card
 *    players would see — public, or whispered to them by CoC7's Self Roll with
 *    "whisper target: owners/everyone" — is narrowed to the GMs.
 *  - UPSTREAM_FIXED_IN is a one-constant kill switch: set it to the CoC7 version
 *    that ships the fix and hook 1 disables itself from that version on. Hook 2
 *    stays: core itself shows the placeholder, so it remains useful after the fix.
 *  - Full removal = delete this folder + its "esmodules" entry in module.json
 *    + test/hidden-initiative.test.js. Nothing else imports it (it only reads
 *    the shared `retargetedMessages` marker from utils.js); it registers no
 *    settings, styles, lang keys or document flags of its own.
 */
import { retargetedMessages } from '../utils.js'
import { decideInitiativeVisibility, shouldHideCard } from './visibility.js'

// Set to the CoC7 version that fixes the issue upstream (e.g. '8.16').
// While null the workaround is active on every CoC7 version.
const UPSTREAM_FIXED_IN = null

let redundancyReported = false
let noGmReported = false
let unresolvedReported = false

/**
 * True once the running CoC7 version is at or above UPSTREAM_FIXED_IN.
 * @returns {boolean}
 */
function isUpstreamFixed () {
  if (!UPSTREAM_FIXED_IN) return false
  const current = game.system?.version
  if (!current) return false
  return !foundry.utils.isNewerVersion(UPSTREAM_FIXED_IN, current)
}

/**
 * Every combat, the active one first so it wins ambiguous matches.
 * @returns {Combat[]}
 */
function orderedCombats () {
  const all = game.combats?.contents ?? []
  const active = game.combat
  return active ? [active, ...all.filter(c => c !== active)] : all
}

/**
 * The user's default chat roll-mode setting — 'core.messageMode' on v14, falling
 * back to 'core.rollMode' on v13 (v14 keeps it only as a deprecated shim). This is
 * the persistent default, not necessarily the mode of the message at hand:
 * a per-roll override (e.g. the roll-visibility dropdown) never changes it.
 * @returns {string|null}
 */
function defaultRollMode () {
  for (const key of ['messageMode', 'rollMode']) {
    try {
      const value = game.settings.get('core', key)
      if (value) return value
    } catch (_) { /* setting not registered on this version — try the next */ }
  }
  return null
}

/**
 * A hidden combatant's initiative card already reached only the GMs although
 * the user's roll mode is public: something else (most likely the upstream fix)
 * now handles it. Say so once per session so the workaround can be retired.
 */
function reportRedundancy () {
  if (redundancyReported) return
  redundancyReported = true
  console.info('[coc7-qol] A hidden combatant\'s initiative roll already reached only the GMs while the roll mode is public. '
    + 'CoC7 (or another module) now hides these itself — the coc7-qol workaround in scripts/hidden-initiative/ can probably be removed.')
}

/**
 * Nobody to whisper to: the roll is left as is. Say so once so it is not silent.
 */
function reportNoGm () {
  if (noGmReported) return
  noGmReported = true
  console.warn('[coc7-qol] A hidden combatant rolled initiative but no user has the Gamemaster role — the roll was left as is.')
}

/**
 * An initiative card we could not tie to any combatant: if it belonged to a
 * hidden one, it went out unprotected. Say so once so a CoC7 change to the
 * card's shape does not fail silently.
 */
function reportUnresolved () {
  if (unresolvedReported) return
  unresolvedReported = true
  console.warn('[coc7-qol] An initiative roll could not be matched to any combatant (no speaker, no CoC7 actor uuid, or no match) — '
    + 'hidden combatants may not be protected. Has the CoC7 initiative card changed shape?')
}

Hooks.on('preCreateChatMessage', (document, data) => {
  // Read from the document, not the raw create data: earlier hooks (e.g. our
  // roll-visibility feature) may already have called updateSource on it.
  if (document.flags?.core?.initiativeRoll !== true) return
  if (isUpstreamFixed()) return

  const decision = decideInitiativeVisibility({
    message: document,
    combats: orderedCombats(),
    gmIds: ChatMessage.getWhisperRecipients('GM').map(u => u.id),
    modes: CONFIG.ChatMessage?.modes ?? CONFIG.Dice?.rollModes,
    rollMode: defaultRollMode(),
    handledByModule: retargetedMessages.has(document)
  })

  if (decision.kind === 'whisper') {
    document.updateSource(decision.update)
    // Core fills in the dice sound AFTER this hook when the raw create data has
    // no "sound" key (ChatMessage#_preCreate), which would undo the update above.
    if (data && typeof data === 'object') data.sound = null
  } else if (decision.kind === 'redundant') reportRedundancy()
  else if (decision.kind === 'no-gm') reportNoGm()
  else if (decision.kind === 'unresolved') reportUnresolved()
})

Hooks.on('renderChatMessageHTML', (message, html) => {
  if (!shouldHideCard({ message, contentVisible: message.isContentVisible })) return
  // Inline so it beats the stylesheet's display rule on .chat-message; the
  // element stays in the log so ChatLog can still find it for updates/deletes.
  html.style.display = 'none'
})
