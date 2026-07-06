// tests/scenarios/circle-of-protection.test.js
// Damage Shields (Part 3): the six Circle of Protection enchantments and
// Greater Realm of Preservation. Cards are pulled live from CARD_DB so these
// tests exercise each card's real activation cost and color/type filter, not
// a hand-copied duplicate of it. See docs/SYSTEMS.md -- Damage Shields.

import { describe, it, expect } from 'vitest';
import { duelReducer, hurt } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { getCardById } from '../../src/data/cards.js';
import { makeState, makeCreature } from '../../src/engine/__tests__/_factory.js';

function onBattlefield(id, iid, overrides = {}) {
  return {
    ...getCardById(id),
    iid, controller: 'p', tapped: false, summoningSick: false, attacking: false,
    blocking: null, damage: 0, counters: {}, eotBuffs: [], enchantments: [],
    ...overrides,
  };
}

function manaPool(cost) {
  const pool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  let generic = 0, i = 0;
  while (i < cost.length) {
    const ch = cost[i];
    if ('WUBRG'.includes(ch)) { pool[ch]++; i++; }
    else if (!isNaN(parseInt(ch))) {
      let n = ''; while (i < cost.length && !isNaN(parseInt(cost[i]))) { n += cost[i]; i++; }
      generic += parseInt(n);
    } else i++;
  }
  pool.C += generic;
  return pool;
}

const CASES = [
  { id: 'circle_of_protection_black', color: 'B', creatureId: 'sengir_vampire' },
  { id: 'circle_of_protection_white', color: 'W', creatureId: 'serra_angel' },
  { id: 'circle_of_protection_blue',  color: 'U', creatureId: 'air_elemental' },
  { id: 'circle_of_protection_red',   color: 'R', creatureId: 'shivan_dragon' },
  { id: 'circle_of_protection_green', color: 'G', creatureId: 'craw_wurm' },
];

describe.each(CASES)('@engine Scenario: $id', ({ id, color, creatureId }) => {
  it(`activates for its printed cost, shields only against $color sources, and prevents matching damage`, () => {
    const card = getCardById(id);
    expect(card).not.toBeNull();
    expect(card.activated.cost).toBe('1'); // all five color-specific CoPs cost {1} to activate
    expect(card.damageShieldColors).toEqual([color]);
    expect(card.damageShieldMode).toBe('prevent');

    const cop = onBattlefield(id, 'cop-1');
    const matchingThreat = makeCreature('threat-1', { id: creatureId, color, controller: 'o' });
    const nonMatchingThreat = makeCreature('other-1', { id: 'grizzly_bears', color: 'G' === color ? 'B' : 'G', controller: 'o' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [cop], oBf: [matchingThreat, nonMatchingThreat] });
    const state = { ...base, p: { ...base.p, mana: manaPool(card.activated.cost), life: 20 } };

    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'cop-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    // Every Circle of Protection is itself printed white (color: 'W'), so
    // Circle of Protection: White also legally (if uselessly) matches its own
    // filter -- a real, Forge-consistent "Card.WhiteSource" match, not a bug.
    const expectedPool = color === 'W' ? ['cop-1', 'threat-1'] : ['threat-1'];
    expect(s2.pendingDamageShieldChoice.pool.map(c => c.iid).sort()).toEqual(expectedPool.sort());

    const s3 = duelReducer(s2, { type: 'RESOLVE_DAMAGE_SHIELD_CHOICE', iid: 'threat-1' });
    expect(s3.turnState.damageShields.p).toHaveLength(1);

    // The chosen threat's combat damage is now prevented.
    const s4 = hurt(s3, 'p', 4, matchingThreat.name, { sourceIid: 'threat-1', sourceType: 'creature', combat: true, unblocked: true });
    expect(s4.p.life).toBe(20);
    expect(s4.turnState.damageShields.p).toEqual([]);
  });
});

describe('@engine Scenario: circle_of_protection_artifacts', () => {
  it('costs {2} to activate (not {1}, unlike the color-specific cycle) and shields by type, not color', () => {
    const card = getCardById('circle_of_protection_artifacts');
    expect(card.activated.cost).toBe('2');
    expect(card.damageShieldTypes).toEqual(['artifact']);
    expect(card.damageShieldMode).toBe('prevent');

    const cop = onBattlefield('circle_of_protection_artifacts', 'cop-1');
    const artifactThreat = { iid: 'art-1', id: 'rod_of_ruin', name: 'Rod of Ruin', type: 'Artifact', color: '', controller: 'o', tapped: false };
    const creatureThreat = makeCreature('cre-1', { id: 'grizzly_bears', color: 'G', controller: 'o' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [cop], oBf: [artifactThreat, creatureThreat] });
    const state = { ...base, p: { ...base.p, mana: manaPool('2') } };

    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'cop-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.pendingDamageShieldChoice.pool.map(c => c.iid)).toEqual(['art-1']);
  });
});

describe('@engine Scenario: greater_realm_of_preservation', () => {
  it('costs {1}{W} to activate (its own cost, distinct from the base CoP cycle) and shields black OR red sources', () => {
    const card = getCardById('greater_realm_of_preservation');
    expect(card.activated.cost).toBe('1W');
    expect(card.damageShieldColors).toEqual(['B', 'R']);
    expect(card.damageShieldMode).toBe('prevent');

    const realm = onBattlefield('greater_realm_of_preservation', 'realm-1');
    const blackThreat = makeCreature('bt-1', { id: 'sengir_vampire', color: 'B', controller: 'o' });
    const redThreat = makeCreature('rt-1', { id: 'shivan_dragon', color: 'R', controller: 'o' });
    const greenThreat = makeCreature('gt-1', { id: 'craw_wurm', color: 'G', controller: 'o' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [realm], oBf: [blackThreat, redThreat, greenThreat] });
    const state = { ...base, p: { ...base.p, mana: manaPool('1W') } };

    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'realm-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    const iids = s2.pendingDamageShieldChoice.pool.map(c => c.iid).sort();
    expect(iids).toEqual(['bt-1', 'rt-1']);
    expect(iids).not.toContain('gt-1');
  });
});
