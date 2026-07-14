// tests/scenarios/ownership-exchange.test.js
// Regression coverage for Part 6: ownershipChanges (Bronze Tablet, Tempest
// Efreet) fires unconditionally -- unlike ante reconciliation, it does not
// depend on who won the duel.

import { describe, it, expect } from 'vitest';
import { resolveEff } from '../../src/engine/DuelCore.js';
import { makeState, makeCreature } from '../../src/engine/__tests__/_factory.js';

describe('@engine-card-scenarios-7 Scenario: ownershipChanges reconciliation model', () => {

  it('Bronze Tablet: opponent declines payment -- both cards permanently exchange ownership', () => {
    const bronzeTablet = { iid: 'bt1', id: 'bronze_tablet', name: 'Bronze Tablet', type: 'Artifact', effect: 'bronzeTabletExchange', controller: 'p', tapped: true, damage: 0, counters: {}, eotBuffs: [], enchantments: [] };
    const oppCreature = makeCreature('oc1', { name: 'Ornithopter', controller: 'o', power: 0, toughness: 2 });

    let state = makeState({ pBf: [bronzeTablet], oBf: [oppCreature] });
    state = { ...state, o: { ...state.o, life: 5 } }; // too low to survive paying 10 life -- must decline

    state = resolveEff(state, {
      card: bronzeTablet,
      caster: 'p',
      targets: [oppCreature.iid],
      xVal: 1,
    });

    expect(state.p.bf.some(c => c.iid === bronzeTablet.iid)).toBe(false);
    expect(state.o.bf.some(c => c.iid === oppCreature.iid)).toBe(false);
    expect(state.o.life).toBe(5); // declined -- no life paid
    expect(state.ownershipChanges).toEqual(expect.arrayContaining([
      expect.objectContaining({ cardId: 'bronze_tablet', newOwner: 'o' }),
      expect.objectContaining({ cardId: oppCreature.id, newOwner: 'p' }),
    ]));
  });

  it('Bronze Tablet: opponent has plenty of life -- pays, no ownership change, card goes to owner\'s graveyard', () => {
    const bronzeTablet = { iid: 'bt2', id: 'bronze_tablet', name: 'Bronze Tablet', type: 'Artifact', effect: 'bronzeTabletExchange', controller: 'p', tapped: true, damage: 0, counters: {}, eotBuffs: [], enchantments: [] };
    const oppCreature = makeCreature('oc2', { name: 'Ornithopter', controller: 'o', power: 0, toughness: 2 });

    let state = makeState({ pBf: [bronzeTablet], oBf: [oppCreature] });
    state = { ...state, o: { ...state.o, life: 20 } };

    state = resolveEff(state, { card: bronzeTablet, caster: 'p', targets: [oppCreature.iid], xVal: 1 });

    expect(state.o.life).toBe(10);
    expect(state.ownershipChanges).toEqual([]);
    expect(state.p.gy.some(c => c.iid === bronzeTablet.iid)).toBe(true);
  });

  it('Tempest Efreet: opponent declines -- reveals a card at random, ownership exchanges permanently', () => {
    const efreet = { iid: 'te1', id: 'tempest_efreet', name: 'Tempest Efreet', type: 'Creature', effect: 'tempestEfreetExchange', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [] };
    const oppCard = { iid: 'oh1', id: 'lightning_bolt', name: 'Lightning Bolt' };

    let state = makeState({ pBf: [efreet], oHand: [oppCard] });
    state = { ...state, o: { ...state.o, life: 3 }, p: { ...state.p, gy: [efreet] } }; // already sacrificed as activation cost

    state = resolveEff(state, { card: efreet, caster: 'p', targets: [], xVal: 1 });

    expect(state.p.hand.some(c => c.id === oppCard.id)).toBe(true);
    expect(state.o.hand.length).toBe(0);
    expect(state.o.gy.some(c => c.iid === efreet.iid)).toBe(true);
    expect(state.p.gy.some(c => c.iid === efreet.iid)).toBe(false);
    expect(state.ownershipChanges).toEqual(expect.arrayContaining([
      expect.objectContaining({ cardId: oppCard.id, newOwner: 'p' }),
      expect.objectContaining({ cardId: 'tempest_efreet', newOwner: 'o' }),
    ]));
  });

  it('Tempest Efreet: opponent has plenty of life -- pays, no reveal, no ownership change', () => {
    const efreet = { iid: 'te2', id: 'tempest_efreet', name: 'Tempest Efreet', type: 'Creature', effect: 'tempestEfreetExchange', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [] };
    const oppCard = { iid: 'oh2', id: 'lightning_bolt', name: 'Lightning Bolt' };

    let state = makeState({ pBf: [efreet], oHand: [oppCard] });
    state = { ...state, o: { ...state.o, life: 20 }, p: { ...state.p, gy: [efreet] } };

    state = resolveEff(state, { card: efreet, caster: 'p', targets: [], xVal: 1 });

    expect(state.o.life).toBe(10);
    expect(state.o.hand.length).toBe(1); // untouched
    expect(state.ownershipChanges).toEqual([]);
  });

  it('ownershipChanges entries are structurally independent of win/loss -- the sweep itself is unconditional (verified at the reconciliation-data level)', () => {
    // handleDuelEnd (useOverworldController.js) sweeps ownershipChanges outside
    // the `if (won) {...} else {...}` branch used for ante reconciliation --
    // this is a static assertion that the array shape produced by resolveEff
    // carries everything handleDuelEnd needs (cardId, card, newOwner) without
    // requiring a `won` flag on the entry itself.
    const bronzeTablet = { iid: 'bt3', id: 'bronze_tablet', name: 'Bronze Tablet', type: 'Artifact', effect: 'bronzeTabletExchange', controller: 'p', tapped: true, damage: 0, counters: {}, eotBuffs: [], enchantments: [] };
    const oppCreature = makeCreature('oc3', { name: 'Ornithopter', controller: 'o', power: 0, toughness: 2 });
    let state = makeState({ pBf: [bronzeTablet], oBf: [oppCreature] });
    state = { ...state, o: { ...state.o, life: 5 } };
    state = resolveEff(state, { card: bronzeTablet, caster: 'p', targets: [oppCreature.iid], xVal: 1 });
    for (const entry of state.ownershipChanges) {
      expect(entry).toHaveProperty('cardId');
      expect(entry).toHaveProperty('card');
      expect(entry).toHaveProperty('newOwner');
      expect(entry).not.toHaveProperty('won');
    }
  });

});
