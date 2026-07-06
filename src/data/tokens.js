// src/data/tokens.js
// Token creature/permanent templates -- separate from CARD_DB (per SYSTEMS.md
// token-creation section) so token definitions never leak into deckbuilding,
// binder, or card-search UIs that enumerate CARD_DB. Tokens are never cast and
// carry no cost/cmc/rarity fields.
//
// DuelCore.js instantiates these into gameplay objects via makeTokenInstance().

import KEYWORDS from './keywords.js';

export const TOKEN_DB = [
  // Rukh Egg: "create a 4/4 red Bird creature token with flying at the
  // beginning of the next end step."
  // Adapted from Card-Forge/forge (r/rukh_egg.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  {
    tokenId: "bird_rukh",
    name: "Bird",
    type: "Creature",
    subtype: "Bird",
    power: 4,
    toughness: 4,
    color: "R",
    keywords: [KEYWORDS.FLYING.id],
  },
  // Serpent Generator: "Create a 1/1 colorless Snake artifact creature token.
  // It has 'Whenever this creature deals damage to a player, that player gets
  // a poison counter.'"
  // Adapted from Card-Forge/forge (s/serpent_generator.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  {
    tokenId: "snake_poison",
    name: "Snake",
    type: "Artifact Creature",
    subtype: "Snake",
    power: 1,
    toughness: 1,
    color: "",
    keywords: [],
    triggeredAbilities: [
      { id: "snake_poison_dmg", trigger: { event: "ON_DAMAGE_DEALT" }, condition: { type: "selfIsDamageSourceToPlayer" }, effect: { type: "grantPoisonCounters", amount: 1 } },
    ],
  },
  // Tetravus: "create that many 1/1 colorless Tetravite artifact creature
  // tokens. They each have flying and 'This token can't be enchanted.'"
  // cantBeEnchanted is data-only (unenforced), matching the existing
  // unenforced consecrate_land noOtherAuras convention in cards.js.
  // Adapted from Card-Forge/forge (t/tetravus.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  {
    tokenId: "tetravite",
    name: "Tetravite",
    type: "Artifact Creature",
    subtype: "Tetravite",
    power: 1,
    toughness: 1,
    color: "",
    keywords: [KEYWORDS.FLYING.id],
    cantBeEnchanted: true,
  },
  // The Hive: "Create a 1/1 colorless Insect artifact creature token with
  // flying named Wasp."
  // Adapted from Card-Forge/forge (t/the_hive.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  {
    tokenId: "wasp",
    name: "Wasp",
    type: "Artifact Creature",
    subtype: "Insect",
    power: 1,
    toughness: 1,
    color: "",
    keywords: [KEYWORDS.FLYING.id],
  },
];
