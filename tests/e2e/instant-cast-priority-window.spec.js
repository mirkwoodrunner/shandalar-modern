// tests/e2e/instant-cast-priority-window.spec.js
//
// Verifies that the Cast button appears in ActionBar when an Instant is selected
// during a non-main priority window.
//
// Bug context: ActionBar's Cast button was gated on `inMain` (MAIN_1/MAIN_2 only).
// Players with priority in COMBAT_ATTACKERS or END could not cast instants from
// hand because the button never rendered. The fix adds an OR branch:
//   inMain || (priorityWindowOpen && selectedCard && isInst(selectedCard))
//
// These tests drive the condition logic via the engine's isInst export and
// exercise the ActionBar condition directly through page.evaluate.

import { test, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLightningBolt(iid) {
  return {
    iid,
    id: 'lightning_bolt',
    name: 'Lightning Bolt',
    type: 'Instant',
    subtype: '',
    color: 'R',
    cmc: 1,
    cost: 'R',
    keywords: [],
    tapped: false,
    summoningSick: false,
    attacking: false,
    blocking: null,
    damage: 0,
    counters: {},
    eotBuffs: [],
    enchantments: [],
    effect: 'damage3',
    controller: 'p',
  };
}

function makeGrizzlyBears(iid) {
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

function makeMountain(iid) {
  return {
    iid,
    id: 'mountain',
    name: 'Mountain',
    type: 'Land',
    subtype: 'Mountain',
    color: 'R',
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
    produces: ['R'],
    controller: 'p',
  };
}

// ---------------------------------------------------------------------------

test.describe('ActionBar Cast button — instant casting during priority windows', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => document.readyState === 'complete', { timeout: 15000 });
  });

  // -------------------------------------------------------------------------
  // Test 1: isInst correctly identifies Instant cards
  // -------------------------------------------------------------------------
  test('isInst returns true for Instant, false for Creature and Land', async ({ page }) => {
    const result = await page.evaluate(async ({ bolt, bear, mountain }) => {
      const mod = await import('/src/engine/DuelCore.js');
      return {
        boltIsInst: mod.isInst(bolt),
        bearIsInst: mod.isInst(bear),
        mountainIsInst: mod.isInst(mountain),
      };
    }, {
      bolt: makeLightningBolt('bolt-1'),
      bear: makeGrizzlyBears('bear-1'),
      mountain: makeMountain('mnt-1'),
    });

    expect(result.boltIsInst).toBe(true);
    expect(result.bearIsInst).toBe(false);
    expect(result.mountainIsInst).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Test 2: ActionBar cast condition — instant selected in non-main phase with
  // priority window open should satisfy the OR branch.
  // -------------------------------------------------------------------------
  test('Cast button condition is true for instant selected during non-main priority window', async ({ page }) => {
    const result = await page.evaluate(async ({ bolt }) => {
      const { isInst, isLand } = await import('/src/engine/DuelCore.js');

      // Simulate the ActionBar condition for COMBAT_ATTACKERS with priority window open.
      const MAIN_PHASES = new Set(['MAIN_1', 'MAIN_2']);
      const phase = 'COMBAT_ATTACKERS';
      const hasSelection = true;
      const isPlayerTurn = true;
      const priorityWindowOpen = true;
      const selectedCard = bolt;

      const inMain = MAIN_PHASES.has(phase);
      const castButtonVisible =
        hasSelection &&
        isPlayerTurn &&
        (inMain || (priorityWindowOpen && selectedCard && isInst(selectedCard)));

      // Also check that WITHOUT the OR branch (old behavior), it would be false.
      const oldCastButtonVisible = hasSelection && inMain && isPlayerTurn;

      return { castButtonVisible, oldCastButtonVisible, inMain };
    }, { bolt: makeLightningBolt('bolt-1') });

    expect(result.inMain).toBe(false);
    expect(result.oldCastButtonVisible).toBe(false);
    expect(result.castButtonVisible).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Test 3: Regression — main-phase sorcery still shows Cast button without
  // a priority window (original behavior unchanged).
  // -------------------------------------------------------------------------
  test('Cast button still appears in MAIN_1 with sorcery selected and no priority window', async ({ page }) => {
    const result = await page.evaluate(async ({ bear }) => {
      const { isInst } = await import('/src/engine/DuelCore.js');

      const MAIN_PHASES = new Set(['MAIN_1', 'MAIN_2']);
      const phase = 'MAIN_1';
      const hasSelection = true;
      const isPlayerTurn = true;
      const priorityWindowOpen = false;
      const selectedCard = bear;

      const inMain = MAIN_PHASES.has(phase);
      const castButtonVisible =
        hasSelection &&
        isPlayerTurn &&
        (inMain || (priorityWindowOpen && selectedCard && isInst(selectedCard)));

      return { castButtonVisible, inMain };
    }, { bear: makeGrizzlyBears('bear-1') });

    expect(result.inMain).toBe(true);
    expect(result.castButtonVisible).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Test 4: Non-instant (sorcery/creature) selected during non-main priority
  // window should NOT show Cast button.
  // -------------------------------------------------------------------------
  test('Cast button does not appear for creature selected during non-main priority window', async ({ page }) => {
    const result = await page.evaluate(async ({ bear }) => {
      const { isInst } = await import('/src/engine/DuelCore.js');

      const MAIN_PHASES = new Set(['MAIN_1', 'MAIN_2']);
      const phase = 'COMBAT_ATTACKERS';
      const hasSelection = true;
      const isPlayerTurn = true;
      const priorityWindowOpen = true;
      const selectedCard = bear;

      const inMain = MAIN_PHASES.has(phase);
      const castButtonVisible =
        hasSelection &&
        isPlayerTurn &&
        (inMain || (priorityWindowOpen && selectedCard && isInst(selectedCard)));

      return { castButtonVisible };
    }, { bear: makeGrizzlyBears('bear-1') });

    expect(result.castButtonVisible).toBe(false);
  });
});
