/**
 * @module-tag engine
 */
// src/engine/__tests__/makeCardInstance.pool.test.js
// L4a seam: makeCardInstance takes an optional `pool` argument defaulting to
// CARD_DB. Two-argument calls must behave exactly as before.

import { describe, it, expect } from 'vitest';
import { makeCardInstance } from '../DuelCore.js';
import { CARD_DB } from '../../data/cards.js';
import { validateCardShape } from '../../data/cardShape.js';
import { makeState } from './_factory.js';

// Small inline fixture pool -- deliberately NOT CARD_DB_PREMODERN, so the test
// proves resolution against an arbitrary caller-supplied array.
const FIXTURE_POOL = [
  {
    id: 'fixture_bear', name: 'Fixture Bear', type: 'Creature', subtype: 'Bear',
    color: 'G', cmc: 2, cost: '1G', power: 2, toughness: 2, text: '', rarity: 'C',
  },
  {
    id: 'fixture_wastes', name: 'Fixture Wastes', type: 'Land', subtype: 'Basic',
    color: '', cmc: 0, cost: '', text: 'T: Add C.', produces: ['C'], rarity: 'C',
  },
];

describe('@engine makeCardInstance pool argument', () => {
  it('defaults to CARD_DB when called with two arguments', () => {
    const inst = makeCardInstance('plains', 'p');
    expect(inst).not.toBeNull();
    expect(inst.id).toBe('plains');
    expect(inst.name).toBe('Plains');
    expect(inst.controller).toBe('p');
  });

  it('two-argument output is identical to passing CARD_DB explicitly', () => {
    const a = makeCardInstance('grizzly_bears', 'p');
    const b = makeCardInstance(a.id, 'p', CARD_DB);
    // iid is a fresh unique id on every call; everything else must match.
    const { iid: _ia, ...restA } = a;
    const { iid: _ib, ...restB } = b;
    expect(restB).toEqual(restA);
    expect(_ia).not.toBe(_ib);
  });

  it('resolves against a caller-supplied pool instead of CARD_DB', () => {
    expect(CARD_DB.find(c => c.id === 'fixture_bear')).toBeUndefined();
    const inst = makeCardInstance('fixture_bear', 'p', FIXTURE_POOL);
    expect(inst).not.toBeNull();
    expect(inst.name).toBe('Fixture Bear');
    expect(inst.power).toBe(2);
    expect(inst.controller).toBe('p');
    // Instance-shape defaults are applied the same way as for CARD_DB cards.
    expect(inst.tapped).toBe(false);
    expect(inst.summoningSick).toBe(true);
    expect(inst.damage).toBe(0);
    expect(inst.counters).toEqual({});
  });

  it('a custom pool does not make CARD_DB ids resolvable', () => {
    expect(makeCardInstance('plains', 'p', FIXTURE_POOL)).toBeNull();
  });

  it('keeps the existing not-found behavior (null) for an empty custom pool', () => {
    // Unchanged from the default-pool miss case -- this prompt does not alter
    // what happens on a miss.
    expect(makeCardInstance('plains', 'p', [])).toBeNull();
    expect(makeCardInstance('no_such_card_id', 'p')).toBeNull();
    expect(makeCardInstance('no_such_card_id', 'p', FIXTURE_POOL)).toBeNull();
  });

  it('pool-built instances satisfy the shared card shape and seat in GameState', () => {
    const inst = makeCardInstance('fixture_wastes', 'p', FIXTURE_POOL);
    expect(validateCardShape(inst).valid).toBe(true);
    const s = makeState({ pBf: [inst] });
    expect(s.p.bf).toHaveLength(1);
    expect(s.p.bf[0].name).toBe('Fixture Wastes');
  });
});
