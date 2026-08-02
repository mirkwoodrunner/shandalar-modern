/**
 * @module-tag engine
 */
// tests/scenarios/legendary-creatures-batch-5-rampage.test.js
// Legendary Creatures Batch 5: introduces the Rampage keyword (see
// src/data/keywords.js) plus Chromium, Marhault Elsdragon, Hunding
// Gjornersen, Gabriel Angelfire. Rampage is resolved generically once per
// combat at the COMBAT_BLOCKERS -> COMBAT_AFTER_BLOCKERS transition in
// advPhase() (same keyword-driven-inline-scan idiom as the existing
// MUST_ATTACK auto-declare block), not as a named per-card trigger. Gabriel
// Angelfire's "until your next upkeep" is approximated as "until end of
// turn" via eotBuffs (cleared at CLEANUP) -- same simplification already
// established for that exact wording on Erhnam Djinn and Xenic Poltergeist.
//
// Chromium's sacrificeUnless_WUB upkeep tax copies the exact shape of
// sacrificeUnless_RGW/UBR/BRG (Palladia-Mors/Nicol Bolas/Vaevictis Asmadi):
// mana burns to zero at the very start of the same advPhase() call that
// processes the upkeep tax (see burnMana in advPhase and the documented
// "still sacrificed even when pre-loaded" tests in
// legendary-creatures-batch-3.test.js / upkeep-sacrifice-batch-a9.test.js),
// so paying the tax through the normal UNTAP -> UPKEEP transition is not
// reachable for any card using this shape, Chromium included. That is
// existing, protected-file behavior -- out of scope to change here -- so
// this file documents it rather than asserting an unreachable "kept, mana
// paid" scenario.
//
// Styled after tests/scenarios/legendary-creatures-batch-4.test.js: real
// CARD_DB-backed instances via makeCardInstance, not synthetic fixtures.
// Declared test count: 8 Vitest cases.

import { describe, it, expect } from 'vitest';
import { duelReducer, makeCardInstance, checkLegendRule, getPow, getTou } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature } from '../../src/engine/__tests__/_factory.js';
import KEYWORDS from '../../src/data/keywords.js';

function makeReadyInstance(id, controller, overrides = {}) {
  const inst = makeCardInstance(id, controller);
  return { ...inst, iid: `${id}-1`, summoningSick: false, tapped: false, eotBuffs: [], enchantments: [], ...overrides };
}

