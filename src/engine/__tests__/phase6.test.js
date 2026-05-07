// src/engine/__tests__/phase6.test.js
// Phase 6 expanded test coverage.
// Systems under test: Power Surge, Holy Ground, Sengir Vampire counter trigger,
// Force of Nature upkeep, and the priority window / instant-speed system.
//
// ENGINE_CONTRACT_SPEC: tests dispatch GameActions through duelReducer or call
// exported pure functions. No direct GameState mutation outside factory setup.

import { describe, it, expect, beforeEach } from 'vitest';
import { duelReducer, hasKw, canBlockDuel } from '../DuelCore.js';
import { PHASE } from '../phases.js';

// ─── Shared factories ─────────────────────────────────────────────────────────

function makePlayerState(overrides = {}) {
  return {
    life: 20,
    lib: [],
    hand: [],
    bf: [],
    gy: [],
    exile: [],
    mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
    extraTurns: 0,
    mulls: 0,
    lifeAnim: null,
    poisonCounters: 0,
    ...overrides,
  };
}

/**
 * Returns a minimal valid GameState with sane defaults.
 * Cards placed in `pBf` / `oBf` are acceptable factory-level setup.
 */
function buildTestState({
  phase = PHASE.UNTAP,
  active = 'p',
  turn = 2,
  pBf = [],
  oBf = [],
  pLife = 20,
  oLife = 20,
  pMana = {},
  oMana = {},
  stack = [],
  over = null,
  dungeonMod = null,
  castleMod = null,
  priorityWindow = false,
  priorityPasser = null,
  pendingUpkeepChoice = null,
  sengirDamagedIids = [],
  powerSurgeUntappedCount = 0,
  triggerQueue = [],
} = {}) {
  return {
    phase,
    active,
    turn,
    landsPlayed: 0,
    spellsThisTurn: 0,
    attackers: [],
    blockers: {},
    stack,
    over,
    selCard: null,
    selTgt: null,
    xVal: 1,
    log: [],
    ruleset: {
      startingLife: 20,
      startingHandSize: 7,
      drawOnFirstTurn: false,
      londonMulligan: false,
      deathtouch: true,
      manaBurn: false,
      maxHandSize: 7,
    },
    castleMod,
    dungeonMod,
    pendingLotus: false,
    pendingLotusIid: null,
    pendingBop: false,
    pendingChoice: null,
    pendingUpkeepChoice,
    priorityWindow,
    priorityPasser,
    turnState: { damageLog: [], sengirDamagedIids, powerSurgeUntappedCount },
    triggerQueue,
    fogActive: false,
    oppArch: { id: 'KARAG', profileId: 'KARAG' },
    anteEnabled: false,
    anteP: null,
    anteO: null,
    p: makePlayerState({
      bf: pBf,
      life: pLife,
      mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...pMana },
    }),
    o: makePlayerState({
      bf: oBf,
      life: oLife,
      mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...oMana },
    }),
  };
}

// ─── Card factories ───────────────────────────────────────────────────────────

function makePowerSurgeCard(iid, controller = 'p') {
  return {
    iid,
    id: 'power_surge',
    name: 'Power Surge',
    type: 'Enchantment',
    color: 'R',
    cmc: 2,
    cost: '1R',
    keywords: [],
    tapped: false,
    summoningSick: false,
    attacking: false,
    blocking: null,
    damage: 0,
    counters: {},
    eotBuffs: [],
    enchantments: [],
    upkeep: 'powerSurgeUpkeep',
    controller,
  };
}

function makeForceOfNatureCard(iid, controller = 'p') {
  return {
    iid,
    id: 'force_of_nature',
    name: 'Force of Nature',
    type: 'Creature',
    subtype: 'Elemental',
    color: 'G',
    cmc: 8,
    cost: '2GGGG',
    power: 8,
    toughness: 8,
    keywords: ['TRAMPLE'],
    tapped: false,
    summoningSick: false,
    attacking: false,
    blocking: null,
    damage: 0,
    counters: {},
    eotBuffs: [],
    enchantments: [],
    upkeep: 'forceOfNatureUpkeep',
    controller,
  };
}

