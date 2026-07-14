// src/engine/__tests__/DuelCore.snapshot.test.js
// Snapshot regression tests for duelReducer.
// Run once to create snapshots; subsequent runs catch unintended engine changes.

import { describe, it, expect } from 'vitest';
import { duelReducer } from '../DuelCore.js';
import { PHASE } from '../phases.js';
import { makePlayerState, makeState, makeCreature, makeLand } from './_factory.js';

// --- Snapshot tests ----------------------------------------------------------

describe('@engine-core-mechanics-1 DuelCore snapshot — fixed action sequence', () => {
  it('fixed tap + play land sequence matches snapshot', () => {
    // land-tap: already on battlefield, will be tapped for mana
    // land-play: in hand, will be played onto the battlefield
    const landTap  = makeLand('land-tap',  { controller: 'p' });
    const landPlay = makeLand('land-play', { controller: 'p' });

    let state = makeState({
      pBf:   [landTap],
      pHand: [landPlay],
      phase: PHASE.MAIN_1,
      active: 'p',
    });

    state = duelReducer(state, { type: 'TAP_LAND',  who: 'p', iid: 'land-tap',  mana: 'G' });
    state = duelReducer(state, { type: 'PLAY_LAND', who: 'p', iid: 'land-play' });

    const slice = {
      phase:       state.phase,
      landsPlayed: state.landsPlayed,
      pMana:       state.p.mana,
      pBfCount:    state.p.bf.length,
      pHandCount:  state.p.hand.length,
      over:        state.over,
    };

    expect(slice).toMatchSnapshot();
  });

  it('fresh state structure matches snapshot', () => {
    const s = makeState();

    expect({
      phase:  s.phase,
      active: s.active,
      turn:   s.turn,
      over:   s.over,
      pLife:  s.p.life,
      oLife:  s.o.life,
    }).toMatchSnapshot();
  });
});