describe('@engine Scenario: legendary-creatures-batch-5-rampage -- Rampage keyword combat math', () => {
  it('a single block applies no bonus (blocked-by-count must exceed 1)', () => {
    const marhault = makeReadyInstance('marhault_elsdragon', 'p');
    const blocker = makeCreature('bl-1', { controller: 'o', power: 1, toughness: 10 });
    const state = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'p', pBf: [marhault], oBf: [blocker] });
    const s1 = duelReducer(state, { type: 'DECLARE_ATTACKER', iid: marhault.iid });
    const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_ATTACKERS
    const s3 = duelReducer(s2, { type: 'ADVANCE_PHASE' }); // -> COMBAT_BLOCKERS
    const s4 = duelReducer(s3, { type: 'DECLARE_BLOCKER', attId: marhault.iid, blId: 'bl-1' });
    const s5 = duelReducer(s4, { type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_BLOCKERS
    const found = s5.p.bf.find(c => c.iid === marhault.iid);
    expect(getPow(found, s5)).toBe(4);
    expect(getTou(found, s5)).toBe(6);
  });

  it('Rampage 1 (Marhault Elsdragon): a double block grants +1/+1 until end of turn, which expires at CLEANUP', () => {
    const marhault = makeReadyInstance('marhault_elsdragon', 'p');
    const bl1 = makeCreature('bl-1', { controller: 'o', power: 1, toughness: 10 });
    const bl2 = makeCreature('bl-2', { controller: 'o', power: 1, toughness: 10 });
    const state = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'p', pBf: [marhault], oBf: [bl1, bl2] });
    const s1 = duelReducer(state, { type: 'DECLARE_ATTACKER', iid: marhault.iid });
    const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_ATTACKERS
    const s3 = duelReducer(s2, { type: 'ADVANCE_PHASE' }); // -> COMBAT_BLOCKERS
    const s4a = duelReducer(s3, { type: 'DECLARE_BLOCKER', attId: marhault.iid, blId: 'bl-1' });
    const s4b = duelReducer(s4a, { type: 'DECLARE_BLOCKER', attId: marhault.iid, blId: 'bl-2' });
    const beforeFound = s4b.p.bf.find(c => c.iid === marhault.iid);
    expect(getPow(beforeFound, s4b)).toBe(4);
    expect(getTou(beforeFound, s4b)).toBe(6);

    const s5 = duelReducer(s4b, { type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_BLOCKERS
    const afterFound = s5.p.bf.find(c => c.iid === marhault.iid);
    expect(getPow(afterFound, s5)).toBe(5);
    expect(getTou(afterFound, s5)).toBe(7);

    // Buff is "until end of turn" -- expires at CLEANUP.
    const cleanupState = makeState({ phase: PHASE.END, active: 'p', pBf: [afterFound] });
    const s6 = duelReducer(cleanupState, { type: 'ADVANCE_PHASE' }); // END -> CLEANUP
    const cleaned = s6.p.bf.find(c => c.iid === marhault.iid);
    expect(getPow(cleaned, s6)).toBe(4);
    expect(getTou(cleaned, s6)).toBe(6);
  });

  it('Rampage 2 (Chromium): a triple block grants +4/+4 until end of turn (2 * (3-1))', () => {
    const chromium = makeReadyInstance('chromium', 'p');
    // Chromium has flying, so its blockers need flying or reach to legally block.
    const bl1 = makeCreature('bl-1', { controller: 'o', power: 1, toughness: 10, keywords: [KEYWORDS.FLYING.id] });
    const bl2 = makeCreature('bl-2', { controller: 'o', power: 1, toughness: 10, keywords: [KEYWORDS.FLYING.id] });
    const bl3 = makeCreature('bl-3', { controller: 'o', power: 1, toughness: 10, keywords: [KEYWORDS.FLYING.id] });
    const state = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'p', pBf: [chromium], oBf: [bl1, bl2, bl3] });
    const s1 = duelReducer(state, { type: 'DECLARE_ATTACKER', iid: chromium.iid });
    const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_ATTACKERS
    const s3 = duelReducer(s2, { type: 'ADVANCE_PHASE' }); // -> COMBAT_BLOCKERS
    const s4a = duelReducer(s3, { type: 'DECLARE_BLOCKER', attId: chromium.iid, blId: 'bl-1' });
    const s4b = duelReducer(s4a, { type: 'DECLARE_BLOCKER', attId: chromium.iid, blId: 'bl-2' });
    const s4c = duelReducer(s4b, { type: 'DECLARE_BLOCKER', attId: chromium.iid, blId: 'bl-3' });
    const s5 = duelReducer(s4c, { type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_BLOCKERS
    const found = s5.p.bf.find(c => c.iid === chromium.iid);
    expect(getPow(found, s5)).toBe(11);
    expect(getTou(found, s5)).toBe(11);
  });
});

describe('@engine Scenario: legendary-creatures-batch-5-rampage -- Chromium upkeep tax', () => {
  it('is sacrificed at upkeep when the {W}{U}{B} cost cannot be paid', () => {
    const chromium = makeReadyInstance('chromium', 'p');
    const state = makeState({ phase: PHASE.UNTAP, active: 'p', pBf: [chromium] });
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // UNTAP -> UPKEEP
    expect(s1.p.bf.some(c => c.iid === chromium.iid)).toBe(false);
    expect(s1.p.gy.some(c => c.iid === chromium.iid)).toBe(true);
  });

  it('is still sacrificed even when {W}{U}{B} was pre-loaded before the transition (mana burn clears the pool first -- same documented behavior as Palladia-Mors/Nicol Bolas/Vaevictis Asmadi)', () => {
    const chromium = makeReadyInstance('chromium', 'p');
    let state = makeState({ phase: PHASE.UNTAP, active: 'p', pBf: [chromium] });
    state = { ...state, p: { ...state.p, mana: { ...state.p.mana, W: 1, U: 1, B: 1 } } };
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' });
    expect(s1.p.mana).toEqual({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 });
    expect(s1.p.bf.some(c => c.iid === chromium.iid)).toBe(false);
  });
});

