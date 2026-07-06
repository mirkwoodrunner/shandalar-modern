// tests/scenarios/eye-for-an-eye.test.js
// Damage Shields (Part 3): Eye for an Eye. Unlike the Circles of Protection,
// this is an Instant (not an activated ability) whose "choose a source" trigger
// fires directly on resolution, with no color/type restriction and mode:
// "redirect" instead of "prevent". See docs/SYSTEMS.md -- Damage Shields.

import { describe, it, expect } from 'vitest';
import { duelReducer, hurt } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { getCardById } from '../../src/data/cards.js';
import { makeState, makeCreature } from '../../src/engine/__tests__/_factory.js';

describe('@engine Scenario: eye_for_an_eye', () => {
  it('has no color/type restriction and mode "redirect"', () => {
    const card = getCardById('eye_for_an_eye');
    expect(card.type).toBe('Instant');
    expect(card.cost).toBe('WW');
    expect(card.effect).toBe('chooseDamageShieldSource');
    expect(card.damageShieldMode).toBe('redirect');
    expect(card.damageShieldColors).toBeUndefined();
    expect(card.damageShieldTypes).toBeUndefined();
  });

  it('end-to-end: cast it, choose an attacking creature as the source, then that creature\'s combat damage is redirected to its controller', () => {
    const efe = { ...getCardById('eye_for_an_eye'), iid: 'efe-1' };
    const attacker = makeCreature('att-1', { id: 'shivan_dragon', name: 'Shivan Dragon', color: 'R', power: 5, toughness: 5, controller: 'o' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [efe], oBf: [attacker] });
    const state = { ...base, p: { ...base.p, mana: { W: 2, U: 0, B: 0, R: 0, G: 0, C: 0 }, life: 20 }, o: { ...base.o, life: 20 } };

    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'efe-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.pendingDamageShieldChoice.pool.map(c => c.iid)).toEqual(['att-1']);

    const s3 = duelReducer(s2, { type: 'RESOLVE_DAMAGE_SHIELD_CHOICE', iid: 'att-1' });
    expect(s3.turnState.damageShields.p).toEqual([
      { chosenSourceIid: 'att-1', chosenSourceController: 'o', mode: 'redirect', shieldSourceIid: 'efe-1', shieldSourceName: 'Eye for an Eye' },
    ]);

    // Shivan Dragon's combat damage now lands on p as usual, and Eye for an Eye
    // deals an equal amount back to Shivan Dragon's controller (o).
    const s4 = hurt(s3, 'p', 5, attacker.name, { sourceIid: 'att-1', sourceType: 'creature', combat: true, unblocked: true });
    expect(s4.p.life).toBe(15);
    expect(s4.o.life).toBe(15);
    expect(s4.turnState.damageShields.p).toEqual([]);
  });

  it('can target any source regardless of color, unlike the Circles of Protection', () => {
    const efe = { ...getCardById('eye_for_an_eye'), iid: 'efe-1' };
    const greenThreat = makeCreature('gt-1', { id: 'craw_wurm', color: 'G', controller: 'o' });
    const blueSpell = { iid: 'spell-1', id: 'ancestral_recall', name: 'Ancestral Recall', type: 'Instant', color: 'U', cmc: 1, cost: 'U' };
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [efe], oBf: [greenThreat] });
    const state = { ...base, p: { ...base.p, mana: { W: 2, U: 0, B: 0, R: 0, G: 0, C: 0 } }, stack: [{ id: 'stk-1', card: blueSpell, caster: 'o', targets: [], xVal: 1 }] };

    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'efe-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    const iids = s2.pendingDamageShieldChoice.pool.map(c => c.iid).sort();
    expect(iids).toEqual(['gt-1', 'spell-1']);
  });
});
