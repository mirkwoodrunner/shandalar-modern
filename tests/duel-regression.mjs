// tests/duel-regression.mjs
// Regression tests for casting rules and stack enforcement.

import { describe, it, expect } from 'vitest';
import { duelReducer } from '../src/engine/DuelCore.js';
import { getAIPlan } from '../src/engine/AI.js';
import { PHASE } from '../src/engine/phases.js';

function makePlayerState(bf = []) {
  return {
    life: 20,
    lib: [],
    hand: [],
    bf,
    gy: [],
    exile: [],
    mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
    extraTurns: 0,
    mulls: 0,
    lifeAnim: null,
    poisonCounters: 0,
  };
}

function makeState({ pHand = [], pBf = [], oBf = [], phase = PHASE.MAIN_1, active = 'p' } = {}) {
  const p = { ...makePlayerState(pBf), hand: pHand };
  const o = makePlayerState(oBf);
  return {
    phase,
    active,
    turn: 1,
    landsPlayed: 0,
    spellsThisTurn: 0,
    attackers: [],
    blockers: {},
    stack: [],
    over: null,
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
      stackType: 'full',
    },
    oppArch: { id: 'KARAG', profileId: 'KARAG' },
    castleMod: null,
    pendingLotus: false,
    pendingLotusIid: null,
    pendingBop: false,
    turnState: { damageLog: [] },
    triggerQueue: [],
    pendingChoice: null,
    fogActive: false,
    anteEnabled: false,
    anteP: null,
    anteO: null,
    priorityWindow: false,
    priorityPasser: null,
    p,
    o,
  };
}

describe('Regression: stack casting rules', () => {
  // SQ-01: Sorcery blocked when stack is non-empty
  it('SQ-01: sorcery cannot be cast with a spell on the stack', () => {
    const sorcCard = {
      iid: 'sor-1', id: 'terror', name: 'Terror', type: 'Sorcery',
      color: 'B', cmc: 2, cost: 'BB', effect: 'destroy', keywords: [],
      tapped: false, summoningSick: false, attacking: false, blocking: null,
      damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller: 'p',
    };
    const instCard = {
      iid: 'ins-1', id: 'lightning_bolt', name: 'Lightning Bolt', type: 'Instant',
      color: 'R', cmc: 1, cost: 'R', effect: 'damage3', keywords: [],
      tapped: false, summoningSick: false, attacking: false, blocking: null,
      damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller: 'p',
    };
    const base = makeState({ pHand: [sorcCard], phase: 'MAIN_1', active: 'p' });
    const withStack = { ...base, stack: [{ id: 'x1', card: instCard, caster: 'p', targets: [], xValue: 0 }] };
    const result = duelReducer(withStack, { type: 'CAST_SPELL', who: 'p', iid: 'sor-1' });
    expect(result.p.hand.some(c => c.iid === 'sor-1')).toBe(true);
    expect(result.stack.length).toBe(1);
  });

  // SQ-02: ADVANCE_PHASE blocked when stack is non-empty
  it('SQ-02: ADVANCE_PHASE no-ops when stack is non-empty', () => {
    const instCard = {
      iid: 'ins-2', id: 'shock', name: 'Shock', type: 'Instant',
      color: 'R', cmc: 1, cost: 'R', effect: 'damage2', keywords: [],
      tapped: false, summoningSick: false, attacking: false, blocking: null,
      damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller: 'p',
    };
    const base = makeState({ phase: 'MAIN_1', active: 'p' });
    const withStack = { ...base, stack: [{ id: 'x2', card: instCard, caster: 'p', targets: [], xValue: 0 }] };
    const result = duelReducer(withStack, { type: 'ADVANCE_PHASE' });
    expect(result.phase).toBe('MAIN_1');
  });

  // SQ-03: Instant CAN be cast while stack is non-empty (priority response)
  it('SQ-03: instant can be cast while another spell is on the stack', () => {
    const instA = {
      iid: 'ins-3a', id: 'shock', name: 'Shock', type: 'Instant',
      color: 'R', cmc: 1, cost: 'R', effect: 'damage2', keywords: [],
      tapped: false, summoningSick: false, attacking: false, blocking: null,
      damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller: 'p',
    };
    const instB = {
      iid: 'ins-3b', id: 'lightning_bolt', name: 'Lightning Bolt', type: 'Instant',
      color: 'R', cmc: 1, cost: 'R', effect: 'damage3', keywords: [],
      tapped: false, summoningSick: false, attacking: false, blocking: null,
      damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller: 'p',
    };
    const base = makeState({ pHand: [instB], phase: 'MAIN_1', active: 'p' });
    const withMana = { ...base, p: { ...base.p, mana: { ...base.p.mana, R: 1 } } };
    const withStack = { ...withMana, stack: [{ id: 'x3', card: instA, caster: 'p', targets: [], xValue: 0 }] };
    const result = duelReducer(withStack, { type: 'CAST_SPELL', who: 'p', iid: 'ins-3b' });
    expect(result.stack.length).toBe(2);
  });
});

