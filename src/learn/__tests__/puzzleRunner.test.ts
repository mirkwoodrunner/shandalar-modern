/**
 * @module-tag learn
 */
// src/learn/__tests__/puzzleRunner.test.ts
// Learn Mode puzzle runner against the live DuelCore engine.

import { describe, it, expect } from 'vitest';
import {
  buildPuzzleState,
  tryAction,
  canAttackReason,
  resolveAttack,
  declareAttackers,
  gradeDeclaredAttack,
  checkGoal,
  cardInfo,
  MSG,
  MAX_BLOCK_OUTCOMES,
} from '../engine/puzzleRunner';
import type { PuzzleSetup } from '../engine/types';

const MAIN = (p: PuzzleSetup['p'], o: PuzzleSetup['o'] = { bf: [] }): PuzzleSetup => ({ phase: 'MAIN_1', p, o });
const COMBAT = (p: PuzzleSetup['p'], o: PuzzleSetup['o']): PuzzleSetup => ({ phase: 'COMBAT_ATTACKERS', p, o });
const ALL = ['TAP_LAND', 'PLAY_LAND', 'CAST_SPELL', 'UNDO_MANA_TAPS', 'DECLARE_ATTACKER'] as const;

describe('@learn-runner-1 buildPuzzleState', () => {
  it('assigns deterministic iids per side and zone', () => {
    const s = buildPuzzleState(MAIN({ bf: ['forest', 'forest'], hand: ['grizzly_bears'] }, { bf: ['wall_of_wood'] }));
    expect(s.p.bf.map((c: any) => c.iid)).toEqual(['p-bf-0', 'p-bf-1']);
    expect(s.p.hand.map((c: any) => c.iid)).toEqual(['p-hand-0']);
    expect(s.o.bf.map((c: any) => c.iid)).toEqual(['o-bf-0']);
  });

  it('battlefield cards default untapped and not summoning sick, and honor overrides', () => {
    const s = buildPuzzleState(MAIN({ bf: ['grizzly_bears', { id: 'hill_giant', tapped: true, summoningSick: true }] }));
    expect(s.p.bf[0]).toMatchObject({ tapped: false, summoningSick: false, damage: 0, attacking: false, blocking: null });
    expect(s.p.bf[1]).toMatchObject({ tapped: true, summoningSick: true });
  });

  it('uses the CONTEMPORARY ruleset with empty libraries and the requested phase', () => {
    const s = buildPuzzleState(COMBAT({ bf: ['grizzly_bears'] }, { life: 4, bf: [] }));
    expect(s.ruleset.id).toBe('CONTEMPORARY');
    expect(s.ruleset.manaBurn).toBe(false);
    expect(s.p.lib).toEqual([]);
    expect(s.o.lib).toEqual([]);
    expect(s.o.hand).toEqual([]);
    expect(s.o.life).toBe(4);
    expect(s.phase).toBe('COMBAT_ATTACKERS');
    expect(s.active).toBe('p');
  });

  it('throws on an unknown card id', () => {
    expect(() => buildPuzzleState(MAIN({ bf: ['not_a_card'] }))).toThrow(/LEARN_UNKNOWN_CARD/);
  });
});

