// tests/scenarios/ai-land-destruction.test.js
//
// Regression suite for the AI land-destruction bug (Sinkhole / Stone Rain /
// Ice Storm / Strip Mine / Demonic Hordes).
//
// Root causes fixed:
//   1. selectTarget() had no 'destroyTargetLand' branch -> returned [] ->
//      spell cast with zero targets -> silent no-op in DuelCore.
//   2. ACTIVATE_ABILITY in DuelCore hardcoded s.p -> AI could never activate
//      abilities (Strip Mine, Demonic Hordes).
//   3. No 'sac' cost parsing -> Strip Mine could not sacrifice itself.
//   4. destroyTargetLand fizzle path had no dlog -> silent failure.
//
// Coverage:
//   Group A  - DuelCore: destroyTargetLand resolution (spell path)
//   Group B  - DuelCore: ACTIVATE_ABILITY who-awareness + sac cost (ability path)
//   Group C  - AI: selectTarget returns valid land for spell-cast cards
//   Group D  - AI: planActivatedAbilities plans Strip Mine / Demonic Hordes

import { describe, it, expect } from 'vitest';
import { duelReducer } from '../../src/engine/DuelCore.js';
import { getAIPlan } from '../../src/engine/AI.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeLand, makeCreature, makeSpell } from '../../src/engine/__tests__/_factory.js';

// ---------------------------------------------------------------------------
// Shared card builders (inlined because these shapes differ from factory defaults)
// ---------------------------------------------------------------------------

function makeSinkhole(iid = 'sinkhole-1') {
  return {
    iid,
    id: 'sinkhole', name: 'Sinkhole', type: 'Sorcery', color: 'B',
    cmc: 2, cost: 'BB', effect: 'destroyTargetLand',
    keywords: [], tapped: false, summoningSick: false,
    attacking: false, blocking: null, damage: 0,
    counters: {}, eotBuffs: [], enchantments: [], controller: 'o',
  };
}

function makeStoneRain(iid = 'stone-1') {
  return {
    iid,
    id: 'stone_rain', name: 'Stone Rain', type: 'Sorcery', color: 'R',
    cmc: 3, cost: '2R', effect: 'destroyTargetLand',
    keywords: [], tapped: false, summoningSick: false,
    attacking: false, blocking: null, damage: 0,
    counters: {}, eotBuffs: [], enchantments: [], controller: 'o',
  };
}

function makeIceStorm(iid = 'ice-1') {
  return {
    iid,
    id: 'ice_storm', name: 'Ice Storm', type: 'Sorcery', color: 'G',
    cmc: 3, cost: '2G', effect: 'destroyTargetLand',
    keywords: [], tapped: false, summoningSick: false,
    attacking: false, blocking: null, damage: 0,
    counters: {}, eotBuffs: [], enchantments: [], controller: 'o',
  };
}

function makeStripMine(iid = 'strip-1', overrides = {}) {
  return {
    iid,
    id: 'strip_mine', name: 'Strip Mine', type: 'Land', subtype: 'Land',
    color: '', cmc: 0, cost: '', produces: ['C'],
    activated: { cost: 'T,sac', effect: 'destroyTargetLand' },
    keywords: [], tapped: false, summoningSick: false,
    attacking: false, blocking: null, damage: 0,
    counters: {}, eotBuffs: [], enchantments: [], controller: 'o',
    ...overrides,
  };
}

function makeDemonicHordes(iid = 'hordes-1', overrides = {}) {
  return {
    iid,
    id: 'demonic_hordes', name: 'Demonic Hordes', type: 'Creature', subtype: 'Demon',
    color: 'B', cmc: 5, cost: '2BBB', power: 5, toughness: 5,
    activated: { cost: 'BBB,T', effect: 'destroyTargetLand' },
    keywords: [], tapped: false, summoningSick: false,
    attacking: false, blocking: null, damage: 0,
    counters: {}, eotBuffs: [], enchantments: [], controller: 'o',
    ...overrides,
  };
}

