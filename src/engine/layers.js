// src/engine/layers.js
// Applies continuous effects to a permanent in CR 613 layer order.
// This is the ONLY place characteristic computation logic lives.
//
// CONSTRAINTS:
//   - Pure function. Never mutates state or any argument.
//   - Called by getPow / getTou / hasKw in DuelCore.js (thin wrappers only).
//   - Layer ordering: 1 (copy) -> 2 (control) -> 3 (text) -> 4 (type) ->
//     5 (color) -> 6 (ability) -> 7a (CDA) -> 7b (set P/T) -> 7c (modify P/T)
//     -> 7d (switch P/T)
//   - Within each layer, effects apply in enterTs order (613.7d).
//   - Layer 1 (copy): applied in DuelCore.js at resolution time (copyPermanentCharacteristics),
//     not as a continuous pass here -- a frozen copy is a fact about base identity, not continuous.
//   - Layer 2 (control): tracked via controlGrant on permanents + revertControlGrant in DuelCore.js.
//     By the time computeCharacteristics runs, the permanent is already under its current controller.
//   - Layer 3 (text substitution): implemented -- textSwap field on permanents, applied below.

import { isLand, isCre, isArt } from './DuelCore.js';
import KEYWORDS from '../data/keywords.js';

// Map from color name to color char, used for lord target matching.
const COLOR_MAP = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' };
const COLOR_TARGETS = new Set(Object.keys(COLOR_MAP));

// All landwalk keyword IDs, for Holy Ground suppression.
const WALK_KW_IDS = [
  'LANDWALK', 'PLAINSWALK', 'ISLANDWALK', 'SWAMPWALK', 'MOUNTAINWALK', 'FORESTWALK',
];

// Reads a permanent's CURRENT (post-type-effect) subtype for "how many Forests/
// Swamps do you control"-style CDAs below, so Evil Presence turning a Forest into
// a Swamp correctly stops it counting as a Forest (and starts counting as a
// Swamp). Unlike matchesGlobalTypeFilter (which snapshots base subtype so Living
// Lands/Kormus Bell/Blood Moon don't chase each other's output -- see above),
// these evaluators read another permanent's already-baked subtypeEff from state,
// which is safe: no self-reference. See docs/SYSTEMS.md S18.9.
const subOf = c => c.subtypeEff ?? c.subtype ?? '';

// Named CDA evaluators. Each returns the computed P or T value for the card.
// Evaluated at read-time from current state; never stored in GameState.
export const CDA_EVALUATORS = {
  plagueRats:     (card, state) => [...state.p.bf, ...state.o.bf].filter(x => x.name === 'Plague Rats').length,
  swampCount:     (card, state) => state[card.controller]?.bf.filter(x => isLand(x) && subOf(x).includes('Swamp')).length ?? 0,
  forestCount:    (card, state) => state[card.controller]?.bf.filter(x => isLand(x) && subOf(x).includes('Forest')).length ?? 0,
  creatureCount:  (card, state) => [...state.p.bf, ...state.o.bf].filter(x => isCre(x) && x.controller === card.controller).length,
  forestBonus:    (card, state) => 1 + (state[card.controller]?.bf.some(x => isLand(x) && subOf(x).includes('Forest')) ? 1 : 0),
  forestBonusTou: (card, state) => 1 + (state[card.controller]?.bf.some(x => isLand(x) && subOf(x).includes('Forest')) ? 2 : 1),
  keldonWarlord:  (card, state) => state[card.controller]?.bf.filter(x => isCre(x) && !x.subtype?.includes('Wall')).length ?? 0,
  forestCountLiege:   (card, state) => {
    if (card.attacking) {
      const opp = card.controller === 'p' ? 'o' : 'p';
      return state[opp]?.bf.filter(x => isLand(x) && subOf(x).includes('Forest')).length ?? 0;
    }
    return state[card.controller]?.bf.filter(x => isLand(x) && subOf(x).includes('Forest')).length ?? 0;
  },
  // Water Wurm: gets +0/+1 as long as an opponent controls an Island.
  // Adapted from Card-Forge/forge (w/water_wurm.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  waterWurmToughness: (card, state) => {
    const base = typeof card.toughness === 'number' ? card.toughness : 0;
    const opp = card.controller === 'p' ? 'o' : 'p';
    const oppHasIsland = state[opp]?.bf.some(x => isLand(x) && subOf(x).includes('Island'));
    return base + (oppHasIsland ? 1 : 0);
  },
  // Gaea's Avenger: power and toughness are each equal to 1 plus the number of
  // artifacts your opponents control.
  // Adapted from Card-Forge/forge (g/gaeas_avenger.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  gaeasAvengerPT: (card, state) => {
    const opp = card.controller === 'p' ? 'o' : 'p';
    return 1 + (state[opp]?.bf.filter(x => isArt(x)).length ?? 0);
  },
  // People of the Woods: toughness is equal to the number of Forests you control.
  // Adapted from Card-Forge/forge (p/people_of_the_woods.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  peopleOfTheWoodsToughness: (card, state) =>
    state[card.controller]?.bf.filter(x => isLand(x) && subOf(x).includes('Forest')).length ?? 0,
  // Angry Mob: during your turn, power and toughness are each 2 plus the number
  // of Swamps your opponents control. During turns other than yours, 2/2.
  // Adapted from Card-Forge/forge (a/angry_mob.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  angryMobPT: (card, state) => {
    if (state.active !== card.controller) return 2;
    const opp = card.controller === 'p' ? 'o' : 'p';
    return 2 + (state[opp]?.bf.filter(x => isLand(x) && subOf(x).includes('Swamp')).length ?? 0);
  },
  // Shapeshifter: power equals the last chosen number, toughness is 7 minus it.
  // Adapted from Card-Forge/forge (s/shapeshifter.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  shapeshifterPower: (card) => card.chosenNumber ?? 0,
  shapeshifterToughness: (card) => 7 - (card.chosenNumber ?? 0),
};

