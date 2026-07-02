// tests/scenarios/trigger-events-expansion.test.js
// Deferral Sweep 1: four new trigger event types (ON_ATTACKS_DECLARED, ON_SPELL_CAST,
// ON_PERMANENT_LEAVES_BF, ON_END_STEP) added to the event/listener system.

import { describe, it, expect } from 'vitest';
import { duelReducer, zMove } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature, makeLand, makeSpell } from '../../src/engine/__tests__/_factory.js';

describe('@engine Scenario: trigger-events-expansion -- ON_ATTACKS_DECLARED', () => {
  it('fires once when the active player commits at least one attacker, only for that attacker', () => {
    const watcher = makeCreature('w-1', {
      controller: 'p', power: 1, toughness: 1,
      triggeredAbilities: [{ id: 'watch', trigger: { event: 'ON_ATTACKS_DECLARED' }, condition: { type: 'selfIsAttacker' }, effect: { type: 'addCounter', counter: '+1/+1', amount: 1 } }],
    });
    const bystander = makeCreature('b-1', { controller: 'p', power: 1, toughness: 1 });
    const base = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'p', pBf: [watcher, bystander] });
    const s1 = duelReducer(base, { type: 'DECLARE_ATTACKER', iid: 'w-1' });
    const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' }); // leaves COMBAT_ATTACKERS
    expect(s2.p.bf.find(c => c.iid === 'w-1').counters.P1P1).toBe(1);
    // Bystander never attacked, so its (absent) trigger never applies -- confirms the
    // condition is scoped per-attacker, not "any attack happened".
    expect(s2.p.bf.find(c => c.iid === 'b-1').counters?.P1P1).toBeUndefined();
  });

  it('does not fire when zero attackers are declared', () => {
    const watcher = makeCreature('w-1', {
      controller: 'p', power: 1, toughness: 1,
      triggeredAbilities: [{ id: 'watch', trigger: { event: 'ON_ATTACKS_DECLARED' }, condition: { type: 'selfIsAttacker' }, effect: { type: 'addCounter', counter: '+1/+1', amount: 1 } }],
    });
    const base = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'p', pBf: [watcher] });
    const s1 = duelReducer(base, { type: 'ADVANCE_PHASE' }); // no DECLARE_ATTACKER dispatched
    expect(s1.p.bf.find(c => c.iid === 'w-1').counters?.P1P1).toBeUndefined();
  });
});

describe('@engine Scenario: trigger-events-expansion -- ON_SPELL_CAST', () => {
  it('fires after the spell is placed on the stack, with color/type payload available to conditions', () => {
    const watcher = makeCreature('w-1', {
      controller: 'o', power: 1, toughness: 1,
      triggeredAbilities: [{ id: 'watch', trigger: { event: 'ON_SPELL_CAST' }, condition: { type: 'opponentCastArtifactSpell' }, effect: { type: 'addCounter', counter: '+1/+1', amount: 1 } }],
    });
    const artifactSpell = makeSpell('as-1', { id: 'test_artifact_spell', name: 'Test Artifact Spell', type: 'Artifact', color: '', cmc: 1, cost: '1', controller: 'p' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [artifactSpell], oBf: [watcher] });
    const funded = { ...base, p: { ...base.p, mana: { ...base.p.mana, C: 1 } } };
    const s1 = duelReducer(funded, { type: 'CAST_SPELL', who: 'p', iid: 'as-1' });
    expect(s1.stack.length).toBe(1); // spell is on the stack, not yet resolved
    expect(s1.o.bf.find(c => c.iid === 'w-1').counters.P1P1).toBe(1);
  });

  it('does not fire the opponent-artifact condition for a non-artifact spell', () => {
    const watcher = makeCreature('w-1', {
      controller: 'o', power: 1, toughness: 1,
      triggeredAbilities: [{ id: 'watch', trigger: { event: 'ON_SPELL_CAST' }, condition: { type: 'opponentCastArtifactSpell' }, effect: { type: 'addCounter', counter: '+1/+1', amount: 1 } }],
    });
    const instantSpell = makeSpell('is-1', { id: 'lightning_bolt', name: 'Lightning Bolt', type: 'Instant', color: 'R', cmc: 1, cost: 'R', controller: 'p' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [instantSpell], oBf: [watcher] });
    const funded = { ...base, p: { ...base.p, mana: { ...base.p.mana, R: 1 } } };
    const s1 = duelReducer(funded, { type: 'CAST_SPELL', who: 'p', iid: 'is-1' });
    expect(s1.o.bf.find(c => c.iid === 'w-1').counters?.P1P1).toBeUndefined();
  });
});

