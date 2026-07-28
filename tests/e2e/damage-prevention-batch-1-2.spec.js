// tests/e2e/damage-prevention-batch-1-2.spec.js
//
// A9 Damage Prevention/Redirect bucket, sub-batches 1+2 (12 cards) Playwright
// regression tests.
//
// Same convention as tests/e2e/legendary-creatures-batch-3.spec.js: engine-only
// cases exercise the real DuelCore.js code via page.evaluate + dynamic import
// (no full duel session). This batch adds no new UI component and no new
// click-flow shape -- every new effect either reuses the existing generic
// click-a-creature-target flow (gated purely by the data-only Set additions in
// useDuelController.ts) or the existing pendingDamageShieldChoice modal -- so
// there is no new UI surface that would need separate mobile-viewport coverage
// beyond what the existing generic-targeting and damage-shield-picker specs
// already cover. chromium project only.

import { test, expect } from '@playwright/test';

function makePlayerState(overrides = {}) {
  return {
    life: 20, lib: [], hand: [], bf: [], gy: [], exile: [],
    mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
    extraTurns: 0, mulls: 0, lifeAnim: null, poisonCounters: 0,
    ...overrides,
  };
}

function makeState({ pBf = [], oBf = [], pHand = [], oHand = [], active = 'p', phase = 'MAIN_1', blockers = {} } = {}) {
  return {
    phase, active, turn: 1, landsPlayed: 0, spellsThisTurn: 0,
    attackers: [], blockers, stack: [], over: null,
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

test.describe('@engine A9 Damage Prevention/Redirect batch 1+2', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => document.readyState === 'complete', { timeout: 15000 });
  });

  test('DPB-E01: activating Horn of Deafening targets a creature and completes, setting preventCombatDamageDealt', async ({ page }) => {
    const state = makeState({});
    const out = await page.evaluate(async (state) => {
      const { duelReducer, makeCardInstance } = await import('/src/engine/DuelCore.js');
      const horn = { ...makeCardInstance('horn_of_deafening', 'p'), iid: 'horn-1', summoningSick: false };
      const threat = { ...makeCardInstance('grizzly_bears', 'o'), iid: 'threat-1' };
      const withBf = { ...state, p: { ...state.p, bf: [horn], mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 2 } }, o: { ...state.o, bf: [threat] } };
      const s1 = duelReducer(withBf, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'horn-1', tgt: 'threat-1' });
      const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
      return { flag: s2.o.bf.find((c) => c.iid === 'threat-1')?.preventCombatDamageDealt };
    }, state);
    expect(out.flag).toBe(true);
  });

  test('DPB-E02: activating Kry Shield targets your own creature and completes, setting the prevent-by flag and pump', async ({ page }) => {
    const state = makeState({});
    const out = await page.evaluate(async (state) => {
      const { duelReducer, makeCardInstance } = await import('/src/engine/DuelCore.js');
      const kry = { ...makeCardInstance('kry_shield', 'p'), iid: 'kry-1', summoningSick: false };
      const mine = { ...makeCardInstance('grizzly_bears', 'p'), iid: 'mine-1' };
      const withBf = { ...state, p: { ...state.p, bf: [kry, mine], mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 2 } } };
      const s1 = duelReducer(withBf, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'kry-1', tgt: 'mine-1' });
      const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
      const after = s2.p.bf.find((c) => c.iid === 'mine-1');
      return { preventCombatDamageDealt: after?.preventCombatDamageDealt, preventAllDamageByThisTurn: after?.preventAllDamageByThisTurn };
    }, state);
    expect(out.preventCombatDamageDealt).toBe(true);
    expect(out.preventAllDamageByThisTurn).toBe(true);
  });

  test('DPB-E03: activating Maze of Ith targets an attacking creature and completes, untapping it', async ({ page }) => {
    const state = makeState({});
    const out = await page.evaluate(async (state) => {
      const { duelReducer, makeCardInstance } = await import('/src/engine/DuelCore.js');
      const maze = { ...makeCardInstance('maze_of_ith', 'p'), iid: 'maze-1', summoningSick: false };
      const attacker = { ...makeCardInstance('grizzly_bears', 'o'), iid: 'att-1', attacking: true, tapped: true };
      const withBf = { ...state, p: { ...state.p, bf: [maze] }, o: { ...state.o, bf: [attacker] } };
      const s1 = duelReducer(withBf, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'maze-1', tgt: 'att-1' });
      const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
      const after = s2.o.bf.find((c) => c.iid === 'att-1');
      return { tapped: after?.tapped, preventCombatDamageDealt: after?.preventCombatDamageDealt, preventAllDamageToThisTurn: after?.preventAllDamageToThisTurn };
    }, state);
    expect(out.tapped).toBe(false);
    expect(out.preventCombatDamageDealt).toBe(true);
    expect(out.preventAllDamageToThisTurn).toBe(true);
  });

  test('DPB-E04: casting Subdue targets a creature and completes, preventing its combat damage and pumping toughness by CMC', async ({ page }) => {
    const state = makeState({});
    const out = await page.evaluate(async (state) => {
      const { duelReducer, makeCardInstance } = await import('/src/engine/DuelCore.js');
      const subdue = { ...makeCardInstance('subdue', 'p'), iid: 'sub-1' };
      const threat = { ...makeCardInstance('grizzly_bears', 'o'), iid: 'threat-1', cmc: 4 };
      const withHand = { ...state, p: { ...state.p, hand: [subdue], mana: { W: 0, U: 0, B: 0, R: 0, G: 1, C: 0 } }, o: { ...state.o, bf: [threat] } };
      const s1 = duelReducer(withHand, { type: 'CAST_SPELL', who: 'p', iid: 'sub-1', tgt: 'threat-1' });
      const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
      const after = s2.o.bf.find((c) => c.iid === 'threat-1');
      return { preventCombatDamageDealt: after?.preventCombatDamageDealt, eotBuffs: after?.eotBuffs };
    }, state);
    expect(out.preventCombatDamageDealt).toBe(true);
    expect(out.eotBuffs).toEqual([{ power: 0, toughness: 4 }]);
  });

  test('DPB-E05: casting Feint targets an attacking creature and completes, tapping its blockers', async ({ page }) => {
    const state = makeState({ blockers: { 'bl-1': 'att-1' } });
    const out = await page.evaluate(async (state) => {
      const { duelReducer, makeCardInstance } = await import('/src/engine/DuelCore.js');
      const feint = { ...makeCardInstance('feint', 'p'), iid: 'feint-1' };
      const attacker = { ...makeCardInstance('grizzly_bears', 'o'), iid: 'att-1', attacking: true };
      const blocker = { ...makeCardInstance('grizzly_bears', 'p'), iid: 'bl-1', blocking: 'att-1' };
      const withState = { ...state, p: { ...state.p, hand: [feint], bf: [blocker], mana: { W: 0, U: 0, B: 0, R: 1, G: 0, C: 0 } }, o: { ...state.o, bf: [attacker] } };
      const s1 = duelReducer(withState, { type: 'CAST_SPELL', who: 'p', iid: 'feint-1', tgt: 'att-1' });
      const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
      return { attackerFlag: s2.o.bf.find((c) => c.iid === 'att-1')?.preventCombatDamageDealt, blockerTapped: s2.p.bf.find((c) => c.iid === 'bl-1')?.tapped };
    }, state);
    expect(out.attackerFlag).toBe(true);
    expect(out.blockerTapped).toBe(true);
  });

  test('DPB-E06: casting Telekinesis targets a creature and completes, tapping it and setting the untap-skip countdown', async ({ page }) => {
    const state = makeState({});
    const out = await page.evaluate(async (state) => {
      const { duelReducer, makeCardInstance } = await import('/src/engine/DuelCore.js');
      const tk = { ...makeCardInstance('telekinesis', 'p'), iid: 'tk-1' };
      const target = { ...makeCardInstance('grizzly_bears', 'o'), iid: 't-1' };
      const withHand = { ...state, p: { ...state.p, hand: [tk], mana: { W: 0, U: 2, B: 0, R: 0, G: 0, C: 0 } }, o: { ...state.o, bf: [target] } };
      const s1 = duelReducer(withHand, { type: 'CAST_SPELL', who: 'p', iid: 'tk-1', tgt: 't-1' });
      const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
      const after = s2.o.bf.find((c) => c.iid === 't-1');
      return { tapped: after?.tapped, preventCombatDamageDealt: after?.preventCombatDamageDealt, untapStepsSkipRemaining: after?.untapStepsSkipRemaining };
    }, state);
    expect(out.tapped).toBe(true);
    expect(out.preventCombatDamageDealt).toBe(true);
    expect(out.untapStepsSkipRemaining).toBe(2);
  });

  test('DPB-E07: activating Dark Sphere opens the damage-shield picker and completes with mode preventHalf', async ({ page }) => {
    const state = makeState({});
    const out = await page.evaluate(async (state) => {
      const { duelReducer, makeCardInstance } = await import('/src/engine/DuelCore.js');
      const sphere = { ...makeCardInstance('dark_sphere', 'p'), iid: 'ds-1', summoningSick: false };
      const threat = { ...makeCardInstance('grizzly_bears', 'o'), iid: 'threat-1' };
      const withBf = { ...state, p: { ...state.p, bf: [sphere] }, o: { ...state.o, bf: [threat] } };
      const s1 = duelReducer(withBf, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'ds-1' });
      const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
      const poolIids = s2.pendingDamageShieldChoice?.pool?.map((c) => c.iid) ?? [];
      const s3 = duelReducer(s2, { type: 'RESOLVE_DAMAGE_SHIELD_CHOICE', iid: 'threat-1' });
      return { poolIids, mode: s3.turnState.damageShields.p[0]?.mode };
    }, state);
    expect(out.poolIids).toContain('threat-1');
    expect(out.mode).toBe('preventHalf');
  });

  test('DPB-E08: activating Nova Pentacle opens the damage-shield picker and completes with mode redirectToCreature', async ({ page }) => {
    const state = makeState({});
    const out = await page.evaluate(async (state) => {
      const { duelReducer, makeCardInstance } = await import('/src/engine/DuelCore.js');
      const nova = { ...makeCardInstance('nova_pentacle', 'p'), iid: 'nova-1', summoningSick: false };
      const threat = { ...makeCardInstance('grizzly_bears', 'o'), iid: 'threat-1' };
      const withBf = { ...state, p: { ...state.p, bf: [nova], mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 3 } }, o: { ...state.o, bf: [threat] } };
      const s1 = duelReducer(withBf, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'nova-1' });
      const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
      const poolIids = s2.pendingDamageShieldChoice?.pool?.map((c) => c.iid) ?? [];
      const s3 = duelReducer(s2, { type: 'RESOLVE_DAMAGE_SHIELD_CHOICE', iid: 'threat-1' });
      return { poolIids, entry: s3.turnState.damageShields.p[0] };
    }, state);
    expect(out.poolIids).toContain('threat-1');
    expect(out.entry.mode).toBe('redirectToCreature');
    expect(out.entry.redirectToCreatureIid).toBe('threat-1');
  });
});
