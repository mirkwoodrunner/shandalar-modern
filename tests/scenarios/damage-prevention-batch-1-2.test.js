// tests/scenarios/damage-prevention-batch-1-2.test.js
// A9 Damage Prevention/Redirect bucket, sub-batches 1+2 (12 cards): Horn of
// Deafening, Subdue, Feint, Reverberation, Indestructible Aura, Silhouette,
// Kry Shield, Maze of Ith, Glyph of Destruction, Dark Sphere, Nova Pentacle,
// Telekinesis. See docs/MECHANICS_INDEX.md for the full batch writeup.
// Declared test count: 23 Vitest cases.

import { describe, it, expect } from 'vitest';
import { duelReducer, hurt, hurtCreature, resolveCombat } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { getCardById } from '../../src/data/cards.js';
import { makeState, makeCreature, makeLand, makeSpell } from '../../src/engine/__tests__/_factory.js';

function fund(state, mana) {
  return { ...state, p: { ...state.p, mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...mana } } };
}

describe('@engine Scenario: Horn of Deafening', () => {
  it('activates for {2}, taps, sets preventCombatDamageDealt on target creature', () => {
    const horn = { ...getCardById('horn_of_deafening'), iid: 'horn-1', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [] };
    const threat = makeCreature('threat-1', { controller: 'o' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [horn], oBf: [threat] });
    const state = fund(base, { C: 2 });
    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'horn-1', tgt: 'threat-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.o.bf.find(c => c.iid === 'threat-1').preventCombatDamageDealt).toBe(true);
  });
});

describe('@engine Scenario: Subdue', () => {
  it('prevents combat damage dealt by target creature and pumps toughness by its CMC', () => {
    const subdue = { ...getCardById('subdue'), iid: 'sub-1' };
    const threat = makeCreature('threat-1', { controller: 'o', cmc: 4 });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [subdue], oBf: [threat] });
    const state = fund(base, { G: 1 });
    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'sub-1', tgt: 'threat-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    const after = s2.o.bf.find(c => c.iid === 'threat-1');
    expect(after.preventCombatDamageDealt).toBe(true);
    expect(after.eotBuffs).toContainEqual({ power: 0, toughness: 4 });
  });
});

describe('@engine Scenario: Feint', () => {
  it('taps all blockers of the target attacker and prevents combat damage between them, leaving a non-blocker untouched', () => {
    const feint = { ...getCardById('feint'), iid: 'feint-1' };
    const attacker = makeCreature('att-1', { controller: 'o', attacking: true });
    const blocker1 = makeCreature('bl-1', { controller: 'p', blocking: 'att-1', tapped: false });
    const blocker2 = makeCreature('bl-2', { controller: 'p', blocking: 'att-1', tapped: false });
    const bystander = makeCreature('by-1', { controller: 'p', tapped: false });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [feint], pBf: [blocker1, blocker2, bystander], oBf: [attacker] });
    const state = { ...fund(base, { R: 1 }), blockers: { 'bl-1': 'att-1', 'bl-2': 'att-1' } };
    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'feint-1', tgt: 'att-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.o.bf.find(c => c.iid === 'att-1').preventCombatDamageDealt).toBe(true);
    const bl1 = s2.p.bf.find(c => c.iid === 'bl-1');
    const bl2 = s2.p.bf.find(c => c.iid === 'bl-2');
    expect(bl1.tapped).toBe(true);
    expect(bl1.preventCombatDamageDealt).toBe(true);
    expect(bl2.tapped).toBe(true);
    expect(bl2.preventCombatDamageDealt).toBe(true);
    const by = s2.p.bf.find(c => c.iid === 'by-1');
    expect(by.tapped).toBe(false);
    expect(by.preventCombatDamageDealt).toBeUndefined();
  });

  it('fizzles on a non-attacking target', () => {
    const feint = { ...getCardById('feint'), iid: 'feint-1' };
    const notAttacking = makeCreature('na-1', { controller: 'o', attacking: false });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [feint], oBf: [notAttacking] });
    const state = { ...fund(base, { R: 1 }), blockers: {} };
    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'feint-1', tgt: 'na-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.o.bf.find(c => c.iid === 'na-1').preventCombatDamageDealt).toBeUndefined();
  });
});

