// tests/scenarios/complex-c2-keywords.test.js
// Complex-tier stub cards implemented from Card-Forge/forge reference scripts
// (GPL-3.0), sub-batch C2: keyword-line cards.
// See THIRD_PARTY_NOTICES.md for attribution.

import { describe, it, expect } from 'vitest';
import { duelReducer } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature } from '../../src/engine/__tests__/_factory.js';

function makeArt(iid, overrides = {}) {
  return { iid, id: 'mox_ruby', name: 'Mox Ruby', type: 'Artifact', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [], cmc: 0, ...overrides };
}

describe('@engine Scenario: Complex-tier Forge batch C2 -- keyword-line cards', () => {

  it('Phyrexian Gremlins: taps and locks target artifact so it stays tapped', () => {
    const gremlins = makeCreature('pg-1', { id: 'phyrexian_gremlins', name: 'Phyrexian Gremlins', controller: 'p', optionalUntap: true, optionalUntapAlways: true, activated: { cost: 'T', effect: 'lockArtifactWhileTapped', requiresTarget: true } });
    const oArt = makeArt('oa-1', { controller: 'o', tapped: false });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [gremlins], oBf: [oArt] });
    const s1 = duelReducer(base, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'pg-1', tgt: 'oa-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.o.bf.find(c => c.iid === 'oa-1').tapped).toBe(true);
    expect(s2.o.bf.find(c => c.iid === 'oa-1').lockedByIid).toBe('pg-1');
  });

  it("Phyrexian Gremlins: locked artifact doesn't untap while Gremlins stays tapped (declines untap)", () => {
    const gremlins = makeCreature('pg-1', { id: 'phyrexian_gremlins', name: 'Phyrexian Gremlins', controller: 'p', tapped: true, optionalUntap: true, optionalUntapAlways: true });
    const oArt = makeArt('oa-1', { controller: 'o', tapped: true, lockedByIid: 'pg-1' });
    const base = makeState({ phase: PHASE.CLEANUP, active: 'p', pBf: [gremlins], oBf: [oArt] });
    // p's cleanup -> o's untap step (o's artifact would normally untap here).
    let s = duelReducer(base, { type: 'ADVANCE_PHASE' });
    expect(s.active).toBe('o');
    expect(s.o.bf.find(c => c.iid === 'oa-1').tapped).toBe(true);
    // Gremlins itself, on p's side, stays tapped pending the optionalUntap choice
    // (queued for the next time it's p's untap step) -- confirm it didn't silently untap.
    expect(s.p.bf.find(c => c.iid === 'pg-1').tapped).toBe(true);
  });

  it('Wall of Wonder: +4/-4 pump and can attack despite defender until end of turn', () => {
    const wall = makeCreature('ww-1', { id: 'wall_of_wonder', name: 'Wall of Wonder', controller: 'p', power: 1, toughness: 5, keywords: ['DEFENDER'], activated: { cost: '2UU', effect: 'wallOfWonderPump' } });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [wall] });
    const state = { ...base, p: { ...base.p, mana: { W: 0, U: 2, B: 0, R: 0, G: 0, C: 2 } } };
    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'ww-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    const wallAfter = s2.p.bf.find(c => c.iid === 'ww-1');
    expect(wallAfter.eotBuffs).toEqual([{ power: 4, toughness: -4 }]);
    expect(wallAfter.canAttackDespiteDefender).toBe(true);
const s2b = duelReducer(s2, { type: 'ADVANCE_PHASE' }); // MAIN_1 -> COMBAT_BEGIN
    const s3 = duelReducer(s2b, { type: 'ADVANCE_PHASE' }); // COMBAT_BEGIN -> COMBAT_ATTACKERS
    const s4 = duelReducer(s3, { type: 'DECLARE_ATTACKER', iid: 'ww-1' });
    expect(s4.attackers).toContain('ww-1');
  });

  it('Wall of Wonder: without the ability, defender still blocks attacking', () => {
    const wall = makeCreature('ww-1', { id: 'wall_of_wonder', name: 'Wall of Wonder', controller: 'p', power: 1, toughness: 5, keywords: ['DEFENDER'] });
    const base = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'p', pBf: [wall] });
    const s1 = duelReducer(base, { type: 'DECLARE_ATTACKER', iid: 'ww-1' });
    expect(s1.attackers).not.toContain('ww-1');
  });
});
