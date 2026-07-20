// tests/scenarios/giant-slug.test.js
// Giant Slug: "{5}: At the beginning of your next upkeep, choose a basic
// land type. This creature gains landwalk of the chosen type until the end
// of that turn." Delayed one-shot effect scheduled via pendingUpkeepLandwalk
// (sibling to Hazezon Tamar's pendingUpkeepTokens), resolved via the same
// basicLandTypeChoice request/resolve shape Phantasmal Terrain already uses,
// distinguished by the grantsLandwalkEOT flag. See docs/MECHANICS_INDEX.md.

import { describe, it, expect } from 'vitest';
import { duelReducer, hasKw } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature, makeLand } from '../../src/engine/__tests__/_factory.js';
import KEYWORDS from '../../src/data/keywords.js';

function makeLandLib(count) {
  return Array.from({ length: count }, (_, i) => makeLand(`lib-${i}`));
}

function makeGiantSlug(iid, overrides = {}) {
  return makeCreature(iid, {
    id: 'giant_slug', name: 'Giant Slug', type: 'Creature', subtype: 'Slug',
    color: 'B', cmc: 2, cost: '1B', power: 1, toughness: 1, keywords: [],
    activated: { cost: '5', effect: 'giantSlugScheduleLandwalk' },
    controller: 'p',
    ...overrides,
  });
}

describe('@engine Scenario: giant-slug -- delayed upkeep landwalk choice', () => {

  it('activating {5} schedules a pendingUpkeepLandwalk entry with no immediate effect', () => {
    const slug = makeGiantSlug('slug-1');
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [slug] });
    state = { ...state, p: { ...state.p, mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 5 } } };

    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'slug-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });

    expect(s2.pendingUpkeepLandwalk).toEqual([{ controller: 'p', sourceIid: 'slug-1' }]);
    const slugAfter = s2.p.bf.find(c => c.iid === 'slug-1');
    expect(slugAfter.eotBuffs).toEqual([]);
    expect(hasKw(slugAfter, KEYWORDS.ISLANDWALK.id)).toBe(false);
  });

  it('at the activating player\'s next upkeep, a basicLandTypeChoice is requested', () => {
    const slug = makeGiantSlug('slug-1');
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [slug] });
    state = { ...state, p: { ...state.p, mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 5 } } };

    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'slug-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    const s3 = { ...s2, phase: PHASE.UNTAP };
    const s4 = duelReducer(s3, { type: 'ADVANCE_PHASE' }); // UNTAP -> UPKEEP, drains pendingUpkeepLandwalk

    expect(s4.pendingChoice?.kind).toBe('basicLandTypeChoice');
    expect(s4.pendingChoice?.grantsLandwalkEOT).toBe(true);
    expect(s4.pendingChoice?.targetIid).toBe('slug-1');
    expect(s4.pendingChoice?.controller).toBe('p');
    expect(s4.pendingUpkeepLandwalk).toEqual([]);
  });

  it('resolving the choice grants the correct landwalk keyword via eotBuffs', () => {
    const slug = makeGiantSlug('slug-1');
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [slug] });
    state = { ...state, p: { ...state.p, mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 5 } } };

    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'slug-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    const s3 = { ...s2, phase: PHASE.UNTAP };
    const s4 = duelReducer(s3, { type: 'ADVANCE_PHASE' });
    const s5 = duelReducer(s4, { type: 'RESOLVE_CHOICE', optionId: 'Island' });

    const slugAfter = s5.p.bf.find(c => c.iid === 'slug-1');
    expect(slugAfter.eotBuffs).toContainEqual({ keywords: [KEYWORDS.ISLANDWALK.id] });
    expect(hasKw(slugAfter, KEYWORDS.ISLANDWALK.id)).toBe(true);
    expect(hasKw(slugAfter, KEYWORDS.SWAMPWALK.id)).toBe(false);
  });

  it('the granted landwalk expires at end of turn -- gone by the next turn\'s upkeep', () => {
    const slug = makeGiantSlug('slug-1');
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [slug] });
    state = { ...state, p: { ...state.p, mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 5 }, lib: makeLandLib(10) }, o: { ...state.o, lib: makeLandLib(10) } };

    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'slug-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    const s3 = { ...s2, phase: PHASE.UNTAP };
    const s4 = duelReducer(s3, { type: 'ADVANCE_PHASE' });
    const s5 = duelReducer(s4, { type: 'RESOLVE_CHOICE', optionId: 'Island' });

    const slugMidTurn = s5.p.bf.find(c => c.iid === 'slug-1');
    expect(hasKw(slugMidTurn, KEYWORDS.ISLANDWALK.id)).toBe(true);

    // Advance through the rest of this turn (CLEANUP purges eotBuffs) and
    // into the opponent's turn, back around to the player's next upkeep.
    const s6 = advanceUntil(s5, s => s.phase === PHASE.UPKEEP && s.active === 'p', 60);

    const slugNextUpkeep = s6.p.bf.find(c => c.iid === 'slug-1');
    expect(slugNextUpkeep.eotBuffs).toEqual([]);
    expect(hasKw(slugNextUpkeep, KEYWORDS.ISLANDWALK.id)).toBe(false);
  });

  it('the pending entry does not resolve on the opponent\'s upkeep if activated on your own turn', () => {
    const slug = makeGiantSlug('slug-1');
    let state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [slug] });
    state = { ...state, p: { ...state.p, mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 5 }, lib: makeLandLib(10) }, o: { ...state.o, lib: makeLandLib(10) } };

    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'slug-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.pendingUpkeepLandwalk).toEqual([{ controller: 'p', sourceIid: 'slug-1' }]);

    // Advance to the OPPONENT's upkeep first -- entry must still be pending,
    // no basicLandTypeChoice should have fired for it (mirrors Hazezon
    // Tamar's p.controller === ns.active filter).
    const s3 = advanceUntil(s2, s => s.phase === PHASE.UPKEEP && s.active === 'o', 40);
    expect(s3.pendingUpkeepLandwalk).toEqual([{ controller: 'p', sourceIid: 'slug-1' }]);
    expect(s3.pendingChoice).toBe(null);

    // Now reaching the player's own upkeep does resolve it.
    const s4 = advanceUntil(s3, s => s.phase === PHASE.UPKEEP && s.active === 'p', 40);
    expect(s4.pendingUpkeepLandwalk).toEqual([]);
    expect(s4.pendingChoice?.kind).toBe('basicLandTypeChoice');
  });

});

function advanceUntil(state, predicate, maxSteps = 20) {
  let s = state;
  for (let i = 0; i < maxSteps; i++) {
    s = duelReducer(s, { type: 'ADVANCE_PHASE' });
    if (predicate(s)) return s;
  }
  throw new Error('advanceUntil: predicate never satisfied within maxSteps');
}
