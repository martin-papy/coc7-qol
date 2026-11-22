/**
 * Maps each label the Markdown renderer reads to an i18n key. CoC7's own keys reuse the sheet's
 * wording; the module-owned ones live in lang/*.json under COC7QOL.MarkdownExport. Pure: no Foundry
 * globals, the caller localizes the keys.
 */
const OWN = 'COC7QOL.MarkdownExport.'

export const LABEL_KEYS = {
  characteristics: 'CoC7.Characteristics',
  str: 'CHARAC.STR',
  con: 'CHARAC.CON',
  siz: 'CHARAC.SIZ',
  dex: 'CHARAC.DEX',
  app: 'CHARAC.APP',
  int: 'CHARAC.INT',
  pow: 'CHARAC.POW',
  edu: 'CHARAC.EDU',
  hp: 'CoC7.HP',
  mp: 'CoC7.MP',
  san: 'CoC7.SAN',
  luck: 'CoC7.Luck',
  mov: 'CoC7.Mov',
  db: 'CoC7.DB',
  build: 'CoC7.Build',
  armor: 'CoC7.Armor',
  skills: 'CoC7.Skills',
  skill: 'CoC7.Skill',
  regular: 'CoC7.RollDifficultyRegular',
  hard: 'CoC7.RollDifficultyHard',
  extreme: 'CoC7.RollDifficultyExtreme',
  weapons: 'CoC7.Weapons',
  weapon: OWN + 'Weapon',
  damage: 'CoC7.WeaponDamage',
  range: 'CoC7.WeaponRange',
  attacks: OWN + 'Attacks',
  ammo: OWN + 'Ammo',
  malfunction: 'CoC7.WeaponMalfunction',
  possessions: 'CoC7.Possessions',
  items: 'CoC7.Items',
  books: 'CoC7.Books',
  spells: 'CoC7.Spells',
  talents: 'CoC7.PulpTalents',
  armors: 'CoC7.Armor',
  statuses: 'CoC7.Status',
  wealth: 'CoC7.MonetaryTitle',
  spendingLevel: OWN + 'SpendingLevel',
  cash: OWN + 'Cash',
  assets: OWN + 'Assets',
  background: 'CoC7.Background',
  encounters: 'CoC7.BackgroundEncounters',
  immune: OWN + 'Immune',
  keeperNotes: 'CoC7.GmNotes'
}
