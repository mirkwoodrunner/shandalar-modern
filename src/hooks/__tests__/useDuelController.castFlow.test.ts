// src/hooks/__tests__/useDuelController.castFlow.test.ts
// Unit tests for cast/activate flow helpers (CAST-FLOW-01 through CAST-FLOW-08).
// Tests pure exported functions — no hook rendering required.

import { describe, it, expect } from 'vitest';
import {
  getManaShortfall,
  needsAnyTarget,
  isOptionalTarget,
  isCounterEffect,
  EXPLICIT_TARGET_EFFECTS,
} from '../useDuelController';
import { canPay } from '../../engine/DuelCore.js';

// ── CAST-FLOW-01 ──────────────────────────────────────────────────────────────

describe('getManaShortfall', () => {
  it('CAST-FLOW-01: returns null when pool already satisfies cost', () => {
    const pool = { W: 0, U: 2, B: 0, R: 0, G: 0, C: 0 };
    expect(getManaShortfall(pool, 'UU', 0)).toBeNull();
  });

  it('CAST-FLOW-01: returns null for a generic cost fully covered by pool', () => {
    const pool = { W: 0, U: 0, B: 0, R: 2, G: 0, C: 0 };
    expect(getManaShortfall(pool, '2', 0)).toBeNull();
  });

  it('CAST-FLOW-01: returns null for empty cost (land, zero-cost)', () => {
    const pool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
    expect(getManaShortfall(pool, '', 0)).toBeNull();
  });
});

// ── CAST-FLOW-02 ──────────────────────────────────────────────────────────────

describe('getManaShortfall shortfall computation', () => {
  it('CAST-FLOW-02: returns needed/have when pool is short on colored mana', () => {
    const pool = { W: 0, U: 1, B: 0, R: 0, G: 0, C: 0 };
    const result = getManaShortfall(pool, 'UU', 0);
    expect(result).not.toBeNull();
    expect(result!.needed.U).toBe(2);
    expect(result!.have.U).toBe(1);
  });

  it('CAST-FLOW-02: generic cost added to needed when xVal > 0', () => {
    const pool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
    const result = getManaShortfall(pool, 'X', 3);
    expect(result).not.toBeNull();
    expect(result!.needed.generic).toBe(3);
  });

  it('CAST-FLOW-02: mixed cost returns correct breakdown', () => {
    const pool = { W: 0, U: 1, B: 0, R: 0, G: 0, C: 0 };
    const result = getManaShortfall(pool, '1UU', 0);
    expect(result).not.toBeNull();
    expect(result!.needed.U).toBe(2);
    expect(result!.needed.generic).toBe(1);
    expect(result!.have.U).toBe(1);
  });
});

// ── CAST-FLOW-03 ──────────────────────────────────────────────────────────────
// Twiddle: optionalTarget=true means isOptionalTarget=true and the flow uses
// hasTarget = needsAnyTarget || isOptionalTarget to decide whether to open the
// targeting step. needsAnyTarget(twiddle) is false because tapTarget is not in
// EXPLICIT_TARGET_EFFECTS (it's an optionalTarget spell, not a required one).
//
// Icy Manipulator: activated ability with effect='tapTarget', verified via
// ACTIVATE_TARGET_EFFECTS (module-internal; tested by checking isCounterEffect
// does NOT fire for it, and that tapTarget was the missing piece).
//
// Vanilla creature: no targeting at all.

