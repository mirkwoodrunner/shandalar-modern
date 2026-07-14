// src/hooks/__tests__/ai-driver-blockers-gating.test.ts
//
// Defense-in-depth unit tests for AI decision behaviour during COMBAT_BLOCKERS
// when the AI ('o') is the active/attacking player.
//
// The real fix lives in useDuelController.ts (phase guard added at the hook
// level). These tests lock in that aiDecide itself stays inert in this scenario
// so future hook refactors cannot reintroduce the bug by relying on aiDecide
// to do its own gating.
//
// BLOCK-GATE-01: aiDecide returns no DECLARE_BLOCKER actions in COMBAT_BLOCKERS
//                when o is the active attacker and attackers[] is populated.
// BLOCK-GATE-02: aiDecide does not produce a block targeting o's own attacker
//                as both blocker and attackerId (the specific pathological case).

import { describe, it, expect } from 'vitest';
import { aiDecide } from '../../engine/AI.js';
import { makeState, makeCreature } from '../../engine/__tests__/_factory.js';
import { PHASE } from '../../engine/phases.js';

describe('@engine-ai-1 AI driver COMBAT_BLOCKERS gating', () => {
  function makeBlockersState() {
    const attacker = makeCreature('att-o-1', {
      controller: 'o',
      attacking: true,
      tapped: false,
      summoningSick: false,
      power: 3,
      toughness: 3,
    });
    const pCreature = makeCreature('def-p-1', {
      controller: 'p',
      attacking: false,
      tapped: false,
      summoningSick: false,
      power: 2,
      toughness: 2,
    });
    const s = {
      ...makeState({
        phase: PHASE.COMBAT_BLOCKERS,
        active: 'o',
        oBf: [attacker],
        pBf: [pCreature],
      }),
      attackers: ['att-o-1'],
    };
    return { s, attacker, pCreature };
  }

  it('BLOCK-GATE-01: aiDecide returns no DECLARE_BLOCKER actions when o is attacker in COMBAT_BLOCKERS', () => {
    const { s } = makeBlockersState();
    const actions = aiDecide(s);

    const blockActions = actions.filter((a: any) => a.type === 'DECLARE_BLOCKER');
    expect(blockActions).toHaveLength(0);
  });

  it('BLOCK-GATE-01: aiDecide returns only empty or pass-only plan (no CAST_SPELL, no ATTACK, no BLOCK)', () => {
    const { s } = makeBlockersState();
    const actions = aiDecide(s);

    const nonPassActions = actions.filter(
      (a: any) => a.type !== 'PASS_PRIORITY' && a.type !== 'RESOLVE_STACK'
    );
    expect(nonPassActions).toHaveLength(0);
  });

  it('BLOCK-GATE-02: aiDecide never emits DECLARE_BLOCKER targeting the attacker as both blocker and attacker', () => {
    // The pathological case: att-o-1 appearing as both blId and attId.
    const { s } = makeBlockersState();
    const actions = aiDecide(s);

    const selfBlock = actions.filter(
      (a: any) => a.type === 'DECLARE_BLOCKER' && a.blId === 'att-o-1' && a.attId === 'att-o-1'
    );
    expect(selfBlock).toHaveLength(0);

    // Also confirm no block with the attacker as blocker against any target.
    const attackerAsBlocker = actions.filter(
      (a: any) => a.type === 'DECLARE_BLOCKER' && a.blId === 'att-o-1'
    );
    expect(attackerAsBlocker).toHaveLength(0);
  });
});