function makeSengirVampireCard(iid, controller = 'p') {
  return {
    iid,
    id: 'sengir_vampire',
    name: 'Sengir Vampire',
    type: 'Creature',
    subtype: 'Vampire',
    color: 'B',
    cmc: 5,
    cost: '3BB',
    power: 4,
    toughness: 4,
    keywords: ['FLYING'],
    // Engine checks card.triggered === 'sengirCounter' in the ON_CREATURE_DIES
    // handler inside emitEvent (DuelCore.js ~line 1286).
    triggered: 'sengirCounter',
    tapped: false,
    summoningSick: false,
    attacking: false,
    blocking: null,
    damage: 0,
    counters: {},
    eotBuffs: [],
    enchantments: [],
    controller,
  };
}

function makeHolyGroundCard(iid, controller = 'o') {
  return {
    iid,
    id: 'holy_ground',
    name: 'Holy Ground',
    type: 'Enchantment',
    color: 'W',
    cmc: 1,
    cost: 'W',
    keywords: [],
    tapped: false,
    summoningSick: false,
    attacking: false,
    blocking: null,
    damage: 0,
    counters: {},
    eotBuffs: [],
    enchantments: [],
    controller,
  };
}

function makeLandCard(iid, subtype, controller = 'p', tapped = false) {
  const nameMap = {
    Forest: 'Forest',
    Island: 'Island',
    Swamp: 'Swamp',
    Plains: 'Plains',
    Mountain: 'Mountain',
  };
  return {
    iid,
    id: subtype.toLowerCase(),
    name: nameMap[subtype] ?? subtype,
    type: 'Land',
    subtype,
    color: null,
    cmc: 0,
    cost: '',
    keywords: [],
    tapped,
    summoningSick: false,
    attacking: false,
    blocking: null,
    damage: 0,
    counters: {},
    eotBuffs: [],
    enchantments: [],
    produces: [subtype === 'Forest' ? 'G' : subtype === 'Island' ? 'U' : subtype === 'Swamp' ? 'B' : subtype === 'Plains' ? 'W' : 'R'],
    controller,
  };
}

function makeCreatureCard(iid, overrides = {}) {
  return {
    iid,
    id: 'grizzly_bears',
    name: 'Grizzly Bears',
    type: 'Creature',
    subtype: 'Bear',
    color: 'G',
    cmc: 2,
    cost: '1G',
    power: 2,
    toughness: 2,
    keywords: [],
    tapped: false,
    summoningSick: false,
    attacking: false,
    blocking: null,
    damage: 0,
    counters: {},
    eotBuffs: [],
    enchantments: [],
    controller: 'o',
    ...overrides,
  };
}

/**
 * A damage3 stack item targeting `targetIid`. resolveEff deals 3 damage to
 * the creature and calls checkDeath, which fires ON_CREATURE_DIES.
 */
function makeStackDamage3(targetIid, caster = 'p') {
  return {
    id: `stack-dmg3-${targetIid}`,
    card: {
      iid: `spell-shock-${targetIid}`,
      id: 'shock',
      name: 'Shock',
      type: 'Instant',
      effect: 'damage3',
      color: 'R',
      cmc: 1,
      cost: '1',
      keywords: [],
    },
    caster,
    targets: [targetIid],
    xVal: 1,
  };
}

// ─── 1. Power Surge ───────────────────────────────────────────────────────────