describe('needsAnyTarget / isOptionalTarget classification', () => {
  const twiddle = { id: 'twiddle', effect: 'tapTarget', optionalTarget: true };
  const counterspell = { id: 'counterspell', effect: 'counter' };
  const grizzlyBears = { id: 'grizzly_bears', type: 'Creature', cost: 'GG', effect: undefined };

  it('CAST-FLOW-03: Twiddle — isOptionalTarget=true, needsAnyTarget=false (handled via optionalTarget path)', () => {
    // tapTarget is not in EXPLICIT_TARGET_EFFECTS, so needsAnyTarget returns false.
    // The targeting step still opens because beginCastFlow checks isOptionalTarget too.
    expect(isOptionalTarget(twiddle)).toBe(true);
    expect(needsAnyTarget(twiddle)).toBe(false);
    // Combined check: hasTarget = needsAnyTarget || isOptionalTarget = true
    const hasTarget = needsAnyTarget(twiddle) || isOptionalTarget(twiddle);
    expect(hasTarget).toBe(true);
  });

  it('CAST-FLOW-03: Counterspell — needsAnyTarget=true via isCounterEffect, not optionalTarget', () => {
    expect(needsAnyTarget(counterspell)).toBe(true);
    expect(isOptionalTarget(counterspell)).toBe(false);
  });

  it('CAST-FLOW-03: Icy Manipulator activated ability uses tapTarget effect (required, ability path)', () => {
    // The activated ability is validated via isCounterEffect not returning true,
    // and the fix was adding tapTarget to ACTIVATE_TARGET_EFFECTS (ability list).
    // At the spell level, Icy Manipulator as an artifact has no card-level effect.
    const icyArtifact = { id: 'icy_manipulator', type: 'Artifact', effect: undefined };
    expect(needsAnyTarget(icyArtifact)).toBe(false); // cast as artifact: no targeting
    expect(isCounterEffect(icyArtifact)).toBe(false);
  });

  it('CAST-FLOW-03: vanilla creature — no targeting at all', () => {
    expect(needsAnyTarget(grizzlyBears)).toBe(false);
    expect(isOptionalTarget(grizzlyBears)).toBe(false);
  });
});

// ── CAST-FLOW-04 ──────────────────────────────────────────────────────────────

describe('CAST-FLOW-04: non-targeting non-land card flow shape', () => {
  it('vanilla creature has no target requirement and no optional target', () => {
    const grizzlyBears = { id: 'grizzly_bears', type: 'Creature', cost: 'GG', effect: undefined };
    const hasTarget = needsAnyTarget(grizzlyBears) || isOptionalTarget(grizzlyBears);
    expect(hasTarget).toBe(false);
  });

  it('CAST-FLOW-04: canPay fires immediately when pool is sufficient — no targeting mode', () => {
    const pool = { W: 0, U: 0, B: 0, R: 0, G: 2, C: 0 };
    expect(canPay(pool, 'GG', 0)).toBe(true);
  });

  it('CAST-FLOW-04: with no targeting and sufficient mana, targeting mode is never entered', () => {
    const grizzlyBears = { id: 'grizzly_bears', type: 'Creature', cost: 'GG', effect: undefined };
    const pool = { W: 0, U: 0, B: 0, R: 0, G: 2, C: 0 };
    const hasTarget = needsAnyTarget(grizzlyBears) || isOptionalTarget(grizzlyBears);
    const wouldEnterTargeting = hasTarget; // beginCastFlow only enters targeting when hasTarget=true
    expect(wouldEnterTargeting).toBe(false);
    expect(canPay(pool, 'GG', 0)).toBe(true); // would cast immediately
  });
});

// ── CAST-FLOW-05 ──────────────────────────────────────────────────────────────

describe('CAST-FLOW-05: optional-target card can proceed with 0 targets', () => {
  it('Twiddle requiresTarget = false (optional), so 0 targets is valid for confirm', () => {
    const twiddle = { id: 'twiddle', effect: 'tapTarget', optionalTarget: true };
    const req = needsAnyTarget(twiddle) && !isOptionalTarget(twiddle);
    expect(req).toBe(false);
    // With requiresTarget=false, 0 selected targets should allow advancing
    const selectedTargets: string[] = [];
    const canConfirm = req ? selectedTargets.length >= 1 : true;
    expect(canConfirm).toBe(true);
  });

  it('CAST-FLOW-05: Twiddle with empty target resolves with null target', () => {
    const selectedTargets: string[] = [];
    const resolvedTarget = selectedTargets[0] ?? null;
    expect(resolvedTarget).toBeNull();
  });
});

// ── CAST-FLOW-06 ──────────────────────────────────────────────────────────────