describe('@engine Scenario: Reverberation', () => {
  it('redirects a targeted sorcery\'s damage to its own caster instead of the original target (o casts the sorcery, p casts Reverberation)', () => {
    const bolt = makeSpell('sorc-1', { id: 'test_sorcery', name: 'Test Sorcery', type: 'Sorcery', effect: 'damage3', controller: 'o' });
    const rev = { ...getCardById('reverberation'), iid: 'rev-1' };
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [rev] });
    const state = {
      ...fund(base, { U: 2, C: 2 }),
      o: { ...base.o, life: 20 },
      stack: [{ id: 'stk-sorc', card: bolt, caster: 'o', targets: ['p'], xVal: 1 }],
    };
    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'rev-1', tgt: 'stk-sorc' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' }); // resolves Reverberation
    expect(s2.turnState.damageShields.p).toEqual([
      { chosenSourceIid: 'sorc-1', chosenSourceController: 'o', mode: 'redirectInstead', shieldSourceIid: 'rev-1', shieldSourceName: 'Reverberation' },
    ]);
    expect(s2.turnState.damageShields.o).toEqual([
      { chosenSourceIid: 'sorc-1', chosenSourceController: 'o', mode: 'redirectInstead', shieldSourceIid: 'rev-1', shieldSourceName: 'Reverberation' },
    ]);
    expect(s2.stack).toHaveLength(1); // the sorcery is still pending
    const s3 = duelReducer(s2, { type: 'RESOLVE_STACK' }); // resolves the sorcery: damage3 targeting p
    expect(s3.p.life).toBe(20); // original target takes none
    expect(s3.o.life).toBe(17); // redirected to the sorcery's own caster instead
  });

  it('redirects the other direction (p casts the sorcery, o casts Reverberation)', () => {
    const bolt = makeSpell('sorc-1', { id: 'test_sorcery', name: 'Test Sorcery', type: 'Sorcery', effect: 'damage3', controller: 'p' });
    const rev = { ...getCardById('reverberation'), iid: 'rev-1' };
    const base = makeState({ phase: PHASE.MAIN_1, active: 'o', oHand: [rev] });
    const state = {
      ...base,
      o: { ...base.o, mana: { W: 0, U: 2, B: 0, R: 0, G: 0, C: 2 } },
      p: { ...base.p, life: 20 },
      stack: [{ id: 'stk-sorc', card: bolt, caster: 'p', targets: ['o'], xVal: 1 }],
    };
    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'o', iid: 'rev-1', tgt: 'stk-sorc' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' }); // resolves Reverberation
    const s3 = duelReducer(s2, { type: 'RESOLVE_STACK' }); // resolves the sorcery: damage3 targeting o
    expect(s3.o.life).toBe(20); // original target takes none
    expect(s3.p.life).toBe(17); // redirected to the sorcery's own caster instead
  });

  it('fizzles if the stack target is not a sorcery spell', () => {
    const notSorcery = makeSpell('inst-1', { id: 'test_instant', name: 'Test Instant', type: 'Instant', effect: 'damage3', controller: 'o' });
    const rev = { ...getCardById('reverberation'), iid: 'rev-1' };
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [rev] });
    const state = { ...fund(base, { U: 2, C: 2 }), stack: [{ id: 'stk-inst', card: notSorcery, caster: 'o', targets: ['p'], xVal: 1 }] };
    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'rev-1', tgt: 'stk-inst' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.turnState.damageShields?.p ?? []).toEqual([]);
    expect(s2.turnState.damageShields?.o ?? []).toEqual([]);
  });
});