describe('@engine Scenario: legendary-creatures-batch-5-rampage -- Gabriel Angelfire', () => {
  it("AI ('o') auto-grants rampage 3 at upkeep with no pending choice, and a subsequent double-block gets +3/+3", () => {
    const gabrielUp = makeReadyInstance('gabriel_angelfire', 'o');
    const upkeepState = makeState({ phase: PHASE.UNTAP, active: 'o', oBf: [gabrielUp] });
    const s1 = duelReducer(upkeepState, { type: 'ADVANCE_PHASE' }); // UNTAP -> UPKEEP
    expect(s1.pendingUpkeepChoice).toBeFalsy();
    const grantedGabriel = s1.o.bf.find(c => c.iid === gabrielUp.iid);
    expect(grantedGabriel.eotBuffs).toEqual([{ keywords: [KEYWORDS.RAMPAGE.id], rampageBonus: 3 }]);

    // A subsequent double-block, carrying the granted buff forward, applies rampage 3's math.
    const bl1 = makeCreature('bl-1', { controller: 'p', power: 1, toughness: 10 });
    const bl2 = makeCreature('bl-2', { controller: 'p', power: 1, toughness: 10 });
    const combatState = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: [grantedGabriel], pBf: [bl1, bl2] });
    const s2 = duelReducer(combatState, { type: 'DECLARE_ATTACKER', iid: grantedGabriel.iid });
    const s3 = duelReducer(s2, { type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_ATTACKERS
    const s4 = duelReducer(s3, { type: 'ADVANCE_PHASE' }); // -> COMBAT_BLOCKERS
    const s5a = duelReducer(s4, { type: 'DECLARE_BLOCKER', attId: grantedGabriel.iid, blId: 'bl-1' });
    const s5b = duelReducer(s5a, { type: 'DECLARE_BLOCKER', attId: grantedGabriel.iid, blId: 'bl-2' });
    const s6 = duelReducer(s5b, { type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_BLOCKERS
    const found = s6.o.bf.find(c => c.iid === grantedGabriel.iid);
    expect(getPow(found, s6)).toBe(7);
    expect(getTou(found, s6)).toBe(7);
  });

  it("human ('p') queues a gabrielAngelfireUpkeep choice at upkeep, and each of the 4 options grants the correct eotBuffs entry", () => {
    const gabriel = makeReadyInstance('gabriel_angelfire', 'p');
    const state = makeState({ phase: PHASE.UNTAP, active: 'p', pBf: [gabriel] });
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // UNTAP -> UPKEEP
    expect(s1.pendingUpkeepChoice).toBeTruthy();
    expect(s1.pendingUpkeepChoice.handlerKey).toBe('gabrielAngelfireUpkeep');
    expect(s1.pendingUpkeepChoice.iid).toBe(gabriel.iid);

    const sFlying = duelReducer(s1, { type: 'UPKEEP_CHOICE_RESOLVE', choice: 'flying' });
    expect(sFlying.p.bf.find(c => c.iid === gabriel.iid).eotBuffs).toEqual([{ keywords: [KEYWORDS.FLYING.id] }]);
    expect(sFlying.pendingUpkeepChoice).toBeFalsy();

    const sFirstStrike = duelReducer(s1, { type: 'UPKEEP_CHOICE_RESOLVE', choice: 'first_strike' });
    expect(sFirstStrike.p.bf.find(c => c.iid === gabriel.iid).eotBuffs).toEqual([{ keywords: [KEYWORDS.FIRST_STRIKE.id] }]);

    const sTrample = duelReducer(s1, { type: 'UPKEEP_CHOICE_RESOLVE', choice: 'trample' });
    expect(sTrample.p.bf.find(c => c.iid === gabriel.iid).eotBuffs).toEqual([{ keywords: [KEYWORDS.TRAMPLE.id] }]);

    const sRampage = duelReducer(s1, { type: 'UPKEEP_CHOICE_RESOLVE', choice: 'rampage_3' });
    expect(sRampage.p.bf.find(c => c.iid === gabriel.iid).eotBuffs).toEqual([{ keywords: [KEYWORDS.RAMPAGE.id], rampageBonus: 3 }]);
  });
});

describe('@engine Scenario: legendary-creatures-batch-5-rampage -- legend rule sanity check', () => {
  it('checkLegendRule triggers when a player controls two copies of Chromium', () => {
    const leg1 = makeReadyInstance('chromium', 'p');
    const leg2 = { ...makeReadyInstance('chromium', 'p'), iid: 'chromium-2' };
    const state = makeState({ pBf: [leg1, leg2] });
    const s1 = checkLegendRule(state);
    expect(s1.pendingChoice).not.toBeNull();
    expect(s1.pendingChoice.kind).toBe('legendRuleChoice');
    expect(s1.pendingChoice.legendName).toBe('Chromium');
    expect(s1.pendingChoice.options.map(o => o.id).sort()).toEqual(['chromium-1', 'chromium-2']);
  });
});
