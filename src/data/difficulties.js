// src/data/difficulties.js
// Difficulty configuration for Shandalar campaign mode.
// Read-only data consumed by OverworldGame and DuelCore.
// DO NOT import from engine files here.

import { CARD_DB } from './cards.js';

export const DIFFICULTIES = {
  APPRENTICE: {
    id: 'APPRENTICE',
    name: 'Apprentice',
    description: 'A gentle introduction. Mono-color start, forgiving life totals.',
    // Player campaign starting life (overworld HP = duel starting life)
    startingLife: 20,
    // Enemy duel starting life by tier [tier1, tier2, tier3]
    tierLife: [14, 17, 20],
    // Boss duel starting life base (before per-kill bonus)
    bossBase: 20,
    // Life added to subsequent boss base per mage already defeated
    bossPerKill: 3,
    // Starting deck total card count range [min, max] (lands + spells)
    deckSize: [28, 32],
    // Color weight distribution [primary, secondary, tertiary, quaternary, quinary]
    // Values are proportions of non-land spell slots; must sum <= 1.0
    // Apprentice: 100% primary color, no off-color
    colorWeights: [1.0, 0.0, 0.0, 0.0, 0.0],
    // Off-color card draw multiplier (applied on top of rarity weight)
    offColorMultiplier: 0.0,
    // Target land ratio of total deck
    landRatio: 0.425,
    // Maximum random variance applied to land ratio (+/-)
    landVariance: 0.02,
    // Maximum shift in land color distribution from exact proportional ratio
    // e.g. 0.10 means Plains% can shift +-10 percentage points from exact ratio
    landColorVariance: 0.10,
  },
  MAGICIAN: {
    id: 'MAGICIAN',
    name: 'Magician',
    description: 'Two-color starts. Enemies hit harder.',
    startingLife: 16,
    tierLife: [16, 20, 24],
    bossBase: 25,
    bossPerKill: 4,
    deckSize: [33, 37],
    colorWeights: [0.75, 0.25, 0.0, 0.0, 0.0],
    offColorMultiplier: 0.3,
    landRatio: 0.425,
    landVariance: 0.04,
    landColorVariance: 0.20,
  },
  SORCERER: {
    id: 'SORCERER',
    name: 'Sorcerer',
    description: 'Three-color starts. Mana inconsistency is real.',
    startingLife: 13,
    tierLife: [18, 22, 27],
    bossBase: 30,
    bossPerKill: 5,
    deckSize: [38, 42],
    colorWeights: [0.60, 0.25, 0.15, 0.0, 0.0],
    offColorMultiplier: 0.5,
    landRatio: 0.425,
    landVariance: 0.06,
    landColorVariance: 0.35,
  },
  WIZARD: {
    id: 'WIZARD',
    name: 'Wizard',
    description: 'Up to five colors. Mono-color possible but rare. Brutal enemies.',
    startingLife: 10,
    tierLife: [20, 25, 30],
    bossBase: 40,
    bossPerKill: 6,
    deckSize: [38, 42],
    colorWeights: [0.45, 0.25, 0.20, 0.10, 0.0],
    offColorMultiplier: 0.7,
    landRatio: 0.425,
    landVariance: 0.10,
    landColorVariance: 0.50,
  },
};

// Rarity base draw weights
export const RARITY_WEIGHTS = { C: 10, U: 4, R: 1 };

// Colorless artifact rarity step-up: Common treated as Uncommon weight,
// Uncommon treated as Rare weight, Rare excluded from starting decks entirely.
export const ARTIFACT_RARITY_MAP = { C: 'U', U: 'R', R: null };

export const COLOR_LAND = { W: 'plains', U: 'island', B: 'swamp', R: 'mountain', G: 'forest' };

export default DIFFICULTIES;

/**
 * Generate a randomized starting deck for a new campaign.
 *
 * @param {string} primaryColor - 'W'|'U'|'B'|'R'|'G'
 * @param {string} difficultyId - key of DIFFICULTIES
 * @param {number} [seed] - optional seed hint (uses Math.random if absent)
 * @returns {string[]} array of card IDs (lands included)
 */
