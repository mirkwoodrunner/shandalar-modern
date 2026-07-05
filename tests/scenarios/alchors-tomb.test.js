// tests/scenarios/alchors-tomb.test.js
// Alchor's Tomb: "{2}, {T}: Target permanent you control becomes the color of
// your choice. (This effect lasts indefinitely.)" Implemented via the
// generalized colorChoiceTarget resolveEff case + createPendingChoice.
// Adapted from Card-Forge/forge (a/alchors_tomb.txt), GPL-3.0.
// See THIRD_PARTY_NOTICES.md.

import { describe, it, expect } from 'vitest';
import { duelReducer } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature, makeLand } from '../../src/engine/__tests__/_factory.js';

function makeTomb(iid, overrides = {}) {
  return {
    iid, id: 'alchorss_tomb', name: "Alchor's Tomb", type: 'Artifact', controller: 'p',
    tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [], cmc: 4,
    effect: null, activated: { cost: '2,T', effect: 'colorChoiceTarget' },
    ...overrides,
  };
}

describe('@engine Scenario: Alchor\'s Tomb', () => {

  it('turns a targeted creature you control into the chosen color, indefinitely', () => {
    const tomb = makeTomb('tomb-1');
    const bear = makeCreature('bear-1', { controller: 'p', color: 'G' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [tomb, bear] });
    const state = { ...base, p: { ...base.p, mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 2 } } };

    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'tomb-1', tgt: 'bear-1' });
    expect(s1.p.bf.find(c => c.iid === 'tomb-1').tapped).toBe(true);
    expect(s1.p.mana.C).toBe(0);

    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.pendingChoice.kind).toBe('colorChoice');
    expect(s2.pendingChoice.targetIid).toBe('bear-1');

    const s3 = duelReducer(s2, { type: 'RESOLVE_CHOICE', optionId: 'B' });
    expect(s3.p.bf.find(c => c.iid === 'bear-1').color).toBe('B');
    expect(s3.pendingChoice).toBeNull();
  });

  it('can target a land you control (any permanent, not just creatures)', () => {
    const tomb = makeTomb('tomb-1');
    const forest = makeLand('forest-1', { controller: 'p', color: 'G' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [tomb, forest] });
    const state = { ...base, p: { ...base.p, mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 2 } } };

    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'tomb-1', tgt: 'forest-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    const s3 = duelReducer(s2, { type: 'RESOLVE_CHOICE', optionId: 'R' });
    expect(s3.p.bf.find(c => c.iid === 'forest-1').color).toBe('R');
  });

  it('cannot target a permanent controlled by the opponent', () => {
    const tomb = makeTomb('tomb-1');
    const oppBear = makeCreature('bear-1', { controller: 'o', color: 'G' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [tomb], oBf: [oppBear] });
    const state = { ...base, p: { ...base.p, mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 2 } } };

    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'tomb-1', tgt: 'bear-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.pendingChoice).toBeNull();
    expect(s2.o.bf.find(c => c.iid === 'bear-1').color).toBe('G');
  });

  it('the color change persists across turns (no eotBuffs / expiry)', () => {
    const tomb = makeTomb('tomb-1');
    const bear = makeCreature('bear-1', { controller: 'p', color: 'G' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [tomb, bear] });
    const state = { ...base, p: { ...base.p, mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 2 } } };

    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'tomb-1', tgt: 'bear-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    const s3 = duelReducer(s2, { type: 'RESOLVE_CHOICE', optionId: 'W' });

    let s4 = { ...s3, phase: PHASE.CLEANUP };
    s4 = duelReducer(s4, { type: 'ADVANCE_PHASE' });
    s4 = { ...s4, active: 'o', phase: PHASE.CLEANUP };
    s4 = duelReducer(s4, { type: 'ADVANCE_PHASE' });
    expect(s4.active).toBe('p');
    expect(s4.p.bf.find(c => c.iid === 'bear-1').color).toBe('W');
  });
});
