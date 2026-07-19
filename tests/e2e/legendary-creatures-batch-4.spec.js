// tests/e2e/legendary-creatures-batch-4.spec.js
//
// Legendary Creatures Batch 4 Playwright regression tests (LGB4-E01 - LGB4-E06).
// Covers Angus Mackenzie, Lady Evangela, Dakkon Blackblade, Tetsuo Umezawa.
//
// Same convention as tests/e2e/legendary-creatures-batch-3.spec.js: engine-only
// cases exercise the real DuelCore.js code via page.evaluate + dynamic import (no
// full duel session, no viewport split beyond the project matrix already running
// every spec against both `chromium` and `mobile-chrome`). Card data is pulled
// from the real CARD_DB via makeCardInstance inside page.evaluate rather than
// duplicated here, since these four cards' mechanics live in activated/layerDef
// fields that a hand-rolled fixture would have to reproduce anyway.

import { test, expect } from '@playwright/test';

function makePlayerState(overrides = {}) {
  return {
    life: 20, lib: [], hand: [], bf: [], gy: [], exile: [],
    mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
    extraTurns: 0, mulls: 0, lifeAnim: null, poisonCounters: 0,
    ...overrides,
  };
}

function makeState({ pBf = [], oBf = [], pHand = [], oHand = [], active = 'p', phase = 'MAIN_1' } = {}) {
  return {
    phase, active, turn: 1, landsPlayed: 0, spellsThisTurn: 0,
    attackers: [], blockers: {}, stack: [], over: null,
    selCard: null, selTgt: null, xVal: 1, log: [],
    ruleset: { startingLife: 20, startingHandSize: 7, drawOnFirstTurn: false, londonMulligan: false, deathtouch: true },
    oppArch: { id: 'KARAG', profileId: 'KARAG' }, castleMod: null,
    pendingLotus: false, pendingLotusIid: null, pendingBop: false,
    turnState: { damageLog: [] }, triggerQueue: [], pendingChoice: null,
    fogActive: false, anteEnabled: false, anteP: null, anteO: null,
    anteExtraP: [], anteExtraO: [], ownershipChanges: [],
    pendingAnteChoice: null, pendingUpkeepChoice: null, pendingUpkeepChoiceQueue: [],
    pendingAnteExchange: null, pendingDamageShieldChoice: null,
    p: makePlayerState({ bf: pBf, hand: pHand }),
    o: makePlayerState({ bf: oBf, hand: oHand }),
  };
}

