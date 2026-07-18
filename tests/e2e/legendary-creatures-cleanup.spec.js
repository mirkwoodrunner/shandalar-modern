// tests/e2e/legendary-creatures-cleanup.spec.js
//
// Legendary Creatures Cleanup batch: the 5 cards deferred from Batch 1+2 (Xira Arien,
// Tor Wauki, Lady Caleria, Gwendlyn Di Corci, Adun Oakenshield) plus Kei Takahashi
// (left out of Batch 1+2's scope by a counting mistake, unrelated to the other 5's
// deferral). See docs/CURRENT_SPRINT.md and docs/MECHANICS_INDEX.md for the fix
// writeup.
//
// Same convention as tests/e2e/legendary-creatures-batch-1-2.spec.js: engine-only
// cases exercise the real DuelCore.js code via page.evaluate + dynamic import (no
// full duel session, no viewport split beyond the project matrix already running
// every spec against both `chromium` and `mobile-chrome`).

import { test, expect } from '@playwright/test';

function makeCreature(overrides = {}) {
  return {
    iid: overrides.iid ?? 'c-1',
    id: overrides.id ?? 'grizzly_bears',
    name: overrides.name ?? 'Grizzly Bears',
    type: overrides.type ?? 'Creature',
    subtype: overrides.subtype ?? 'Bear',
    color: overrides.color ?? 'G',
    cmc: overrides.cmc ?? 2,
    cost: overrides.cost ?? '1G',
    power: overrides.power ?? 2,
    toughness: overrides.toughness ?? 2,
    keywords: overrides.keywords ?? [],
    tapped: false,
    summoningSick: false,
    attacking: false,
    blocking: null,
    damage: overrides.damage ?? 0,
    counters: overrides.counters ?? {},
    eotBuffs: [],
    enchantments: overrides.enchantments ?? [],
    controller: overrides.controller ?? 'p',
    ...overrides,
  };
}

function makePlayerState(overrides = {}) {
  return {
    life: 20, lib: [], hand: [], bf: [], gy: [], exile: [],
    mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
    extraTurns: 0, mulls: 0, lifeAnim: null, poisonCounters: 0,
    ...overrides,
  };
}