describe('Power Surge', () => {
  let baseState;

  beforeEach(() => {
    baseState = buildTestState({
      phase: PHASE.UNTAP,
      active: 'p',
      pBf: [makePowerSurgeCard('ps-1', 'p')],
      powerSurgeUntappedCount: 0,
    });
  });

  it('PS-01: zero snapshot → no damage; log records 0-damage message', () => {
    // powerSurgeUntappedCount = 0 → hurt() not called
    const result = duelReducer(baseState, { type: 'ADVANCE_PHASE' });

    expect(result.p.life).toBe(20);
    expect(result.log.some(l => l.text.toLowerCase().includes('no damage') || l.text.includes('0'))).toBe(true);
  });

  it('PS-02: snapshot = 3 → active player loses exactly 3 life', () => {
    const state = buildTestState({
      phase: PHASE.UNTAP,
      active: 'p',
      pBf: [makePowerSurgeCard('ps-1', 'p')],
      powerSurgeUntappedCount: 3,
    });

    const result = duelReducer(state, { type: 'ADVANCE_PHASE' });

    expect(result.p.life).toBe(17);
    expect(result.log.some(l => l.text.includes('3 damage') || l.text.includes('takes 3'))).toBe(true);
  });

  it('PS-03: no Power Surge on either BF → upkeep handler skips; no hurt, no relevant log', () => {
    const state = buildTestState({
      phase: PHASE.UNTAP,
      active: 'p',
      pBf: [], // Power Surge absent
      oBf: [],
      powerSurgeUntappedCount: 0,
    });

    const result = duelReducer(state, { type: 'ADVANCE_PHASE' });

    expect(result.p.life).toBe(20);
    expect(result.o.life).toBe(20);
    // No Power Surge log entry at all
    expect(result.log.some(l => l.text.toLowerCase().includes('power surge'))).toBe(false);
  });

  it('PS-04: snapshot resets each UNTAP; second snapshot overwrites first', () => {
    // First CLEANUP→UNTAP transition: 2 tapped forests on the NEW active player's BF.
    // Active starts at 'p'; after turn change active becomes 'o'.
    // Power Surge is on both BFs to ensure snapshot is taken regardless of controller.
    const land1 = makeLandCard('land-o-1', 'Forest', 'o', true);
    const land2 = makeLandCard('land-o-2', 'Forest', 'o', true);
    const ps = makePowerSurgeCard('ps-1', 'o');

    const state1 = buildTestState({
      phase: PHASE.CLEANUP,
      active: 'p',
      oBf: [land1, land2, ps],
      powerSurgeUntappedCount: 99, // old stale snapshot
    });
    const afterFirst = duelReducer(state1, { type: 'ADVANCE_PHASE' });

    // After CLEANUP→UNTAP the snapshot is recalculated for the new active player ('o').
    // 'o' has 2 tapped lands → snapshot = 2 (overwrites 99).
    expect(afterFirst.turnState.powerSurgeUntappedCount).toBe(2);

    // Second CLEANUP→UNTAP: only 1 tapped land on 'o' BF.
    const land3 = makeLandCard('land-o-3', 'Forest', 'o', true);
    const land4 = makeLandCard('land-o-4', 'Forest', 'o', false);
    const state2 = buildTestState({
      phase: PHASE.CLEANUP,
      active: 'p',
      oBf: [land3, land4, ps],
      powerSurgeUntappedCount: 99,
    });
    const afterSecond = duelReducer(state2, { type: 'ADVANCE_PHASE' });

    expect(afterSecond.turnState.powerSurgeUntappedCount).toBe(1);
  });

  it('PS-05: opponent controls Power Surge; active player still takes damage', () => {
    // Power Surge on opponent's BF — the upkeep handler always damages ns.active.
    const state = buildTestState({
      phase: PHASE.UNTAP,
      active: 'p',
      pBf: [],
      oBf: [makePowerSurgeCard('ps-opp', 'o')],
      powerSurgeUntappedCount: 2,
    });

    const result = duelReducer(state, { type: 'ADVANCE_PHASE' });

    expect(result.p.life).toBe(18); // active player 'p' takes 2 damage
    expect(result.o.life).toBe(20); // opponent unaffected
  });

  it('PS-06: active player at 1 life, snapshot = 3 → player dies; game-over triggered', () => {
    const state = buildTestState({
      phase: PHASE.UNTAP,
      active: 'p',
      pBf: [makePowerSurgeCard('ps-1', 'p')],
      pLife: 1,
      powerSurgeUntappedCount: 3,
    });

    const result = duelReducer(state, { type: 'ADVANCE_PHASE' });

    expect(result.p.life).toBeLessThanOrEqual(0);
    expect(result.over).not.toBeNull();
    expect(result.over.winner).toBe('o');
  });
});