function getTs(eff) {
  return eff.enterTs ?? 0;
}

// Filter-matching for global type-changing effects (Living Lands, Kormus Bell,
// Blood Moon). Matches against the affected card's BASE printed type/subtype
// (not any already-baked typeEff/subtypeEff) -- collectEffects snapshots all
// effects before applying them in timestamp order, so this intentionally does
// not chase dependencies between two type-changing effects on the same land
// (e.g. Evil Presence + Living Lands stacked on one permanent). SIMPLIFICATION:
// see docs/SYSTEMS.md S18.9.
function matchesGlobalTypeFilter(card, filter) {
  const baseType = card.type ?? '';
  const isBaseLand = baseType === 'Land' || baseType.includes('Land');
  if (!isBaseLand) return false;
  const sub = card.subtype ?? '';
  if (filter === 'Forest') return sub.includes('Forest');
  if (filter === 'Swamp') return sub.includes('Swamp');
  if (filter === 'nonBasicLand') return !sub.includes('Basic');
  return false;
}

// Collects all applicable continuous effects for the given card from the
// current game state. Returns a flat array of layer-annotated effect objects.
function collectEffects(card, state) {
  const effects = [];

  // 1. Card's own layerDef (CDA, etc.)
  if (card.layerDef) {
    effects.push({ ...card.layerDef, enterTs: card.enterTs ?? 0 });
  }

  // 2. Static abilities from other battlefield permanents (lords, globalPumps)
  const allBf = [...(state.p?.bf ?? []), ...(state.o?.bf ?? [])];
  for (const src of allBf) {
    if (src.iid === card.iid) continue;

    if (src.effect === 'lordEffect' || src.effect === 'globalPump') {
      // Kobold lords (Drill Sergeant/Overlord/Taskmaster): "you control" scoping,
      // unlike symmetric anthems such as Goblin King/Crusade/Bad Moon.
      // Adapted from Card-Forge/forge (k/kobold_drill_sergeant.txt, k/kobold_overlord.txt,
      // k/kobold_taskmaster.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
      if (src.lordControllerOnly && src.controller !== card.controller) continue;
      const t = src.targets?.toLowerCase();
      if (!t) continue;
      const matches = COLOR_TARGETS.has(t)
        ? card.color === COLOR_MAP[t]
        : card.subtype?.toLowerCase().split(' ').some(s => s === t);
      if (!matches) continue;

      // P/T bonus goes to Layer 7c
      if ((src.mod?.power ?? 0) !== 0 || (src.mod?.toughness ?? 0) !== 0) {
        effects.push({
          layer: '7c',
          power:     src.mod?.power     ?? 0,
          toughness: src.mod?.toughness ?? 0,
          enterTs: src.enterTs ?? 0,
        });
      }
      // Keyword grant goes to Layer 6
      if (src.lordKeywords?.length) {
        effects.push({
          layer: 6,
          addKeywords: src.lordKeywords,
          enterTs: src.enterTs ?? 0,
        });
      }
    }

    // Guardian Beast: while untapped, grants INDESTRUCTIBLE to noncreature artifacts
    // controlled by the same player (Layer 6 keyword grant).
    if (src.effect === 'guardianBeast' && !src.tapped && src.controller === card.controller) {
      if (isArt(card) && !isCre(card)) {
        effects.push({
          layer: 6,
          addKeywords: [KEYWORDS.INDESTRUCTIBLE.id],
          enterTs: src.enterTs ?? 0,
        });
      }
    }
  }

  // 3. Attached auras
  for (const aura of (card.enchantments ?? [])) {
    if (!aura.mod) continue;
    const enchTs = aura.enterTs ?? 0;
    if (aura.mod.power !== undefined || aura.mod.toughness !== undefined) {
      effects.push({
        layer: '7c',
        power:     aura.mod.power     ?? 0,
        toughness: aura.mod.toughness ?? 0,
        enterTs: enchTs,
      });
    }
    if (aura.mod.keywords?.length) {
      effects.push({ layer: 6, addKeywords: aura.mod.keywords, enterTs: enchTs });
    }
    if (aura.mod.protection?.length) {
      effects.push({ layer: 6, addProtection: aura.mod.protection, enterTs: enchTs });
    }
    if (aura.mod.removeKeywords?.length) {
      effects.push({ layer: 6, removeKeywords: aura.mod.removeKeywords, enterTs: enchTs });
    }
    if (aura.mod.layerDef) {
      effects.push({ ...aura.mod.layerDef, enterTs: enchTs });
    }
  }

  // 4. eotBuffs (temporary effects from spells / activated abilities)
  for (const buff of (card.eotBuffs ?? [])) {
    const buffTs = buff.enterTs ?? 0;
    if (buff.layerDef) {
      effects.push({ ...buff.layerDef, enterTs: buffTs });
    } else {
      if (buff.power !== undefined || buff.toughness !== undefined) {
        effects.push({
          layer: '7c',
          power:     buff.power     ?? 0,
          toughness: buff.toughness ?? 0,
          enterTs: buffTs,
        });
      }
      if (buff.keywords?.length) {
        effects.push({ layer: 6, addKeywords: buff.keywords, enterTs: buffTs });
      }
    }
  }

  // 5. Counters (Layer 7c)
  const p1p1 = card.counters?.P1P1 ?? 0;
  const m1m1 = card.counters?.M1M1 ?? 0;
  if (p1p1 !== 0 || m1m1 !== 0) {
    effects.push({ layer: '7c', power: p1p1 - m1m1, toughness: p1p1 - m1m1, enterTs: 0 });
  }

  // 6. textSwap: persistent text-word substitution (Sleight of Mind, Magical Hack).
  if (card.textSwap) {
    effects.push({ layer: 3, ...card.textSwap, enterTs: card.textSwap.enterTs ?? 0 });
  }

  // 7. Holy Ground (Option B): suppress landwalk keywords when opponent controls Holy Ground.
  //    Applied last in Layer 6 via MAX_SAFE_INTEGER timestamp so lord-granted walks are also suppressed.
  if (card.controller) {
    const opp = card.controller === 'p' ? 'o' : 'p';
    if (state[opp]?.bf.some(h => h.name === 'Holy Ground')) {
      effects.push({ layer: 6, removeKeywords: WALK_KW_IDS, enterTs: Number.MAX_SAFE_INTEGER });
    }
  }

  // 8. Castle: "Untapped creatures you control get +0/+2." Name-based static check,
  //    same pattern as Holy Ground above (no dedicated permanent-effect layer exists
  //    for "creatures you control" filtered by tapped state).
  //    Adapted from Card-Forge/forge (c/castle.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  if (isCre(card) && !card.tapped && state[card.controller]?.bf.some(h => h.name === 'Castle')) {
    effects.push({ layer: '7c', toughness: 2, enterTs: 0 });
  }

  // 9. Fortified Area: "Wall creatures you control get +1/+0 and have banding."
  //    Adapted from Card-Forge/forge (f/fortified_area.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  if (isCre(card) && card.subtype?.includes('Wall') && state[card.controller]?.bf.some(h => h.name === 'Fortified Area')) {
    effects.push({ layer: '7c', power: 1, enterTs: 0 });
    effects.push({ layer: 6, addKeywords: [KEYWORDS.BANDING.id], enterTs: 0 });
  }

  // 10. Weakstone: "Attacking creatures get -1/-0." Controller-blind, unlike Castle/
  //     Fortified Area above -- applies to any attacking creature on either side.
  //     Adapted from Card-Forge/forge (w/weakstone.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  if (isCre(card) && card.attacking && [...(state.p?.bf ?? []), ...(state.o?.bf ?? [])].some(h => h.name === 'Weakstone')) {
    effects.push({ layer: '7c', power: -1, enterTs: 0 });
  }

  // 11. Angelic Voices: "Creatures you control get +1/+1 as long as you control
  //     no nonartifact, nonwhite creatures."
  //     Adapted from Card-Forge/forge (a/angelic_voices.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  if (isCre(card) && card.controller && state[card.controller]?.bf.some(h => h.name === 'Angelic Voices')) {
    const hasOffColor = state[card.controller].bf.some(x => isCre(x) && x.color !== 'W' && !isArt(x));
    if (!hasOffColor) effects.push({ layer: '7c', power: 1, toughness: 1, enterTs: 0 });
  }

  // 12. Beasts of Bogardan: "This creature gets +1/+1 as long as an opponent
  //     controls a nontoken white permanent." No token tracking exists in this
  //     engine yet, so every permanent is treated as nontoken (SIMPLIFICATION).
  //     Adapted from Card-Forge/forge (b/beasts_of_bogardan.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  if (card.name === 'Beasts of Bogardan' && card.controller) {
    const opp = card.controller === 'p' ? 'o' : 'p';
    if (state[opp]?.bf.some(h => h.color === 'W')) {
      effects.push({ layer: '7c', power: 1, toughness: 1, enterTs: 0 });
    }
  }

  // 13. Orcish Oriflamme: "Attacking creatures you control get +1/+0."
  //     Adapted from Card-Forge/forge (o/orcish_oriflamme.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  if (isCre(card) && card.attacking && card.controller && state[card.controller]?.bf.some(h => h.name === 'Orcish Oriflamme')) {
    effects.push({ layer: '7c', power: 1, enterTs: 0 });
  }

  // 14. Global type/color/P-T-changing static effects (Living Lands, Kormus Bell,
  //     Blood Moon): unlike lordEffect/globalPump above (which target creatures by
  //     subtype/color and only ever modify Layer 6/7c), these target LANDS by a
  //     fixed filter and modify Layer 4 (type), Layer 5 (color), and Layer 7b (set
  //     P/T). Deferral Sweep 2 -- see docs/SYSTEMS.md S18.9.
  for (const src of allBf) {
    if (src.iid === card.iid) continue;
    const gte = src.globalTypeEffect;
    if (!gte || !matchesGlobalTypeFilter(card, gte.filter)) continue;
    const srcTs = src.enterTs ?? 0;
    if (gte.setTypes || gte.addTypes || gte.removeTypes || gte.setSubtypes || gte.addSubtypes || gte.removeSubtypes) {
      effects.push({
        layer: 4,
        setTypes: gte.setTypes, addTypes: gte.addTypes, removeTypes: gte.removeTypes,
        setSubtypes: gte.setSubtypes, addSubtypes: gte.addSubtypes, removeSubtypes: gte.removeSubtypes,
        enterTs: srcTs,
      });
    }
    if (gte.setColor !== undefined) {
      effects.push({ layer: 5, setColor: gte.setColor, enterTs: srcTs });
    }
    if (gte.setPower !== undefined || gte.setToughness !== undefined) {
      effects.push({ layer: '7b', setPower: gte.setPower, setToughness: gte.setToughness, enterTs: srcTs });
    }
  }

  // 15. Rabid Wombat: "gets +2/+2 for each Aura attached to it."
  //     Adapted from Card-Forge/forge (r/rabid_wombat.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  if (card.name === 'Rabid Wombat') {
    const auraCount = card.enchantments?.length ?? 0;
    if (auraCount > 0) effects.push({ layer: '7c', power: auraCount * 2, toughness: auraCount * 2, enterTs: 0 });
  }

  // 15b. Jihad: "White creatures get +2/+1 as long as the chosen player
  //      controls a nontoken permanent of the chosen color." No token tracking
  //      exists (every permanent treated as nontoken, matching the Beasts of
  //      Bogardan SIMPLIFICATION above).
  //      Adapted from Card-Forge/forge (j/jihad.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  if (isCre(card) && card.color === 'W') {
    for (const src of allBf) {
      if (src.name !== 'Jihad' || !src.chosenColor || !src.chosenPlayer) continue;
      if (state[src.chosenPlayer]?.bf.some(x => x.color === src.chosenColor)) {
        effects.push({ layer: '7c', power: 2, toughness: 1, enterTs: src.enterTs ?? 0 });
      }
    }
  }

  // 16. Hidden Path: "Green creatures have forestwalk."
  //     Adapted from Card-Forge/forge (h/hidden_path.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  if (isCre(card) && card.color === 'G' && [...(state.p?.bf ?? []), ...(state.o?.bf ?? [])].some(h => h.name === 'Hidden Path')) {
    effects.push({ layer: 6, addKeywords: [KEYWORDS.FORESTWALK.id], enterTs: 0 });
  }

  // 17. Ashnod's Battle Gear / Tawnos's Weaponry: "Target creature gets +X/+Y
  //     for as long as this artifact remains tapped." whileTappedPump is set on
  //     the source artifact by the pumpWhileTapped resolveEff case in
  //     DuelCore.js. Gating on src.tapped here (rather than a stored duration)
  //     means the bonus ends automatically the instant the artifact untaps --
  //     no separate expiry tracking needed.
  for (const src of allBf) {
    const wtp = src.whileTappedPump;
    if (!wtp || wtp.targetIid !== card.iid || !src.tapped) continue;
    effects.push({ layer: '7c', power: wtp.power || 0, toughness: wtp.toughness || 0, enterTs: src.enterTs ?? 0 });
  }

  return effects;
}

