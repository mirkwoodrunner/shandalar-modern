// tests/scenarios/vesuvan-doppelganger.test.js
// Vesuvan Doppelganger: optional ETB copy of any creature (colorOverride keeps
// it blue instead of the copied creature's color), plus a recurring upkeep
// trigger that re-targets and re-copies. Part 3 of the copy-mechanism
// generalization: the first triggered ability in this codebase to prompt for
// a fresh battlefield target at trigger-resolution time (ability.requiresTarget
// / s.pendingTriggerTarget / RESOLVE_TRIGGER_TARGET in DuelCore.js), rather
// than a fixed pendingChoice option list.

import { describe, it, expect } from 'vitest';
import { duelReducer, checkDeath } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature, makeLand } from '../../src/engine/__tests__/_factory.js';

function withLib(state, who, count) {
  return { ...state, [who]: { ...state[who], lib: Array.from({ length: count }, (_, i) => makeLand(`${who}-lib-${i}`)) } };
}

function makeVesuvan(iid = 'ves-1', overrides = {}) {
  return {
    iid, id: 'vesuvan_doppelganger', name: 'Vesuvan Doppelganger', type: 'Creature',
    subtype: 'Shapeshifter', color: 'U', cmc: 5, cost: '3UU', power: 0, toughness: 0,
    effect: 'vesuvanEtbCopy', keywords: [], tapped: false, summoningSick: false,
    attacking: false, blocking: null, damage: 0, counters: {}, eotBuffs: [],
    enchantments: [], controller: 'p',
    ...overrides,
  };
}

function stateWithVesuvanOnStack(oBf, targetIid, iid = 'ves-1') {
  const base = makeState({ phase: PHASE.MAIN_1, active: 'p', oBf });
  return {
    ...base,
    stack: [{ id: 'si-1', card: makeVesuvan(iid), caster: 'p', targets: targetIid ? [targetIid] : [], xVal: 1 }],
  };
}