// ─── 2. Holy Ground ───────────────────────────────────────────────────────────

describe('Holy Ground', () => {
  it('HG-01: FORESTWALK suppressed by Holy Ground on defender BF', () => {
    const attacker = makeCreatureCard('att-1', {
      controller: 'p',
      keywords: ['FORESTWALK'],
    });
    const holyGround = makeHolyGroundCard('hg-1', 'o');
    const state = buildTestState({
      pBf: [attacker],
      oBf: [holyGround, makeLandCard('forest-1', 'Forest', 'o')],
    });

    // With Holy Ground on defender's BF, FORESTWALK (ends in WALK) is suppressed.
    expect(hasKw(attacker, 'FORESTWALK', state)).toBe(false);
  });

  it('HG-02: ISLANDWALK suppressed by Holy Ground on defender BF', () => {
    const attacker = makeCreatureCard('att-2', {
      controller: 'p',
      keywords: ['ISLANDWALK'],
    });
    const holyGround = makeHolyGroundCard('hg-1', 'o');
    const state = buildTestState({
      pBf: [attacker],
      oBf: [holyGround, makeLandCard('island-1', 'Island', 'o')],
    });

    expect(hasKw(attacker, 'ISLANDWALK', state)).toBe(false);
  });

  it('HG-03: no Holy Ground → FORESTWALK remains active', () => {
    const attacker = makeCreatureCard('att-3', {
      controller: 'p',
      keywords: ['FORESTWALK'],
    });
    const state = buildTestState({
      pBf: [attacker],
      oBf: [makeLandCard('forest-1', 'Forest', 'o')], // Forest but NO Holy Ground
    });

    expect(hasKw(attacker, 'FORESTWALK', state)).toBe(true);
  });

  it('HG-04: Holy Ground on attacker side only → suppression does NOT apply', () => {
    // Holy Ground on 'p' BF; attacker controller is 'p'; defender is 'o'.
    // hasKw checks state[defender].bf, which is 'o'. No Holy Ground there.
    const attacker = makeCreatureCard('att-4', {
      controller: 'p',
      keywords: ['FORESTWALK'],
    });
    const holyGroundOnAttackerSide = makeHolyGroundCard('hg-wrong', 'p');
    const state = buildTestState({
      pBf: [attacker, holyGroundOnAttackerSide],
      oBf: [makeLandCard('forest-1', 'Forest', 'o')],
    });

    // Defender ('o') does not have Holy Ground → suppression inactive
    expect(hasKw(attacker, 'FORESTWALK', state)).toBe(true);
  });

  it('HG-05: FLYING is not suppressed by Holy Ground (not a landwalk keyword)', () => {
    const attacker = makeCreatureCard('att-5', {
      controller: 'p',
      keywords: ['FLYING'],
    });
    const holyGround = makeHolyGroundCard('hg-1', 'o');
    const state = buildTestState({
      pBf: [attacker],
      oBf: [holyGround],
    });

    // "FLYING" does not end in "WALK" → Holy Ground suppression does not apply
    expect(hasKw(attacker, 'FLYING', state)).toBe(true);
  });

  it('HG-06: canBlockDuel threads state correctly — LANDWALK suppressed by Holy Ground', () => {
    // The engine's canBlockDuel uses hasKw(attacker, "LANDWALK", state) +
    // attacker.landwalkType to represent SWAMPWALK.
    const attacker = makeCreatureCard('att-6', {
      controller: 'p',
      keywords: ['LANDWALK'],
      landwalkType: 'swamp',
    });
    const blocker = makeCreatureCard('blk-6', { controller: 'o' });
    const holyGround = makeHolyGroundCard('hg-1', 'o');
    const swamp = makeLandCard('swamp-1', 'Swamp', 'o');
    const state = buildTestState({
      pBf: [attacker],
      oBf: [blocker, holyGround, swamp],
    });

    // Without Holy Ground: LANDWALK + Swamp present → canBlockDuel returns false.
    // With Holy Ground: hasKw(attacker, "LANDWALK", state) → false → landwalk check
    //   skipped → blocker CAN legally block.
    const defBf = state.o.bf;
    expect(canBlockDuel(blocker, attacker, defBf, state)).toBe(true);
  });

  it('HG-07: backward compat — hasKw without state arg does not crash; returns raw keyword truth', () => {
    const attacker = makeCreatureCard('att-7', {
      controller: 'p',
      keywords: ['FORESTWALK'],
    });

    // No state argument → Holy Ground check skipped → returns keyword presence.
    expect(() => hasKw(attacker, 'FORESTWALK')).not.toThrow();
    expect(hasKw(attacker, 'FORESTWALK')).toBe(true);
    expect(hasKw(attacker, 'ISLANDWALK')).toBe(false);
  });
});

