// src/engine/__tests__/DuelCore.reducer.test.js
// Isolated unit tests for duelReducer action handlers.

import { describe, it, expect } from 'vitest';
import { duelReducer } from '../DuelCore.js';
import { PHASE, PHASE_SEQUENCE } from '../phases.js';
import { makePlayerState, makeState, makeCreature, makeLand } from './_factory.js';

// --- TAP_LAND ----------------------------------------------------------------

describe('TAP_LAND', () => {
  it('taps an untapped land in bf and adds mana', () => {
    const land = makeLand('land-1');
    const state = makeState({ pBf: [land] });

    const result = duelReducer(state, { type: 'TAP_LAND', who: 'p', iid: 'land-1', mana: 'G' });

    const tappedLand = result.p.bf.find(c => c.iid === 'land-1');
    expect(tappedLand.tapped).toBe(true);
    expect(result.p.mana.G).toBe(1);
  });

  it('returns state unchanged when land is already tapped', () => {
    const land = makeLand('land-1', { tapped: true });
    const state = makeState({ pBf: [land] });

    const result = duelReducer(state, { type: 'TAP_LAND', who: 'p', iid: 'land-1', mana: 'G' });

    expect(result).toBe(state);
    expect(result.p.mana.G).toBe(0);
  });

  it('returns state unchanged when iid is not in bf', () => {
    const state = makeState();

    const result = duelReducer(state, { type: 'TAP_LAND', who: 'p', iid: 'land-missing', mana: 'G' });

    expect(result).toBe(state);
  });
});

// --- PLAY_LAND ---------------------------------------------------------------

describe('PLAY_LAND', () => {
  it('moves land from hand to bf and increments landsPlayed', () => {
    const land = makeLand('land-h1', { controller: 'p' });
    const state = makeState({ pHand: [land], phase: PHASE.MAIN_1, active: 'p' });

    const result = duelReducer(state, { type: 'PLAY_LAND', who: 'p', iid: 'land-h1' });

    expect(result.p.bf.some(c => c.iid === 'land-h1')).toBe(true);
    expect(result.p.hand.some(c => c.iid === 'land-h1')).toBe(false);
    expect(result.landsPlayed).toBe(1);
  });

  it('returns state unchanged when landsPlayed >= 1', () => {
    const land = makeLand('land-h1', { controller: 'p' });
    const state = makeState({ pHand: [land], phase: PHASE.MAIN_1, active: 'p', landsPlayed: 1 });

    const result = duelReducer(state, { type: 'PLAY_LAND', who: 'p', iid: 'land-h1' });

    expect(result).toBe(state);
  });

  it('returns state unchanged during a non-main phase', () => {
    const land = makeLand('land-h1', { controller: 'p' });
    const state = makeState({ pHand: [land], phase: PHASE.COMBAT_ATTACKERS, active: 'p' });

    const result = duelReducer(state, { type: 'PLAY_LAND', who: 'p', iid: 'land-h1' });

    expect(result).toBe(state);
  });

  it('returns state unchanged when it is not the active player\'s turn', () => {
    const land = makeLand('land-h1', { controller: 'p' });
    const state = makeState({ pHand: [land], phase: PHASE.MAIN_1, active: 'o' });

    const result = duelReducer(state, { type: 'PLAY_LAND', who: 'p', iid: 'land-h1' });

    expect(result).toBe(state);
  });
});

// --- ADVANCE_PHASE -----------------------------------------------------------

describe('ADVANCE_PHASE', () => {
  it('advances from MAIN_1 to the next phase in sequence', () => {
    const state = makeState({ phase: PHASE.MAIN_1 });
    const expectedNext = PHASE_SEQUENCE[PHASE_SEQUENCE.indexOf(PHASE.MAIN_1) + 1];

    const result = duelReducer(state, { type: 'ADVANCE_PHASE' });

    expect(result.phase).toBe(expectedNext);
  });

  it('leaves state.over as null after advancing from a fresh state', () => {
    const state = makeState({ phase: PHASE.MAIN_1 });

    const result = duelReducer(state, { type: 'ADVANCE_PHASE' });

    expect(result.over).toBeNull();
  });
});

// --- state.over guard --------------------------------------------------------

describe('state.over guard', () => {
  it('returns state unchanged for any action when over is already set', () => {
    const overState = makeState({ over: { winner: 'p', reason: 'test' } });

    const actions = [
      { type: 'TAP_LAND', who: 'p', iid: 'any', mana: 'G' },
      { type: 'PLAY_LAND', who: 'p', iid: 'any' },
      { type: 'ADVANCE_PHASE' },
      { type: 'DECLARE_ATTACKER', iid: 'any' },
    ];

    for (const action of actions) {
      const result = duelReducer(overState, action);
      expect(result).toBe(overState);
    }
  });
});

// --- Channel -----------------------------------------------------------------

describe('Channel', () => {
  it('sets channelActive when channel sorcery resolves off the stack', () => {
    const channelCard = {
      iid: 'chan-1', id: 'channel', name: 'Channel', type: 'Sorcery',
      color: 'G', cmc: 2, cost: 'GG', effect: 'channel',
      keywords: [], tapped: false, summoningSick: false,
      attacking: false, blocking: null, damage: 0,
      counters: {}, eotBuffs: [], enchantments: [], controller: 'p',
    };
    const base = makeState({ pHand: [channelCard], phase: PHASE.MAIN_1, active: 'p' });
    const withMana = { ...base, p: { ...base.p, mana: { ...base.p.mana, G: 2 } } };

    // All spells now use the stack; effect applies on RESOLVE_STACK
    const afterCast = duelReducer(withMana, { type: 'CAST_SPELL', who: 'p', iid: 'chan-1' });
    expect(afterCast.stack.length).toBe(1);

    const result = duelReducer(afterCast, { type: 'RESOLVE_STACK' });
    expect(result.p.channelActive).toBe(true);
  });

  it('USE_CHANNEL decrements life by 1 and adds 1 C mana', () => {
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p' });
    const withChannel = { ...base, p: { ...base.p, channelActive: true, life: 10 } };

    const result = duelReducer(withChannel, { type: 'USE_CHANNEL', who: 'p' });

    expect(result.p.life).toBe(9);
    expect(result.p.mana.C).toBe(1);
  });

  it('USE_CHANNEL does not fire when life is 1', () => {
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p' });
    const withChannel = { ...base, p: { ...base.p, channelActive: true, life: 1 } };

    const result = duelReducer(withChannel, { type: 'USE_CHANNEL', who: 'p' });

    expect(result.p.life).toBe(1);
    expect(result.p.mana.C).toBe(0);
  });

  it('channelActive is cleared when phase advances to CLEANUP', () => {
    const base = makeState({ phase: PHASE.END, active: 'p' });
    const withChannel = { ...base, p: { ...base.p, channelActive: true } };

    const result = duelReducer(withChannel, { type: 'ADVANCE_PHASE' });

    expect(result.phase).toBe(PHASE.CLEANUP);
    expect(result.p.channelActive).toBe(false);
  });
});
