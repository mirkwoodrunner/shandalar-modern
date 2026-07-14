// src/engine/__tests__/lava-axe-psionic-blast.test.js
//
// Regression tests for:
//   - Lava Axe (damage5) crashing when given a creature target iid
//   - Psionic Blast (psionicBlast) missing creature-damage branch
//
// LAVA-AXE-01: player target -- opponent life drops by 5
// LAVA-AXE-02: creature target fallback -- no crash, falls back to opponent damage
// PSIONIC-01:  player target -- opponent takes 4, caster takes 2
// PSIONIC-02:  creature target non-lethal -- damage marked on creature, caster takes 2
// PSIONIC-03:  creature target lethal -- creature removed to graveyard, caster takes 2
// PSIONIC-04:  creature target lethal (exact) -- creature with toughness == damage dies

import { describe, it, expect } from 'vitest';
import { resolveEff } from '../DuelCore.js';
import { makeState, makeCreature } from './_factory.js';
import { PHASE } from '../phases.js';

// Build a minimal stack item for resolveEff.
function stackItem(card, caster, targets = [], xVal = 1) {
  return { id: 'test-stack-id', card, caster, targets, xVal };
}

// ── Lava Axe (damage5) ────────────────────────────────────────────────────────

const lavaAxeCard = { effect: 'damage5', name: 'Lava Axe', id: 'lava_axe', type: 'Sorcery' };

describe('@engine-combat-1 Lava Axe (damage5) targeting', () => {
  it('LAVA-AXE-01: player target -- opponent life drops by 5', () => {
    const s = makeState({ phase: PHASE.MAIN_1, active: 'p' });
    const ns = resolveEff(s, stackItem(lavaAxeCard, 'p', ['o']));
    expect(ns.o.life).toBe(15);
    expect(ns.p.life).toBe(20);
  });

  it('LAVA-AXE-02: creature target fallback -- no crash, falls back to opponent damage', () => {
    const creature = makeCreature('c-o-1', { controller: 'o', power: 2, toughness: 2 });
    const s = makeState({ oBf: [creature], phase: PHASE.MAIN_1, active: 'p' });

    // This simulates a targeting-UI bug slipping through. Must not throw.
    let ns;
    expect(() => {
      ns = resolveEff(s, stackItem(lavaAxeCard, 'p', ['c-o-1']));
    }).not.toThrow();

    // Defensive fallback: invalid tgt is not 'p' or 'o', so opp takes damage.
    expect(ns.o.life).toBe(15);
    // Creature must be unaffected by damage5 (no creature damage branch for damage5).
    const creatureAfter = ns.o.bf.find(c => c.iid === 'c-o-1');
    expect(creatureAfter).toBeDefined();
    expect(creatureAfter.damage).toBe(0);
  });
});

// ── Psionic Blast (psionicBlast) ──────────────────────────────────────────────

const psionicCard = { effect: 'psionicBlast', name: 'Psionic Blast', id: 'psionic_blast', type: 'Instant' };

describe('@engine-combat-1 Psionic Blast (psionicBlast) targeting', () => {
  it('PSIONIC-01: player target -- opponent takes 4, caster takes 2', () => {
    const s = makeState({ phase: PHASE.MAIN_1, active: 'p' });
    const ns = resolveEff(s, stackItem(psionicCard, 'p', ['o']));
    expect(ns.o.life).toBe(16);
    expect(ns.p.life).toBe(18);
  });

  it('PSIONIC-02: creature target non-lethal -- damage marked on creature, caster takes 2', () => {
    const creature = makeCreature('c-o-1', { controller: 'o', power: 2, toughness: 6 });
    const s = makeState({ oBf: [creature], phase: PHASE.MAIN_1, active: 'p' });
    const ns = resolveEff(s, stackItem(psionicCard, 'p', ['c-o-1']));

    const creatureAfter = ns.o.bf.find(c => c.iid === 'c-o-1');
    expect(creatureAfter, 'creature must still be on battlefield (non-lethal)').toBeDefined();
    expect(creatureAfter.damage).toBe(4);
    expect(ns.o.life).toBe(20);
    expect(ns.p.life).toBe(18);
  });

  it('PSIONIC-03: creature target lethal -- creature goes to graveyard, caster takes 2', () => {
    const creature = makeCreature('c-o-lethal', { controller: 'o', power: 2, toughness: 4 });
    const s = makeState({ oBf: [creature], phase: PHASE.MAIN_1, active: 'p' });
    const ns = resolveEff(s, stackItem(psionicCard, 'p', ['c-o-lethal']));

    const stillOnBf = ns.o.bf.some(c => c.iid === 'c-o-lethal');
    expect(stillOnBf, 'lethal-damaged creature must be removed from battlefield').toBe(false);

    const inGy = ns.o.gy.some(c => c.iid === 'c-o-lethal');
    expect(inGy, 'lethal-damaged creature must be in graveyard').toBe(true);

    expect(ns.o.life).toBe(20);
    expect(ns.p.life).toBe(18);
  });

  it('PSIONIC-04: creature target exact lethal (toughness == 4) -- creature dies', () => {
    const creature = makeCreature('c-o-exact', { controller: 'o', power: 3, toughness: 4 });
    const s = makeState({ oBf: [creature], phase: PHASE.MAIN_1, active: 'p' });
    const ns = resolveEff(s, stackItem(psionicCard, 'p', ['c-o-exact']));

    expect(ns.o.bf.some(c => c.iid === 'c-o-exact')).toBe(false);
    expect(ns.o.gy.some(c => c.iid === 'c-o-exact')).toBe(true);
    expect(ns.p.life).toBe(18);
  });

  it('PSIONIC-05: creature target below lethal -- creature survives, caster still takes 2', () => {
    const creature = makeCreature('c-o-tough', { controller: 'o', power: 2, toughness: 8 });
    const s = makeState({ oBf: [creature], phase: PHASE.MAIN_1, active: 'p' });
    const ns = resolveEff(s, stackItem(psionicCard, 'p', ['c-o-tough']));

    const creatureAfter = ns.o.bf.find(c => c.iid === 'c-o-tough');
    expect(creatureAfter).toBeDefined();
    expect(creatureAfter.damage).toBe(4);
    expect(ns.p.life).toBe(18);
    expect(ns.o.life).toBe(20);
  });
});