export function generateStartingDeck(primaryColor, difficultyId, seed) {
  const diff = DIFFICULTIES[difficultyId] || DIFFICULTIES.APPRENTICE;

  // --- Deck size: random within [min, max] ---
  const [sizeMin, sizeMax] = diff.deckSize;
  const totalSize = sizeMin + Math.floor(Math.random() * (sizeMax - sizeMin + 1));

  // --- Land count: ~42.5% with variance ---
  const landRatioVariance = (Math.random() * 2 - 1) * diff.landVariance;
  const landRatio = Math.min(0.55, Math.max(0.35, diff.landRatio + landRatioVariance));
  const landCount = Math.round(totalSize * landRatio);
  const spellCount = totalSize - landCount;

  // --- Determine active colors for this deck ---
  // colorWeights[0] = primary fraction, [1] = secondary, etc.
  // Shuffle the off-colors so secondary/tertiary assignment is random
  const offColors = ['W', 'U', 'B', 'R', 'G'].filter(c => c !== primaryColor);
  // Fisher-Yates shuffle of offColors
  for (let i = offColors.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [offColors[i], offColors[j]] = [offColors[j], offColors[i]];
  }
  const colorSlots = [primaryColor, ...offColors]; // length 5

  // Compute actual spell counts per color
  const weights = diff.colorWeights; // [primary, sec, ter, quat, quin]
  const spellsPerColor = {}; // color -> count
  let assigned = 0;
  for (let i = 0; i < colorSlots.length; i++) {
    if (weights[i] <= 0) continue;
    const count = i < colorSlots.length - 1
      ? Math.floor(spellCount * weights[i])
      : spellCount - assigned; // last active color gets remainder
    if (count > 0) {
      spellsPerColor[colorSlots[i]] = count;
      assigned += count;
    }
  }
  // Edge: if assigned < spellCount due to flooring, add remainder to primary
  const remainder = spellCount - Object.values(spellsPerColor).reduce((a, b) => a + b, 0);
  if (remainder > 0) spellsPerColor[primaryColor] = (spellsPerColor[primaryColor] || 0) + remainder;

  // --- Build weighted card pool ---
  // Partition CARD_DB into colored and colorless (artifacts)
  const isBasicLand = (c) => ['plains','island','swamp','mountain','forest'].includes(c.id);

  const spellIds = [];

  for (const [color, count] of Object.entries(spellsPerColor)) {
    // Eligible cards: matching color, not a basic land
    const eligible = CARD_DB.filter(c => !isBasicLand(c) && c.color === color);
    const isOnColor = color === primaryColor;

    // Build weighted pool entries: each card represented weight times
    const pool = [];
    for (const card of eligible) {
      const baseWeight = RARITY_WEIGHTS[card.rarity] ?? 1;
      const colorMult = isOnColor ? 1.0 : diff.offColorMultiplier;
      const weight = Math.round(baseWeight * colorMult * 10);
      for (let w = 0; w < weight; w++) pool.push(card.id);
    }

    // Draw `count` cards from pool with replacement (no 5-copy limit needed for starting deck)
    // Cap at 4 copies of any single card
    const drawn = [];
    const localCopies = {};
    let attemptsLeft = count * 30;
    while (drawn.length < count && attemptsLeft-- > 0) {
      if (pool.length === 0) break;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      const copies = localCopies[pick] || 0;
      if (copies < 4) {
        drawn.push(pick);
        localCopies[pick] = copies + 1;
      }
    }
    // If we couldn't fill (very small pool), pad with basics -- handled in land section
    spellIds.push(...drawn);
  }

  // --- Colorless artifacts ---
  // Available at all difficulties; treated as one rarity step up.
  // Each color slot gets a proportional share of artifact slots (~10% of spell slots).
  const artifactSlots = Math.max(0, spellCount - spellIds.length);
  if (artifactSlots > 0 || Math.random() < 0.3) {
    const artifactPool = [];
    for (const card of CARD_DB.filter(c => !isBasicLand(c) && c.color === '')) {
      const mappedRarity = ARTIFACT_RARITY_MAP[card.rarity];
      if (mappedRarity === null) continue; // rare artifacts excluded
      const weight = Math.round((RARITY_WEIGHTS[mappedRarity] ?? 1) * 10);
      for (let w = 0; w < weight; w++) artifactPool.push(card.id);
    }
    const targetArtifacts = Math.min(
      artifactSlots > 0 ? artifactSlots : Math.floor(spellCount * 0.10),
      spellCount - spellIds.length > 0 ? spellCount - spellIds.length : 2
    );
    const artCopies = {};
    let artAttempts = targetArtifacts * 20;
    while (spellIds.length < spellCount && artAttempts-- > 0) {
      if (artifactPool.length === 0) break;
      const pick = artifactPool[Math.floor(Math.random() * artifactPool.length)];
      const copies = artCopies[pick] || 0;
      if (copies < 4) {
        spellIds.push(pick);
        artCopies[pick] = copies + 1;
      }
    }
  }

  // Trim to spellCount if we somehow overshot
  const finalSpells = spellIds.slice(0, spellCount);

  // --- Land generation ---
  // Count actual colors represented in finalSpells
  const colorCounts = {};
  for (const id of finalSpells) {
    const card = CARD_DB.find(c => c.id === id);
    if (card && card.color && card.color !== '') {
      colorCounts[card.color] = (colorCounts[card.color] || 0) + 1;
    }
  }
  // Colorless spells don't demand a color land; distribute remaining land slots
  const totalColorSpells = Object.values(colorCounts).reduce((a, b) => a + b, 0) || 1;

  // Base proportional ratios
  const exactRatios = {};
  for (const [c, cnt] of Object.entries(colorCounts)) {
    exactRatios[c] = cnt / totalColorSpells;
  }

  // Apply land color variance: shift ratios randomly within landColorVariance
  // Higher difficulty = wider possible shift
  const shiftedRatios = { ...exactRatios };
  const colorKeys = Object.keys(shiftedRatios);
  if (colorKeys.length > 1) {
    // For each color, apply a random shift bounded by landColorVariance
    const shifts = {};
    let shiftSum = 0;
    for (const c of colorKeys) {
      const shift = (Math.random() * 2 - 1) * diff.landColorVariance;
      shifts[c] = shift;
      shiftSum += shift;
    }
    // Normalize so ratios still sum to 1
    for (const c of colorKeys) {
      shiftedRatios[c] = Math.max(0.05, exactRatios[c] + shifts[c] - shiftSum / colorKeys.length);
    }
    // Re-normalize to sum to 1
    const ratioTotal = Object.values(shiftedRatios).reduce((a, b) => a + b, 0);
    for (const c of colorKeys) shiftedRatios[c] /= ratioTotal;
  }

  // Assign land counts
  const landIds = [];
  const actualLandCount = Math.min(landCount, totalSize - finalSpells.length);
  let landsAssigned = 0;
  const colorLandCounts = {};
  for (const [i, c] of colorKeys.entries()) {
    const isLast = i === colorKeys.length - 1;
    const count = isLast
      ? actualLandCount - landsAssigned
      : Math.round(actualLandCount * shiftedRatios[c]);
    colorLandCounts[c] = Math.max(0, count);
    landsAssigned += colorLandCounts[c];
  }
  // Edge: if primary color has no lands (shouldn't happen), ensure minimum 1
  if (colorCounts[primaryColor] > 0 && !colorLandCounts[primaryColor]) {
    colorLandCounts[primaryColor] = 1;
  }

  for (const [c, cnt] of Object.entries(colorLandCounts)) {
    const landId = COLOR_LAND[c];
    if (landId) {
      for (let i = 0; i < cnt; i++) landIds.push(landId);
    }
  }

  return [...finalSpells, ...landIds];
}