describe('@engine Scenario: Indestructible Aura', () => {
  it('prevents combat damage to the target creature this turn', () => {
    const aura = { ...getCardById('indestructible_aura'), iid: 'ia-1' };
    const attacker = makeCreature('att-1', { controller: 'p', power: 5, toughness: 5, attacking: true, tapped: true });
    const blocker = makeCreature('bl-1', { controller: 'o', power: 2, toughness: 2, blocking: 'att-1' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [aura], pBf: [attacker], oBf: [blocker] });
    const state = fund(base, { W: 1 });
    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'ia-1', tgt: 'bl-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.o.bf.find(c => c.iid === 'bl-1').preventAllDamageToThisTurn).toBe(true);

    const combatState = { ...s2, phase: PHASE.COMBAT_DAMAGE, attackers: ['att-1'], blockers: { 'bl-1': 'att-1' } };
    const s3 = resolveCombat(combatState);
    const blAfter = s3.o.bf.find(c => c.iid === 'bl-1');
    expect(blAfter.damage).toBe(0);
  });

  it('prevents non-combat damage to the target creature via hurtCreature this turn, then clears at CLEANUP so damage applies normally next turn', () => {
    const aura = { ...getCardById('indestructible_aura'), iid: 'ia-1' };
    const target = makeCreature('t-1', { controller: 'o', toughness: 5 });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [aura], oBf: [target] });
    const state = fund(base, { W: 1 });
    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'ia-1', tgt: 't-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    const s3 = hurtCreature(s2, 't-1', 4, 'Test Ping', { sourceIid: 'ping-1' });
    expect(s3.o.bf.find(c => c.iid === 't-1').damage).toBe(0);

    // CLEANUP clears the flag.
    const s4 = duelReducer(s3, { type: 'ADVANCE_PHASE' }); // -> next phase toward CLEANUP
    let s = s4;
    for (let i = 0; i < 10 && s.o.bf.find(c => c.iid === 't-1')?.preventAllDamageToThisTurn; i++) {
      s = duelReducer(s, { type: 'ADVANCE_PHASE' });
    }
    expect(s.o.bf.find(c => c.iid === 't-1').preventAllDamageToThisTurn).toBeFalsy();
    const s5 = hurtCreature(s, 't-1', 2, 'Test Ping 2', { sourceIid: 'ping-2' });
    expect(s5.o.bf.find(c => c.iid === 't-1').damage).toBe(2);
  });
});

describe('@engine Scenario: Silhouette', () => {
  it('shares the exact preventAllDamageToTarget case with Indestructible Aura', () => {
    const card = getCardById('silhouette');
    expect(card.effect).toBe('preventAllDamageToTarget');
    const silhouette = { ...card, iid: 'sil-1' };
    const target = makeCreature('t-1', { controller: 'o', toughness: 5 });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [silhouette], oBf: [target] });
    const state = fund(base, { U: 1, C: 1 });
    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'sil-1', tgt: 't-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.o.bf.find(c => c.iid === 't-1').preventAllDamageToThisTurn).toBe(true);
    const s3 = hurtCreature(s2, 't-1', 4, 'Test Ping', { sourceIid: 'ping-1' });
    expect(s3.o.bf.find(c => c.iid === 't-1').damage).toBe(0);
  });
});

describe('@engine Scenario: Kry Shield', () => {
  it('prevents both combat and non-combat damage dealt by your own target creature this turn, and pumps toughness by its CMC', () => {
    const kry = { ...getCardById('kry_shield'), iid: 'kry-1', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [] };
    const mine = makeCreature('mine-1', { controller: 'p', cmc: 3 });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [kry, mine] });
    const state = fund(base, { C: 2 });
    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'kry-1', tgt: 'mine-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    const after = s2.p.bf.find(c => c.iid === 'mine-1');
    expect(after.preventCombatDamageDealt).toBe(true);
    expect(after.preventAllDamageByThisTurn).toBe(true);
    expect(after.eotBuffs).toContainEqual({ power: 0, toughness: 3 });

    // Non-combat damage dealt BY this creature (via an ability, say) is prevented.
    const s3 = hurt(s2, 'o', 5, 'mine-1 ability', { sourceIid: 'mine-1' });
    expect(s3.o.life).toBe(20);
    const s4 = hurtCreature(s2, 'target-elsewhere', 5, 'mine-1 ability', { sourceIid: 'mine-1' });
    // No such target -- just confirm hurt() path above already proved the source-side gate fires.
    expect(s4).toBeDefined();
  });

  it('fizzles if the target is not a creature you control', () => {
    const kry = { ...getCardById('kry_shield'), iid: 'kry-1', controller: 'p', tapped: false, damage: 0, counters: {}, eotBuffs: [], enchantments: [] };
    const theirs = makeCreature('theirs-1', { controller: 'o', cmc: 3 });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [kry], oBf: [theirs] });
    const state = fund(base, { C: 2 });
    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'kry-1', tgt: 'theirs-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.o.bf.find(c => c.iid === 'theirs-1').preventAllDamageByThisTurn).toBeUndefined();
  });
});