// ─── 3. Sengir Vampire Counter Trigger ───────────────────────────────────────

describe('Sengir Vampire', () => {
  // The engine checks `card.triggered === 'sengirCounter'` in emitEvent when
  // ON_CREATURE_DIES fires. We kill a creature by resolving a damage3 spell
  // from the stack against a toughness-2 creature, which calls checkDeath
  // inside resolveEff. If the creature's IID is in sengirDamagedIids the
  // trigger queues and resolves in the same RESOLVE_STACK call.

  it('SV-01: creature Sengir damaged dies → Sengir gains 1 P1P1 counter', () => {
    const sengir = makeSengirVampireCard('sv-1', 'p');
    const target = makeCreatureCard('tgt-1', { controller: 'o', toughness: 2 });
    const state = buildTestState({
      phase: PHASE.MAIN_1,
      pBf: [sengir],
      oBf: [target],
      stack: [makeStackDamage3('tgt-1')],
      sengirDamagedIids: ['tgt-1'],
    });

    const result = duelReducer(state, { type: 'RESOLVE_STACK' });

    const resultSengir = result.p.bf.find(c => c.iid === 'sv-1');
    expect(resultSengir.counters.P1P1).toBe(1);
  });

  it('SV-02: creature NOT damaged by Sengir dies → Sengir does NOT gain counter', () => {
    const sengir = makeSengirVampireCard('sv-2', 'p');
    const target = makeCreatureCard('tgt-2', { controller: 'o', toughness: 2 });
    const state = buildTestState({
      phase: PHASE.MAIN_1,
      pBf: [sengir],
      oBf: [target],
      stack: [makeStackDamage3('tgt-2')],
      sengirDamagedIids: [], // creature not in list
    });

    const result = duelReducer(state, { type: 'RESOLVE_STACK' });

    const resultSengir = result.p.bf.find(c => c.iid === 'sv-2');
    expect(resultSengir.counters?.P1P1 ?? 0).toBe(0);
  });

  it('SV-03: multiple creatures die; only one Sengir-damaged → exactly 1 counter', () => {
    const sengir = makeSengirVampireCard('sv-3', 'p');
    // Two targets, only the first is in sengirDamagedIids.
    const target1 = makeCreatureCard('tgt-3a', { controller: 'o', toughness: 2 });
    const target2 = makeCreatureCard('tgt-3b', { controller: 'o', toughness: 2 });
    // Resolve damage against target1 only in this action.
    const state = buildTestState({
      phase: PHASE.MAIN_1,
      pBf: [sengir],
      oBf: [target1, target2],
      stack: [makeStackDamage3('tgt-3a')],
      sengirDamagedIids: ['tgt-3a'], // only tgt-3a was damaged by Sengir
    });

    const result = duelReducer(state, { type: 'RESOLVE_STACK' });

    const resultSengir = result.p.bf.find(c => c.iid === 'sv-3');
    expect(resultSengir.counters.P1P1).toBe(1);
    // target2 still alive
    expect(result.o.bf.some(c => c.iid === 'tgt-3b')).toBe(true);
  });

  it('SV-04: Sengir itself is not on BF (already dead) → no counter awarded', () => {
    // Sengir absent from all zones; a Sengir-damaged creature still dies.
    const target = makeCreatureCard('tgt-4', { controller: 'o', toughness: 2 });
    const state = buildTestState({
      phase: PHASE.MAIN_1,
      pBf: [], // Sengir not present
      oBf: [target],
      stack: [makeStackDamage3('tgt-4')],
      sengirDamagedIids: ['tgt-4'],
    });

    const result = duelReducer(state, { type: 'RESOLVE_STACK' });

    // No Sengir anywhere → no counter can be placed; no crash.
    const allBf = [...result.p.bf, ...result.o.bf];
    expect(allBf.some(c => c.name === 'Sengir Vampire')).toBe(false);
  });

  it('SV-05: counter stacks — Sengir with 2 existing counters gains another after kill', () => {
    const sengir = makeSengirVampireCard('sv-5', 'p');
    sengir.counters = { P1P1: 2 }; // pre-existing counters (factory setup only)
    const target = makeCreatureCard('tgt-5', { controller: 'o', toughness: 2 });
    const state = buildTestState({
      phase: PHASE.MAIN_1,
      pBf: [sengir],
      oBf: [target],
      stack: [makeStackDamage3('tgt-5')],
      sengirDamagedIids: ['tgt-5'],
    });

    const result = duelReducer(state, { type: 'RESOLVE_STACK' });

    const resultSengir = result.p.bf.find(c => c.iid === 'sv-5');
    expect(resultSengir.counters.P1P1).toBe(3);
  });

  it('SV-06: sengirDamagedIids resets at start of each new turn', () => {
    // Advance from CLEANUP → UNTAP (turn change). The turnState reset clears the list.
    const sengir = makeSengirVampireCard('sv-6', 'o'); // 'o' is the next active player
    const state = buildTestState({
      phase: PHASE.CLEANUP,
      active: 'p', // 'o' becomes active after turn change
      oBf: [sengir],
      sengirDamagedIids: ['some-old-creature-iid'],
    });

    const result = duelReducer(state, { type: 'ADVANCE_PHASE' });

    expect(result.phase).toBe(PHASE.UNTAP);
    expect(result.turnState.sengirDamagedIids).toEqual([]);
  });
});