// Computes the full set of characteristics for a permanent by applying all
// continuous effects in CR 613 layer order.
//
// Returns: { power, toughness, color, types, subtypes, keywords, protection, landTypeOverride }
export function computeCharacteristics(card, state) {
  // Base values (non-numeric power/toughness — e.g. "*" on CDAs — defaults to 0)
  let power     = typeof card.power     === 'number' ? card.power     : 0;
  let toughness = typeof card.toughness === 'number' ? card.toughness : 0;

  const typeStr = card.type ?? '';
  let types    = typeStr.split(' ').filter(Boolean);
  let subtypes = card.subtype ? card.subtype.split(' ').filter(Boolean) : [];
  let color    = card.color ?? '';

  let keywords   = [...(card.keywords ?? [])];
  const rawProt  = card.protection;
  let protection = [...(Array.isArray(rawProt) ? rawProt : rawProt ? [rawProt] : [])];

  const effects = collectEffects(card, state);

  // Layer 3: Text-word substitution (Sleight of Mind, Magical Hack).
  // Applied to base values before layers 4-7; baked-in field mutation ensures all
  // direct .color / .keywords reads outside computeCharacteristics also see the change.
  const l3 = effects.filter(e => e.layer === 3).sort((a, b) => getTs(a) - getTs(b));
  for (const eff of l3) {
    if (eff.type === 'color' && color === eff.from) {
      color = eff.to;
    }
    if (eff.type === 'landtype') {
      keywords = keywords.map(kw => kw === eff.from ? eff.to : kw);
    }
  }

  // Layer 4: Type-changing effects
  const l4 = effects.filter(e => e.layer === 4).sort((a, b) => getTs(a) - getTs(b));
  for (const eff of l4) {
    if (eff.setTypes)       types    = [...eff.setTypes];
    if (eff.addTypes)       types    = [...types, ...eff.addTypes.filter(t => !types.includes(t))];
    if (eff.removeTypes)    types    = types.filter(t => !eff.removeTypes.includes(t));
    if (eff.setSubtypes)    subtypes = [...eff.setSubtypes];
    if (eff.addSubtypes)    subtypes = [...subtypes, ...eff.addSubtypes.filter(t => !subtypes.includes(t))];
    if (eff.removeSubtypes) subtypes = subtypes.filter(t => !eff.removeSubtypes.includes(t));
  }
  // landTypeOverride: a land whose subtype was fully REPLACED (not just added to)
  // by a Layer-4 effect down to a single recognized basic land type it didn't
  // print (Blood Moon -> Mountain, Evil Presence -> Swamp) is treated as having
  // lost its other printed land abilities and gained only that basic type's
  // intrinsic mana ability -- an engine-level SIMPLIFICATION of these cards'
  // actual Oracle rulings (real Blood Moon doesn't remove non-type-derived
  // abilities); see docs/SYSTEMS.md S18.9. Living Lands/Kormus Bell only ADD the
  // Creature type and never touch subtypes, so they never trigger this.
  const BASIC_LAND_SUBTYPES = new Set(['Plains', 'Island', 'Swamp', 'Mountain', 'Forest']);
  const baseSubtypes = card.subtype ? card.subtype.split(' ').filter(Boolean) : [];
  const subtypesReplaced = subtypes.length !== baseSubtypes.length || subtypes.some(t => !baseSubtypes.includes(t));
  const landTypeOverride = (subtypesReplaced && subtypes.length === 1 && BASIC_LAND_SUBTYPES.has(subtypes[0]))
    ? subtypes[0]
    : null;

  // Layer 5: Color-changing effects (last writer wins per 613.9)
  const l5 = effects.filter(e => e.layer === 5).sort((a, b) => getTs(a) - getTs(b));
  for (const eff of l5) {
    if (eff.setColor !== undefined) color = eff.setColor;
  }

  // Layer 6: Ability-adding / ability-removing
  const l6 = effects.filter(e => e.layer === 6).sort((a, b) => getTs(a) - getTs(b));
  for (const eff of l6) {
    if (eff.addKeywords) {
      for (const kw of eff.addKeywords) {
        if (!keywords.includes(kw)) keywords.push(kw);
      }
    }
    if (eff.removeKeywords) {
      keywords = keywords.filter(kw => !eff.removeKeywords.includes(kw));
    }
    if (eff.addProtection) {
      for (const p of eff.addProtection) {
        if (!protection.includes(p)) protection.push(p);
      }
    }
    if (eff.removeProtection) {
      protection = protection.filter(p => !eff.removeProtection.includes(p));
    }
  }

  // Layer 7a: Characteristic-defining abilities (replace base P/T)
  const l7a = effects.filter(e => e.layer === '7a').sort((a, b) => getTs(a) - getTs(b));
  for (const eff of l7a) {
    if (eff.powerFn && CDA_EVALUATORS[eff.powerFn]) {
      power = CDA_EVALUATORS[eff.powerFn](card, state);
    }
    if (eff.toughnessFn && CDA_EVALUATORS[eff.toughnessFn]) {
      toughness = CDA_EVALUATORS[eff.toughnessFn](card, state);
    }
  }

  // Layer 7b: Set power and/or toughness to a specific value (last writer wins)
  const l7b = effects.filter(e => e.layer === '7b').sort((a, b) => getTs(a) - getTs(b));
  for (const eff of l7b) {
    if (eff.setPower     !== undefined) power     = eff.setPower;
    if (eff.setToughness !== undefined) toughness = eff.setToughness;
  }

  // Layer 7c: Modify power and/or toughness by delta
  const l7c = effects.filter(e => e.layer === '7c').sort((a, b) => getTs(a) - getTs(b));
  for (const eff of l7c) {
    power     += eff.power     ?? 0;
    toughness += eff.toughness ?? 0;
  }

  // Layer 7d: Switch power and toughness
  const l7d = effects.filter(e => e.layer === '7d').sort((a, b) => getTs(a) - getTs(b));
  for (const _eff of l7d) {
    [power, toughness] = [toughness, power];
  }

  // Power floor: minimum 0. Toughness is NOT floored — SBE handles toughness <= 0.
  power = Math.max(0, power);

  return { power, toughness, color, types, subtypes, keywords, protection, landTypeOverride };
}
