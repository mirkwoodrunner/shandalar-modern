// tests/scenarios/creature-damage-centralization.test.js
// Creature Damage Centralization + Jade Monolith + Personal Incarnation.
// Validates: hurtCreature()/consumeCreatureDamageShields() as the new creature-damage
// choke point, migration parity for a representative sample of the 24 raw sites that
// moved onto it, the shield-check insertion at all 9 dmgWithShield() call sites
// (5 non-combat + 4 combat), and the two cards this phase unblocks.
// See docs/ENGINE_CONTRACT_SPEC.md -- Creature Damage Shields.

import { readFileSync } from 'node:fs';
import { describe, it, expect, vi } from 'vitest';
import {
  duelReducer, resolveEff, hurtCreature, consumeCreatureDamageShields,
} from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { isCreatureOnlyTarget } from '../../src/hooks/useDuelController';
import {
  makeState, makeCreature, makeLand, makeStackItem,
} from '../../src/engine/__tests__/_factory.js';

function withShields(base, creatureDamageShields) {
  return { ...base, turnState: { ...base.turnState, creatureDamageShields } };
}

// ─── Infrastructure (CDMG-01 .. CDMG-12) ─────────────────────────────────────

describe('@engine Scenario: hurtCreature -- basic behavior', () => {
  it('CDMG-01: applies full damage and runs checkDeath when no shields are present', () => {
    const cre = makeCreature('c1', { toughness: 2, damage: 0, controller: 'p' });
    const state = makeState({ pBf: [cre] });
    const s1 = hurtCreature(state, 'c1', 2, 'Test Source', { sourceIid: 'src-1', sourceType: 'creature' });
    expect(s1.p.bf.some(c => c.iid === 'c1')).toBe(false);
    expect(s1.p.gy.some(c => c.iid === 'c1')).toBe(true);
  });

  it('CDMG-02: target not found logs an error and returns state unchanged', () => {
    const state = makeState({});
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const s1 = hurtCreature(state, 'nonexistent-iid', 3, 'Test Source', null);
    expect(s1).toBe(state);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('@engine Scenario: consumeCreatureDamageShields -- exact-source redirect (Jade Monolith)', () => {
  it('CDMG-03: a matching exact-source shield redirects the entire amount and is consumed', () => {
    const cre = makeCreature('c1', { toughness: 5, damage: 0, controller: 'p' });
    const base = makeState({ pBf: [cre] });
    const state = { ...base, o: { ...base.o, life: 20 }, ...{ turnState: { ...base.turnState, creatureDamageShields: { c1: [{ mode: 'redirect', chosenSourceIid: 'src-1', redirectToPlayer: 'o', shieldSourceIid: 'jm-1', shieldSourceName: 'Jade Monolith' }] } } } };
    const s1 = hurtCreature(state, 'c1', 4, 'Threat', { sourceIid: 'src-1', sourceType: 'creature' });
    expect(s1.p.bf.find(c => c.iid === 'c1').damage).toBe(0);
    expect(s1.o.life).toBe(16);
    expect(s1.turnState.creatureDamageShields.c1).toEqual([]);
  });

  it('CDMG-04: a non-matching exact-source shield is left untouched and full damage applies', () => {
    const cre = makeCreature('c1', { toughness: 5, damage: 0, controller: 'p' });
    const base = makeState({ pBf: [cre] });
    const state = withShields(base, { c1: [{ mode: 'redirect', chosenSourceIid: 'src-1', redirectToPlayer: 'o', shieldSourceIid: 'jm-1', shieldSourceName: 'Jade Monolith' }] });
    const s1 = hurtCreature(state, 'c1', 4, 'Other Threat', { sourceIid: 'src-2', sourceType: 'creature' });
    expect(s1.p.bf.find(c => c.iid === 'c1').damage).toBe(4);
    expect(s1.turnState.creatureDamageShields.c1).toHaveLength(1);
  });
});

describe('@engine Scenario: consumeCreatureDamageShields -- point redirect (Personal Incarnation)', () => {
  it('CDMG-05: a single point-redirect shield absorbs 1 point, remainder applies, shield consumed', () => {
    const cre = makeCreature('c1', { toughness: 10, damage: 0, controller: 'p' });
    const base = makeState({ pBf: [cre] });
    const state = withShields(base, { c1: [{ mode: 'redirectPoint', redirectToPlayer: 'p', shieldSourceIid: 'pi-1', shieldSourceName: 'Personal Incarnation' }] });
    const s1 = hurtCreature(state, 'c1', 5, 'Threat', { sourceIid: 'src-1', sourceType: 'creature' });
    expect(s1.p.bf.find(c => c.iid === 'c1').damage).toBe(4);
    expect(s1.p.life).toBe(19);
    expect(s1.turnState.creatureDamageShields.c1).toEqual([]);
  });

  it('CDMG-06: three stacked point-redirect shields absorb 3, remainder applies, all consumed', () => {
    const cre = makeCreature('c1', { toughness: 10, damage: 0, controller: 'p' });
    const base = makeState({ pBf: [cre] });
    const shields = [1, 2, 3].map(n => ({ mode: 'redirectPoint', redirectToPlayer: 'p', shieldSourceIid: 'pi-1', shieldSourceName: `Shield ${n}` }));
    const state = withShields(base, { c1: shields });
    const s1 = hurtCreature(state, 'c1', 5, 'Threat', { sourceIid: 'src-1', sourceType: 'creature' });
    expect(s1.p.bf.find(c => c.iid === 'c1').damage).toBe(2);
    expect(s1.p.life).toBe(17);
    expect(s1.turnState.creatureDamageShields.c1).toEqual([]);
  });

  it('CDMG-07: five stacked point-redirect shields against 2 damage -- only 2 consumed, 3 remain', () => {
    const cre = makeCreature('c1', { toughness: 10, damage: 0, controller: 'p' });
    const base = makeState({ pBf: [cre] });
    const shields = [1, 2, 3, 4, 5].map(n => ({ mode: 'redirectPoint', redirectToPlayer: 'p', shieldSourceIid: 'pi-1', shieldSourceName: `Shield ${n}` }));
    const state = withShields(base, { c1: shields });
    const s1 = hurtCreature(state, 'c1', 2, 'Threat', { sourceIid: 'src-1', sourceType: 'creature' });
    expect(s1.p.bf.find(c => c.iid === 'c1').damage).toBe(0);
    expect(s1.p.life).toBe(18);
    expect(s1.turnState.creatureDamageShields.c1).toHaveLength(3);
  });

  it('CDMG-08: exact-source and point-redirect shields both present -- exact-source wins, points untouched', () => {
    const cre = makeCreature('c1', { toughness: 10, damage: 0, controller: 'p' });
    const base = makeState({ pBf: [cre] });
    const state = withShields(base, {
      c1: [
        { mode: 'redirectPoint', redirectToPlayer: 'p', shieldSourceIid: 'pi-1', shieldSourceName: 'Personal Incarnation' },
        { mode: 'redirect', chosenSourceIid: 'src-1', redirectToPlayer: 'o', shieldSourceIid: 'jm-1', shieldSourceName: 'Jade Monolith' },
      ],
    });
    const s1 = hurtCreature(state, 'c1', 4, 'Threat', { sourceIid: 'src-1', sourceType: 'creature' });
    expect(s1.p.bf.find(c => c.iid === 'c1').damage).toBe(0);
    expect(s1.o.life).toBe(16);
    expect(s1.turnState.creatureDamageShields.c1).toHaveLength(1);
    expect(s1.turnState.creatureDamageShields.c1[0].mode).toBe('redirectPoint');
  });

  it('CDMG-09: shields are per-creature -- a shield on A does not affect damage to B', () => {
    const a = makeCreature('a1', { toughness: 10, damage: 0, controller: 'p' });
    const b = makeCreature('b1', { toughness: 10, damage: 0, controller: 'p' });
    const base = makeState({ pBf: [a, b] });
    const state = withShields(base, { a1: [{ mode: 'redirectPoint', redirectToPlayer: 'p', shieldSourceIid: 'pi-1', shieldSourceName: 'Personal Incarnation' }] });
    const s1 = hurtCreature(state, 'b1', 3, 'Threat', { sourceIid: 'src-1', sourceType: 'creature' });
    expect(s1.p.bf.find(c => c.iid === 'b1').damage).toBe(3);
    expect(s1.turnState.creatureDamageShields.a1).toHaveLength(1);
  });
});

describe('@engine Scenario: creature damage shields -- turn reset', () => {
  it('CDMG-10: CLEANUP clears creatureDamageShields alongside damageShields', () => {
    const cre = makeCreature('c1', { toughness: 10, damage: 0, controller: 'p' });
    const base = makeState({ phase: PHASE.END, active: 'p', pBf: [cre] });
    const state = withShields(base, { c1: [{ mode: 'redirectPoint', redirectToPlayer: 'p', shieldSourceIid: 'pi-1', shieldSourceName: 'Personal Incarnation' }] });
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // END -> CLEANUP
    expect(s1.phase).toBe(PHASE.CLEANUP);
    expect(s1.turnState.creatureDamageShields).toEqual({});
  });
});

describe('@engine Scenario: consumeCreatureDamageShields -- unit-level no-op', () => {
  it('CDMG-11: no entries for the target is a no-op; remainingAmt === amt', () => {
    const state = makeState({});
    const { state: s1, remainingAmt } = consumeCreatureDamageShields(state, 'nonexistent', 5, { sourceIid: 'src-1' });
    expect(remainingAmt).toBe(5);
    expect(s1).toBe(state);
  });
});

describe('@engine Scenario: creature damage centralization -- migration tripwire', () => {
  it('CDMG-12: exactly 3 raw `damage: c.damage + N` sites remain after migration (2 inside dmgWithShield\'s own definition, 1 inside hurt()\'s untouched player-to-creature redirect at the former line 408 -- explicitly excluded from migration per spec)', () => {
    const src = readFileSync(new URL('../../src/engine/DuelCore.js', import.meta.url), 'utf8');
    const matches = src.match(/damage: c\.damage ?\+/g) || [];
    expect(matches).toHaveLength(3);
  });
});

// ─── Migration parity (CDMG-P01 .. CDMG-P08) ─────────────────────────────────

describe('@engine Scenario: migrated raw-site parity', () => {
  it('CDMG-P01: damage2 (simple if/else inline mutation, same trio pattern as ping/damage1) applies identical damage and dlog text', () => {
    const src = { id: 'shock', name: 'Shock', effect: 'damage2', iid: 'shock-1' };
    const tgt = makeCreature('tgt-1', { toughness: 5, controller: 'o' });
    const state = makeState({ oBf: [tgt] });
    const item = makeStackItem(src, 'p', ['tgt-1'], 1);
    const s1 = resolveEff(state, item);
    expect(s1.o.bf.find(c => c.iid === 'tgt-1').damage).toBe(2);
  });

  it('CDMG-P02: inferno6 (loop-based multi-creature mutation) deals 6 to every creature and each player', () => {
    const c1 = makeCreature('c1', { toughness: 10, controller: 'p' });
    const c2 = makeCreature('c2', { toughness: 10, controller: 'o' });
    const src = { id: 'inferno', name: 'Inferno', effect: 'inferno6', iid: 'inf-1' };
    const base = makeState({ pBf: [c1], oBf: [c2] });
    const state = { ...base, p: { ...base.p, life: 20 }, o: { ...base.o, life: 20 } };
    const item = makeStackItem(src, 'p', [], 1);
    const s1 = resolveEff(state, item);
    expect(s1.p.bf.find(c => c.iid === 'c1').damage).toBe(6);
    expect(s1.o.bf.find(c => c.iid === 'c2').damage).toBe(6);
    expect(s1.p.life).toBe(14);
    expect(s1.o.life).toBe(14);
  });

  it('CDMG-P03: drainLife (xVal-driven variable-amount site) applies xVal damage and gains the caster xVal life', () => {
    const tgt = makeCreature('tgt-1', { toughness: 10, controller: 'o' });
    const src = { id: 'drain_life', name: 'Drain Life', effect: 'drainLife', iid: 'dl-1' };
    const base = makeState({ oBf: [tgt] });
    const state = { ...base, p: { ...base.p, life: 20 } };
    const item = makeStackItem(src, 'p', ['tgt-1'], 4);
    const s1 = resolveEff(state, item);
    expect(s1.o.bf.find(c => c.iid === 'tgt-1').damage).toBe(4);
    expect(s1.p.life).toBe(24);
  });

  it('CDMG-P04: psionicEntity (named-creature-conditional self-damage) deals 2 to target and 3 to itself', () => {
    const pe = makeCreature('pe-1', { id: 'psionic_entity', name: 'Psionic Entity', toughness: 10, controller: 'p' });
    const tgt = makeCreature('tgt-1', { toughness: 10, controller: 'o' });
    const src = { id: 'psionic_entity_ability', name: 'Psionic Entity', effect: 'psionicEntity', iid: 'pe-1' };
    const base = makeState({ pBf: [pe], oBf: [tgt] });
    const item = makeStackItem(src, 'p', ['tgt-1'], 1);
    const s1 = resolveEff(base, item);
    expect(s1.o.bf.find(c => c.iid === 'tgt-1').damage).toBe(2);
    expect(s1.p.bf.find(c => c.iid === 'pe-1').damage).toBe(3);
  });

  it('CDMG-P05: cuombajjWitches (caster-side-targeting cwOppTgt site) damages the caster\'s own highest-toughness creature', () => {
    const cw = makeCreature('cw-1', { id: 'cuombajj_witches', name: "Cuombajj Witches", toughness: 10, controller: 'p' });
    const ownCre = makeCreature('own-1', { toughness: 11, controller: 'p' }); // strictly highest effective toughness, unambiguously chosen
    const tgt = makeCreature('tgt-1', { toughness: 10, controller: 'o' });
    const src = { id: 'cuombajj_witches_ability', name: "Cuombajj Witches", effect: 'cuombajjWitches', iid: 'cw-1' };
    const base = makeState({ pBf: [cw, ownCre], oBf: [tgt] });
    const item = makeStackItem(src, 'p', ['tgt-1'], 1);
    const s1 = resolveEff(base, item);
    expect(s1.o.bf.find(c => c.iid === 'tgt-1').damage).toBe(1);
    expect(s1.p.bf.find(c => c.iid === 'own-1').damage).toBe(1);
  });

  it('CDMG-P06: fightTargets (paired site -- two creatures trade damage simultaneously) applies both instances correctly', () => {
    const f1 = makeCreature('f1', { power: 3, toughness: 10, controller: 'p' });
    const f2 = makeCreature('f2', { power: 2, toughness: 10, controller: 'o' });
    const src = { id: 'fight_spell', name: 'Fight Spell', effect: 'fightTargets', iid: 'fs-1' };
    const base = makeState({ pBf: [f1], oBf: [f2] });
    const item = makeStackItem(src, 'p', ['f1', 'f2'], 1);
    const s1 = resolveEff(base, item);
    expect(s1.p.bf.find(c => c.iid === 'f1').damage).toBe(2); // took f2's power
    expect(s1.o.bf.find(c => c.iid === 'f2').damage).toBe(3); // took f1's power
  });

  it('CDMG-P07: disintegrate (exileNextDeath wrapper) exiles rather than destroys when the damage is lethal', () => {
    const tgt = makeCreature('tgt-1', { toughness: 3, controller: 'o' });
    const src = { id: 'disintegrate', name: 'Disintegrate', effect: 'disintegrate', iid: 'dis-1' };
    const base = makeState({ oBf: [tgt] });
    const item = makeStackItem(src, 'p', ['tgt-1'], 5);
    const s1 = resolveEff(base, item);
    expect(s1.o.bf.some(c => c.iid === 'tgt-1')).toBe(false);
    expect(s1.o.gy.some(c => c.iid === 'tgt-1')).toBe(false); // exiled, not in gy
    expect(s1.o.exile.some(c => c.iid === 'tgt-1')).toBe(true);
    expect(s1.exileNextDeath).toBe(false); // flag reset afterward
  });

  it('CDMG-P08: desertPing (ACTIVATE_ABILITY-embedded site outside resolveEff) deals 1 damage to an attacking creature', () => {
    const desert = makeLand('desert-1', { id: 'desert', name: 'Desert', subtype: 'Desert', produces: [], controller: 'p', tapped: false, activatedAbilities: [{ id: 'desert_damage', cost: { tap: true }, effect: 'desertPing' }] });
    const attacker = makeCreature('att-1', { toughness: 10, controller: 'o' });
    const base = makeState({ phase: PHASE.COMBAT_END, active: 'o', pBf: [desert], oBf: [attacker] });
    const state = { ...base, attackers: ['att-1'] };
    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'desert-1', tgt: 'att-1', abilityId: 'desert_damage' });
    expect(s1.o.bf.find(c => c.iid === 'att-1').damage).toBe(1);
    expect(s1.p.bf.find(c => c.iid === 'desert-1').tapped).toBe(true);
  });
});

// ─── dmgWithShield insertion sites (CDMG-S01 .. CDMG-S09) ────────────────────

describe('@engine Scenario: dmgWithShield sites -- non-combat', () => {
  it('CDMG-S01: Tracker\'s damage to the target creature is reduced by a creature-damage shield before the flat damageShield check', () => {
    const tracker = makeCreature('tr-1', { id: 'tracker', name: 'Tracker', power: 3, toughness: 3, controller: 'p' });
    const tgt = makeCreature('tgt-1', { power: 2, toughness: 10, controller: 'o', damageShield: 1 });
    const base = makeState({ pBf: [tracker], oBf: [tgt] });
    const state = withShields({ ...base, o: { ...base.o, life: 20 } }, { 'tgt-1': [{ mode: 'redirectPoint', redirectToPlayer: 'o', shieldSourceIid: 'pi-1', shieldSourceName: 'Personal Incarnation' }] });
    const item = makeStackItem({ ...tracker, effect: 'trackerDamageExchange' }, 'p', ['tgt-1'], 1);
    const s1 = resolveEff(state, item);
    const tgtAfter = s1.o.bf.find(c => c.iid === 'tgt-1');
    expect(tgtAfter.damage).toBe(1); // 3 total -1 (creature shield) -1 (flat damageShield) = 1
    expect(tgtAfter.damageShield).toBe(0);
    expect(s1.o.life).toBe(19);
  });

  it('CDMG-S02: Tracker\'s own return damage is reduced by a creature-damage shield on Tracker itself', () => {
    const tracker = makeCreature('tr-1', { id: 'tracker', name: 'Tracker', power: 1, toughness: 5, controller: 'p', damageShield: 1 });
    const tgt = makeCreature('tgt-1', { power: 4, toughness: 10, controller: 'o' });
    const base = makeState({ pBf: [tracker], oBf: [tgt] });
    const state = withShields({ ...base, p: { ...base.p, life: 20 } }, { 'tr-1': [{ mode: 'redirectPoint', redirectToPlayer: 'p', shieldSourceIid: 'pi-1', shieldSourceName: 'Personal Incarnation' }] });
    const item = makeStackItem({ ...tracker, effect: 'trackerDamageExchange' }, 'p', ['tgt-1'], 1);
    const s1 = resolveEff(state, item);
    const trAfter = s1.p.bf.find(c => c.iid === 'tr-1');
    expect(trAfter.damage).toBe(2); // 4 total -1 (creature shield) -1 (flat damageShield) = 2
    expect(trAfter.damageShield).toBe(0);
    expect(s1.p.life).toBe(19);
  });

  it('CDMG-S03: Winter Blast\'s 2 damage to a tapped flying creature is reduced by a creature-damage shield', () => {
    const flier = makeCreature('fl-1', { controller: 'o', keywords: ['FLYING'], tapped: false, toughness: 10 });
    const base = makeState({ oBf: [flier] });
    const state = withShields({ ...base, o: { ...base.o, life: 20 } }, { 'fl-1': [{ mode: 'redirectPoint', redirectToPlayer: 'o', shieldSourceIid: 'pi-1', shieldSourceName: 'Personal Incarnation' }] });
    const item = makeStackItem({ id: 'winter_blast', name: 'Winter Blast', effect: 'winterBlastTapX' }, 'p', [], 1);
    const s1 = resolveEff(state, item);
    const flAfter = s1.o.bf.find(c => c.iid === 'fl-1');
    expect(flAfter.tapped).toBe(true);
    expect(flAfter.damage).toBe(1);
    expect(s1.o.life).toBe(19);
  });

  it('CDMG-S04: Banshee\'s half-X damage to the targeted creature is reduced by a creature-damage shield', () => {
    const banshee = makeCreature('bn-1', { id: 'banshee', name: 'Banshee', controller: 'p' });
    const tgt = makeCreature('tgt-1', { controller: 'o', toughness: 10 });
    const base = makeState({ pBf: [banshee], oBf: [tgt] });
    const state = withShields({ ...base, p: { ...base.p, life: 20 }, o: { ...base.o, life: 20 } }, { 'tgt-1': [{ mode: 'redirectPoint', redirectToPlayer: 'o', shieldSourceIid: 'pi-1', shieldSourceName: 'Personal Incarnation' }] });
    const item = makeStackItem({ id: 'banshee_ability', name: 'Banshee', effect: 'bansheeDrain', iid: 'bn-1' }, 'p', ['tgt-1'], 5);
    const s1 = resolveEff(state, item);
    const tgtAfter = s1.o.bf.find(c => c.iid === 'tgt-1');
    expect(tgtAfter.damage).toBe(1); // down=2, 1 redirected, 1 marked
    expect(s1.o.life).toBe(19);
    expect(s1.p.life).toBe(17); // 20 - up(3)
  });

  it('CDMG-S05: Volcanic Eruption\'s per-creature damage is reduced by a creature-damage shield on one creature, unaffected on another', () => {
    const mtn = makeLand('mtn-1', { id: 'mountain', name: 'Mountain', subtype: 'Mountain', controller: 'p' });
    const c1 = makeCreature('c1', { controller: 'p', toughness: 10 });
    const c2 = makeCreature('c2', { controller: 'o', toughness: 10 });
    const base = makeState({ pBf: [mtn, c1], oBf: [c2] });
    const state = withShields({ ...base, p: { ...base.p, life: 20 }, o: { ...base.o, life: 20 } }, { c1: [{ mode: 'redirectPoint', redirectToPlayer: 'p', shieldSourceIid: 'pi-1', shieldSourceName: 'Personal Incarnation' }] });
    const item = makeStackItem({ id: 'volcanic_eruption', name: 'Volcanic Eruption', effect: 'volcanicEruption' }, 'p', ['mtn-1'], 1);
    const s1 = resolveEff(state, item);
    expect(s1.p.bf.find(c => c.iid === 'c1').damage).toBe(0); // 1 redirected, fully covered
    expect(s1.o.bf.find(c => c.iid === 'c2').damage).toBe(1); // unaffected
    expect(s1.p.life).toBe(18); // 20 - 1 (spell hits p) - 1 (redirected from c1's shield)
    expect(s1.o.life).toBe(19); // 20 - 1 (spell hits o)
  });
});

describe('@engine Scenario: dmgWithShield sites -- combat (regular and first-strike)', () => {
  it('CDMG-S06: regular-pass attacker damage to the blocker is reduced by a creature-damage shield on the blocker; the counter-hit on the attacker is unaffected', () => {
    const attacker = makeCreature('att-1', { power: 3, toughness: 5, controller: 'o' });
    const blocker = makeCreature('bl-1', { power: 2, toughness: 10, controller: 'p' });
    const base = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: [attacker], pBf: [blocker] });
    const state = withShields({ ...base, p: { ...base.p, life: 20 } }, { 'bl-1': [{ mode: 'redirectPoint', redirectToPlayer: 'p', shieldSourceIid: 'pi-1', shieldSourceName: 'Personal Incarnation' }] });

    const s1 = duelReducer(state, { type: 'DECLARE_ATTACKER', iid: 'att-1' });
    const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' });
    const s3 = duelReducer(s2, { type: 'ADVANCE_PHASE' });
    const s4 = duelReducer(s3, { type: 'DECLARE_BLOCKER', attId: 'att-1', blId: 'bl-1' });
    const s5 = duelReducer(s4, { type: 'ADVANCE_PHASE' });
    const s6 = duelReducer(s5, { type: 'ADVANCE_PHASE' });

    expect(s6.p.bf.find(c => c.iid === 'bl-1').damage).toBe(2); // 3 - 1 redirected
    expect(s6.p.life).toBe(19);
    expect(s6.o.bf.find(c => c.iid === 'att-1').damage).toBe(2); // blocker's power, unaffected
  });

  it('CDMG-S07: regular-pass blocker damage to the attacker is reduced by a creature-damage shield on the attacker; the counter-hit on the blocker is unaffected', () => {
    const attacker = makeCreature('att-1', { power: 2, toughness: 10, controller: 'o' });
    const blocker = makeCreature('bl-1', { power: 2, toughness: 10, controller: 'p' });
    const base = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: [attacker], pBf: [blocker] });
    const state = withShields({ ...base, o: { ...base.o, life: 20 } }, { 'att-1': [{ mode: 'redirectPoint', redirectToPlayer: 'o', shieldSourceIid: 'pi-1', shieldSourceName: 'Personal Incarnation' }] });

    const s1 = duelReducer(state, { type: 'DECLARE_ATTACKER', iid: 'att-1' });
    const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' });
    const s3 = duelReducer(s2, { type: 'ADVANCE_PHASE' });
    const s4 = duelReducer(s3, { type: 'DECLARE_BLOCKER', attId: 'att-1', blId: 'bl-1' });
    const s5 = duelReducer(s4, { type: 'ADVANCE_PHASE' });
    const s6 = duelReducer(s5, { type: 'ADVANCE_PHASE' });

    expect(s6.o.bf.find(c => c.iid === 'att-1').damage).toBe(1); // 2 - 1 redirected
    expect(s6.o.life).toBe(19);
    expect(s6.p.bf.find(c => c.iid === 'bl-1').damage).toBe(2); // attacker's power, unaffected
  });

  it('CDMG-S08: first-strike attacker damage to the blocker is reduced by a creature-damage shield on the blocker', () => {
    const attacker = makeCreature('att-1', { power: 3, toughness: 5, controller: 'o', keywords: ['FIRST_STRIKE'] });
    const blocker = makeCreature('bl-1', { power: 2, toughness: 10, controller: 'p' });
    const base = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: [attacker], pBf: [blocker] });
    const state = withShields({ ...base, p: { ...base.p, life: 20 } }, { 'bl-1': [{ mode: 'redirectPoint', redirectToPlayer: 'p', shieldSourceIid: 'pi-1', shieldSourceName: 'Personal Incarnation' }] });

    const s1 = duelReducer(state, { type: 'DECLARE_ATTACKER', iid: 'att-1' });
    const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' });
    const s3 = duelReducer(s2, { type: 'ADVANCE_PHASE' });
    const s4 = duelReducer(s3, { type: 'DECLARE_BLOCKER', attId: 'att-1', blId: 'bl-1' });
    const s5 = duelReducer(s4, { type: 'ADVANCE_PHASE' });
    const s6 = duelReducer(s5, { type: 'ADVANCE_PHASE' });

    expect(s6.p.bf.find(c => c.iid === 'bl-1').damage).toBe(2); // 3 - 1 redirected (first-strike pass)
    expect(s6.p.life).toBe(19);
    expect(s6.o.bf.find(c => c.iid === 'att-1').damage).toBe(2); // blocker survives, deals its power in the regular pass, unaffected
  });

  it('CDMG-S09: first-strike blocker damage to the attacker is reduced by a creature-damage shield on the attacker', () => {
    const attacker = makeCreature('att-1', { power: 2, toughness: 10, controller: 'o' });
    const blocker = makeCreature('bl-1', { power: 3, toughness: 5, controller: 'p', keywords: ['FIRST_STRIKE'] });
    const base = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: [attacker], pBf: [blocker] });
    const state = withShields({ ...base, o: { ...base.o, life: 20 } }, { 'att-1': [{ mode: 'redirectPoint', redirectToPlayer: 'o', shieldSourceIid: 'pi-1', shieldSourceName: 'Personal Incarnation' }] });

    const s1 = duelReducer(state, { type: 'DECLARE_ATTACKER', iid: 'att-1' });
    const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' });
    const s3 = duelReducer(s2, { type: 'ADVANCE_PHASE' });
    const s4 = duelReducer(s3, { type: 'DECLARE_BLOCKER', attId: 'att-1', blId: 'bl-1' });
    const s5 = duelReducer(s4, { type: 'ADVANCE_PHASE' });
    const s6 = duelReducer(s5, { type: 'ADVANCE_PHASE' });

    expect(s6.o.bf.find(c => c.iid === 'att-1').damage).toBe(2); // 3 - 1 redirected (first-strike pass)
    expect(s6.o.life).toBe(19);
    expect(s6.p.bf.find(c => c.iid === 'bl-1').damage).toBe(2); // attacker survives, deals its power in the regular pass, unaffected
  });
});

