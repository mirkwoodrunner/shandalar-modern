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

// Named CDA evaluators. Each returns the computed P or T value for the card.
// Evaluated at read-time from current state; never stored in GameState.
export const CDA_EVALUATORS = {
  plagueRats:     (card, state) => [...state.p.bf, ...state.o.bf].filter(x => x.name === 'Plague Rats').length,
  swampCount:     (card, state) => state[card.controller]?.bf.filter(x => isLand(x) && x.subtype?.includes('Swamp')).length ?? 0,
  forestCount:    (card, state) => state[card.controller]?.bf.filter(x => isLand(x) && x.subtype?.includes('Forest')).length ?? 0,
  creatureCount:  (card, state) => [...state.p.bf, ...state.o.bf].filter(x => isCre(x) && x.controller === card.controller).length,
  forestBonus:    (card, state) => 1 + (state[card.controller]?.bf.some(x => isLand(x) && x.subtype?.includes('Forest')) ? 1 : 0),
  forestBonusTou: (card, state) => 1 + (state[card.controller]?.bf.some(x => isLand(x) && x.subtype?.includes('Forest')) ? 2 : 1),
  keldonWarlord:  (card, state) => state[card.controller]?.bf.filter(x => isCre(x) && !x.subtype?.includes('Wall')).length ?? 0,
  forestCountLiege:   (card, state) => {
    if (card.attacking) {
      const opp = card.controller === 'p' ? 'o' : 'p';
      return state[opp]?.bf.filter(x => isLand(x) && x.subtype?.includes('Forest')).length ?? 0;
    }
    return state[card.controller]?.bf.filter(x => isLand(x) && x.subtype?.includes('Forest')).length ?? 0;
  },
};

function getTs(eff) {
  return eff.enterTs ?? 0;
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

  return effects;
}

// Computes the full set of characteristics for a permanent by applying all
// continuous effects in CR 613 layer order.
//
// Returns: { power, toughness, color, types, subtypes, keywords, protection }
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

  return { power, toughness, color, types, subtypes, keywords, protection };
}