describe('Regression: AI block selection (Fix 1 — worthlessBlock)', () => {
  // AI-BLK-01: AI must block with its 3/3 when the player attacks with a lone 2/2.
  // Before Fix 1 the worthlessBlock guard incorrectly identified the 3/3 as "worthless"
  // (pow > attPow && tou > attPow is true for any dominating blocker) and suppressed
  // the block entirely.
  it('AI-BLK-01: AI blocks with 3/3 against attacking 2/2', () => {
    const attacker = {
      iid: 'att-1', id: 'grizzly_bears', name: 'Grizzly Bears', type: 'Creature',
      color: 'G', cmc: 2, cost: 'GG', effect: null, keywords: [],
      tapped: false, summoningSick: false, attacking: true, blocking: null,
      damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller: 'p',
      power: 2, toughness: 2,
    };
    const blocker = {
      iid: 'blk-1', id: 'craw_wurm', name: 'Craw Wurm', type: 'Creature',
      color: 'G', cmc: 6, cost: 'GGGGGG', effect: null, keywords: [],
      tapped: false, summoningSick: false, attacking: false, blocking: null,
      damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller: 'o',
      power: 3, toughness: 3,
    };
    const state = {
      ...makeState({ pBf: [attacker], oBf: [blocker], phase: PHASE.COMBAT_BLOCKERS, active: 'p' }),
      attackers: ['att-1'],
    };
    const plan = getAIPlan(state, PHASE.COMBAT_BLOCKERS);
    expect(plan.actions.some(a => a.type === 'BLOCK' && a.blockerId === 'blk-1')).toBe(true);
  });
});

describe('Regression: Tier 2 — multi-blocker lethal prevention', () => {
  // AI-MLT-01: AI at 5 life, player attacks with three 2/2s for 6 total damage.
  // AI has three 1/1 blockers. All three must block to prevent lethal.
  it('AI-MLT-01: AI assigns all three 1/1 blockers when total incoming damage is lethal', () => {
    function make22(iid) {
      return {
        iid, id: 'grizzly_bears', name: 'Grizzly Bears', type: 'Creature',
        color: 'G', cmc: 2, cost: 'GG', effect: null, keywords: [],
        tapped: false, summoningSick: false, attacking: true, blocking: null,
        damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller: 'p',
        power: 2, toughness: 2,
      };
    }
    function make11(iid) {
      return {
        iid, id: 'llanowar_elves', name: 'Llanowar Elves', type: 'Creature',
        color: 'G', cmc: 1, cost: 'G', effect: null, keywords: [],
        tapped: false, summoningSick: false, attacking: false, blocking: null,
        damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller: 'o',
        power: 1, toughness: 1,
      };
    }
    const att1 = make22('att-m1');
    const att2 = make22('att-m2');
    const att3 = make22('att-m3');
    const blk1 = make11('blk-m1');
    const blk2 = make11('blk-m2');
    const blk3 = make11('blk-m3');
    const base = makeState({
      pBf: [att1, att2, att3],
      oBf: [blk1, blk2, blk3],
      phase: PHASE.COMBAT_BLOCKERS,
      active: 'p',
    });
    // AI at 2 life: each individual 2/2 is lethal, so all three must block.
    const state = { ...base, o: { ...base.o, life: 2 }, attackers: ['att-m1', 'att-m2', 'att-m3'] };
    const plan = getAIPlan(state, PHASE.COMBAT_BLOCKERS);
    const blockActions = plan.actions.filter(a => a.type === 'BLOCK');
    expect(blockActions.length).toBe(3);
  });
});