// ─── Card-level (CARD-01 .. CARD-06) ─────────────────────────────────────────

function makeJadeMonolith(iid, overrides = {}) {
  return {
    iid, id: 'jade_monolith', name: 'Jade Monolith', type: 'Artifact', color: '', cmc: 4, cost: '4',
    tapped: false, summoningSick: false, attacking: false, blocking: null, damage: 0, counters: {},
    eotBuffs: [], enchantments: [], controller: 'p',
    activated: { cost: '1', effect: 'chooseDamageShieldSourceForTarget' },
    damageShieldMode: 'redirect',
    ...overrides,
  };
}

function makePersonalIncarnation(iid, overrides = {}) {
  return makeCreature(iid, {
    id: 'personal_incarnation', name: 'Personal Incarnation', color: 'W', cmc: 6, cost: '3WWW',
    power: 6, toughness: 6,
    activated: { cost: '0', effect: 'addCreatureDamageShieldSelf' },
    triggeredAbilities: [{ id: 'personal_incarnation_dies', trigger: { event: 'ON_CREATURE_DIES', scope: 'self' }, effect: { type: 'loseHalfLifeRoundedUp' } }],
    ...overrides,
  });
}

describe('@engine Scenario: Jade Monolith', () => {
  it('CARD-01: activation targets a creature and records a redirect entry via the human picker', () => {
    const jm = makeJadeMonolith('jm-1');
    const targetCre = makeCreature('tc-1', { controller: 'o' });
    const threat = makeCreature('threat-1', { controller: 'o', name: 'Threat' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [jm], oBf: [targetCre, threat] });
    const state = { ...base, p: { ...base.p, mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 1 } } };

    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'jm-1', tgt: 'tc-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.pendingDamageShieldChoice).not.toBeNull();
    expect(s2.pendingDamageShieldChoice.tgtIid).toBe('tc-1');

    const s3 = duelReducer(s2, { type: 'RESOLVE_DAMAGE_SHIELD_CHOICE', iid: 'threat-1' });
    expect(s3.pendingDamageShieldChoice).toBeNull();
    expect(s3.turnState.creatureDamageShields['tc-1']).toEqual([
      { mode: 'redirect', chosenSourceIid: 'threat-1', redirectToPlayer: 'p', shieldSourceIid: 'jm-1', shieldSourceName: 'Jade Monolith' },
    ]);
  });

  it("CARD-02: the chosen source dealing damage to the targeted creature redirects fully to Jade Monolith's controller", () => {
    const targetCre = makeCreature('tc-1', { controller: 'o', toughness: 5 });
    const base = makeState({ oBf: [targetCre] });
    const state = withShields({ ...base, p: { ...base.p, life: 20 } }, { 'tc-1': [{ mode: 'redirect', chosenSourceIid: 'threat-1', redirectToPlayer: 'p', shieldSourceIid: 'jm-1', shieldSourceName: 'Jade Monolith' }] });
    const s1 = hurtCreature(state, 'tc-1', 4, 'Threat', { sourceIid: 'threat-1', sourceType: 'creature' });
    expect(s1.o.bf.find(c => c.iid === 'tc-1').damage).toBe(0);
    expect(s1.p.life).toBe(16);
  });

  it('CARD-03: isCreatureOnlyTarget flags Jade Monolith\'s activated-ability effect so the click-routing guard rejects non-creature clicks', () => {
    // Mirrors the exact shape DuelScreen.tsx/DuelScreenMobile.tsx read off the
    // battlefield permanent during an 'ability'-kind castFlow (card.activated.effect,
    // not card.effect -- Jade Monolith has no top-level effect of its own).
    const jm = makeJadeMonolith('jm-1');
    const land = makeLand('land-1');
    const creature = makeCreature('cre-1');
    expect(isCreatureOnlyTarget(jm)).toBe(true);
    // The guard used at both screens' click handlers is:
    //   isCreatureOnlyTarget(castingCard) && !isCre(card)
    // A land click must be rejected (illegal); a creature click must be allowed.
    expect(isCreatureOnlyTarget(jm) && land.type !== 'Creature').toBe(true); // land click: illegal, no-op
    expect(isCreatureOnlyTarget(jm) && creature.type !== 'Creature').toBe(false); // creature click: legal
    // A card with no matching effect must never trigger the restriction.
    const unrelated = { id: 'grizzly_bears', activated: { cost: '1', effect: 'pumpCreature' } };
    expect(isCreatureOnlyTarget(unrelated)).toBe(false);
  });

  it('CARD-04: resolve-time defense-in-depth rejects a non-creature target dispatched directly, bypassing the UI', () => {
    const jm = makeJadeMonolith('jm-1');
    const land = makeLand('land-1', { controller: 'o' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [jm], oBf: [land] });
    const state = { ...base, p: { ...base.p, mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 1 } } };

    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'jm-1', tgt: 'land-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });

    expect(s2.pendingDamageShieldChoice).toBeNull();
    expect(s2.turnState.creatureDamageShields ?? {}).toEqual({});
  });
});

