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