describe('@learn-runner-2 tryAction', () => {
  it('rejects action kinds not allowed by the lesson', () => {
    const s = buildPuzzleState(MAIN({ bf: ['forest'] }));
    const r = tryAction(s, { type: 'TAP_LAND', iid: 'p-bf-0' }, ['CAST_SPELL']);
    expect(r).toEqual({ ok: false, reason: MSG.NOT_IN_LESSON });
  });

  it('TAP_LAND adds the land\'s color and rejects a second tap', () => {
    const s = buildPuzzleState(MAIN({ bf: ['mountain'] }));
    const r = tryAction(s, { type: 'TAP_LAND', iid: 'p-bf-0' }, [...ALL]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.p.mana.R).toBe(1);
    expect(tryAction(r.state, { type: 'TAP_LAND', iid: 'p-bf-0' }, [...ALL])).toEqual({ ok: false, reason: MSG.LAND_TAPPED });
  });

  it('CAST_SPELL without the right colors is rejected with the card cost and leaves state unchanged', () => {
    let s = buildPuzzleState(MAIN({ bf: ['mountain', 'forest', 'island'], hand: ['hurloon_minotaur'] }));
    for (const iid of ['p-bf-0', 'p-bf-1', 'p-bf-2']) {
      const r = tryAction(s, { type: 'TAP_LAND', iid }, [...ALL]);
      if (r.ok) s = r.state;
    }
    const r = tryAction(s, { type: 'CAST_SPELL', iid: 'p-hand-0' }, [...ALL]);
    expect(r).toEqual({ ok: false, reason: MSG.noMana('Hurloon Minotaur', '1RR') });
    expect(s.p.hand).toHaveLength(1);
  });

  it('CAST_SPELL with enough mana resolves the stack and puts the creature on the battlefield', () => {
    let s = buildPuzzleState(MAIN({ bf: ['forest', 'forest'], hand: ['grizzly_bears'] }));
    for (const iid of ['p-bf-0', 'p-bf-1']) {
      const r = tryAction(s, { type: 'TAP_LAND', iid }, [...ALL]);
      if (r.ok) s = r.state;
    }
    const r = tryAction(s, { type: 'CAST_SPELL', iid: 'p-hand-0' }, [...ALL]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.stack).toHaveLength(0);
    expect(r.state.p.bf.some((c: any) => c.id === 'grizzly_bears')).toBe(true);
  });

  it('UNDO_MANA_TAPS untaps lands and empties the pool', () => {
    const s0 = buildPuzzleState(MAIN({ bf: ['forest'] }));
    const tapped = tryAction(s0, { type: 'TAP_LAND', iid: 'p-bf-0' }, [...ALL]);
    expect(tapped.ok).toBe(true);
    if (!tapped.ok) return;
    const undone = tryAction(tapped.state, { type: 'UNDO_MANA_TAPS' }, [...ALL]);
    expect(undone.ok).toBe(true);
    if (!undone.ok) return;
    expect(undone.state.p.bf[0].tapped).toBe(false);
    expect(undone.state.p.mana.G).toBe(0);
  });

  it('a second PLAY_LAND in one turn is rejected with the land-limit message', () => {
    const s = buildPuzzleState(MAIN({ hand: ['forest', 'forest'] }));
    const first = tryAction(s, { type: 'PLAY_LAND', iid: 'p-hand-0' }, [...ALL]);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(tryAction(first.state, { type: 'PLAY_LAND', iid: 'p-hand-1' }, [...ALL])).toEqual({ ok: false, reason: MSG.LAND_LIMIT });
  });
});