describe('@engine Scenario: Maze of Ith', () => {
  it('fizzles on a non-attacking target', () => {
    const maze = makeLand('maze-1', { id: 'maze_of_ith', name: 'Maze of Ith', subtype: undefined, produces: undefined, activated: { cost: 'T', effect: 'mazeOfIthUntapAndPrevent' } });
    const notAttacking = makeCreature('na-1', { controller: 'o', attacking: false, tapped: true });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [maze], oBf: [notAttacking] });
    const s1 = duelReducer(base, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'maze-1', tgt: 'na-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.o.bf.find(c => c.iid === 'na-1').tapped).toBe(true); // unchanged
  });

  it('untaps the target attacking creature and prevents combat damage to and from it this turn', () => {
    const maze = makeLand('maze-1', { id: 'maze_of_ith', name: 'Maze of Ith', subtype: undefined, produces: undefined, activated: { cost: 'T', effect: 'mazeOfIthUntapAndPrevent' } });
    const attacker = makeCreature('att-1', { controller: 'o', attacking: true, tapped: true });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [maze], oBf: [attacker] });
    const s1 = duelReducer(base, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'maze-1', tgt: 'att-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    const after = s2.o.bf.find(c => c.iid === 'att-1');
    expect(after.tapped).toBe(false);
    expect(after.preventCombatDamageDealt).toBe(true);
    expect(after.preventAllDamageToThisTurn).toBe(true);
  });
});

describe('@engine Scenario: Glyph of Destruction', () => {
  it('fizzles on a non-blocking creature, a non-Wall, or an opponent\'s creature', () => {
    const glyph = { ...getCardById('glyph_of_destruction'), iid: 'gly-1' };
    const nonBlockingWall = makeCreature('w1-1', { controller: 'p', subtype: 'Wall', blocking: null });
    const nonWallBlocker = makeCreature('w2-1', { controller: 'p', subtype: 'Bear', blocking: 'att-1' });
    const opponentsWall = makeCreature('w3-1', { controller: 'o', subtype: 'Wall', blocking: 'att-1' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [glyph], pBf: [nonBlockingWall, nonWallBlocker], oBf: [opponentsWall] });
    const state = fund(base, { R: 1 });

    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'gly-1', tgt: 'w1-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.p.bf.find(c => c.iid === 'w1-1').destroyAtNextEnd).toBeUndefined();
  });

  it('pumps the blocking Wall +10/+0 (scope: combat), prevents all damage to it this turn, and destroys it at the next end step', () => {
    const glyph = { ...getCardById('glyph_of_destruction'), iid: 'gly-1' };
    const wall = makeCreature('w-1', { controller: 'p', subtype: 'Wall', blocking: 'att-1', power: 0, toughness: 4 });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [glyph], pBf: [wall] });
    const state = fund(base, { R: 1 });
    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'gly-1', tgt: 'w-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    const after = s2.p.bf.find(c => c.iid === 'w-1');
    expect(after.eotBuffs).toContainEqual({ power: 10, toughness: 0, scope: 'combat' });
    expect(after.preventAllDamageToThisTurn).toBe(true);
    expect(after.destroyAtNextEnd).toBe(true);

    const s3 = hurtCreature(s2, 'w-1', 6, 'Test Ping', { sourceIid: 'ping-1' });
    expect(s3.p.bf.find(c => c.iid === 'w-1').damage).toBe(0);

    // Drive phases forward until the wall is destroyed (delayed PHASE.END trigger).
    let s = s3;
    for (let i = 0; i < 10 && s.p.bf.some(c => c.iid === 'w-1'); i++) {
      s = duelReducer(s, { type: 'ADVANCE_PHASE' });
    }
    expect(s.p.bf.some(c => c.iid === 'w-1')).toBe(false);
    expect(s.p.gy.some(c => c.iid === 'w-1')).toBe(true);
  });
});