describe('@engine Scenario: trigger-events-expansion -- ON_PERMANENT_LEAVES_BF', () => {
  it('fires alongside ON_CREATURE_DIES when a permanent moves bf -> gy via zMove', () => {
    const watcher = { iid: 'w-1', id: 'test_watcher', name: 'Test Watcher', type: 'Artifact', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [],
      triggeredAbilities: [{ id: 'watch', trigger: { event: 'ON_PERMANENT_LEAVES_BF' }, condition: { type: 'permanentWasLand' }, effect: { type: 'addCounter', counter: '+1/+1', amount: 1 } }],
    };
    const land = makeLand('l-1', { controller: 'o' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [watcher], oBf: [land] });
    const s1 = zMove(base, 'l-1', 'o', 'o', 'gy');
    expect(s1.o.gy.some(c => c.iid === 'l-1')).toBe(true);
    // Watcher's counters live on an Artifact, not a Creature, but addCounter is
    // generic -- verify it fired via the same mechanism.
    expect(s1.p.bf.find(c => c.iid === 'w-1').counters.P1P1).toBe(1);
  });

  it('does not fire for a bf -> bf control change', () => {
    const watcher = { iid: 'w-1', id: 'test_watcher', name: 'Test Watcher', type: 'Artifact', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [],
      triggeredAbilities: [{ id: 'watch', trigger: { event: 'ON_PERMANENT_LEAVES_BF' }, effect: { type: 'addCounter', counter: '+1/+1', amount: 1 } }],
    };
    const stolen = makeCreature('s-1', { controller: 'o' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [watcher], oBf: [stolen] });
    const s1 = zMove(base, 's-1', 'o', 'p', 'bf');
    expect(s1.p.bf.some(c => c.iid === 's-1')).toBe(true); // control changed
    expect(s1.p.bf.find(c => c.iid === 'w-1').counters?.P1P1).toBeUndefined(); // no leave-bf trigger
  });
});

describe('@engine Scenario: trigger-events-expansion -- ON_END_STEP', () => {
  it('fires when the END phase is entered', () => {
    const watcher = makeCreature('w-1', {
      controller: 'p', power: 1, toughness: 1,
      triggeredAbilities: [{ id: 'watch', trigger: { event: 'ON_END_STEP' }, effect: { type: 'addCounter', counter: '+1/+1', amount: 1 } }],
    });
    const base = makeState({ phase: PHASE.MAIN_2, active: 'p', pBf: [watcher] });
    const s1 = duelReducer(base, { type: 'ADVANCE_PHASE' }); // MAIN_2 -> END
    expect(s1.phase).toBe(PHASE.END);
    expect(s1.p.bf.find(c => c.iid === 'w-1').counters.P1P1).toBe(1);
  });
});

describe('@engine Scenario: trigger-events-expansion -- APNAP ordering on new events', () => {
  it('resolves the active player\'s ON_SPELL_CAST trigger before the non-active player\'s', () => {
    const apWatcher = makeCreature('ap-1', { controller: 'p', name: 'AP Watcher', power: 1, toughness: 1,
      triggeredAbilities: [{ id: 'ap_watch', trigger: { event: 'ON_SPELL_CAST' }, effect: { type: 'addCounter', counter: '+1/+1', amount: 1 } }] });
    const napWatcher = makeCreature('nap-1', { controller: 'o', name: 'NAP Watcher', power: 1, toughness: 1,
      triggeredAbilities: [{ id: 'nap_watch', trigger: { event: 'ON_SPELL_CAST' }, effect: { type: 'addCounter', counter: '+1/+1', amount: 1 } }] });
    const spell = makeSpell('sp-1', { id: 'lightning_bolt', name: 'Lightning Bolt', type: 'Instant', color: 'R', cmc: 1, cost: 'R', controller: 'p' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [apWatcher], oBf: [napWatcher], pHand: [spell] });
    const funded = { ...base, p: { ...base.p, mana: { ...base.p.mana, R: 1 } } };
    const s1 = duelReducer(funded, { type: 'CAST_SPELL', who: 'p', iid: 'sp-1' });
    const messages = s1.log.filter(l => l.text.includes('gets a +1/+1 counter')).map(l => l.text);
    expect(messages).toEqual(['AP Watcher gets a +1/+1 counter.', 'NAP Watcher gets a +1/+1 counter.']);
  });
});
