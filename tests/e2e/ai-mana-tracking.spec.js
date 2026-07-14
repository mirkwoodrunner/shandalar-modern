// tests/e2e/ai-mana-tracking.spec.js
//
// Verifies that the AI correctly chains ramp spells into follow-up casts
// within the same main phase turn.
//
// Bug context: evaluateAndCast was not deducting spent mana from virtualState,
// and applyVirtualPlay did not credit addMana spells into the virtual pool.
// This caused the AI to cast Dark Ritual but fail to cast any follow-up spell.

import { test, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers — build plain-JS game state objects matching the GameState shape.
// These mirror src/engine/__tests__/_factory.js but live here to avoid an
// ES module import across the Playwright/Vite boundary.
// ---------------------------------------------------------------------------

function makePlayerState(overrides = {}) {
  return {
    life: 20,
    lib: [],
    hand: [],
    bf: [],
    gy: [],
    exile: [],
    mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
    extraTurns: 0,
    mulls: 0,
    lifeAnim: null,
    poisonCounters: 0,
    ...overrides,
  };
}

function makeState({ pBf = [], oBf = [], pHand = [], oHand = [], phase = 'MAIN_1' } = {}) {
  return {
    phase,
    active: 'o',
    turn: 2,
    landsPlayed: 0,
    spellsThisTurn: 0,
    attackers: [],
    blockers: {},
    stack: [],
    over: null,
    selCard: null,
    selTgt: null,
    xVal: 1,
    log: [],
    ruleset: {
      startingLife: 20,
      startingHandSize: 7,
      drawOnFirstTurn: false,
      londonMulligan: false,
      deathtouch: true,
    },
    oppArch: { id: 'GENERIC', profileId: 'GENERIC' },
    castleMod: null,
    pendingLotus: false,
    pendingLotusIid: null,
    pendingBop: false,
    turnState: { damageLog: [] },
    triggerQueue: [],
    pendingChoice: null,
    fogActive: false,
    anteEnabled: false,
    anteP: null,
    anteO: null,
    p: makePlayerState({ bf: pBf, hand: pHand }),
    o: makePlayerState({ bf: oBf, hand: oHand }),
  };
}

// Minimal land card shape (produces Black mana).
function makeSwamp(iid) {
  return {
    iid,
    id: 'swamp',
    name: 'Swamp',
    type: 'Land',
    subtype: 'Swamp',
    color: 'B',
    cmc: 0,
    cost: '',
    keywords: [],
    tapped: false,
    summoningSick: false,
    attacking: false,
    blocking: null,
    damage: 0,
    counters: {},
    eotBuffs: [],
    enchantments: [],
    produces: ['B'],
    controller: 'o',
  };
}

// Dark Ritual — addMana spell; produces BBB for B.
function makeDarkRitual(iid) {
  return {
    iid,
    id: 'dark_ritual',
    name: 'Dark Ritual',
    type: 'Instant',
    color: 'B',
    cmc: 1,
    cost: 'B',
    keywords: [],
    tapped: false,
    summoningSick: false,
    attacking: false,
    blocking: null,
    damage: 0,
    counters: {},
    eotBuffs: [],
    enchantments: [],
    effect: 'addMana',
    mana: ['B', 'B', 'B'],
    controller: 'o',
  };
}

// Terror — instant removal costing 1B; needs 2 mana total.
// Without the ramp fix the AI cannot cast this after Dark Ritual + 1 Swamp.
function makeTerror(iid) {
  return {
    iid,
    id: 'terror',
    name: 'Terror',
    type: 'Instant',
    color: 'B',
    cmc: 2,
    cost: '1B',
    keywords: [],
    tapped: false,
    summoningSick: false,
    attacking: false,
    blocking: null,
    damage: 0,
    counters: {},
    eotBuffs: [],
    enchantments: [],
    effect: 'destroy',
    controller: 'o',
  };
}

// Hypnotic Specter — 2/2 creature costing 1BB; needs 3 mana total, 2 of which Black.
// Costs exactly what Dark Ritual + 1 Swamp provide.
function makeHypnoticSpecter(iid) {
  return {
    iid,
    id: 'hypnotic_specter',
    name: 'Hypnotic Specter',
    type: 'Creature',
    subtype: 'Specter',
    color: 'B',
    cmc: 3,
    cost: '1BB',
    keywords: [],
    tapped: false,
    summoningSick: false,
    attacking: false,
    blocking: null,
    damage: 0,
    counters: {},
    eotBuffs: [],
    enchantments: [],
    effect: 'none',
    controller: 'o',
  };
}

// Vanilla creature on the player's side so Terror has a legal target.
function makeVanillaCreature(iid) {
  return {
    iid,
    id: 'grizzly_bears',
    name: 'Grizzly Bears',
    type: 'Creature',
    subtype: 'Bear',
    color: 'G',
    cmc: 2,
    cost: '1G',
    power: 2,
    toughness: 2,
    keywords: [],
    tapped: false,
    summoningSick: false,
    attacking: false,
    blocking: null,
    damage: 0,
    counters: {},
    eotBuffs: [],
    enchantments: [],
    controller: 'p',
  };
}

// ---------------------------------------------------------------------------

test.describe('@engine-ai-1 AI virtual mana tracking — ramp spell chaining', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for Vite-built module to be available.
    await page.waitForFunction(() => document.readyState === 'complete', { timeout: 15000 });
  });

  // -------------------------------------------------------------------------
  // Test 1: evaluateAndCast pool deduction
  // The AI has 1 Swamp + Dark Ritual + Hypnotic Specter in hand.
  // After casting Dark Ritual (cost B from Swamp), the virtual pool should
  // hold BB (net: BBB produced - B cost = BB remaining).
  // The planner must then see Hypnotic Specter (cost 1BB) as affordable and
  // include a second PLAY_CARD in the plan.
  // -------------------------------------------------------------------------
  test('AI casts Dark Ritual then Hypnotic Specter in same main phase', async ({ page }) => {
    const gameState = makeState({
      oBf: [makeSwamp('swamp-1')],
      oHand: [makeDarkRitual('ritual-1'), makeHypnoticSpecter('specter-1')],
      pBf: [],
    });

    const plan = await page.evaluate(async (state) => {
      // Dynamic import so we reach the Vite-built module at runtime.
      const mod = await import('/src/engine/AI.js');
      return mod.getAIPlan(state, 'MAIN_1');
    }, gameState);

    const playCasts = plan.actions.filter(a => a.type === 'PLAY_CARD');
    const castIds = playCasts.map(a => a.cardId);

    expect(castIds).toContain('ritual-1');
    expect(castIds).toContain('specter-1');
    // Dark Ritual must be cast before Hypnotic Specter.
    expect(castIds.indexOf('ritual-1')).toBeLessThan(castIds.indexOf('specter-1'));
  });

  // -------------------------------------------------------------------------
  // Test 2: applyVirtualPlay credits addMana into virtual pool
  // Same scenario with Terror instead: the AI needs the BBB from Dark Ritual
  // to afford Terror (1B) after spending B on the ritual itself.
  // Player board has a creature so Terror has a valid target.
  // -------------------------------------------------------------------------
  test('AI casts Dark Ritual then Terror targeting player creature', async ({ page }) => {
    const gameState = makeState({
      oBf: [makeSwamp('swamp-1')],
      oHand: [makeDarkRitual('ritual-1'), makeTerror('terror-1')],
      pBf: [makeVanillaCreature('bear-1')],
    });

    const plan = await page.evaluate(async (state) => {
      const mod = await import('/src/engine/AI.js');
      return mod.getAIPlan(state, 'MAIN_1');
    }, gameState);

    const playCasts = plan.actions.filter(a => a.type === 'PLAY_CARD');
    const castIds = playCasts.map(a => a.cardId);

    expect(castIds).toContain('ritual-1');
    expect(castIds).toContain('terror-1');
    expect(castIds.indexOf('ritual-1')).toBeLessThan(castIds.indexOf('terror-1'));
  });

  // -------------------------------------------------------------------------
  // Test 3: AI does NOT over-extend — no affordable spell beyond the pool
  // AI has 1 Swamp + Dark Ritual in hand only (no follow-up spell).
  // Plan should contain exactly one PLAY_CARD (Dark Ritual itself).
  // -------------------------------------------------------------------------
  test('AI does not attempt follow-up when no affordable spell exists', async ({ page }) => {
    const gameState = makeState({
      oBf: [makeSwamp('swamp-1')],
      oHand: [makeDarkRitual('ritual-1')],
    });

    const plan = await page.evaluate(async (state) => {
      const mod = await import('/src/engine/AI.js');
      return mod.getAIPlan(state, 'MAIN_1');
    }, gameState);

    const playCasts = plan.actions.filter(a => a.type === 'PLAY_CARD');
    // Dark Ritual alone has low value — the planner may or may not cast it.
    // What we assert is that no phantom unaffordable spell appears.
    const badCast = playCasts.find(a => a.cardId !== 'ritual-1');
    expect(badCast).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Test 4: regression — single swamp without ramp does NOT enable 3-CMC cast
  // Sanity check: 1 Swamp alone should not make Hypnotic Specter castable.
  // -------------------------------------------------------------------------
  test('AI cannot cast Hypnotic Specter on 1 Swamp without Dark Ritual', async ({ page }) => {
    const gameState = makeState({
      oBf: [makeSwamp('swamp-1')],
      oHand: [makeHypnoticSpecter('specter-1')],
    });

    const plan = await page.evaluate(async (state) => {
      const mod = await import('/src/engine/AI.js');
      return mod.getAIPlan(state, 'MAIN_1');
    }, gameState);

    const playCasts = plan.actions.filter(a => a.type === 'PLAY_CARD');
    expect(playCasts.find(a => a.cardId === 'specter-1')).toBeUndefined();
  });
});