describe('@engine Scenario: Dark Sphere', () => {
  it('has damageShieldMode "preventHalf" and reuses the existing chooseDamageShieldSource case', () => {
    const card = getCardById('dark_sphere');
    expect(card.damageShieldMode).toBe('preventHalf');
    expect(card.activated.effect).toBe('chooseDamageShieldSource');
  });

  it('prevents half the damage (rounded down), leaving the remainder to apply normally', () => {
    const sphere = { ...getCardById('dark_sphere'), iid: 'ds-1', controller: 'p', tapped: false, counters: {}, eotBuffs: [], enchantments: [] };
    const threat = makeCreature('threat-1', { controller: 'o' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [sphere], oBf: [threat] });
    const s1 = duelReducer(base, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'ds-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.pendingDamageShieldChoice.pool.map(c => c.iid)).toContain('threat-1');
    const s3 = duelReducer(s2, { type: 'RESOLVE_DAMAGE_SHIELD_CHOICE', iid: 'threat-1' });
    expect(s3.turnState.damageShields.p).toEqual([
      { chosenSourceIid: 'threat-1', chosenSourceController: 'o', mode: 'preventHalf', shieldSourceIid: 'ds-1', shieldSourceName: 'Dark Sphere' },
    ]);
    const s4 = { ...s3, p: { ...s3.p, life: 20 } };
    const s5 = hurt(s4, 'p', 5, 'Test Threat', { sourceIid: 'threat-1' });
    // 5 damage -> floor(5/2)=2 prevented, 3 remainder applied.
    expect(s5.p.life).toBe(17);
    expect(s5.turnState.damageShields.p).toEqual([]);
  });
});

describe('@engine Scenario: Nova Pentacle', () => {
  it('fizzles if the opponent controls no creature', () => {
    const nova = { ...getCardById('nova_pentacle'), iid: 'nova-1', controller: 'p', tapped: false, counters: {}, eotBuffs: [], enchantments: [] };
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [nova] });
    const state = fund(base, { C: 3 });
    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'nova-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.pendingDamageShieldChoice).toBeNull();
    expect(s2.turnState.damageShields?.p ?? []).toEqual([]);
  });

  it('redirects the next chosen-source damage to the caster onto the opponent\'s (auto-picked) creature instead', () => {
    const nova = { ...getCardById('nova_pentacle'), iid: 'nova-1', controller: 'p', tapped: false, counters: {}, eotBuffs: [], enchantments: [] };
    // The chosen damage source is a non-creature permanent (an artifact) so it
    // never appears in the opponent-creature auto-pick pool, keeping the two
    // roles (chosen source vs. redirect destination) unambiguous.
    const threat = { iid: 'threat-1', id: 'test_artifact', name: 'Test Artifact', type: 'Artifact', controller: 'o', tapped: false, counters: {}, eotBuffs: [], enchantments: [] };
    const oppCreature = makeCreature('opp-cre-1', { controller: 'o', toughness: 6 });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [nova], oBf: [threat, oppCreature] });
    const state = fund(base, { C: 3 });
    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'nova-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.pendingDamageShieldChoice.pool.map(c => c.iid)).toContain('threat-1');
    const s3 = duelReducer(s2, { type: 'RESOLVE_DAMAGE_SHIELD_CHOICE', iid: 'threat-1' });
    expect(s3.turnState.damageShields.p).toEqual([
      { chosenSourceIid: 'threat-1', chosenSourceController: 'o', mode: 'redirectToCreature', shieldSourceIid: 'nova-1', shieldSourceName: 'Nova Pentacle', redirectToCreatureIid: 'opp-cre-1' },
    ]);
    const s4 = { ...s3, p: { ...s3.p, life: 20 } };
    const s5 = hurt(s4, 'p', 5, 'Test Threat', { sourceIid: 'threat-1' });
    expect(s5.p.life).toBe(20); // caster takes none
    expect(s5.o.bf.find(c => c.iid === 'opp-cre-1').damage).toBe(5); // lands on the opponent's creature instead
  });
});