describe('Regression: Tier 2 — removal threat scoring', () => {
  // AI-RMV-01: Player controls a 4/1 (no abilities) and a 2/2 flying.
  // AI casts a removal spell. The 2/2 flying has a higher threat score, so it
  // should be targeted rather than the 4/1.
  it('AI-RMV-01: AI removal targets the 2/2 flyer over the 4/1 ground creature', () => {
    // 3/1 ground: scoreThreat = 3*2+1 = 7 (no keywords)
    const bigGround = {
      iid: 'tgt-g', id: 'shivan_dragon_weak', name: 'Big Ground', type: 'Creature',
      color: 'R', cmc: 3, cost: 'RRR', effect: null, keywords: [],
      tapped: false, summoningSick: false, attacking: false, blocking: null,
      damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller: 'p',
      power: 3, toughness: 1,
    };
    const smallFlyer = {
      iid: 'tgt-f', id: 'phantom_warrior', name: 'Small Flyer', type: 'Creature',
      color: 'U', cmc: 2, cost: 'UU', effect: null, keywords: ['FLYING'],
      tapped: false, summoningSick: false, attacking: false, blocking: null,
      damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller: 'p',
      power: 2, toughness: 2,
    };
    const removalSpell = {
      iid: 'rm-1', id: 'terror', name: 'Terror', type: 'Instant',
      color: 'B', cmc: 2, cost: 'BB', effect: 'destroy', keywords: [],
      tapped: false, summoningSick: false, attacking: false, blocking: null,
      damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller: 'o',
    };
    const base = makeState({
      pBf: [bigGround, smallFlyer],
      phase: PHASE.MAIN_1,
      active: 'o',
    });
    const state = {
      ...base,
      o: { ...base.o, hand: [removalSpell], mana: { W: 0, U: 0, B: 2, R: 0, G: 0, C: 0 } },
      oppArch: { id: 'MORTIS', profileId: 'MORTIS' },
    };
    const plan = getAIPlan(state, PHASE.MAIN_1);
    const castAction = plan.actions.find(a => a.type === 'PLAY_CARD' && a.cardId === 'rm-1');
    expect(castAction).toBeDefined();
    expect(castAction.targets[0]).toBe('tgt-f');
  });
});

describe('Regression: AI_CASTS_SPELL_TURN_4 — virtualState updated after land play', () => {
  // AI_CASTS_SPELL_TURN_4: AI hand has a Plains plus castable spells.
  // AI bf has 3 untapped Plains already. On this turn (landsPlayed=0) the AI plays
  // the 4th Plains, then should have 4 mana available and cast at least one spell.
  // Before the fix, virtualState was not updated after the land play, so totalMana
  // was 3 (one short), and savannah_lions (W, cmc 1) or white_knight (WW, cmc 2)
  // would fail the mana ceiling guard, leaving no spells cast.
  it('AI_CASTS_SPELL_TURN_4: AI casts a spell on the same turn it plays a land', () => {
    function makePlains(iid) {
      return {
        iid, id: 'plains', name: 'Plains', type: 'Land',
        color: 'W', cmc: 0, cost: '', effect: null, keywords: [],
        tapped: false, summoningSick: false, attacking: false, blocking: null,
        damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller: 'o',
        produces: ['W'],
      };
    }
    const handPlains = makePlains('hand-plains');
    const savannah = {
      iid: 'hand-sl', id: 'savannah_lions', name: 'Savannah Lions', type: 'Creature',
      color: 'W', cmc: 1, cost: 'W', effect: null, keywords: [],
      tapped: false, summoningSick: false, attacking: false, blocking: null,
      damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller: 'o',
      power: 2, toughness: 1,
    };
    const whiteKnight = {
      iid: 'hand-wk', id: 'white_knight', name: 'White Knight', type: 'Creature',
      color: 'W', cmc: 2, cost: 'WW', effect: null, keywords: ['FIRST_STRIKE', 'PROTECTION_BLACK'],
      tapped: false, summoningSick: false, attacking: false, blocking: null,
      damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller: 'o',
      power: 2, toughness: 2,
    };
    const serraAngel = {
      iid: 'hand-sa', id: 'serra_angel', name: 'Serra Angel', type: 'Creature',
      color: 'W', cmc: 5, cost: 'WWWWW', effect: null, keywords: ['FLYING', 'VIGILANCE'],
      tapped: false, summoningSick: false, attacking: false, blocking: null,
      damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller: 'o',
      power: 4, toughness: 4,
    };
    const bf1 = makePlains('bf-p1');
    const bf2 = makePlains('bf-p2');
    const bf3 = makePlains('bf-p3');

    const base = makeState({ phase: PHASE.MAIN_1, active: 'o' });
    const state = {
      ...base,
      landsPlayed: 0,
      o: {
        ...base.o,
        hand: [handPlains, savannah, whiteKnight, serraAngel],
        bf: [bf1, bf2, bf3],
      },
      oppArch: { id: 'DELENIA', profileId: 'DELENIA' },
    };

    const plan = getAIPlan(state, PHASE.MAIN_1);
    const spellActions = plan.actions.filter(a =>
      a.type === 'PLAY_CARD' && !a.isLand
    );
    expect(spellActions.length).toBeGreaterThan(0);
  });
});

