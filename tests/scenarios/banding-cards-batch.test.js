// tests/scenarios/banding-cards-batch.test.js
// Banding phase 3 of 3: unstubs Battering Ram, Mishra's War Machine, Nalathni
// Dragon, and Knights of Thorn now that the phase 1/2 banding subsystem and AI
// heuristics are live. See THIRD_PARTY_NOTICES.md for attribution.

import { describe, it, expect } from 'vitest';
import { duelReducer, hasKw, makeCardInstance, canBlockDuel } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature } from '../../src/engine/__tests__/_factory.js';
import KEYWORDS from '../../src/data/keywords.js';

// Builds a real CARD_DB-backed battlefield instance with a known iid, ready to
// act (not summoning sick, untapped). Mirrors batch-14's helper.
function makeReadyInstance(id, controller, overrides = {}) {
  const inst = makeCardInstance(id, controller);
  return { ...inst, iid: `${id}-1`, summoningSick: false, tapped: false, eotBuffs: [], ...overrides };
}

describe('@engine Scenario: banding-cards-batch -- Battering Ram', () => {
  it('gains banding at the beginning of combat on its controller\'s turn', () => {
    const ram = makeReadyInstance('battering_ram', 'p');
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [ram] });
    const s1 = duelReducer(base, { type: 'ADVANCE_PHASE' }); // -> COMBAT_BEGIN
    const ramAfter = s1.p.bf.find(c => c.iid === 'battering_ram-1');
    expect(hasKw(ramAfter, KEYWORDS.BANDING.id)).toBe(true);
    expect(ramAfter.eotBuffs).toContainEqual({ keywords: [KEYWORDS.BANDING.id], scope: 'combat' });
  });

  it('does not gain banding at the beginning of combat on the opponent\'s turn', () => {
    const ram = makeReadyInstance('battering_ram', 'p');
    const base = makeState({ phase: PHASE.MAIN_1, active: 'o', pBf: [ram] });
    const s1 = duelReducer(base, { type: 'ADVANCE_PHASE' }); // -> COMBAT_BEGIN (o's combat)
    const ramAfter = s1.p.bf.find(c => c.iid === 'battering_ram-1');
    expect(hasKw(ramAfter, KEYWORDS.BANDING.id)).toBe(false);
  });

  it('banding expires at end of combat rather than lingering into main phase 2', () => {
    const ram = makeReadyInstance('battering_ram', 'p');
    const dummy = makeCreature('dummy-1', { controller: 'o', power: 0, toughness: 5 });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [ram], oBf: [dummy] });
    let s = duelReducer(base, { type: 'ADVANCE_PHASE' }); // -> COMBAT_BEGIN (gains banding)
    s = duelReducer(s, { type: 'ADVANCE_PHASE' }); // -> COMBAT_ATTACKERS
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'battering_ram-1' });
    s = duelReducer(s, { type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_ATTACKERS
    s = duelReducer(s, { type: 'ADVANCE_PHASE' }); // -> COMBAT_BLOCKERS
    s = duelReducer(s, { type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_BLOCKERS
    s = duelReducer(s, { type: 'ADVANCE_PHASE' }); // -> COMBAT_DAMAGE (resolves)
    const ramAtDamage = s.p.bf.find(c => c.iid === 'battering_ram-1');
    expect(hasKw(ramAtDamage, KEYWORDS.BANDING.id)).toBe(true); // still banded through damage
    s = duelReducer(s, { type: 'ADVANCE_PHASE' }); // -> COMBAT_END (scope:'combat' stripped)
    const ramAfter = s.p.bf.find(c => c.iid === 'battering_ram-1');
    expect(hasKw(ramAfter, KEYWORDS.BANDING.id)).toBe(false);
  });

  it('destroys a blocking Wall at end of combat', () => {
    const ram = makeReadyInstance('battering_ram', 'p');
    const wall = makeCreature('wall-1', { controller: 'o', subtype: 'Wall', power: 0, toughness: 5 });
    const base = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'p', pBf: [ram], oBf: [wall] });
    let s = duelReducer(base, { type: 'DECLARE_ATTACKER', iid: 'battering_ram-1' });
    s = duelReducer(s, { type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_ATTACKERS
    s = duelReducer(s, { type: 'ADVANCE_PHASE' }); // -> COMBAT_BLOCKERS
    s = duelReducer(s, { type: 'DECLARE_BLOCKER', blId: 'wall-1', attId: 'battering_ram-1' });
    expect(s.turnState.endOfCombatDestroy).toContain('wall-1');
    s = duelReducer(s, { type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_BLOCKERS
    s = duelReducer(s, { type: 'ADVANCE_PHASE' }); // -> COMBAT_DAMAGE
    expect(s.o.bf.some(c => c.iid === 'wall-1')).toBe(true); // survives combat damage (0 power attacker... wait ram has 1 power, wall has 5 toughness)
    s = duelReducer(s, { type: 'ADVANCE_PHASE' }); // -> COMBAT_END (destroyed here, not earlier)
    expect(s.o.bf.some(c => c.iid === 'wall-1')).toBe(false);
    expect(s.o.gy.some(c => c.iid === 'wall-1')).toBe(true);
  });

  it('does not destroy a non-Wall blocker', () => {
    const ram = makeReadyInstance('battering_ram', 'p');
    const bear = makeCreature('bear-1', { controller: 'o', subtype: 'Bear', power: 0, toughness: 5 });
    const base = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'p', pBf: [ram], oBf: [bear] });
    let s = duelReducer(base, { type: 'DECLARE_ATTACKER', iid: 'battering_ram-1' });
    s = duelReducer(s, { type: 'ADVANCE_PHASE' });
    s = duelReducer(s, { type: 'ADVANCE_PHASE' });
    s = duelReducer(s, { type: 'DECLARE_BLOCKER', blId: 'bear-1', attId: 'battering_ram-1' });
    expect(s.turnState.endOfCombatDestroy ?? []).not.toContain('bear-1');
    s = duelReducer(s, { type: 'ADVANCE_PHASE' });
    s = duelReducer(s, { type: 'ADVANCE_PHASE' });
    s = duelReducer(s, { type: 'ADVANCE_PHASE' });
    expect(s.o.bf.some(c => c.iid === 'bear-1')).toBe(true);
  });
});