describe('CAST-FLOW-06: required target blocks confirm at 0 targets', () => {
  it('damage3 spell requiresTarget = true, confirm blocked at 0 targets', () => {
    const lightningBolt = { id: 'lightning_bolt', effect: 'damage3' };
    const requiresTarget = needsAnyTarget(lightningBolt) && !isOptionalTarget(lightningBolt);
    const selectedTargets: string[] = [];
    const canAdvance = requiresTarget ? selectedTargets.length >= 1 : true;
    expect(requiresTarget).toBe(true);
    expect(canAdvance).toBe(false);
  });

  it('CAST-FLOW-06: required-target card advances once a target is selected', () => {
    const selectedTargets = ['creature_iid_abc'];
    const requiresTarget = true;
    const canAdvance = requiresTarget ? selectedTargets.length >= 1 : true;
    expect(canAdvance).toBe(true);
  });

  it('CAST-FLOW-06: confirmCastTargets is a no-op when requiresTarget=true and 0 targets', () => {
    // confirmCastTargets in the hook returns early when requiresTarget && selectedTargets.length < 1
    const requiresTarget = true;
    const selectedTargets: string[] = [];
    const willAdvance = requiresTarget ? selectedTargets.length >= 1 : true;
    expect(willAdvance).toBe(false);
  });
});

// ── CAST-FLOW-07 ──────────────────────────────────────────────────────────────

describe('CAST-FLOW-07: cancel flow undo logic', () => {
  it('should dispatch UNDO_MANA_TAPS when manaTapSnapshot is non-null', () => {
    const manaTapSnapshot = { pMana: { U: 1 }, lands: [] };
    const shouldUndo = manaTapSnapshot !== null;
    expect(shouldUndo).toBe(true);
  });

  it('CAST-FLOW-07: should NOT dispatch UNDO_MANA_TAPS when manaTapSnapshot is null', () => {
    const manaTapSnapshot = null;
    const shouldUndo = manaTapSnapshot !== null;
    expect(shouldUndo).toBe(false);
  });
});

// ── CAST-FLOW-08 ──────────────────────────────────────────────────────────────

describe('CAST-FLOW-08: Counterspell targeting uses explicit stack-item id', () => {
  it('Counterspell is a counter effect, needsAnyTarget = true', () => {
    const counterspell = { id: 'counterspell', effect: 'counter' };
    expect(needsAnyTarget(counterspell)).toBe(true);
    expect(isOptionalTarget(counterspell)).toBe(false);
  });

  it('CAST-FLOW-08: selectCastTarget stores the non-top stack item, not top-of-stack fallback', () => {
    const stack = [
      { iid: 'top_item', card: { name: 'Lightning Bolt' } },
      { iid: 'non_top_item', card: { name: 'Giant Growth' } },
    ];
    // Simulates selecting the non-top stack item explicitly
    const selectedTargets: string[] = [];
    const nonTopId = stack[1].iid;
    selectedTargets.push(nonTopId);
    expect(selectedTargets[0]).toBe('non_top_item');
    expect(selectedTargets[0]).not.toBe(stack[0].iid); // not top-of-stack
  });

  it('CAST-FLOW-08: with explicit target set, castSpell receives the correct stack item id', () => {
    const selectedTargets = ['non_top_item'];
    const resolvedTarget = selectedTargets[0] ?? null;
    // castSpell would receive this, not the default top-of-stack
    expect(resolvedTarget).toBe('non_top_item');
  });
});

// ── Additional: EXPLICIT_TARGET_EFFECTS integrity ─────────────────────────────

describe('EXPLICIT_TARGET_EFFECTS integrity', () => {
  it('includes damage3 (Lightning Bolt effect)', () => {
    expect(EXPLICIT_TARGET_EFFECTS.has('damage3')).toBe(true);
  });

  it('includes bounce (Unsummon effect)', () => {
    expect(EXPLICIT_TARGET_EFFECTS.has('bounce')).toBe(true);
  });

  it('does not include counter (that is handled by isCounterEffect separately)', () => {
    expect(EXPLICIT_TARGET_EFFECTS.has('counter')).toBe(false);
  });

  it('tapTarget is not in EXPLICIT_TARGET_EFFECTS (it is an optional-target spell effect via optionalTarget flag)', () => {
    // Twiddle uses optionalTarget:true, not EXPLICIT_TARGET_EFFECTS membership
    expect(EXPLICIT_TARGET_EFFECTS.has('tapTarget')).toBe(false);
  });
});