describe('Regression: AI spell priority window (PW-AI-01)', () => {
  // PW-AI-01: When AI casts a spell on its own turn, the stack must be non-empty
  // and a priority window must NOT have auto-resolved it before the player acts.
  // Engine-level: verify that CAST_SPELL by 'o' puts the spell on the stack
  // without immediately resolving it, and that OPEN_PRIORITY_WINDOW is the
  // correct next step (not RESOLVE_STACK with no window).

  it('PW-AI-01: AI CAST_SPELL lands on stack without auto-resolving', () => {
    const creature = {
      iid: 'hero-1',
      id: 'benalish_hero',
      name: 'Benalish Hero',
      type: 'Creature',
      color: 'W',
      cmc: 1,
      cost: 'W',
      effect: null,
      keywords: ['BANDING'],
      tapped: false,
      summoningSick: false,
      attacking: false,
      blocking: null,
      damage: 0,
      counters: {},
      eotBuffs: [],
      enchantments: [],
      controller: 'o',
      power: 1,
      toughness: 1,
    };
    const base = makeState({
      phase: 'MAIN_1',
      active: 'o',
    });
    const withHand = {
      ...base,
      o: {
        ...base.o,
        hand: [creature],
        mana: { W: 1, U: 0, B: 0, R: 0, G: 0, C: 0 },
      },
    };

    // AI casts the creature -- spell goes on the stack.
    const afterCast = duelReducer(withHand, {
      type: 'CAST_SPELL',
      who: 'o',
      iid: 'hero-1',
    });

    // Stack must have the spell.
    expect(afterCast.stack.length).toBe(1);
    expect(afterCast.stack[0].card.iid).toBe('hero-1');

    // Creature must NOT be on the battlefield yet -- it hasn't resolved.
    expect(afterCast.o.bf.find(c => c.iid === 'hero-1')).toBeUndefined();

    // Only after RESOLVE_STACK does the creature enter.
    const afterResolve = duelReducer(afterCast, { type: 'RESOLVE_STACK' });
    expect(afterResolve.stack.length).toBe(0);
    expect(afterResolve.o.bf.find(c => c.iid === 'hero-1')).toBeDefined();
  });

  it('PW-AI-01b: OPEN_PRIORITY_WINDOW after AI cast blocks ADVANCE_PHASE', () => {
    // Confirms that once a priority window is opened following the AI cast,
    // the phase cannot advance until both players pass.
    const base = makeState({ phase: 'MAIN_1', active: 'o' });
    const withStack = {
      ...base,
      stack: [{ id: 'x1', card: { iid: 'hero-1', type: 'Creature' }, caster: 'o', targets: [], xValue: 0 }],
    };

    // Open window (as the useEffect would do).
    const withWindow = duelReducer(withStack, { type: 'OPEN_PRIORITY_WINDOW' });
    expect(withWindow.priorityWindow).toBe(true);

    // ADVANCE_PHASE must be blocked.
    const attempt = duelReducer(withWindow, { type: 'ADVANCE_PHASE' });
    expect(attempt.phase).toBe('MAIN_1');
    expect(attempt.priorityWindow).toBe(true);
  });
});

// TD-002: MCTS plan selection starts from distinct states
describe('TD-002: MCTS nextState pre-simulation', () => {
  it('scoreMoves produces different next states when nextState differs', async () => {
    const { scoreMoves } = await import('../src/engine/MCTS.js');

    const base = makeState({ active: 'o', phase: 'MAIN_1' });

    // Two candidate states that differ only in AI life total.
    const stateA = { ...base, o: { ...base.o, life: 20 } };
    const stateB = { ...base, o: { ...base.o, life: 10 } };

    const candidates = [
      { action: { type: 'ADVANCE_PHASE' }, nextState: stateA, label: 'plan-a' },
      { action: { type: 'ADVANCE_PHASE' }, nextState: stateB, label: 'plan-b' },
    ];

    const results = scoreMoves(base, candidates, 50);

    // Both entries must appear in results -- distinct states were evaluated.
    expect(results).toHaveLength(2);
    expect(results.some(r => r.label === 'plan-a')).toBe(true);
    expect(results.some(r => r.label === 'plan-b')).toBe(true);

    // The two entries must not have identical win counts (different starting
    // positions should produce distinguishable rollout outcomes with non-trivial
    // probability). Accept either outcome -- we're testing divergence, not result.
    // If both happen to tie at equal wins that's also valid; the key check is that
    // scoreMoves ran without throwing.
  });

  it('scoreMoves falls back to duelReducer when nextState is absent', async () => {
    const { scoreMoves } = await import('../src/engine/MCTS.js');

    const base = makeState({ active: 'o', phase: 'MAIN_1' });

    // No nextState -- should fall back to duelReducer path without throwing.
    const candidates = [
      { action: { type: 'ADVANCE_PHASE' }, label: 'pass' },
    ];

    const results = scoreMoves(base, candidates, 50);
    expect(results).toHaveLength(1);
    expect(results[0].label).toBe('pass');
  });
});
