// src/engine/__tests__/AI.banding.test.js
// AI heuristics for banding (CR 702.22), phase 2 of 3. Phase 1 built the core
// subsystem (bandId, FORM_BAND, the 702.22j/k damage-division choices) with
// AI.js untouched -- the AI never formed a band and useDuelController.ts's
// generic options[0] fallback answered both choices. This file locks in the
// phase-2 heuristics: aggression/value-spread-gated band formation in
// planAttack, chooseBandingDamageOrder for both 702.22j/k choice kinds, and
// planBlock's band-power-aware risk evaluation.

import { describe, it, expect } from 'vitest';
import { duelReducer } from '../DuelCore.js';
import { getAIPlan, chooseBandingDamageOrder } from '../AI.js';
import { PHASE } from '../phases.js';
import { makeState, makeCreature } from './_factory.js';

// Advances from COMBAT_ATTACKERS through the COMBAT_BLOCKERS declaration
// point (does not declare blocks itself). Mirrors tests/scenarios/banding-core.test.js.
function toBlockersPhase(state) {
  const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_ATTACKERS
  return duelReducer(s1, { type: 'ADVANCE_PHASE' });        // -> COMBAT_BLOCKERS
}

describe('@engine-ai-1 AI banding heuristics (CR 702.22, phase 2)', () => {

  // -- Band formation gating (planAttack) -------------------------------------

  it('does not form a band below the aggression threshold, even with a large value gap', () => {
    const a = makeCreature('a', { controller: 'o', keywords: ['BANDING'], power: 1, toughness: 1 });
    const b = makeCreature('b', { controller: 'o', keywords: ['BANDING'], power: 8, toughness: 8 });
    let s = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: [a, b] });
    s = { ...s, oppArch: { id: 'MORTIS', profileId: 'MORTIS' } }; // aggression 0.6, below the 0.8 gate

    const plan = getAIPlan(s, PHASE.COMBAT_ATTACKERS);

    expect(plan.actions.find(x => x.type === 'FORM_BAND')).toBeUndefined();
    const attack = plan.actions.find(x => x.type === 'ATTACK');
    expect(attack.attackerIds).toEqual(expect.arrayContaining(['a', 'b']));
  });

  it('forms a band at the aggression threshold when there is a meaningful value gap', () => {
    const a = makeCreature('a', { controller: 'o', keywords: ['BANDING'], power: 1, toughness: 1 });
    const b = makeCreature('b', { controller: 'o', keywords: ['BANDING'], power: 8, toughness: 8 });
    let s = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: [a, b] });
    s = { ...s, oppArch: { id: 'ARZAKON', profileId: 'ARZAKON' } }; // aggression 0.8, exactly the gate

    const plan = getAIPlan(s, PHASE.COMBAT_ATTACKERS);

    const band = plan.actions.find(x => x.type === 'FORM_BAND');
    expect(band).toBeTruthy();
    expect(band.iids.sort()).toEqual(['a', 'b']);
  });

  it('does not form a band when the eligible members are evenly matched in value', () => {
    const a = makeCreature('a', { controller: 'o', keywords: ['BANDING'], power: 3, toughness: 3 });
    const b = makeCreature('b', { controller: 'o', keywords: ['BANDING'], power: 3, toughness: 3 });
    const s = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: [a, b] }); // KARAG, aggression 1.0

    const plan = getAIPlan(s, PHASE.COMBAT_ATTACKERS);

    expect(plan.actions.find(x => x.type === 'FORM_BAND')).toBeUndefined();
  });

  it('pairs a lone banding attacker with the highest-value non-banding attacker when a gap exists', () => {
    const a = makeCreature('a', { controller: 'o', keywords: ['BANDING'], power: 1, toughness: 1 });
    const c = makeCreature('c', { controller: 'o', keywords: [], power: 8, toughness: 8 });
    const s = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: [a, c] }); // KARAG, aggression 1.0

    const plan = getAIPlan(s, PHASE.COMBAT_ATTACKERS);

    const band = plan.actions.find(x => x.type === 'FORM_BAND');
    expect(band).toBeTruthy();
    expect(band.iids.sort()).toEqual(['a', 'c']);
  });

  it('does not attempt to form a band with a solo banding attacker and nobody to pair with', () => {
    const a = makeCreature('a', { controller: 'o', keywords: ['BANDING'], power: 1, toughness: 1 });
    const s = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: [a] }); // KARAG, aggression 1.0

    const plan = getAIPlan(s, PHASE.COMBAT_ATTACKERS);

    expect(plan.actions.find(x => x.type === 'FORM_BAND')).toBeUndefined();
  });

  // -- Both damage-division choices (chooseBandingDamageOrder) ----------------

  it('702.22j: resolves the defending-player blocker-order choice ascending by value', () => {
    const a = makeCreature('a', { controller: 'p', keywords: [], power: 2, toughness: 10 });
    const x = makeCreature('x', { controller: 'o', keywords: ['BANDING'], power: 5, toughness: 5 }); // higher value
    const y = makeCreature('y', { controller: 'o', keywords: [], power: 1, toughness: 1 });           // lower value
    let s = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'p', pBf: [a], oBf: [x, y] });
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'a' });
    s = toBlockersPhase(s);
    s = duelReducer(s, { type: 'DECLARE_BLOCKER', attId: 'a', blId: 'x' });
    s = duelReducer(s, { type: 'DECLARE_BLOCKER', attId: 'a', blId: 'y' });
    s = duelReducer(s, { type: 'ADVANCE_PHASE' });
    s = duelReducer(s, { type: 'ADVANCE_PHASE' }); // -> COMBAT_DAMAGE, pauses for the 702.22j choice

    expect(s.pendingChoice.kind).toBe('bandAttackerDamageOrder');
    expect(s.pendingChoice.controller).toBe('o'); // defending player is 'o' here

    const optionId = chooseBandingDamageOrder(s.pendingChoice, s);
    const chosen = s.pendingChoice.options.find(o => o.id === optionId);
    expect(chosen.order).toEqual(['y', 'x']); // y (lower value) absorbs lethal first
  });

  it('702.22k: resolves the active-player band-member-order choice ascending by value', () => {
    const m1 = makeCreature('m1', { controller: 'o', keywords: ['BANDING'], power: 6, toughness: 6 }); // higher value
    const m2 = makeCreature('m2', { controller: 'o', keywords: ['BANDING'], power: 1, toughness: 5 });  // lower value
    const x = makeCreature('x', { controller: 'p', keywords: [], power: 3, toughness: 10 });
    let s = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: [m1, m2], pBf: [x] });
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'm1' });
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'm2' });
    s = duelReducer(s, { type: 'FORM_BAND', iids: ['m1', 'm2'] });
    s = toBlockersPhase(s);
    s = duelReducer(s, { type: 'DECLARE_BLOCKER', attId: 'm1', blId: 'x' });
    s = duelReducer(s, { type: 'ADVANCE_PHASE' });
    s = duelReducer(s, { type: 'ADVANCE_PHASE' }); // -> COMBAT_DAMAGE, pauses for the 702.22k choice

    expect(s.pendingChoice.kind).toBe('bandBlockerDamageOrder');
    expect(s.pendingChoice.controller).toBe('o'); // active player chooses

    const optionId = chooseBandingDamageOrder(s.pendingChoice, s);
    const chosen = s.pendingChoice.options.find(o => o.id === optionId);
    expect(chosen.order).toEqual(['m2', 'm1']); // m2 (lower value) absorbs lethal first
  });

  // -- planBlock band-power awareness ------------------------------------------

  it('declines a block that looks safe against one band member alone but is lethal against the combined band', () => {
    const m1 = makeCreature('m1', { controller: 'p', keywords: ['BANDING'], power: 1, toughness: 1 });
    const m2 = makeCreature('m2', { controller: 'p', keywords: ['BANDING'], power: 1, toughness: 1 });
    const blk = makeCreature('blk', { controller: 'o', keywords: [], power: 1, toughness: 2 });
    let s = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'p', pBf: [m1, m2], oBf: [blk] });
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'm1' });
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'm2' });
    s = duelReducer(s, { type: 'FORM_BAND', iids: ['m1', 'm2'] });
    s = toBlockersPhase(s);

    // blk's toughness (2) beats m1's own power (1) in isolation -- a
    // block-evaluation that only looks at the targeted attacker's own power
    // would call this a safe block. Combined band power is 2, which blk
    // does not survive, so the fixed heuristic should decline to block.
    const plan = getAIPlan(s, PHASE.COMBAT_BLOCKERS);

    expect(plan.actions.filter(x => x.type === 'BLOCK')).toHaveLength(0);
  });

  it('still blocks when the blocker genuinely survives the full combined band power', () => {
    const m1 = makeCreature('m1', { controller: 'p', keywords: ['BANDING'], power: 1, toughness: 1 });
    const m2 = makeCreature('m2', { controller: 'p', keywords: ['BANDING'], power: 1, toughness: 1 });
    const blk = makeCreature('blk', { controller: 'o', keywords: [], power: 1, toughness: 5 });
    let s = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'p', pBf: [m1, m2], oBf: [blk] });
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'm1' });
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'm2' });
    s = duelReducer(s, { type: 'FORM_BAND', iids: ['m1', 'm2'] });
    s = toBlockersPhase(s);

    const plan = getAIPlan(s, PHASE.COMBAT_BLOCKERS);

    const blocks = plan.actions.filter(x => x.type === 'BLOCK');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].blockerId).toBe('blk');
  });

  it('regression: an unbanded attacker still uses its own power alone in the block risk calculation', () => {
    const a = makeCreature('a', { controller: 'p', keywords: [], power: 2, toughness: 2 });
    const blk = makeCreature('blk', { controller: 'o', keywords: [], power: 3, toughness: 3 });
    let s = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'p', pBf: [a], oBf: [blk] });
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'a' });
    s = toBlockersPhase(s);

    const plan = getAIPlan(s, PHASE.COMBAT_BLOCKERS);

    const blocks = plan.actions.filter(x => x.type === 'BLOCK');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].blockerId).toBe('blk');
    expect(blocks[0].attackerId).toBe('a');
  });

  // -- Control cases: no banding creature present ------------------------------

  it('control: planAttack never forms a band when no attacker has banding, regardless of aggression or value spread', () => {
    const a = makeCreature('a', { controller: 'o', keywords: [], power: 1, toughness: 1 });
    const b = makeCreature('b', { controller: 'o', keywords: [], power: 8, toughness: 8 });
    const s = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: [a, b] }); // KARAG, aggression 1.0

    const plan = getAIPlan(s, PHASE.COMBAT_ATTACKERS);

    expect(plan.actions.find(x => x.type === 'FORM_BAND')).toBeUndefined();
  });

  it('control: the aggregate lethal chump-block pass is unaffected by the banding changes', () => {
    const a = makeCreature('a', { controller: 'p', keywords: [], power: 12, toughness: 12 });
    const b = makeCreature('b', { controller: 'p', keywords: [], power: 12, toughness: 12 });
    const chump = makeCreature('chump', { controller: 'o', keywords: [], power: 1, toughness: 1 });
    let s = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'p', pBf: [a, b], oBf: [chump] });
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'a' });
    s = duelReducer(s, { type: 'DECLARE_ATTACKER', iid: 'b' });
    s = toBlockersPhase(s);

    const plan = getAIPlan(s, PHASE.COMBAT_BLOCKERS);

    // 24 incoming damage against 20 life is lethal -- the aggregate pass should
    // still force the chump to block the biggest attacker, same as pre-banding.
    const blocks = plan.actions.filter(x => x.type === 'BLOCK');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].blockerId).toBe('chump');
    expect(blocks[0].attackerId).toBe('a');
  });

});
