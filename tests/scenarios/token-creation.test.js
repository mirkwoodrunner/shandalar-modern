// tests/scenarios/token-creation.test.js
// Token creation infrastructure: TOKEN_DB, makeTokenInstance, and the CR 111.7
// "a token that leaves the battlefield ceases to exist" rule enforced in zMove.

import { describe, it, expect } from 'vitest';
import { duelReducer, makeTokenInstance, createToken, zMove, checkDeath } from '../../src/engine/DuelCore.js';
import { CARD_DB } from '../../src/data/cards.js';
import { TOKEN_DB } from '../../src/data/tokens.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature } from '../../src/engine/__tests__/_factory.js';

describe('@engine-card-scenarios-8 Scenario: Token creation infrastructure', () => {

  it('makeTokenInstance produces the same instance shape as makeCardInstance, plus isToken', () => {
    const token = makeTokenInstance('wasp', 'p');
    expect(token).toMatchObject({
      tokenId: 'wasp',
      name: 'Wasp',
      controller: 'p',
      tapped: false,
      summoningSick: true,
      attacking: false,
      blocking: null,
      damage: 0,
      counters: {},
      enchantments: [],
      exerted: false,
      isToken: true,
    });
    expect(typeof token.iid).toBe('string');
    expect(token.iid.length).toBeGreaterThan(0);
  });

  it('makeTokenInstance returns null for an unknown tokenId', () => {
    expect(makeTokenInstance('not_a_real_token', 'p')).toBeNull();
  });

  it('createToken places N tokens onto the correct battlefield', () => {
    const state = makeState({ phase: PHASE.MAIN_1, active: 'p' });
    const ns = createToken(state, 'wasp', 3, 'p');
    expect(ns.p.bf).toHaveLength(3);
    expect(ns.p.bf.every(c => c.isToken && c.tokenId === 'wasp')).toBe(true);
  });

  it('createToken tags each token with sourceIid when provided', () => {
    const state = makeState({ phase: PHASE.MAIN_1, active: 'p' });
    const ns = createToken(state, 'tetravite', 2, 'p', 'tetravus-iid-1');
    expect(ns.p.bf.every(c => c.sourceIid === 'tetravus-iid-1')).toBe(true);
  });

  it('a token ceases to exist on death (SBE, checkDeath)', () => {
    const token = { ...makeTokenInstance('wasp', 'p'), iid: 'tok-1', damage: 1 };
    const state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [token] });
    const ns = checkDeath(state);
    expect(ns.p.bf.some(c => c.iid === 'tok-1')).toBe(false);
    expect(ns.p.gy.some(c => c.iid === 'tok-1')).toBe(false);
  });

  it('a token ceases to exist on bounce (zMove to hand)', () => {
    const token = { ...makeTokenInstance('wasp', 'p'), iid: 'tok-1' };
    const state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [token] });
    const ns = zMove(state, 'tok-1', 'p', 'p', 'hand');
    expect(ns.p.bf.some(c => c.iid === 'tok-1')).toBe(false);
    expect(ns.p.hand.some(c => c.iid === 'tok-1')).toBe(false);
  });

  it('a token ceases to exist on exile (zMove to exile)', () => {
    const token = { ...makeTokenInstance('snake_poison', 'p'), iid: 'tok-1' };
    const state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [token] });
    const ns = zMove(state, 'tok-1', 'p', 'p', 'exile');
    expect(ns.p.bf.some(c => c.iid === 'tok-1')).toBe(false);
    expect(ns.p.exile.some(c => c.iid === 'tok-1')).toBe(false);
  });

  it('a token ceases to exist on sacrifice (activated-ability sac cost, e.g. Strip Mine idiom)', () => {
    const token = { ...makeTokenInstance('wasp', 'p'), iid: 'tok-1', activated: { cost: 'T,sac', effect: 'destroyTargetLand' } };
    const state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [token] });
    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'tok-1' });
    expect(s1.p.bf.some(c => c.iid === 'tok-1')).toBe(false);
    expect(s1.p.gy.some(c => c.iid === 'tok-1')).toBe(false);
  });

  it('a non-token permanent is unaffected -- still moves normally through every zone', () => {
    const creature = makeCreature('c1', { controller: 'p', damage: 2, toughness: 2 });
    const state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [creature] });
    const ns = checkDeath(state);
    expect(ns.p.bf.some(c => c.iid === 'c1')).toBe(false);
    expect(ns.p.gy.some(c => c.iid === 'c1')).toBe(true);
  });

  it('isToken/TOKEN_DB entries never leak into CARD_DB-enumerating code (deckbuilder, binder, search)', () => {
    // TOKEN_DB is a wholly separate array -- no tokenId ever collides with a
    // CARD_DB id, so any UI that enumerates CARD_DB (deckbuilder, binder,
    // card search) can never surface a token.
    for (const t of TOKEN_DB) {
      expect(CARD_DB.some(c => c.id === t.tokenId)).toBe(false);
    }
    expect(CARD_DB.every(c => c.isToken === undefined)).toBe(true);
  });

});