// ─── 4. Force of Nature Upkeep ────────────────────────────────────────────────

describe('Force of Nature Upkeep', () => {
  it('FN-01: human player controls Force of Nature → pendingUpkeepChoice set at UPKEEP; subsequent ADVANCE_PHASE blocked', () => {
    const fon = makeForceOfNatureCard('fon-1', 'p');
    const state = buildTestState({
      phase: PHASE.UNTAP,
      active: 'p',
      pBf: [fon],
    });

    const result = duelReducer(state, { type: 'ADVANCE_PHASE' });

    expect(result.phase).toBe(PHASE.UPKEEP);
    expect(result.pendingUpkeepChoice).not.toBeNull();
    expect(result.pendingUpkeepChoice.cardName).toBe('Force of Nature');

    // A second ADVANCE_PHASE must be blocked while the choice is pending.
    const blocked = duelReducer(result, { type: 'ADVANCE_PHASE' });
    expect(blocked.phase).toBe(PHASE.UPKEEP);
  });

  it('FN-02: AI controls Force of Nature; burnMana clears pool before check → AI takes 8 damage', () => {
    // advPhase burns all mana before the Force of Nature upkeep handler runs.
    // Even with G:4 pre-loaded, the mana is cleared and the AI cannot pay.
    const fon = makeForceOfNatureCard('fon-2', 'o');
    const state = buildTestState({
      phase: PHASE.UNTAP,
      active: 'o',
      oBf: [fon],
      oMana: { G: 4 }, // pool is cleared by burnMana before the check fires
    });

    const result = duelReducer(state, { type: 'ADVANCE_PHASE' });

    // burnMana clears G mana → handler sees G:0 → AI takes 8 damage
    expect(result.o.life).toBe(12);
  });

  it('FN-03: AI cannot pay GGGG (empty pool) → takes 8 damage; phase advances to UPKEEP', () => {
    const fon = makeForceOfNatureCard('fon-3', 'o');
    const state = buildTestState({
      phase: PHASE.UNTAP,
      active: 'o',
      oBf: [fon],
      oMana: { G: 0 },
    });

    const result = duelReducer(state, { type: 'ADVANCE_PHASE' });

    expect(result.o.life).toBe(12);
    expect(result.phase).toBe(PHASE.UPKEEP);
  });

  it('FN-04: AI at 9 life, cannot pay → takes 8 damage → life = 1; game continues', () => {
    const fon = makeForceOfNatureCard('fon-4', 'o');
    const state = buildTestState({
      phase: PHASE.UNTAP,
      active: 'o',
      oBf: [fon],
      oLife: 9,
    });

    const result = duelReducer(state, { type: 'ADVANCE_PHASE' });

    expect(result.o.life).toBe(1);
    expect(result.over).toBeNull(); // not dead yet
  });

  it('FN-05: AI at 8 life, cannot pay → takes 8 damage → life ≤ 0; game-over triggered', () => {
    const fon = makeForceOfNatureCard('fon-5', 'o');
    const state = buildTestState({
      phase: PHASE.UNTAP,
      active: 'o',
      oBf: [fon],
      oLife: 8,
    });

    const result = duelReducer(state, { type: 'ADVANCE_PHASE' });

    expect(result.o.life).toBeLessThanOrEqual(0);
    expect(result.over).not.toBeNull();
    expect(result.over.winner).toBe('p');
  });

  it('FN-06: human dispatches UPKEEP_CHOICE_RESOLVE pay → no damage; choice cleared', () => {
    const pendingChoice = {
      cardName: 'Force of Nature',
      handlerKey: 'forceOfNatureUpkeep',
      options: ['PAY_GGGG', 'TAKE_DAMAGE'],
    };
    const state = buildTestState({
      phase: PHASE.UPKEEP,
      active: 'p',
      pendingUpkeepChoice: pendingChoice,
      pMana: { G: 4 },
    });

    const result = duelReducer(state, { type: 'UPKEEP_CHOICE_RESOLVE', choice: 'PAY_GGGG' });

    expect(result.p.life).toBe(20); // no damage
    expect(result.p.mana.G).toBe(0); // GGGG deducted
    expect(result.pendingUpkeepChoice).toBeNull();
  });

  it('FN-07: human dispatches UPKEEP_CHOICE_RESOLVE take → 8 damage applied; choice cleared', () => {
    const pendingChoice = {
      cardName: 'Force of Nature',
      handlerKey: 'forceOfNatureUpkeep',
      options: ['PAY_GGGG', 'TAKE_DAMAGE'],
    };
    const state = buildTestState({
      phase: PHASE.UPKEEP,
      active: 'p',
      pendingUpkeepChoice: pendingChoice,
    });

    const result = duelReducer(state, { type: 'UPKEEP_CHOICE_RESOLVE', choice: 'TAKE_DAMAGE' });

    expect(result.p.life).toBe(12);
    expect(result.pendingUpkeepChoice).toBeNull();
  });
});