test.describe('@engine Legendary Creatures Batch 4', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => document.readyState === 'complete', { timeout: 15000 });
  });

  test('LGB4-E01: Angus Mackenzie prevents all combat damage this turn when activated before the combat damage step', async ({ page }) => {
    const state = makeState({ active: 'p', phase: 'COMBAT_ATTACKERS' });

    const out = await page.evaluate(async (state) => {
      const { duelReducer, makeCardInstance } = await import('/src/engine/DuelCore.js');
      const angus = { ...makeCardInstance('angus_mackenzie', 'p'), iid: 'am-1', summoningSick: false };
      const attacker = { ...makeCardInstance('grizzly_bears', 'p'), iid: 'atk-1', summoningSick: false };
      const withBf = { ...state, p: { ...state.p, bf: [angus, attacker] } };
      const s1 = duelReducer(withBf, { type: 'DECLARE_ATTACKER', iid: 'atk-1' });
      const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_ATTACKERS
      const s3 = duelReducer(s2, { type: 'ADVANCE_PHASE' }); // -> COMBAT_BLOCKERS
      const s4 = duelReducer(s3, { type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_BLOCKERS
      const funded = { ...s4, p: { ...s4.p, mana: { ...s4.p.mana, G: 1, W: 1, U: 1 } } };
      const s5 = duelReducer(funded, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'am-1' });
      const s6 = duelReducer(s5, { type: 'RESOLVE_STACK' });
      const s7 = duelReducer(s6, { type: 'ADVANCE_PHASE' }); // -> COMBAT_DAMAGE, fog resolves
      return { oLife: s7.o.life };
    }, state);

    expect(out.oLife).toBe(20);
  });

  test('LGB4-E02: Angus Mackenzie cannot be activated after the combat damage step', async ({ page }) => {
    const state = makeState({ active: 'p', phase: 'MAIN_2' });

    const out = await page.evaluate(async (state) => {
      const { duelReducer, makeCardInstance } = await import('/src/engine/DuelCore.js');
      const angus = { ...makeCardInstance('angus_mackenzie', 'p'), iid: 'am-1', summoningSick: false };
      const funded = { ...state, p: { ...state.p, bf: [angus], mana: { ...state.p.mana, G: 1, W: 1, U: 1 } } };
      const s1 = duelReducer(funded, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'am-1' });
      return { stackLength: s1.stack.length, lastLog: s1.log[s1.log.length - 1].text };
    }, state);

    expect(out.stackLength).toBe(0);
    expect(out.lastLog).toContain('before the combat damage step');
  });

  test('LGB4-E03: Lady Evangela prevents combat damage only from the targeted attacking creature', async ({ page }) => {
    const state = makeState({ active: 'o', phase: 'COMBAT_ATTACKERS' });

    const out = await page.evaluate(async (state) => {
      const { duelReducer, makeCardInstance } = await import('/src/engine/DuelCore.js');
      const evangela = { ...makeCardInstance('lady_evangela', 'p'), iid: 'le-1', summoningSick: false };
      const atk1 = { ...makeCardInstance('grizzly_bears', 'o'), iid: 'atk-1', summoningSick: false, power: 4, toughness: 4 };
      const atk2 = { ...makeCardInstance('grizzly_bears', 'o'), iid: 'atk-2', summoningSick: false, power: 3, toughness: 3 };
      const withBf = { ...state, p: { ...state.p, bf: [evangela] }, o: { ...state.o, bf: [atk1, atk2] } };
      const s1 = duelReducer(withBf, { type: 'DECLARE_ATTACKER', iid: 'atk-1' });
      const s1b = duelReducer(s1, { type: 'DECLARE_ATTACKER', iid: 'atk-2' });
      const s2 = duelReducer(s1b, { type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_ATTACKERS
      const s3 = duelReducer(s2, { type: 'ADVANCE_PHASE' }); // -> COMBAT_BLOCKERS
      const s4 = duelReducer(s3, { type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_BLOCKERS
      const funded = { ...s4, p: { ...s4.p, mana: { ...s4.p.mana, W: 1, B: 1 } } };
      const s5 = duelReducer(funded, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'le-1', tgt: 'atk-1' });
      const s6 = duelReducer(s5, { type: 'RESOLVE_STACK' });
      const s7 = duelReducer(s6, { type: 'ADVANCE_PHASE' }); // -> COMBAT_DAMAGE
      return { pLife: s7.p.life };
    }, state);

    expect(out.pLife).toBe(17); // only atk-2's 3 damage gets through; atk-1's 4 is prevented
  });

  test('LGB4-E04: Dakkon Blackblade\'s power and toughness equal the number of lands its controller controls', async ({ page }) => {
    const state = makeState({ active: 'p' });

    const out = await page.evaluate(async (state) => {
      const { makeCardInstance, getPow, getTou } = await import('/src/engine/DuelCore.js');
      const dakkon = { ...makeCardInstance('dakkon_blackblade', 'p'), iid: 'db-1', summoningSick: false };
      const lands = [1, 2, 3].map((n) => ({ ...makeCardInstance('forest', 'p'), iid: `land-${n}` }));
      const withBf = { ...state, p: { ...state.p, bf: [dakkon, ...lands] } };
      return { power: getPow(dakkon, withBf), toughness: getTou(dakkon, withBf) };
    }, state);

    expect(out.power).toBe(3);
    expect(out.toughness).toBe(3);
  });

  test('LGB4-E05: Tetsuo Umezawa can\'t be the target of Aura spells', async ({ page }) => {
    const state = makeState({ active: 'o', phase: 'MAIN_1' });

    const out = await page.evaluate(async (state) => {
      const { duelReducer, makeCardInstance } = await import('/src/engine/DuelCore.js');
      const tetsuo = { ...makeCardInstance('tetsuo_umezawa', 'p'), iid: 'tu-1', summoningSick: false };
      const aura = { iid: 'aura-1', id: 'test_aura', name: 'Test Aura', type: 'Enchantment', subtype: 'Aura', color: 'R', cmc: 1, cost: 'R', keywords: [], tapped: false, summoningSick: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller: 'o', effect: 'enchantCreature', mod: { power: 1 } };
      const withBf = { ...state, p: { ...state.p, bf: [tetsuo] }, o: { ...state.o, hand: [aura], mana: { ...state.o.mana, R: 1 } } };
      const s1 = duelReducer(withBf, { type: 'CAST_SPELL', who: 'o', iid: 'aura-1', tgt: 'tu-1' });
      const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
      const tetsuoAfter = s2.p.bf.find((c) => c.iid === 'tu-1');
      return { enchantments: tetsuoAfter.enchantments, lastLog: s2.log[s2.log.length - 1].text };
    }, state);

    expect(out.enchantments).toEqual([]);
    expect(out.lastLog).toContain("can't be the target of Aura spells");
  });

  test('LGB4-E06: Tetsuo Umezawa destroys a target tapped creature', async ({ page }) => {
    const state = makeState({ active: 'p', phase: 'MAIN_1' });

    const out = await page.evaluate(async (state) => {
      const { duelReducer, makeCardInstance } = await import('/src/engine/DuelCore.js');
      const tetsuo = { ...makeCardInstance('tetsuo_umezawa', 'p'), iid: 'tu-1', summoningSick: false };
      const target = { ...makeCardInstance('grizzly_bears', 'o'), iid: 'tgt-1', tapped: true };
      const funded = { ...state, p: { ...state.p, bf: [tetsuo], mana: { ...state.p.mana, U: 1, B: 1, R: 1 } }, o: { ...state.o, bf: [target] } };
      const s1 = duelReducer(funded, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'tu-1', tgt: 'tgt-1' });
      const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
      return { onBf: s2.o.bf.some((c) => c.iid === 'tgt-1'), inGy: s2.o.gy.some((c) => c.iid === 'tgt-1') };
    }, state);

    expect(out.onBf).toBe(false);
    expect(out.inGy).toBe(true);
  });
});