function makeState({ pBf = [], oBf = [], pHand = [], oHand = [], active = 'p', attackers = [] } = {}) {
  return {
    phase: 'MAIN_1', active, turn: 1, landsPlayed: 0, spellsThisTurn: 0,
    attackers, blockers: {}, stack: [], over: null,
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

test.describe('@engine Legendary Creatures Cleanup', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => document.readyState === 'complete', { timeout: 15000 });
  });

  test('LGC-E01: Xira Arien makes the chosen opponent draw a card', async ({ page }) => {
    const xira = makeCreature({ iid: 'xa-1', id: 'xira_arien', name: 'Xira Arien', type: 'Legendary Creature', power: 1, toughness: 2, activated: { cost: 'BRG,T', effect: 'draw1Tgt', requiresTarget: true } });
    const state = makeState({ pBf: [xira] });
    const funded = { ...state, p: { ...state.p, mana: { ...state.p.mana, B: 1, R: 1, G: 1 } }, o: { ...state.o, lib: [{ iid: 'o-lib-1', id: 'forest', name: 'Forest', type: 'Land' }] } };

    const out = await page.evaluate(async (state) => {
      const { duelReducer } = await import('/src/engine/DuelCore.js');
      const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'xa-1', tgt: 'o' });
      const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
      return { oHand: s2.o.hand.length, pHand: s2.p.hand.length };
    }, funded);

    expect(out.oHand).toBe(1);
    expect(out.pHand).toBe(0);
  });

  test('LGC-E02: Tor Wauki deals 2 damage to a target attacking creature', async ({ page }) => {
    const tor = makeCreature({ iid: 'tw-1', id: 'tor_wauki', name: 'Tor Wauki', type: 'Legendary Creature', power: 3, toughness: 3, activated: { cost: 'T', effect: 'pingCombatant2', requiresTarget: true } });
    const attacker = makeCreature({ iid: 'atk-1', controller: 'o', toughness: 4 });
    const state = makeState({ pBf: [tor], oBf: [attacker], attackers: ['atk-1'] });

    const out = await page.evaluate(async (state) => {
      const { duelReducer } = await import('/src/engine/DuelCore.js');
      const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'tw-1', tgt: 'atk-1' });
      const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
      return { damage: s2.o.bf.find((c) => c.iid === 'atk-1')?.damage };
    }, state);

    expect(out.damage).toBe(2);
  });

  test('LGC-E03: Lady Caleria deals 3 damage to a target blocking creature', async ({ page }) => {
    const caleria = makeCreature({ iid: 'lc-1', id: 'lady_caleria', name: 'Lady Caleria', type: 'Legendary Creature', power: 3, toughness: 6, activated: { cost: 'T', effect: 'pingCombatant3', requiresTarget: true } });
    const blocker = makeCreature({ iid: 'bl-1', controller: 'o', toughness: 6, blocking: 'atk-1' });
    const state = makeState({ pBf: [caleria], oBf: [blocker] });

    const out = await page.evaluate(async (state) => {
      const { duelReducer } = await import('/src/engine/DuelCore.js');
      const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'lc-1', tgt: 'bl-1' });
      const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
      return { damage: s2.o.bf.find((c) => c.iid === 'bl-1')?.damage };
    }, state);

    expect(out.damage).toBe(3);
  });

  test('LGC-E04: Gwendlyn Di Corci discards a card at random from the chosen opponent target', async ({ page }) => {
    const gwendlyn = makeCreature({ iid: 'gd-1', id: 'gwendlyn_di_corci', name: 'Gwendlyn Di Corci', type: 'Legendary Creature', power: 3, toughness: 5, activated: { cost: 'T', effect: 'discardOneTgt', requiresTarget: true } });
    const oppCard = { iid: 'oc-1', id: 'forest', name: 'Forest', type: 'Land' };
    const state = makeState({ pBf: [gwendlyn], oHand: [oppCard] });

    const out = await page.evaluate(async (state) => {
      const { duelReducer } = await import('/src/engine/DuelCore.js');
      const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'gd-1', tgt: 'o' });
      const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
      return { oHand: s2.o.hand.length, inGy: s2.o.gy.some((c) => c.iid === 'oc-1') };
    }, state);

    expect(out.oHand).toBe(0);
    expect(out.inGy).toBe(true);
  });

  test('LGC-E05: Adun Oakenshield returns the specifically targeted creature card from the graveyard', async ({ page }) => {
    const adun = makeCreature({ iid: 'ao-1', id: 'adun_oakenshield', name: 'Adun Oakenshield', type: 'Legendary Creature', power: 1, toughness: 2, activated: { cost: 'BRG,T', effect: 'regrowthCreature', requiresTarget: true } });
    const older = { iid: 'gy-old', id: 'grizzly_bears', name: 'Grizzly Bears', type: 'Creature' };
    const newer = { iid: 'gy-new', id: 'craw_wurm', name: 'Craw Wurm', type: 'Creature' };
    const state = makeState({ pBf: [adun] });
    const funded = { ...state, p: { ...state.p, mana: { ...state.p.mana, B: 1, R: 1, G: 1 }, gy: [older, newer] } };

    const out = await page.evaluate(async (state) => {
      const { duelReducer } = await import('/src/engine/DuelCore.js');
      const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'ao-1', tgt: 'gy-old' });
      const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
      return { inHand: s2.p.hand.some((c) => c.iid === 'gy-old'), stillInGy: s2.p.gy.some((c) => c.iid === 'gy-new') };
    }, funded);

    expect(out.inHand).toBe(true);
    expect(out.stillInGy).toBe(true);
  });

  test('LGC-E06: Kei Takahashi adds a 2-point damage shield to a target creature', async ({ page }) => {
    const kei = makeCreature({ iid: 'kt-1', id: 'kei_takahashi', name: 'Kei Takahashi', type: 'Legendary Creature', power: 2, toughness: 2, activated: { cost: 'T', effect: 'preventDamage2Creature', requiresTarget: true } });
    const target = makeCreature({ iid: 'sh-1', controller: 'p' });
    const state = makeState({ pBf: [kei, target] });

    const out = await page.evaluate(async (state) => {
      const { duelReducer } = await import('/src/engine/DuelCore.js');
      const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'kt-1', tgt: 'sh-1' });
      const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
      return { damageShield: s2.p.bf.find((c) => c.iid === 'sh-1')?.damageShield };
    }, state);

    expect(out.damageShield).toBe(2);
  });
});