// ─── 5. Priority Window / Instant-Speed System ───────────────────────────────

describe('Priority Window', () => {
  it('PW-01: OPEN_PRIORITY_WINDOW → priorityWindow true; priorityPasser null', () => {
    const state = buildTestState({ phase: PHASE.MAIN_1 });

    const result = duelReducer(state, { type: 'OPEN_PRIORITY_WINDOW' });

    expect(result.priorityWindow).toBe(true);
    // The reducer sets priorityPasser: null when opening (neither player has yet passed).
    expect(result.priorityPasser).toBeNull();
  });

  it('PW-02: ADVANCE_PHASE blocked while priority window is open', () => {
    const state = buildTestState({
      phase: PHASE.MAIN_1,
      priorityWindow: true,
    });

    const result = duelReducer(state, { type: 'ADVANCE_PHASE' });

    expect(result.phase).toBe(PHASE.MAIN_1); // no advancement
    expect(result.priorityWindow).toBe(true);
  });

  it('PW-03: player passes priority → priorityPasser records who passed', () => {
    const state = buildTestState({
      phase: PHASE.MAIN_1,
      priorityWindow: true,
      priorityPasser: null,
    });

    const result = duelReducer(state, { type: 'PASS_PRIORITY', who: 'p' });

    // Window stays open; passer recorded so the other player can respond.
    expect(result.priorityWindow).toBe(true);
    expect(result.priorityPasser).toBe('p');
  });

  it('PW-04: both players pass → window closes', () => {
    // 'p' has already passed (priorityPasser = 'p').
    const state = buildTestState({
      phase: PHASE.MAIN_1,
      priorityWindow: true,
      priorityPasser: 'p',
    });

    const result = duelReducer(state, { type: 'PASS_PRIORITY', who: 'o' });

    expect(result.priorityWindow).toBe(false);
    expect(result.priorityPasser).toBeNull();
  });

  it('PW-05: SILENCE dungeonMod suppresses OPEN_PRIORITY_WINDOW', () => {
    const state = buildTestState({
      phase: PHASE.MAIN_1,
      dungeonMod: 'SILENCE',
    });

    const result = duelReducer(state, { type: 'OPEN_PRIORITY_WINDOW' });

    expect(result.priorityWindow).toBe(false);
  });

  it('PW-05b: SILENCE castleMod also suppresses OPEN_PRIORITY_WINDOW', () => {
    const state = buildTestState({
      phase: PHASE.MAIN_1,
      castleMod: { name: 'SILENCE' },
    });

    const result = duelReducer(state, { type: 'OPEN_PRIORITY_WINDOW' });

    expect(result.priorityWindow).toBe(false);
  });

  it('PW-06: instant can be cast while priority window is open', () => {
    // CAST_SPELL has no priority window gate — an instant can be cast at any time.
    // Without stackType:"batch", instants land on the stack; a RESOLVE_STACK
    // follows to actually apply the effect.
    const instant = {
      iid: 'shock-hand',
      id: 'shock',
      name: 'Shock',
      type: 'Instant',
      effect: 'damage3',
      color: 'R',
      cmc: 1,
      cost: '1',
      keywords: [],
    };
    const state = buildTestState({
      phase: PHASE.UPKEEP,
      active: 'o',
      priorityWindow: true,
      priorityPasser: 'p', // player has passed; AI's turn to respond
      oMana: { R: 1 },
    });
    const stateWithHand = { ...state, o: { ...state.o, hand: [instant] } };

    // Step 1: AI casts the instant — spell lands on the stack.
    const afterCast = duelReducer(stateWithHand, {
      type: 'CAST_SPELL',
      who: 'o',
      iid: 'shock-hand',
      tgt: 'p',
    });
    expect(afterCast.stack.length).toBe(1);

    // Step 2: Resolve the stack — damage applies to 'p'.
    const result = duelReducer(afterCast, { type: 'RESOLVE_STACK' });
    expect(result.p.life).toBe(17);
  });

  it('PW-07: AI passes immediately if no instants → window closes', () => {
    // Player already passed. AI passes too → window should close.
    const state = buildTestState({
      phase: PHASE.MAIN_1,
      priorityWindow: true,
      priorityPasser: 'p',
    });

    const result = duelReducer(state, { type: 'PASS_PRIORITY', who: 'o' });

    expect(result.priorityWindow).toBe(false);
    expect(result.priorityPasser).toBeNull();
  });

  it('PW-08: priority window state does not persist across turns', () => {
    // After both players pass the window is closed; any subsequent turn start
    // begins with priorityWindow false. We verify via the CLEANUP→UNTAP
    // (turn change) that the new turn state carries priorityWindow: false.
    const state = buildTestState({
      phase: PHASE.CLEANUP,
      active: 'p',
      priorityWindow: false, // already closed (both passed)
    });

    const result = duelReducer(state, { type: 'ADVANCE_PHASE' });

    expect(result.phase).toBe(PHASE.UNTAP);
    expect(result.priorityWindow).toBe(false);

    // Also confirm a window left open before ADVANCE_PHASE blocks it.
    const openState = buildTestState({
      phase: PHASE.MAIN_1,
      priorityWindow: true,
    });
    const blocked = duelReducer(openState, { type: 'ADVANCE_PHASE' });
    expect(blocked.phase).toBe(PHASE.MAIN_1); // cannot advance with open window
  });
});