describe('@engine Scenario: banding-cards-batch -- Mishra\'s War Machine', () => {
  it('queues an upkeep choice for the human controller', () => {
    const mwm = makeReadyInstance('mishrass_war_machine', 'p');
    const card1 = { iid: 'c1', id: 'forest', name: 'Forest' };
    const base = makeState({ phase: PHASE.CLEANUP, active: 'o', pBf: [mwm], pHand: [card1] });
    const state = { ...base, p: { ...base.p, life: 20 } };
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // -> UNTAP (p's turn)
    const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' }); // -> UPKEEP, queues the choice
    expect(s2.pendingUpkeepChoice?.handlerKey).toBe('mishrasWarMachineUpkeep');
  });

  it('discarding a card avoids the damage', () => {
    const mwm = makeReadyInstance('mishrass_war_machine', 'p');
    const card1 = { iid: 'c1', id: 'forest', name: 'Forest' };
    const base = makeState({ phase: PHASE.CLEANUP, active: 'o', pBf: [mwm], pHand: [card1] });
    const state = { ...base, p: { ...base.p, life: 20 } };
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' });
    const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' });
    const s3 = duelReducer(s2, { type: 'UPKEEP_CHOICE_RESOLVE', choice: 'DISCARD' });
    expect(s3.p.hand.length).toBe(0);
    expect(s3.p.gy.some(c => c.iid === 'c1')).toBe(true);
    expect(s3.p.life).toBe(20);
    expect(s3.p.bf.find(c => c.iid === 'mishrass_war_machine-1').tapped).toBe(false);
  });

  it('declining deals 3 damage and taps the creature', () => {
    const mwm = makeReadyInstance('mishrass_war_machine', 'p');
    const card1 = { iid: 'c1', id: 'forest', name: 'Forest' };
    const base = makeState({ phase: PHASE.CLEANUP, active: 'o', pBf: [mwm], pHand: [card1] });
    const state = { ...base, p: { ...base.p, life: 20 } };
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' });
    const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' });
    const s3 = duelReducer(s2, { type: 'UPKEEP_CHOICE_RESOLVE', choice: 'DECLINE' });
    expect(s3.p.hand.length).toBe(1); // no card discarded
    expect(s3.p.life).toBe(17);
    expect(s3.p.bf.find(c => c.iid === 'mishrass_war_machine-1').tapped).toBe(true);
  });

  it('opponent auto-discards a card when one is available', () => {
    const mwm = makeReadyInstance('mishrass_war_machine', 'o');
    const oCard = { iid: 'oc1', id: 'forest', name: 'Forest' };
    const base = makeState({ phase: PHASE.CLEANUP, active: 'p', oBf: [mwm], oHand: [oCard] });
    const state = { ...base, o: { ...base.o, life: 20 } };
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // -> UNTAP (o's turn)
    const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' }); // -> UPKEEP, auto-resolves
    expect(s2.o.hand.length).toBe(0);
    expect(s2.o.gy.some(c => c.iid === 'oc1')).toBe(true);
    expect(s2.o.life).toBe(20);
  });

  it('opponent takes unavoidable damage and taps when its hand is empty', () => {
    const mwm = makeReadyInstance('mishrass_war_machine', 'o');
    const base = makeState({ phase: PHASE.CLEANUP, active: 'p', oBf: [mwm] });
    const state = { ...base, o: { ...base.o, life: 20 } };
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' });
    const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' });
    expect(s2.o.life).toBe(17);
    expect(s2.o.bf.find(c => c.iid === 'mishrass_war_machine-1').tapped).toBe(true);
  });
});