describe('@engine-layers-copy-2 Scenario: Vesuvan Doppelganger', () => {

  it('declining the ETB copy leaves a 0/0 Shapeshifter that dies to state-based actions', () => {
    const state = stateWithVesuvanOnStack([], null);
    const s1 = duelReducer(state, { type: 'RESOLVE_STACK' });
    const onBf = s1.p.bf.find(c => c.iid === 'ves-1');
    expect(onBf).toBeDefined();
    expect(onBf.power).toBe(0);
    expect(onBf.toughness).toBe(0);
    expect(onBf.triggeredAbilities ?? []).toHaveLength(0);

    const s2 = checkDeath(s1);
    expect(s2.p.bf.find(c => c.iid === 'ves-1')).toBeUndefined();
    expect(s2.p.gy.some(c => c.iid === 'ves-1')).toBe(true);
  });

  it('accepting the ETB copy takes the target creature\'s characteristics but keeps its own (blue) color', () => {
    const bears = makeCreature('bear-1', {
      id: 'grizzly_bears', name: 'Grizzly Bears', type: 'Creature', subtype: 'Bear',
      color: 'G', power: 2, toughness: 2, controller: 'o',
    });
    const state = stateWithVesuvanOnStack([bears], 'bear-1');
    const s1 = duelReducer(state, { type: 'RESOLVE_STACK' });
    const copy = s1.p.bf.find(c => c.iid === 'ves-1');
    expect(copy.name).toBe('Grizzly Bears');
    expect(copy.power).toBe(2);
    expect(copy.toughness).toBe(2);
    expect(copy.color).toBe('U');
    // The recurring re-copy ability is granted alongside the copy.
    expect(copy.triggeredAbilities).toHaveLength(1);
    expect(copy.triggeredAbilities[0].effect.type).toBe('vesuvanRecopy');
  });

  it('upkeep trigger suspends into pendingTriggerTarget rather than resolving immediately', () => {
    const bears = makeCreature('bear-1', {
      id: 'grizzly_bears', name: 'Grizzly Bears', type: 'Creature',
      color: 'G', power: 2, toughness: 2, controller: 'o',
    });
    const etb = duelReducer(stateWithVesuvanOnStack([bears], 'bear-1'), { type: 'RESOLVE_STACK' });
    const upkeepState = { ...etb, phase: PHASE.UNTAP };
    const s1 = duelReducer(upkeepState, { type: 'ADVANCE_PHASE' }); // UNTAP -> UPKEEP
    expect(s1.phase).toBe(PHASE.UPKEEP);
    expect(s1.pendingTriggerTarget).toBeDefined();
    expect(s1.pendingTriggerTarget.sourceCardId).toBe('ves-1');
    expect(s1.pendingTriggerTarget.controller).toBe('p');
  });

  it('upkeep re-copy targets a new creature, replaces characteristics, and preserves iid/counters/tapped/damage', () => {
    const bears = makeCreature('bear-1', {
      id: 'grizzly_bears', name: 'Grizzly Bears', type: 'Creature',
      color: 'G', power: 2, toughness: 2, controller: 'o',
    });
    const etb = duelReducer(stateWithVesuvanOnStack([bears], 'bear-1'), { type: 'RESOLVE_STACK' });

    const juggernaut = makeCreature('jug-1', {
      id: 'juggernaut', name: 'Juggernaut', type: 'Artifact Creature', subtype: 'Juggernaut',
      color: '', power: 5, toughness: 3, controller: 'o',
    });
    let s = { ...etb, phase: PHASE.UNTAP, o: { ...etb.o, bf: [...etb.o.bf, juggernaut] } };
    s = withLib(s, 'p', 10);
    s = withLib(s, 'o', 10);
    // Give the copied Vesuvan some live battlefield state that must survive the re-copy.
    s = { ...s, p: { ...s.p, bf: s.p.bf.map(c => c.iid === 'ves-1' ? { ...c, damage: 1, counters: { P1P1: 2 }, tapped: true } : c) } };

    s = duelReducer(s, { type: 'ADVANCE_PHASE' }); // UNTAP -> UPKEEP, suspends on pendingTriggerTarget
    expect(s.pendingTriggerTarget).toBeDefined();

    s = duelReducer(s, { type: 'RESOLVE_TRIGGER_TARGET', iid: 'jug-1' });
    expect(s.pendingTriggerTarget).toBeNull();

    const recopy = s.p.bf.find(c => c.iid === 'ves-1');
    expect(recopy.name).toBe('Juggernaut');
    expect(recopy.power).toBe(5);
    expect(recopy.toughness).toBe(3);
    expect(recopy.color).toBe('U'); // colorOverride still applies on re-copy
    // Battlefield state preserved across the re-copy merge.
    expect(recopy.iid).toBe('ves-1');
    expect(recopy.damage).toBe(1);
    expect(recopy.counters).toEqual({ P1P1: 2 });
    expect(recopy.tapped).toBe(true);
    // The recurring ability persists onto the newly-copied form.
    expect(recopy.triggeredAbilities).toHaveLength(1);
    expect(recopy.triggeredAbilities[0].effect.type).toBe('vesuvanRecopy');
  });

  it('the recopy ability survives being re-copied a second time in the same game', () => {
    const bears = makeCreature('bear-1', {
      id: 'grizzly_bears', name: 'Grizzly Bears', type: 'Creature',
      color: 'G', power: 2, toughness: 2, controller: 'o',
    });
    let s = duelReducer(stateWithVesuvanOnStack([bears], 'bear-1'), { type: 'RESOLVE_STACK' });

    const juggernaut = makeCreature('jug-1', {
      id: 'juggernaut', name: 'Juggernaut', type: 'Artifact Creature', color: '',
      power: 5, toughness: 3, controller: 'o',
    });
    const hillGiant = makeCreature('hg-1', {
      id: 'hill_giant', name: 'Hill Giant', type: 'Creature', color: 'R',
      power: 3, toughness: 3, controller: 'o',
    });
    s = { ...s, o: { ...s.o, bf: [...s.o.bf, juggernaut, hillGiant] } };
    s = withLib(s, 'p', 15);
    s = withLib(s, 'o', 15);

    // First upkeep re-copy -> Juggernaut.
    s = { ...s, phase: PHASE.UNTAP };
    s = duelReducer(s, { type: 'ADVANCE_PHASE' });
    expect(s.pendingTriggerTarget).toBeDefined();
    s = duelReducer(s, { type: 'RESOLVE_TRIGGER_TARGET', iid: 'jug-1' });
    let copy = s.p.bf.find(c => c.iid === 'ves-1');
    expect(copy.name).toBe('Juggernaut');
    expect(copy.triggeredAbilities).toHaveLength(1);

    // Second upkeep re-copy (next turn cycle) -> Hill Giant.
    s = advancePastFullTurn(s);
    expect(s.pendingTriggerTarget).toBeDefined();
    expect(s.pendingTriggerTarget.sourceCardId).toBe('ves-1');
    s = duelReducer(s, { type: 'RESOLVE_TRIGGER_TARGET', iid: 'hg-1' });
    copy = s.p.bf.find(c => c.iid === 'ves-1');
    expect(copy.name).toBe('Hill Giant');
    expect(copy.power).toBe(3);
    expect(copy.color).toBe('U');
    expect(copy.triggeredAbilities).toHaveLength(1);
    expect(copy.triggeredAbilities[0].effect.type).toBe('vesuvanRecopy');
  });

  it('declining the upkeep re-copy (no target) leaves the current copy unchanged and drains the queue', () => {
    const bears = makeCreature('bear-1', {
      id: 'grizzly_bears', name: 'Grizzly Bears', type: 'Creature',
      color: 'G', power: 2, toughness: 2, controller: 'o',
    });
    let s = duelReducer(stateWithVesuvanOnStack([bears], 'bear-1'), { type: 'RESOLVE_STACK' });
    s = { ...s, phase: PHASE.UNTAP };
    s = duelReducer(s, { type: 'ADVANCE_PHASE' });
    expect(s.pendingTriggerTarget).toBeDefined();

    s = duelReducer(s, { type: 'RESOLVE_TRIGGER_TARGET', iid: null });
    expect(s.pendingTriggerTarget).toBeNull();
    expect(s.triggerQueue).toHaveLength(0);
    const copy = s.p.bf.find(c => c.iid === 'ves-1');
    expect(copy.name).toBe('Grizzly Bears'); // unchanged
  });
});

// Advances phases until the next UPKEEP where 'p' (Vesuvan's controller) is
// active again -- a full lap flips active to 'o' at the intervening UNTAP, so
// this must skip past o's upkeep too before the ON_UPKEEP_START/'controller'
// scope trigger fires again for p.
function advancePastFullTurn(state) {
  let s = state;
  for (let i = 0; i < 30; i++) {
    s = duelReducer(s, { type: 'ADVANCE_PHASE' });
    if (s.phase === PHASE.UPKEEP && s.active === 'p') return s;
  }
  throw new Error('advancePastFullTurn: never reached p\'s UPKEEP within 30 steps');
}