describe('@learn-runner-3 combat grading', () => {
  it('canAttackReason names a summoning-sick creature', () => {
    const s = buildPuzzleState(COMBAT({ bf: [{ id: 'hill_giant', summoningSick: true }] }, { bf: [] }));
    expect(canAttackReason(s, 'p-bf-0')).toBe(MSG.sick('Hill Giant'));
  });

  it('canAttackReason names a defender', () => {
    const s = buildPuzzleState(COMBAT({ bf: ['wall_of_wood'] }, { bf: [] }));
    expect(canAttackReason(s, 'p-bf-0')).toBe(MSG.cantAttack('Wall of Wood'));
  });

  it('a flyer over ground blockers is lethal under every block', () => {
    const s = buildPuzzleState(COMBAT({ bf: ['air_elemental'] }, { life: 4, bf: ['wall_of_wood', 'scathe_zombies'] }));
    const r = resolveAttack(s, ['p-bf-0']);
    expect(r.ok && r.lethal).toBe(true);
  });

  it('a non-lethal attack reports the defender\'s best block and the resulting life', () => {
    const s = buildPuzzleState(COMBAT({ bf: ['grizzly_bears', 'gray_ogre', 'hill_giant'] }, { life: 3, bf: ['wall_of_wood'] }));
    const r = resolveAttack(s, ['p-bf-0', 'p-bf-1']);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lethal).toBe(false);
    expect(r.worstCase.oppLifeAfter).toBe(1);
    expect(r.summary).toMatch(/^Wall of Wood blocks (Grizzly Bears|Gray Ogre)\. You deal 2\. They're at 1\.$/);
  });

  it('attacking with more creatures than they have blockers is lethal', () => {
    const s = buildPuzzleState(COMBAT({ bf: ['grizzly_bears', 'gray_ogre', 'hill_giant'] }, { life: 3, bf: ['wall_of_wood'] }));
    const r = resolveAttack(s, ['p-bf-0', 'p-bf-1', 'p-bf-2']);
    expect(r.ok && r.lethal).toBe(true);
    if (!r.ok) return;
    expect(r.outcomes).toBe(4);
  });

  it('no defenders means exactly one outcome', () => {
    const s = buildPuzzleState(COMBAT({ bf: ['grizzly_bears'] }, { life: 2, bf: [] }));
    const r = resolveAttack(s, ['p-bf-0']);
    expect(r.ok && r.outcomes).toBe(1);
  });

  it('refuses boards past the outcome cap', () => {
    const many = Array(6).fill('grizzly_bears');
    const s = buildPuzzleState(COMBAT({ bf: many }, { life: 20, bf: many }));
    const attackers = many.map((_, i) => `p-bf-${i}`);
    expect(7 ** 6).toBeGreaterThan(MAX_BLOCK_OUTCOMES);
    expect(() => resolveAttack(s, attackers)).toThrow(/LEARN_TOO_MANY_OUTCOMES/);
  });

  // --- gradeDeclaredAttack (L3b: best-defense grading for scenario mode) ------
  // Scenario mode cannot hand over an attacker list: the learner declares
  // attackers on the real duel screen, so grading has to read them back off the
  // board. These assert that reading them back reaches the same verdict as
  // resolveAttack, and that the live board survives the analysis untouched.

  const declared = (setup: PuzzleSetup, attackers: string[]) => {
    const d = declareAttackers(buildPuzzleState(setup), attackers);
    if (!d.ok) throw new Error(`declareAttackers refused: ${d.reason}`);
    return d.state;
  };

  it('grades a declared lethal attack read off the board', () => {
    const setup = COMBAT({ bf: ['air_elemental'] }, { life: 4, bf: ['wall_of_wood', 'scathe_zombies'] });
    const r = gradeDeclaredAttack(declared(setup, ['p-bf-0']));
    expect(r).not.toBeNull();
    expect(r!.ok && r!.lethal).toBe(true);
  });

  it('grades a declared losing attack as not lethal, with the best block named', () => {
    const setup = COMBAT({ bf: ['grizzly_bears', 'gray_ogre', 'hill_giant'] }, { life: 3, bf: ['wall_of_wood'] });
    const r = gradeDeclaredAttack(declared(setup, ['p-bf-0', 'p-bf-1']));
    expect(r).not.toBeNull();
    expect(r!.ok).toBe(true);
    if (!r!.ok) return;
    expect(r!.lethal).toBe(false);
    expect(r!.worstCase.oppLifeAfter).toBe(1);
    expect(r!.summary).toMatch(/^Wall of Wood blocks (Grizzly Bears|Gray Ogre)\. You deal 2\. They're at 1\.$/);
  });

  // The point of the port. checkGoal is a snapshot test: on a board sitting at
  // COMBAT_ATTACKERS it reports false whatever the attack is worth, so a
  // winning attack and a losing one are indistinguishable to it. Best-defense
  // grading separates them.
  it('separates a winning from a losing attack where checkGoal cannot', () => {
    const setup = COMBAT({ bf: ['grizzly_bears', 'gray_ogre', 'hill_giant'] }, { life: 3, bf: ['wall_of_wood'] });
    const losing = declared(setup, ['p-bf-0', 'p-bf-1']);
    const winning = declared(setup, ['p-bf-0', 'p-bf-1', 'p-bf-2']);

    expect(checkGoal(losing, { kind: 'OPPONENT_DEAD_THIS_TURN' })).toBe(false);
    expect(checkGoal(winning, { kind: 'OPPONENT_DEAD_THIS_TURN' })).toBe(false);

    expect(gradeDeclaredAttack(losing)!.ok && gradeDeclaredAttack(losing)!.lethal).toBe(false);
    expect(gradeDeclaredAttack(winning)!.ok && gradeDeclaredAttack(winning)!.lethal).toBe(true);
  });

  it('agrees with resolveAttack on the same board and attackers', () => {
    const cases: Array<[PuzzleSetup, string[]]> = [
      [COMBAT({ bf: ['air_elemental', 'grizzly_bears'] }, { life: 4, bf: ['wall_of_wood', 'scathe_zombies'] }), ['p-bf-0']],
      [COMBAT({ bf: ['craw_wurm', 'savannah_lions', 'scryb_sprites'] }, { life: 3, bf: ['pearled_unicorn'] }), ['p-bf-1', 'p-bf-2']],
      [COMBAT({ bf: ['grizzly_bears', 'gray_ogre', 'hill_giant'] }, { life: 3, bf: ['wall_of_wood'] }), ['p-bf-0', 'p-bf-1', 'p-bf-2']],
      [COMBAT({ bf: ['grizzly_bears'] }, { life: 2, bf: [] }), ['p-bf-0']],
    ];
    for (const [setup, attackers] of cases) {
      const viaList = resolveAttack(buildPuzzleState(setup), attackers);
      const viaBoard = gradeDeclaredAttack(declared(setup, attackers));
      expect(viaBoard).not.toBeNull();
      expect(viaList.ok).toBe(viaBoard!.ok);
      if (viaList.ok && viaBoard!.ok) {
        expect(viaBoard!.lethal).toBe(viaList.lethal);
        expect(viaBoard!.outcomes).toBe(viaList.outcomes);
        expect(viaBoard!.summary).toBe(viaList.summary);
      }
    }
  });

  it('returns null when no attackers are declared', () => {
    const s = buildPuzzleState(COMBAT({ bf: ['grizzly_bears'] }, { life: 2, bf: [] }));
    expect(gradeDeclaredAttack(s)).toBeNull();
  });

  it('returns null once the board is past the blocker step', () => {
    const setup = COMBAT({ bf: ['grizzly_bears'] }, { life: 2, bf: [] });
    const resolved = resolveAttack(buildPuzzleState(setup), ['p-bf-0']);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(gradeDeclaredAttack(resolved.worstCase.finalState)).toBeNull();
  });

  // The analysis drives duelReducer over the board the learner is looking at.
  // If any of that leaked back, a Check press would corrupt the lesson.
  it('leaves the live board untouched', () => {
    const setup = COMBAT({ bf: ['grizzly_bears', 'gray_ogre'] }, { life: 3, bf: ['wall_of_wood'] });
    const live = declared(setup, ['p-bf-0', 'p-bf-1']);
    const before = JSON.stringify(live);
    const r = gradeDeclaredAttack(live);
    expect(r).not.toBeNull();
    expect(JSON.stringify(live)).toBe(before);
  });

  it('cardInfo returns display data and throws on unknown ids', () => {
    expect(cardInfo('hurloon_minotaur')).toMatchObject({ name: 'Hurloon Minotaur', cost: '1RR', type: 'Creature', power: 2, toughness: 3 });
    expect(() => cardInfo('not_a_card')).toThrow(/LEARN_UNKNOWN_CARD/);
  });

  it('checkGoal handles all three goal kinds', () => {
    const s = buildPuzzleState(MAIN({ bf: ['grizzly_bears'] }, { life: 0, bf: [] }));
    const withMana = { ...s, p: { ...s.p, mana: { ...s.p.mana, G: 1 } } };
    expect(checkGoal(withMana, { kind: 'MANA_IN_POOL', color: 'G', amount: 1 })).toBe(true);
    expect(checkGoal(s, { kind: 'MANA_IN_POOL', color: 'G', amount: 1 })).toBe(false);
    expect(checkGoal(s, { kind: 'CARD_ON_BATTLEFIELD', cardId: 'grizzly_bears' })).toBe(true);
    expect(checkGoal(s, { kind: 'OPPONENT_DEAD_THIS_TURN' })).toBe(true);
  });
});

describe('@learn-runner-tgt targeted casts and land colour choice', () => {
  const A: any = ['TAP_LAND', 'CAST_SPELL'];

  // LC-2. A dual land used to make produces[0] and nothing else.
  it('a dual land makes either colour it produces, and refuses one it does not', () => {
    const base = buildPuzzleState(MAIN({ bf: ['taiga'] }));
    const dflt = tryAction(base, { type: 'TAP_LAND', iid: 'p-bf-0' }, A);
    expect(dflt.ok && dflt.state.p.mana.R).toBe(1);

    const green = tryAction(base, { type: 'TAP_LAND', iid: 'p-bf-0', color: 'G' }, A);
    expect(green.ok && green.state.p.mana.G).toBe(1);
    expect(green.ok && green.state.p.mana.R).toBe(0);

    const white = tryAction(base, { type: 'TAP_LAND', iid: 'p-bf-0', color: 'W' }, A);
    expect(white.ok).toBe(false);
    if (!white.ok) expect(white.reason).toBe(MSG.wrongColor('Taiga', 'W'));
  });

  it('a basic land ignores a colour it already makes and still rejects a wrong one', () => {
    const base = buildPuzzleState(MAIN({ bf: ['forest'] }));
    const ok = tryAction(base, { type: 'TAP_LAND', iid: 'p-bf-0', color: 'G' }, A);
    expect(ok.ok && ok.state.p.mana.G).toBe(1);
    const bad = tryAction(base, { type: 'TAP_LAND', iid: 'p-bf-0', color: 'U' }, A);
    expect(bad.ok).toBe(false);
  });

  // LC-1. A targeted spell with no target used to be accepted, leave hand,
  // resolve, and change nothing at all.
  it('a targeted instant with no target is rejected rather than silently fizzling', () => {
    const base = buildPuzzleState(MAIN({ bf: ['mountain'], hand: ['lightning_bolt'] }, { life: 3, bf: [] }));
    const tapped = tryAction(base, { type: 'TAP_LAND', iid: 'p-bf-0' }, A);
    expect(tapped.ok).toBe(true);
    if (!tapped.ok) return;

    const noTgt = tryAction(tapped.state, { type: 'CAST_SPELL', iid: 'p-hand-0' }, A);
    expect(noTgt.ok).toBe(false);
    if (!noTgt.ok) expect(noTgt.reason).toBe(MSG.needsTarget('Lightning Bolt'));
  });

  it('a targeted instant aimed at the opponent deals its damage and can be lethal', () => {
    const base = buildPuzzleState(MAIN({ bf: ['mountain'], hand: ['lightning_bolt'] }, { life: 3, bf: [] }));
    const tapped = tryAction(base, { type: 'TAP_LAND', iid: 'p-bf-0' }, A);
    expect(tapped.ok).toBe(true);
    if (!tapped.ok) return;

    const cast = tryAction(tapped.state, { type: 'CAST_SPELL', iid: 'p-hand-0', tgt: 'o' }, A);
    expect(cast.ok).toBe(true);
    if (!cast.ok) return;
    expect(cast.state.o.life).toBe(0);
    expect(checkGoal(cast.state, { kind: 'OPPONENT_DEAD_THIS_TURN' })).toBe(true);
  });

  // The guard is scoped to instants and sorceries on purpose. A permanent whose
  // rules text says "target" is cast without one.
  it('a permanent whose text says "target" still casts with no target', () => {
    let s = buildPuzzleState(MAIN({ bf: ['plains', 'plains'], hand: ['circle_of_protection_red'] }));
    for (const i of [0, 1]) {
      const r = tryAction(s, { type: 'TAP_LAND', iid: `p-bf-${i}` }, A);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      s = r.state;
    }
    const cast = tryAction(s, { type: 'CAST_SPELL', iid: 'p-hand-0' }, A);
    expect(cast.ok).toBe(true);
    if (!cast.ok) return;
    expect(checkGoal(cast.state, { kind: 'CARD_ON_BATTLEFIELD', cardId: 'circle_of_protection_red' })).toBe(true);
  });
});