describe('@engine Scenario: banding-cards-batch -- Nalathni Dragon', () => {
  it('activating once grants +1/+0 until end of turn and increments the activation count', () => {
    const dragon = makeReadyInstance('nalathni_dragon', 'p');
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [dragon] });
    const state = { ...base, p: { ...base.p, mana: { ...base.p.mana, R: 4 } } };
    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'nalathni_dragon-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.turnState.activationCounts?.['nalathni_dragon-1']).toBe(1);
    expect(s2.p.bf.find(c => c.iid === 'nalathni_dragon-1').eotBuffs).toContainEqual({ power: 1 });
  });

  it('sacrifices itself at the next end step after four or more activations', () => {
    const dragon = makeReadyInstance('nalathni_dragon', 'p');
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [dragon] });
    let s = { ...base, p: { ...base.p, mana: { ...base.p.mana, R: 4 } } };
    for (let i = 0; i < 4; i++) {
      s = duelReducer(s, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'nalathni_dragon-1' });
      s = duelReducer(s, { type: 'RESOLVE_STACK' });
    }
    expect(s.turnState.activationCounts['nalathni_dragon-1']).toBe(4);
    expect(s.p.bf.some(c => c.iid === 'nalathni_dragon-1')).toBe(true); // not yet -- only at the next end step
    s = duelReducer({ ...s, phase: PHASE.MAIN_2 }, { type: 'ADVANCE_PHASE' }); // -> END, fires ON_END_STEP
    expect(s.p.bf.some(c => c.iid === 'nalathni_dragon-1')).toBe(false);
    expect(s.p.gy.some(c => c.iid === 'nalathni_dragon-1')).toBe(true);
  });

  it('survives the end step with fewer than four activations', () => {
    const dragon = makeReadyInstance('nalathni_dragon', 'p');
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [dragon] });
    let s = { ...base, p: { ...base.p, mana: { ...base.p.mana, R: 3 } } };
    for (let i = 0; i < 3; i++) {
      s = duelReducer(s, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'nalathni_dragon-1' });
      s = duelReducer(s, { type: 'RESOLVE_STACK' });
    }
    s = duelReducer({ ...s, phase: PHASE.MAIN_2 }, { type: 'ADVANCE_PHASE' }); // -> END
    expect(s.p.bf.some(c => c.iid === 'nalathni_dragon-1')).toBe(true);
  });
});

describe('@engine Scenario: banding-cards-batch -- Knights of Thorn (control case)', () => {
  it('cannot be blocked by red creatures (protection)', () => {
    const knight = makeReadyInstance('knights_of_thorn', 'p');
    const redBlocker = makeCreature('rb-1', { controller: 'o', color: 'R' });
    expect(canBlockDuel(redBlocker, knight, [])).toBe(false);
  });

  it('can be blocked by a non-red creature and forms a band via FORM_BAND', () => {
    const knight = makeReadyInstance('knights_of_thorn', 'p');
    const other = makeCreature('other-1', { controller: 'p', keywords: [] });
    const blueBlocker = makeCreature('bb-1', { controller: 'o', color: 'U' });
    expect(canBlockDuel(blueBlocker, knight, [])).toBe(true);

    const base = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'p', pBf: [knight, other] });
    let s = duelReducer(base, { type: 'DECLARE_ATTACKER', iid: 'knights_of_thorn-1' });
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'other-1' });
    s = duelReducer(s, { type: 'FORM_BAND', iids: ['knights_of_thorn-1', 'other-1'] });
    const kot = s.p.bf.find(c => c.iid === 'knights_of_thorn-1');
    const oth = s.p.bf.find(c => c.iid === 'other-1');
    expect(kot.bandId).toBeTruthy();
    expect(kot.bandId).toBe(oth.bandId);
  });
});