describe('@engine Scenario: Personal Incarnation', () => {
  it('CARD-05: activating {0} twice, then taking 3 damage, redirects 2 and marks 1', () => {
    const pi = makePersonalIncarnation('pi-1', { controller: 'p' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [pi] });
    const state = { ...base, p: { ...base.p, life: 20 } };

    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'pi-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    const s3 = duelReducer(s2, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'pi-1' });
    const s4 = duelReducer(s3, { type: 'RESOLVE_STACK' });
    expect(s4.turnState.creatureDamageShields['pi-1']).toHaveLength(2);

    const s5 = hurtCreature(s4, 'pi-1', 3, 'Threat', { sourceIid: 'threat-1', sourceType: 'creature' });
    expect(s5.p.bf.find(c => c.iid === 'pi-1').damage).toBe(1);
    expect(s5.p.life).toBe(18); // 20 - 2 redirected
  });

  it("CARD-06: the death-trigger clause still fires (owner loses half life, rounded up) when damage exceeds available redirects", () => {
    const pi = makePersonalIncarnation('pi-1', { controller: 'p', toughness: 6, damage: 0 });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [pi] });
    const state = { ...base, p: { ...base.p, life: 20 } };

    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'pi-1' }); // one shield: redirects 1
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.turnState.creatureDamageShields['pi-1']).toHaveLength(1);

    // 10 damage: 1 redirected (18 life), 9 marked -- lethal (toughness 6) -- dies.
    const s3 = hurtCreature(s2, 'pi-1', 10, 'Threat', { sourceIid: 'threat-1', sourceType: 'creature' });
    expect(s3.p.bf.some(c => c.iid === 'pi-1')).toBe(false);
    expect(s3.p.gy.some(c => c.iid === 'pi-1')).toBe(true);
    // Life after redirect: 20 - 1 = 19; death trigger: lose half of 19, rounded up = 10 -> 9.
    expect(s3.p.life).toBe(9);
  });
});