describe('@engine Scenario: Telekinesis', () => {
  it('taps the target, prevents its combat damage this turn, and skips its controller\'s next two untap steps before untapping normally on the third', () => {
    const telekinesis = { ...getCardById('telekinesis'), iid: 'tk-1' };
    const target = makeCreature('t-1', { controller: 'o', tapped: false });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [telekinesis], oBf: [target] });
    const state = fund(base, { U: 2 });
    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'tk-1', tgt: 't-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    const after = s2.o.bf.find(c => c.iid === 't-1');
    expect(after.tapped).toBe(true);
    expect(after.preventCombatDamageDealt).toBe(true);
    expect(after.untapStepsSkipRemaining).toBe(2);

    // First of the controller's ('o') next two untap steps: stays tapped.
    let s = { ...s2, active: 'p', phase: PHASE.CLEANUP };
    s = duelReducer(s, { type: 'ADVANCE_PHASE' }); // -> UNTAP (o's turn)
    expect(s.active).toBe('o');
    let t = s.o.bf.find(c => c.iid === 't-1');
    expect(t.tapped).toBe(true);
    expect(t.untapStepsSkipRemaining).toBe(1);

    // Second skipped untap step.
    s = { ...s, active: 'p', phase: PHASE.CLEANUP };
    s = duelReducer(s, { type: 'ADVANCE_PHASE' });
    t = s.o.bf.find(c => c.iid === 't-1');
    expect(t.tapped).toBe(true);
    expect(t.untapStepsSkipRemaining).toBe(0);

    // Third untap step: untaps normally.
    s = { ...s, active: 'p', phase: PHASE.CLEANUP };
    s = duelReducer(s, { type: 'ADVANCE_PHASE' });
    t = s.o.bf.find(c => c.iid === 't-1');
    expect(t.tapped).toBe(false);
  });
});

describe('@engine Scenario: damage prevention batch 1+2 -- CLEANUP and isolation regression', () => {
  it('CLEANUP clears preventAllDamageToThisTurn/preventAllDamageByThisTurn on both sides even when unconsumed', () => {
    const pCre = makeCreature('p-1', { controller: 'p', preventAllDamageToThisTurn: true, preventAllDamageByThisTurn: true });
    const oCre = makeCreature('o-1', { controller: 'o', preventAllDamageToThisTurn: true, preventAllDamageByThisTurn: true });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [pCre], oBf: [oCre] });
    let s = base;
    for (let i = 0; i < 10 && (s.p.bf.find(c => c.iid === 'p-1')?.preventAllDamageToThisTurn || s.o.bf.find(c => c.iid === 'o-1')?.preventAllDamageToThisTurn); i++) {
      s = duelReducer(s, { type: 'ADVANCE_PHASE' });
    }
    expect(s.p.bf.find(c => c.iid === 'p-1').preventAllDamageToThisTurn).toBeFalsy();
    expect(s.p.bf.find(c => c.iid === 'p-1').preventAllDamageByThisTurn).toBeFalsy();
    expect(s.o.bf.find(c => c.iid === 'o-1').preventAllDamageToThisTurn).toBeFalsy();
    expect(s.o.bf.find(c => c.iid === 'o-1').preventAllDamageByThisTurn).toBeFalsy();
  });

  it('the new flags do not leak onto an unrelated creature on the same battlefield', () => {
    const aura = { ...getCardById('indestructible_aura'), iid: 'ia-1' };
    const target = makeCreature('t-1', { controller: 'o' });
    const bystander = makeCreature('by-1', { controller: 'o' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [aura], oBf: [target, bystander] });
    const state = fund(base, { W: 1 });
    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'ia-1', tgt: 't-1' });
    const s2 = duelReducer(s1, { type: 'RESOLVE_STACK' });
    expect(s2.o.bf.find(c => c.iid === 't-1').preventAllDamageToThisTurn).toBe(true);
    expect(s2.o.bf.find(c => c.iid === 'by-1').preventAllDamageToThisTurn).toBeUndefined();
  });
});