// Basic land (subtype 'Basic Forest' so selectLandToDestroy treats it as basic)
function makeBasicLand(iid, overrides = {}) {
  return makeLand(iid, { subtype: 'Basic Forest', id: 'forest', name: 'Forest', produces: ['G'], controller: 'p', ...overrides });
}

// Nonbasic land (no 'Basic' prefix -> preferred target)
function makeNonbasicLand(iid, overrides = {}) {
  return makeLand(iid, { subtype: 'Tropical Island', id: 'tropical_island', name: 'Tropical Island', produces: ['G', 'U'], controller: 'p', ...overrides });
}

// Build a base AI state (AI = 'o', MAIN_1) with custom mana for 'o'
function makeAIState({ oHand = [], oBf = [], pBf = [], oMana = {}, extra = {} } = {}) {
  const base = makeState({ phase: PHASE.MAIN_1, active: 'o', oHand, oBf, pBf });
  return {
    ...base,
    o: { ...base.o, mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...oMana } },
    oppArch: { id: 'MORTIS', profileId: 'MORTIS' },  // non-MCTS, deterministic
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Group A: DuelCore destroyTargetLand resolution
// ---------------------------------------------------------------------------

describe('DuelCore -- destroyTargetLand spell resolution', () => {
  it('A1: destroys the target land and logs the kill', () => {
    const land = makeBasicLand('land-1');
    const base = makeState({ pBf: [land] });
    const stackItem = {
      id: 'stack-dtl',
      card: { id: 'sinkhole', name: 'Sinkhole', type: 'Sorcery', effect: 'destroyTargetLand' },
      caster: 'o',
      targets: ['land-1'],
      xVal: 1,
    };
    const s0 = { ...base, stack: [stackItem] };
    const s1 = duelReducer(s0, { type: 'RESOLVE_STACK' });

    expect(s1.p.bf.some(c => c.iid === 'land-1')).toBe(false);
    expect(s1.p.gy.some(c => c.iid === 'land-1')).toBe(true);
    expect(s1.log.some(l => l.text?.includes('Sinkhole destroys'))).toBe(true);
  });

  it('A2: fizzles with a log message when tgt is absent from the battlefield', () => {
    const base = makeState({});
    const stackItem = {
      id: 'stack-dtl-fiz',
      card: { id: 'sinkhole', name: 'Sinkhole', type: 'Sorcery', effect: 'destroyTargetLand' },
      caster: 'o',
      targets: [],
      xVal: 1,
    };
    const s0 = { ...base, stack: [stackItem] };
    const s1 = duelReducer(s0, { type: 'RESOLVE_STACK' });

    expect(s1.log.some(l => l.text?.includes('fizzles -- no valid land target'))).toBe(true);
  });

  it('A3: fizzles when target is a creature, not a land', () => {
    const creature = makeCreature('cre-1', { controller: 'p' });
    const base = makeState({ pBf: [creature] });
    const stackItem = {
      id: 'stack-dtl-cre',
      card: { id: 'stone_rain', name: 'Stone Rain', type: 'Sorcery', effect: 'destroyTargetLand' },
      caster: 'o',
      targets: ['cre-1'],
      xVal: 1,
    };
    const s0 = { ...base, stack: [stackItem] };
    const s1 = duelReducer(s0, { type: 'RESOLVE_STACK' });

    // Creature should survive; fizzle log should appear
    expect(s1.p.bf.some(c => c.iid === 'cre-1')).toBe(true);
    expect(s1.log.some(l => l.text?.includes('fizzles -- no valid land target'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Group B: DuelCore ACTIVATE_ABILITY who-awareness and sac cost
// ---------------------------------------------------------------------------

describe('DuelCore -- ACTIVATE_ABILITY who-awareness and sac cost', () => {
  it('B1: who:"o" tap-only ability -- taps the AI card and pushes to stack', () => {
    // Demonic Hordes: {BBB}{T}: Destroy target land
    const hordes = makeDemonicHordes('hordes-1');
    const land = makeBasicLand('land-1');
    const base = makeState({ oBf: [hordes], pBf: [land], phase: PHASE.MAIN_1, active: 'o' });
    const s0 = { ...base, o: { ...base.o, mana: { W: 0, U: 0, B: 3, R: 0, G: 0, C: 0 } } };

    const s1 = duelReducer(s0, { type: 'ACTIVATE_ABILITY', who: 'o', iid: 'hordes-1', tgt: 'land-1' });

    // Hordes is tapped (T cost paid)
    const hAfter = s1.o.bf.find(c => c.iid === 'hordes-1');
    expect(hAfter).toBeDefined();
    expect(hAfter.tapped).toBe(true);

    // BBB spent from o.mana
    expect(s1.o.mana.B).toBe(0);

    // Hordes is still on o.bf (no sac cost)
    expect(s1.o.bf.some(c => c.iid === 'hordes-1')).toBe(true);
    expect(s1.o.gy.some(c => c.iid === 'hordes-1')).toBe(false);

    // Ability pushed to stack targeting the land
    expect(s1.stack.length).toBe(1);
    expect(s1.stack[0].caster).toBe('o');
    expect(s1.stack[0].targets).toContain('land-1');
    expect(s1.priorityWindow).toBe(true);
  });

  it('B2: who:"o" with sac cost (Strip Mine) -- card sacrificed before stack push, land destroyed on resolve', () => {
    const mine = makeStripMine('strip-1');
    const land = makeBasicLand('land-1');
    const base = makeState({ oBf: [mine], pBf: [land], phase: PHASE.MAIN_1, active: 'o' });

    const s1 = duelReducer(base, { type: 'ACTIVATE_ABILITY', who: 'o', iid: 'strip-1', tgt: 'land-1' });

    // Strip Mine sacrificed: no longer on o.bf, now in o.gy
    expect(s1.o.bf.some(c => c.iid === 'strip-1')).toBe(false);
    expect(s1.o.gy.some(c => c.iid === 'strip-1')).toBe(true);

    // Ability on stack targeting land
    expect(s1.stack.length).toBe(1);
    expect(s1.stack[0].caster).toBe('o');
    expect(s1.stack[0].targets).toContain('land-1');
    expect(s1.log.some(l => l.text?.includes('sacrificed'))).toBe(true);

    // Resolve: land destroyed
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.p.bf.some(c => c.iid === 'land-1')).toBe(false);
    expect(s2.p.gy.some(c => c.iid === 'land-1')).toBe(true);
    expect(s2.log.some(l => l.text?.includes('Strip Mine destroys'))).toBe(true);
  });

  it('B3: regression -- no who field defaults to "p", player-side ability still works', () => {
    // Player controls a creature with a non-mana activated ability targeting a land.
    // Use a simplified destroyTargetLand ability so we can verify routing without needing
    // a real card handler -- the key invariant is caster:"p" on the stack item.
    const creature = {
      iid: 'attacker-1', id: 'test_creature', name: 'Test Creature',
      type: 'Creature', subtype: 'Human', color: 'R', cmc: 2, cost: '1R',
      power: 2, toughness: 2,
      activated: { cost: 'T', effect: 'destroyTargetLand' },
      keywords: [], tapped: false, summoningSick: false,
      attacking: false, blocking: null, damage: 0,
      counters: {}, eotBuffs: [], enchantments: [], controller: 'p',
    };
    const land = makeLand('opp-land-1', { controller: 'o' });
    const base = makeState({ pBf: [creature], oBf: [land], phase: PHASE.MAIN_1, active: 'p' });

    // Dispatch without who -- must default to 'p'
    const s1 = duelReducer(base, { type: 'ACTIVATE_ABILITY', iid: 'attacker-1', tgt: 'opp-land-1' });

    // Creature tapped on p.bf
    const cAfter = s1.p.bf.find(c => c.iid === 'attacker-1');
    expect(cAfter?.tapped).toBe(true);

    // Stack item has caster 'p'
    expect(s1.stack.length).toBe(1);
    expect(s1.stack[0].caster).toBe('p');
    expect(s1.stack[0].targets).toContain('opp-land-1');
  });

  it('B4: ACTIVATE_ABILITY with who:"o" is blocked during DECLARE phases (regression guard)', () => {
    const mine = makeStripMine('strip-1');
    const land = makeBasicLand('land-1');
    const base = makeState({ oBf: [mine], pBf: [land], phase: PHASE.COMBAT_ATTACKERS, active: 'o' });

    const s1 = duelReducer(base, { type: 'ACTIVATE_ABILITY', who: 'o', iid: 'strip-1', tgt: 'land-1' });

    // Should be a no-op (DECLARE_ONLY_PHASES blocks activation)
    expect(s1.stack.length).toBe(0);
    expect(s1.o.bf.some(c => c.iid === 'strip-1')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Group C: AI selectTarget for destroyTargetLand spell-cast cards
// ---------------------------------------------------------------------------

describe('AI -- selectTarget for destroyTargetLand (via getAIPlan)', () => {
  it('C1: Sinkhole -- AI plans a cast with a valid land target when human has lands', () => {
    const sinkhole = makeSinkhole();
    const land = makeBasicLand('land-1');
    const state = makeAIState({
      oHand: [sinkhole],
      pBf: [land],
      oMana: { B: 2 },
    });

    const plan = getAIPlan(state, PHASE.MAIN_1);
    const castAction = plan.actions.find(a => a.type === 'PLAY_CARD' && a.cardId === 'sinkhole-1');

    expect(castAction).toBeDefined();
    expect(castAction.targets).toEqual(['land-1']);
  });

  it('C2: Sinkhole -- AI skips the cast (no PLAY_CARD) when human has no lands', () => {
    const sinkhole = makeSinkhole();
    const state = makeAIState({
      oHand: [sinkhole],
      pBf: [],          // no targets
      oMana: { B: 2 },
    });

    const plan = getAIPlan(state, PHASE.MAIN_1);
    const castAction = plan.actions.find(a => a.type === 'PLAY_CARD' && a.cardId === 'sinkhole-1');

    expect(castAction).toBeUndefined();
  });

  it('C3: Sinkhole -- AI prefers the nonbasic land over a basic land', () => {
    const sinkhole = makeSinkhole();
    const basic = makeBasicLand('basic-1');
    const nonbasic = makeNonbasicLand('nonbasic-1');
    const state = makeAIState({
      oHand: [sinkhole],
      pBf: [basic, nonbasic],
      oMana: { B: 2 },
    });

    const plan = getAIPlan(state, PHASE.MAIN_1);
    const castAction = plan.actions.find(a => a.type === 'PLAY_CARD' && a.cardId === 'sinkhole-1');

    expect(castAction).toBeDefined();
    expect(castAction.targets).toEqual(['nonbasic-1']);
  });

  it('C4: Stone Rain -- same selectTarget branch works for Red land destruction', () => {
    const stoneRain = makeStoneRain();
    const land = makeBasicLand('land-1');
    const state = makeAIState({
      oHand: [stoneRain],
      pBf: [land],
      oMana: { R: 1, C: 2 },
    });

    const plan = getAIPlan(state, PHASE.MAIN_1);
    const castAction = plan.actions.find(a => a.type === 'PLAY_CARD' && a.cardId === 'stone-1');

    expect(castAction).toBeDefined();
    expect(castAction.targets).toEqual(['land-1']);
  });

  it('C5: Ice Storm -- same selectTarget branch works for Green land destruction', () => {
    const iceStorm = makeIceStorm();
    const land = makeBasicLand('land-1');
    const state = makeAIState({
      oHand: [iceStorm],
      pBf: [land],
      oMana: { G: 1, C: 2 },
    });

    const plan = getAIPlan(state, PHASE.MAIN_1);
    const castAction = plan.actions.find(a => a.type === 'PLAY_CARD' && a.cardId === 'ice-1');

    expect(castAction).toBeDefined();
    expect(castAction.targets).toEqual(['land-1']);
  });
});

// ---------------------------------------------------------------------------
// Group D: AI planActivatedAbilities for Strip Mine and Demonic Hordes
// ---------------------------------------------------------------------------

describe('AI -- planActivatedAbilities for destroyTargetLand abilities', () => {
  it('D1: Strip Mine -- AI plans activation when human has a land', () => {
    const mine = makeStripMine('strip-1');
    const land = makeBasicLand('land-1');
    const state = makeAIState({ oBf: [mine], pBf: [land] });

    const plan = getAIPlan(state, PHASE.MAIN_1);
    const activateAction = plan.actions.find(a => a.type === 'ACTIVATE_ABILITY' && a.sourceId === 'strip-1');

    expect(activateAction).toBeDefined();
    expect(activateAction.targets).toEqual(['land-1']);
  });

  it('D2: Strip Mine -- AI does NOT activate when human has no lands (no wasted sacrifice)', () => {
    const mine = makeStripMine('strip-1');
    const state = makeAIState({ oBf: [mine], pBf: [] });

    const plan = getAIPlan(state, PHASE.MAIN_1);
    const activateAction = plan.actions.find(a => a.type === 'ACTIVATE_ABILITY' && a.sourceId === 'strip-1');

    expect(activateAction).toBeUndefined();
  });

  it('D3: Demonic Hordes -- AI plans activation when human has a land', () => {
    const hordes = makeDemonicHordes('hordes-1');
    const land = makeBasicLand('land-1');
    const state = makeAIState({
      oBf: [hordes],
      pBf: [land],
      oMana: { B: 3 },
    });

    const plan = getAIPlan(state, PHASE.MAIN_1);
    const activateAction = plan.actions.find(a => a.type === 'ACTIVATE_ABILITY' && a.sourceId === 'hordes-1');

    expect(activateAction).toBeDefined();
    expect(activateAction.targets).toEqual(['land-1']);
  });

  it('D4: Demonic Hordes -- AI does NOT activate when human has no lands', () => {
    const hordes = makeDemonicHordes('hordes-1');
    const state = makeAIState({ oBf: [hordes], pBf: [], oMana: { B: 3 } });

    const plan = getAIPlan(state, PHASE.MAIN_1);
    const activateAction = plan.actions.find(a => a.type === 'ACTIVATE_ABILITY' && a.sourceId === 'hordes-1');

    expect(activateAction).toBeUndefined();
  });

  it('D5: Strip Mine is classified as land (sac+land), Demonic Hordes as creature (sac-free+creature) -- no cross-fire', () => {
    // Both on board simultaneously; verify each triggers only its own branch
    const mine = makeStripMine('strip-1');
    const hordes = makeDemonicHordes('hordes-1');
    const land1 = makeBasicLand('land-1');
    const land2 = makeBasicLand('land-2', { iid: 'land-2' });
    const state = makeAIState({
      oBf: [mine, hordes],
      pBf: [land1, land2],
      oMana: { B: 3 },
    });

    const plan = getAIPlan(state, PHASE.MAIN_1);
    const mineAct = plan.actions.find(a => a.type === 'ACTIVATE_ABILITY' && a.sourceId === 'strip-1');
    const hordesAct = plan.actions.find(a => a.type === 'ACTIVATE_ABILITY' && a.sourceId === 'hordes-1');

    // Both should plan activations (two different lands to target)
    expect(mineAct).toBeDefined();
    expect(hordesAct).toBeDefined();
  });

  it('D6: Tapped Strip Mine is skipped by planActivatedAbilities', () => {
    const mine = makeStripMine('strip-1', { tapped: true });
    const land = makeBasicLand('land-1');
    const state = makeAIState({ oBf: [mine], pBf: [land] });

    const plan = getAIPlan(state, PHASE.MAIN_1);
    const activateAction = plan.actions.find(a => a.type === 'ACTIVATE_ABILITY' && a.sourceId === 'strip-1');

    expect(activateAction).toBeUndefined();
  });
});
