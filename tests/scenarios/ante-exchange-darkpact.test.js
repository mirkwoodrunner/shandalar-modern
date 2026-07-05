// tests/scenarios/ante-exchange-darkpact.test.js
// Generalize Existing Choice Mechanisms (Part 2): Darkpact reuses TutorModal's
// card-array picker (pendingAnteExchange) but resolves by exchanging the
// chosen ante card with the top of the caster's library, not moving it to
// hand. Only the caster's own ante contributions are legal targets --
// "You own target card in the ante" read as a targeting restriction (see
// completion summary for the Forge GainOwnership vs. Oracle-text discrepancy
// this resolves). See THIRD_PARTY_NOTICES.md.

import { describe, it, expect } from 'vitest';
import { duelReducer } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeLand, makeSpell } from '../../src/engine/__tests__/_factory.js';

describe('@engine Scenario: Darkpact ante-exchange (Part 2)', () => {

  it('pendingAnteExchange only lists the caster\'s own ante cards (anteP + anteExtraP), never the opponent\'s', () => {
    const darkpact = makeSpell('dp-1', { id: 'darkpact', name: 'Darkpact', color: 'B', cost: 'BBB', cmc: 3, anteOnly: true, effect: 'darkpactExchange' });
    const ownAnteStake = makeLand('own-ante', { id: 'forest', name: 'Own Ante Forest' });
    const ownExtraAnte = makeLand('own-extra-ante', { id: 'plains', name: 'Own Extra Ante Plains' });
    const oppAnteStake = makeLand('opp-ante', { id: 'island', name: 'Opp Ante Island' });

    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [darkpact] });
    const state = {
      ...base,
      anteEnabled: true,
      anteP: ownAnteStake,
      anteExtraP: [ownExtraAnte],
      anteO: oppAnteStake,
      anteExtraO: [],
      p: { ...base.p, mana: { W: 0, U: 0, B: 3, R: 0, G: 0, C: 0 }, lib: [makeLand('lib-top', { id: 'mountain', name: 'Library Top' })] },
    };

    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'dp-1', tgt: null, xVal: 1 });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });

    expect(s2.pendingAnteExchange).not.toBeNull();
    expect(s2.pendingAnteExchange.caster).toBe('p');
    const iids = s2.pendingAnteExchange.cards.map(c => c.iid).sort();
    expect(iids).toEqual(['own-ante', 'own-extra-ante']);
    expect(iids).not.toContain('opp-ante');
  });

  it('exchanging the ante scalar slot (anteP) swaps it with the top of the library, appending the old ante card to the library', () => {
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p' });
    const state = {
      ...base,
      anteEnabled: true,
      pendingAnteExchange: {
        caster: 'p',
        cards: [makeLand('own-ante', { id: 'forest', name: 'Own Ante Forest' })],
      },
      anteP: makeLand('own-ante', { id: 'forest', name: 'Own Ante Forest' }),
      anteExtraP: [],
      anteO: makeLand('opp-ante', { id: 'island', name: 'Opp Ante Island' }),
      anteExtraO: [],
      p: { ...base.p, lib: [makeLand('lib-top', { id: 'mountain', name: 'Library Top' }), makeLand('lib-2', { id: 'swamp' })] },
    };

    const s1 = duelReducer(state, { type: 'RESOLVE_ANTE_EXCHANGE', iid: 'own-ante' });

    expect(s1.pendingAnteExchange).toBeNull();
    expect(s1.anteP.iid).toBe('lib-top');
    expect(s1.p.lib.map(c => c.iid)).toEqual(['lib-2', 'own-ante']);
    // Opponent's ante is completely untouched.
    expect(s1.anteO.iid).toBe('opp-ante');
  });

  it('exchanging an anteExtraP card swaps it in place, leaving the scalar anteP slot untouched', () => {
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p' });
    const state = {
      ...base,
      anteEnabled: true,
      pendingAnteExchange: {
        caster: 'p',
        cards: [makeLand('own-extra-ante', { id: 'plains', name: 'Own Extra Ante Plains' })],
      },
      anteP: makeLand('own-ante', { id: 'forest', name: 'Own Ante Forest' }),
      anteExtraP: [makeLand('own-extra-ante', { id: 'plains', name: 'Own Extra Ante Plains' })],
      anteO: null,
      anteExtraO: [],
      p: { ...base.p, lib: [makeLand('lib-top', { id: 'mountain', name: 'Library Top' })] },
    };

    const s1 = duelReducer(state, { type: 'RESOLVE_ANTE_EXCHANGE', iid: 'own-extra-ante' });

    expect(s1.pendingAnteExchange).toBeNull();
    expect(s1.anteP.iid).toBe('own-ante');
    expect(s1.anteExtraP.map(c => c.iid)).toEqual(['lib-top']);
    expect(s1.p.lib.map(c => c.iid)).toEqual(['own-extra-ante']);
  });

  it('DECLINE_ANTE_EXCHANGE clears pendingAnteExchange without touching either ante zone', () => {
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p' });
    const state = {
      ...base,
      pendingAnteExchange: { caster: 'p', cards: [makeLand('own-ante', { id: 'forest' })] },
      anteP: makeLand('own-ante', { id: 'forest' }),
      anteO: makeLand('opp-ante', { id: 'island' }),
    };
    const s1 = duelReducer(state, { type: 'DECLINE_ANTE_EXCHANGE' });
    expect(s1.pendingAnteExchange).toBeNull();
    expect(s1.anteP.iid).toBe('own-ante');
    expect(s1.anteO.iid).toBe('opp-ante');
  });
});
