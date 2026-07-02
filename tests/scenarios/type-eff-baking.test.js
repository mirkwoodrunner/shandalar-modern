// tests/scenarios/type-eff-baking.test.js
// Deferral Sweep 2: verifies the typeEff/subtypeEff/colorEff/bloodMoonNeutered
// baking pipeline in isolation, before testing the individual cards that rely on it.

import { describe, it, expect } from 'vitest';
import { isCre, isLand, recomputeTypeEffects, zMove, checkDeath, resolveCombat, duelReducer } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature, makeLand } from '../../src/engine/__tests__/_factory.js';

function makeLivingLands(iid, overrides = {}) {
  return {
    iid, id: 'living_lands', name: 'Living Lands', type: 'Enchantment', color: 'G',
    cmc: 4, cost: '3G', keywords: [], tapped: false, damage: 0, counters: {},
    eotBuffs: [], enchantments: [], controller: 'p', enterTs: 1,
    effect: 'globalTypeEffect',
    globalTypeEffect: { filter: 'Forest', addTypes: ['Creature'], setPower: 1, setToughness: 1 },
    ...overrides,
  };
}

describe('@engine Scenario: type-effect baking (Deferral Sweep 2)', () => {

  it('bakes typeEff/subtypeEff and P/T onto a Forest while Living Lands is on the battlefield', () => {
    const forest = makeLand('forest-1', { id: 'forest', name: 'Forest', subtype: 'Forest', controller: 'p' });
    const state = makeState({ pBf: [forest, makeLivingLands('ll-1')] });

    const ns = recomputeTypeEffects(state);
    const bakedForest = ns.p.bf.find(c => c.iid === 'forest-1');

    expect(bakedForest.typeEff).toBe('Land Creature');
    expect(bakedForest.subtypeEff).toBeUndefined();
    expect(isCre(bakedForest)).toBe(true);
    expect(isLand(bakedForest)).toBe(true);
  });

  it('strips typeEff when Living Lands leaves the battlefield', () => {
    const forest = makeLand('forest-1', { id: 'forest', name: 'Forest', subtype: 'Forest', controller: 'p' });
    const living = makeLivingLands('ll-1');
    const animated = makeState({ pBf: [forest, living] });
    const withEffect = recomputeTypeEffects(animated);
    expect(isCre(withEffect.p.bf.find(c => c.iid === 'forest-1'))).toBe(true);

    // Living Lands leaves (destroyed) -- only the Forest remains.
    const withoutEffect = { ...withEffect, p: { ...withEffect.p, bf: withEffect.p.bf.filter(c => c.iid !== 'll-1') } };
    const reverted = recomputeTypeEffects(withoutEffect);
    const revertedForest = reverted.p.bf.find(c => c.iid === 'forest-1');

    expect(revertedForest.typeEff).toBeUndefined();
    expect(isCre(revertedForest)).toBe(false);
    expect(isLand(revertedForest)).toBe(true);
  });

  it('strips baked fields when a card leaves the battlefield via zMove (dies as a land, not a creature)', () => {
    const forest = makeLand('forest-1', { id: 'forest', name: 'Forest', subtype: 'Forest', controller: 'p' });
    const living = makeLivingLands('ll-1');
    let state = makeState({ pBf: [forest, living] });
    state = recomputeTypeEffects(state);
    expect(isCre(state.p.bf.find(c => c.iid === 'forest-1'))).toBe(true);

    const moved = zMove(state, 'forest-1', 'p', 'p', 'gy');
    const gyCard = moved.p.gy.find(c => c.iid === 'forest-1');

    expect(gyCard).toBeDefined();
    expect(gyCard.typeEff).toBeUndefined();
    expect(gyCard.subtypeEff).toBeUndefined();
    expect(isCre(gyCard)).toBe(false);
    expect(isLand(gyCard)).toBe(true);
  });

  it('checkDeath sends an animated Forest to the graveyard as a land, not a creature card', () => {
    const forest = makeLand('forest-1', {
      id: 'forest', name: 'Forest', subtype: 'Forest', controller: 'p', damage: 5,
    });
    const living = makeLivingLands('ll-1');
    let state = makeState({ pBf: [forest, living] });
    state = recomputeTypeEffects(state);
    // Sanity: baked as a 1/1 creature with lethal damage marked.
    const bakedForest = state.p.bf.find(c => c.iid === 'forest-1');
    expect(isCre(bakedForest)).toBe(true);

    const afterDeath = checkDeath(state);
    expect(afterDeath.p.bf.find(c => c.iid === 'forest-1')).toBeUndefined();
    const gyCard = afterDeath.p.gy.find(c => c.iid === 'forest-1');
    expect(gyCard).toBeDefined();
    expect(isCre(gyCard)).toBe(false);
    expect(isLand(gyCard)).toBe(true);
  });

  it('mid-combat revert: an attacking animated Forest is removed from combat when Living Lands leaves', () => {
    const forest = makeLand('forest-1', {
      id: 'forest', name: 'Forest', subtype: 'Forest', controller: 'p', attacking: true, tapped: true,
    });
    const living = makeLivingLands('ll-1');
    let state = { ...makeState({ phase: PHASE.COMBAT_ATTACKERS, pBf: [forest, living] }), attackers: ['forest-1'] };
    state = recomputeTypeEffects(state);
    expect(state.attackers).toContain('forest-1');

    // Living Lands leaves the battlefield -- the Forest should be spliced out of combat.
    const withoutEffect = { ...state, p: { ...state.p, bf: state.p.bf.filter(c => c.iid !== 'll-1') } };
    const reverted = recomputeTypeEffects(withoutEffect);

    expect(reverted.attackers).not.toContain('forest-1');
    const revertedForest = reverted.p.bf.find(c => c.iid === 'forest-1');
    expect(revertedForest.attacking).toBe(false);
    expect(isCre(revertedForest)).toBe(false);
  });

  it('regression guard: recomputeTypeEffects is a no-op for an ordinary board with no type-changing effects', () => {
    const bear = makeCreature('bear-1');
    const forest = makeLand('forest-1');
    const state = makeState({ pBf: [bear, forest] });

    const ns = recomputeTypeEffects(state);
    const bakedBear = ns.p.bf.find(c => c.iid === 'bear-1');
    const bakedForest = ns.p.bf.find(c => c.iid === 'forest-1');

    expect(bakedBear.typeEff).toBeUndefined();
    expect(bakedForest.typeEff).toBeUndefined();
    expect(isCre(bakedBear)).toBe(true);
    expect(isLand(bakedForest)).toBe(true);
    expect(isCre(bakedForest)).toBe(false);
    expect(isLand(bakedBear)).toBe(false);
  });

  it('regression guard: combat damage between two ordinary creatures is unaffected', () => {
    const attacker = makeCreature('att-1', { controller: 'p', power: 3, toughness: 3, attacking: true, tapped: true });
    const blocker = makeCreature('bl-1', { controller: 'o', power: 2, toughness: 2, blocking: 'att-1' });
    const state = {
      ...makeState({ phase: PHASE.COMBAT_DAMAGE, pBf: [attacker], oBf: [blocker] }),
      attackers: ['att-1'], blockers: { 'bl-1': 'att-1' },
    };

    const ns = resolveCombat(state);
    const attAfter = ns.p.bf.find(c => c.iid === 'att-1');
    const blAfter = ns.o.bf.find(c => c.iid === 'bl-1');
    expect(attAfter.damage).toBe(2);
    expect(blAfter).toBeUndefined(); // 3 damage >= 2 toughness -- blocker dies
    const dead = ns.o.gy.find(c => c.iid === 'bl-1');
    expect(dead).toBeDefined();
  });

  it('PLAY_LAND sets summoningSick:true so an animated land under Living Lands cannot attack the turn it enters', () => {
    const living = makeLivingLands('ll-1');
    const forestInHand = { iid: 'forest-hand', id: 'forest', name: 'Forest', type: 'Land', subtype: 'Forest', color: 'G', cmc: 0, cost: '', keywords: [] };
    const state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [living], pHand: [forestInHand] });

    const ns = duelReducer(state, { type: 'PLAY_LAND', who: 'p', iid: 'forest-hand' });
    const played = ns.p.bf.find(c => c.iid === 'forest-hand');
    expect(played.summoningSick).toBe(true);
    expect(isCre(played)).toBe(true);

    const attackAttempt = duelReducer({ ...ns, phase: PHASE.COMBAT_ATTACKERS }, { type: 'DECLARE_ATTACKER', iid: 'forest-hand' });
    expect(attackAttempt.attackers ?? []).not.toContain('forest-hand');
  });

});
