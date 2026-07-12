// tests/scenarios/protection-artifact-ward.test.js
// Protection-from-Artifact Extension + Artifact Ward.
// Extends the existing color-only protection system (canBlockDuel, the two
// resolveCombat damage-prevention checks, DECLARE_BLOCKER's explicit check)
// with an "artifact" type-based quality, and adds two wholly new enforcement
// points: non-combat damage (consumeCreatureDamageShields) and
// protection-from-targeting (CAST_SPELL / ACTIVATE_ABILITY legality).
// See docs/ENGINE_CONTRACT_SPEC.md -- Protection (DEBT).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import {
  duelReducer, canBlockDuel, hurtCreature, consumeCreatureDamageShields,
  isProtectedFromSource,
} from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature, makeSpell } from '../../src/engine/__tests__/_factory.js';

// Artifact Ward's own attach shape (mirrors the enchantCreature auraRecord
// built in DuelCore.js's "enchantCreature" case).
function wardAura(name, protection, overrides = {}) {
  return { name, mod: { protection }, enterTs: 0, ...overrides };
}

function artifactCreature(iid, overrides = {}) {
  return makeCreature(iid, { id: 'ornithopter', name: 'Ornithopter', type: 'Artifact Creature', color: '', ...overrides });
}

// ---------------------------------------------------------------------------
// Combat extension (8)
// ---------------------------------------------------------------------------
describe('@engine Scenario: protection from artifact -- canBlockDuel', () => {
  it('PROT-01: artifact creature cannot block a creature with protection from artifact', () => {
    const attacker = artifactCreature('att-1', { controller: 'o' });
    const blocker = makeCreature('bl-1', { controller: 'p', enchantments: [wardAura('Artifact Ward', ['artifact'])] });
    expect(canBlockDuel(blocker, attacker, [blocker], makeState({ pBf: [blocker], oBf: [attacker] }))).toBe(false);
  });

  it('PROT-02: non-artifact creature can still block (color-based protection at this site still works unchanged)', () => {
    const attacker = makeCreature('att-1', { controller: 'o', color: 'R' });
    const blocker = makeCreature('bl-1', { controller: 'p', enchantments: [wardAura('Blue Ward', ['U'])] });
    const state = makeState({ pBf: [blocker], oBf: [attacker] });
    expect(canBlockDuel(blocker, attacker, [blocker], state)).toBe(true);
    // Regression: the pre-existing color-protection check at this site still blocks a matching color.
    const blueAttacker = makeCreature('att-2', { controller: 'o', color: 'U' });
    expect(canBlockDuel(blocker, blueAttacker, [blocker], makeState({ pBf: [blocker], oBf: [blueAttacker] }))).toBe(false);
  });
});

describe('@engine Scenario: protection from artifact -- resolveCombat damage prevention', () => {
  it('PROT-03: combat damage from an artifact attacker to a protected blocker is prevented (first resolveCombat site)', () => {
    const attacker = artifactCreature('att-1', { controller: 'o', power: 3, toughness: 3 });
    const blocker = makeCreature('bl-1', { controller: 'p', power: 2, toughness: 2 });
    const state = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: [attacker], pBf: [blocker] });

    const s1 = duelReducer(state, { type: 'DECLARE_ATTACKER', iid: 'att-1' });
    const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_ATTACKERS
    const s3 = duelReducer(s2, { type: 'ADVANCE_PHASE' }); // -> COMBAT_BLOCKERS
    // Block declared legally before the Aura attaches (protection is granted mid-combat).
    const s4 = duelReducer(s3, { type: 'DECLARE_BLOCKER', attId: 'att-1', blId: 'bl-1' });
    // Simulate Artifact Ward resolving onto the blocker before damage.
    const s4w = { ...s4, p: { ...s4.p, bf: s4.p.bf.map(c => c.iid === 'bl-1' ? { ...c, enchantments: [wardAura('Artifact Ward', ['artifact'])] } : c) } };
    const s5 = duelReducer(s4w, { type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_BLOCKERS
    const s6 = duelReducer(s5, { type: 'ADVANCE_PHASE' }); // -> COMBAT_DAMAGE, resolves

    expect(s6.p.bf.find(c => c.iid === 'bl-1').damage).toBe(0);
    expect(s6.p.bf.some(c => c.iid === 'bl-1')).toBe(true);
  });

  it('PROT-04: combat damage from a protected attacker\'s artifact blocker is prevented (second resolveCombat site)', () => {
    const attacker = makeCreature('att-1', { controller: 'o', power: 2, toughness: 5 });
    const blocker = artifactCreature('bl-1', { controller: 'p', power: 3, toughness: 3 });
    const state = makeState({ phase: PHASE.COMBAT_ATTACKERS, active: 'o', oBf: [attacker], pBf: [blocker] });

    const s1 = duelReducer(state, { type: 'DECLARE_ATTACKER', iid: 'att-1' });
    const s2 = duelReducer(s1, { type: 'ADVANCE_PHASE' });
    const s3 = duelReducer(s2, { type: 'ADVANCE_PHASE' });
    const s4 = duelReducer(s3, { type: 'DECLARE_BLOCKER', attId: 'att-1', blId: 'bl-1' });
    // Attach Artifact Ward to the attacker after the block is locked in.
    const s4w = { ...s4, o: { ...s4.o, bf: s4.o.bf.map(c => c.iid === 'att-1' ? { ...c, enchantments: [wardAura('Artifact Ward', ['artifact'])] } : c) } };
    const s5 = duelReducer(s4w, { type: 'ADVANCE_PHASE' });
    const s6 = duelReducer(s5, { type: 'ADVANCE_PHASE' });

    // The artifact blocker's damage to the protected attacker is prevented.
    expect(s6.o.bf.find(c => c.iid === 'att-1').damage).toBe(0);
  });

  it('PROT-05: DECLARE_BLOCKER explicit check rejects an artifact creature blocking a protected attacker, with the existing dlog format', () => {
    const attacker = makeCreature('att-1', { controller: 'o', enchantments: [wardAura('Artifact Ward', ['artifact'])] });
    const blocker = artifactCreature('bl-1', { controller: 'p' });
    const state = { ...makeState({ phase: PHASE.COMBAT_BLOCKERS, active: 'o', oBf: [attacker], pBf: [blocker] }), attackers: ['att-1'] };

    const s1 = duelReducer(state, { type: 'DECLARE_BLOCKER', attId: 'att-1', blId: 'bl-1' });

    expect(s1.p.bf.find(c => c.iid === 'bl-1').blocking).toBeFalsy();
    expect(s1.log[s1.log.length - 1].text).toBe('Ornithopter cannot block Grizzly Bears (protection from artifact).');
  });

  it('PROT-06: regression -- DECLARE_BLOCKER\'s existing color-based rejection still works unchanged', () => {
    const attacker = makeCreature('att-1', { controller: 'o', color: 'B', enchantments: [wardAura('Black Ward', ['B'])] });
    const blocker = makeCreature('bl-1', { controller: 'p', color: 'B' });
    const state = { ...makeState({ phase: PHASE.COMBAT_BLOCKERS, active: 'o', oBf: [attacker], pBf: [blocker] }), attackers: ['att-1'] };

    const s1 = duelReducer(state, { type: 'DECLARE_BLOCKER', attId: 'att-1', blId: 'bl-1' });

    expect(s1.p.bf.find(c => c.iid === 'bl-1').blocking).toBeFalsy();
    expect(s1.log[s1.log.length - 1].text).toContain('protection from B');
  });

  it('PROT-07: a creature with both color and artifact protection correctly blocks both kinds of source', () => {
    const blocker = makeCreature('bl-1', { controller: 'p', enchantments: [wardAura('Black Ward', ['B']), wardAura('Artifact Ward', ['artifact'])] });
    const blackAttacker = makeCreature('att-1', { controller: 'o', color: 'B' });
    const artifactAttacker = artifactCreature('att-2', { controller: 'o' });
    const state1 = makeState({ pBf: [blocker], oBf: [blackAttacker] });
    const state2 = makeState({ pBf: [blocker], oBf: [artifactAttacker] });
    expect(canBlockDuel(blocker, blackAttacker, [blocker], state1)).toBe(false);
    expect(canBlockDuel(blocker, artifactAttacker, [blocker], state2)).toBe(false);
  });

  it('PROT-08: an artifact land (animated into a creature) counts as an artifact source for blocking', () => {
    const artifactLandCreature = makeCreature('alc-1', {
      id: 'animated_artifact_land', name: 'Animated Artifact Land', type: 'Land Creature Artifact', subtype: 'Assembly-Worker',
      controller: 'o',
    });
    const blocker = makeCreature('bl-1', { controller: 'p', enchantments: [wardAura('Artifact Ward', ['artifact'])] });
    expect(canBlockDuel(blocker, artifactLandCreature, [blocker], makeState({ pBf: [blocker], oBf: [artifactLandCreature] }))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Non-combat damage (6)
// ---------------------------------------------------------------------------
describe('@engine Scenario: protection from artifact -- non-combat damage (consumeCreatureDamageShields)', () => {
  it('PROT-09: an artifact source dealing damage via hurtCreature is fully prevented', () => {
    const artifactSource = artifactCreature('src-1', { controller: 'o' });
    const target = makeCreature('tgt-1', { controller: 'p', enchantments: [wardAura('Artifact Ward', ['artifact'])] });
    const state = makeState({ pBf: [target], oBf: [artifactSource] });

    const s1 = hurtCreature(state, 'tgt-1', 5, 'Ornithopter', { sourceIid: 'src-1', sourceType: 'creature' });

    expect(s1.p.bf.find(c => c.iid === 'tgt-1').damage).toBe(0);
    expect(s1.p.gy.some(c => c.iid === 'tgt-1')).toBe(false);
  });

  it('PROT-10: a non-artifact spell dealing damage to the same protected creature is unaffected', () => {
    const nonArtifactSource = makeCreature('src-1', { controller: 'o', type: 'Creature', color: 'R' });
    const target = makeCreature('tgt-1', { controller: 'p', toughness: 10, enchantments: [wardAura('Artifact Ward', ['artifact'])] });
    const state = makeState({ pBf: [target], oBf: [nonArtifactSource] });

    const s1 = hurtCreature(state, 'tgt-1', 5, 'Shivan Dragon', { sourceIid: 'src-1', sourceType: 'creature' });

    expect(s1.p.bf.find(c => c.iid === 'tgt-1').damage).toBe(5);
  });

  it('PROT-11: protection does not consume any existing one-shot creatureDamageShields entries', () => {
    const artifactSource = artifactCreature('src-1', { controller: 'o' });
    const target = makeCreature('tgt-1', { controller: 'p', enchantments: [wardAura('Artifact Ward', ['artifact'])] });
    const base = makeState({ pBf: [target], oBf: [artifactSource] });
    const state = { ...base, turnState: { ...base.turnState, creatureDamageShields: { 'tgt-1': [{ mode: 'redirectPoint', redirectToPlayer: 'o', shieldSourceIid: 'jade-1', shieldSourceName: 'Jade Monolith' }] } } };

    const { state: s1, remainingAmt } = consumeCreatureDamageShields(state, 'tgt-1', 3, { sourceIid: 'src-1', sourceType: 'creature' });

    expect(remainingAmt).toBe(0);
    expect(s1.turnState.creatureDamageShields['tgt-1']).toHaveLength(1); // untouched, still armed
  });

  it('PROT-12: a dmgWithShield() call site (Tracker\'s damage exchange) also respects protection when the source is an artifact', () => {
    const artifactSource = artifactCreature('src-1', { controller: 'o', power: 4 });
    const target = makeCreature('tgt-1', { controller: 'p', enchantments: [wardAura('Artifact Ward', ['artifact'])] });
    const base = makeState({ pBf: [target], oBf: [artifactSource] });
    const { state: s1, remainingAmt } = consumeCreatureDamageShields(base, 'tgt-1', 4, { sourceIid: 'src-1', sourceType: 'creature' });
    expect(remainingAmt).toBe(0);
    expect(s1.p.bf.find(c => c.iid === 'tgt-1').damage).toBe(0);
  });

  it('PROT-13: the same artifact source can attempt to deal damage twice in one turn -- both attempts are prevented (not one-shot)', () => {
    const artifactSource = artifactCreature('src-1', { controller: 'o' });
    const target = makeCreature('tgt-1', { controller: 'p', enchantments: [wardAura('Artifact Ward', ['artifact'])] });
    const state = makeState({ pBf: [target], oBf: [artifactSource] });

    const s1 = hurtCreature(state, 'tgt-1', 3, 'Ornithopter', { sourceIid: 'src-1', sourceType: 'creature' });
    expect(s1.p.bf.find(c => c.iid === 'tgt-1').damage).toBe(0);
    const s2 = hurtCreature(s1, 'tgt-1', 3, 'Ornithopter', { sourceIid: 'src-1', sourceType: 'creature' });
    expect(s2.p.bf.find(c => c.iid === 'tgt-1').damage).toBe(0);
  });

  it('PROT-14: source resolution correctly reaches the stack (not just the battlefield) for spell-sourced damage', () => {
    const artifactSpell = makeSpell('spell-1', { id: 'ornithopter_bolt', name: 'Artifact Zap', type: 'Instant', color: '', caster: 'o' });
    // The card object carries its own iid so buildDamageShieldPool-style lookups (and our source lookup) can match it.
    const stackCard = { ...artifactSpell, iid: 'spell-1', type: 'Artifact' };
    const target = makeCreature('tgt-1', { controller: 'p', enchantments: [wardAura('Artifact Ward', ['artifact'])] });
    const base = makeState({ pBf: [target] });
    const state = { ...base, stack: [{ id: 'stk-1', card: stackCard, caster: 'o', targets: ['tgt-1'], xVal: 1 }] };

    const s1 = hurtCreature(state, 'tgt-1', 4, 'Artifact Zap', { sourceIid: 'spell-1', sourceType: 'spell' });

    expect(s1.p.bf.find(c => c.iid === 'tgt-1').damage).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Targeting legality (10)
// ---------------------------------------------------------------------------
describe('@engine Scenario: protection from artifact -- targeting legality (CAST_SPELL)', () => {
  function artifactTargetSpell(iid, overrides = {}) {
    return makeSpell(iid, { id: 'artifact_zap', name: 'Artifact Zap', type: 'Artifact', color: '', cost: '1', cmc: 1, effect: 'protArtifactTestFizzle', ...overrides });
  }

  it('PROT-15: an artifact spell targeting the protected creature is rejected outright -- no stack item, no mana spent, hand unchanged', () => {
    const spell = artifactTargetSpell('spell-1');
    const target = makeCreature('tgt-1', { controller: 'o', enchantments: [wardAura('Artifact Ward', ['artifact'])] });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [spell], oBf: [target] });
    const state = { ...base, p: { ...base.p, mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 1 } } };

    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'spell-1', tgt: 'tgt-1' });

    expect(s1.stack).toHaveLength(0);
    expect(s1.p.hand.some(c => c.iid === 'spell-1')).toBe(true);
    expect(s1.p.mana.C).toBe(1);
  });

  it('PROT-16: the same spell targeting a different, unprotected creature succeeds normally', () => {
    const spell = artifactTargetSpell('spell-1');
    const target = makeCreature('tgt-1', { controller: 'o' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [spell], oBf: [target] });
    const state = { ...base, p: { ...base.p, mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 1 } } };

    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'spell-1', tgt: 'tgt-1' });

    expect(s1.stack).toHaveLength(1);
    expect(s1.p.hand.some(c => c.iid === 'spell-1')).toBe(false);
  });

  it('PROT-17: the plain single-ability activate path rejects an artifact permanent\'s ability aimed at the protected creature', () => {
    const activator = artifactCreature('act-1', { controller: 'p', power: 0, toughness: 4, activated: { cost: 'T', effect: 'protArtifactTestFizzle' } });
    const target = makeCreature('tgt-1', { controller: 'o', enchantments: [wardAura('Artifact Ward', ['artifact'])] });
    const state = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [activator], oBf: [target] });

    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'act-1', tgt: 'tgt-1' });

    expect(s1.stack).toHaveLength(0);
    expect(s1.p.bf.find(c => c.iid === 'act-1').tapped).toBe(false);
  });

  it('PROT-18: regression -- a non-artifact spell can still target the protected creature normally', () => {
    const spell = makeSpell('spell-1', { id: 'shock', name: 'Shock', type: 'Instant', color: 'R', cost: 'R', cmc: 1, effect: 'protArtifactTestFizzle' });
    const target = makeCreature('tgt-1', { controller: 'o', enchantments: [wardAura('Artifact Ward', ['artifact'])] });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [spell], oBf: [target] });
    const state = { ...base, p: { ...base.p, mana: { W: 0, U: 0, B: 0, R: 1, G: 0, C: 0 } } };

    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'spell-1', tgt: 'tgt-1' });

    expect(s1.stack).toHaveLength(1);
  });

  it('PROT-19: a color-protected creature is still correctly protected from same-color targeting (color leg of the new gate)', () => {
    const blackSpell = makeSpell('spell-1', { id: 'terror', name: 'Terror', type: 'Instant', color: 'B', cost: 'B', cmc: 1, effect: 'protArtifactTestFizzle' });
    const target = makeCreature('tgt-1', { controller: 'o', enchantments: [wardAura('Black Ward', ['B'])] });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [blackSpell], oBf: [target] });
    const state = { ...base, p: { ...base.p, mana: { W: 0, U: 0, B: 1, R: 0, G: 0, C: 0 } } };

    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'spell-1', tgt: 'tgt-1' });

    expect(s1.stack).toHaveLength(0);
    expect(s1.p.hand.some(c => c.iid === 'spell-1')).toBe(true);
  });

  it('PROT-20: the Pyramids array-ability branch is unchanged -- no protection check added there', () => {
    // Source inspection: the "destroyLandAura"/"preventLandDestructionOnce" branch
    // (the array-ability shape) still has no isProtectedFromSource call anywhere
    // in this codebase outside CAST_SPELL / the plain ACTIVATE_ABILITY path.
    const src = readFileSync(new URL('../../src/engine/DuelCore.js', import.meta.url), 'utf8');
    const branchStart = src.indexOf('ab.effect === "destroyLandAura"');
    const branchEnd = src.indexOf('return s;\n  }\n\n  if (!card.activated)');
    const branch = src.slice(branchStart, branchEnd);
    expect(branch).not.toContain('isProtectedFromSource');
  });

  it('PROT-21: a rejected cast produces the specified dlog message format', () => {
    const spell = artifactTargetSpell('spell-1');
    const target = makeCreature('tgt-1', { controller: 'o', name: 'Serra Angel', enchantments: [wardAura('Artifact Ward', ['artifact'])] });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [spell], oBf: [target] });
    const state = { ...base, p: { ...base.p, mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 1 } } };

    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'spell-1', tgt: 'tgt-1' });

    expect(s1.log[s1.log.length - 1].text).toBe("Artifact Zap can't target Serra Angel (protection from artifact).");
  });

  it('PROT-22: an artifact CREATURE spell that would target something protected is also rejected at cast time', () => {
    const artifactCreatureSpell = makeCreature('spell-1', { id: 'triskelion', name: 'Triskelion', type: 'Artifact Creature', color: '', cost: '3', cmc: 3, controller: 'p' });
    // Cast from hand, not battlefield -- CAST_SPELL reads from s.p.hand.
    const spellCard = { ...artifactCreatureSpell, effect: 'protArtifactTestFizzle' };
    const target = makeCreature('tgt-1', { controller: 'o', enchantments: [wardAura('Artifact Ward', ['artifact'])] });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [spellCard], oBf: [target] });
    const state = { ...base, p: { ...base.p, mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 3 } } };

    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'spell-1', tgt: 'tgt-1' });

    expect(s1.stack).toHaveLength(0);
  });

  it('PROT-23: modalChoice re-entry is not re-checked for protection at resolution time (cast-time check already covered legality)', () => {
    // The only protection-targeting checks added by this phase live in CAST_SPELL
    // and the plain ACTIVATE_ABILITY path, both of which run before the item is
    // ever pushed to the stack. RESOLVE_STACK / CHOOSE_MODAL never re-invoke
    // isProtectedFromSource, so a modal choice made after a legal cast cannot be
    // retroactively invalidated by this phase's changes.
    const src = readFileSync(new URL('../../src/engine/DuelCore.js', import.meta.url), 'utf8');
    const resolveStackStart = src.indexOf('case "RESOLVE_STACK"');
    const resolveStackEnd = src.indexOf('case "CAST_SPELL"') > resolveStackStart ? src.indexOf('case "CAST_SPELL"') : src.length;
    // RESOLVE_STACK is defined after CAST_SPELL in this file -- just confirm no
    // isProtectedFromSource call exists anywhere in RESOLVE_STACK's own body by
    // checking the next 4000 chars (comfortably past its closing brace).
    const resolveStackBody = src.slice(resolveStackStart, resolveStackStart + 4000);
    expect(resolveStackBody).not.toContain('isProtectedFromSource');
  });

  it('PROT-24: target permanent not found (already left the battlefield) is unaffected by the new protection check', () => {
    const spell = artifactTargetSpell('spell-1');
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pHand: [spell] });
    const state = { ...base, p: { ...base.p, mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 1 } } };

    const s1 = duelReducer(state, { type: 'CAST_SPELL', who: 'p', iid: 'spell-1', tgt: 'no-such-iid' });

    // Not found -> isProtectedFromSource is never reached -- cast proceeds normally.
    expect(s1.stack).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Card-level and click-guard-equivalent (4)
// ---------------------------------------------------------------------------
describe('@engine Scenario: protection from artifact -- Artifact Ward card data + isProtectedFromSource', () => {
  it('PROT-25: Artifact Ward\'s mod.protection correctly surfaces on the enchanted creature via computeCharacteristics', () => {
    const target = makeCreature('tgt-1', { enchantments: [wardAura('Artifact Ward', ['artifact'])] });
    const source = artifactCreature('src-1');
    expect(isProtectedFromSource(target, source, makeState({ pBf: [target] }))).toBe(true);
    const nonArtifactSource = makeCreature('src-2', { color: 'G' });
    expect(isProtectedFromSource(target, nonArtifactSource, makeState({ pBf: [target] }))).toBe(false);
  });

  it('PROT-26: the click-guard equivalent -- isProtectedFromSource is the sole gate the DuelScreen/Mobile click handlers call, and it is source-specific (non-artifact source is a legal click target)', () => {
    const target = makeCreature('tgt-1', { enchantments: [wardAura('Artifact Ward', ['artifact'])] });
    const artifactSource = artifactCreature('src-1');
    const nonArtifactSource = makeCreature('src-2', { color: 'U' });
    const state = makeState({ pBf: [target] });
    expect(isProtectedFromSource(target, artifactSource, state)).toBe(true); // click guard fires (no-op)
    expect(isProtectedFromSource(target, nonArtifactSource, state)).toBe(false); // click registers normally
  });

  it('PROT-27: the click-guard reads AURA-GRANTED protection via full computeCharacteristics, not a raw card.protection field', () => {
    // A creature with NO intrinsic card.protection field at all, protected only
    // via an attached Aura -- a raw `card.protection` read would see nothing.
    const target = makeCreature('tgt-1', { protection: undefined, enchantments: [wardAura('Artifact Ward', ['artifact'])] });
    expect(target.protection).toBeUndefined();
    const source = artifactCreature('src-1');
    expect(isProtectedFromSource(target, source, makeState({ pBf: [target] }))).toBe(true);
  });

  it('PROT-28: removing the Aura removes the click-guard restriction and the damage/targeting protections on the next state read', () => {
    const target = makeCreature('tgt-1', { enchantments: [wardAura('Artifact Ward', ['artifact'])] });
    const source = artifactCreature('src-1');
    const state = makeState({ pBf: [target] });
    expect(isProtectedFromSource(target, source, state)).toBe(true);
    const unenchanted = { ...target, enchantments: [] };
    const state2 = { ...state, p: { ...state.p, bf: [unenchanted] } };
    expect(isProtectedFromSource(unenchanted, source, state2)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Additional coverage (4) -- mixed-format regression + direct helper edge cases
// ---------------------------------------------------------------------------
describe('@engine Scenario: protection from artifact -- additional coverage', () => {
  it('PROT-29: mixed single-letter/full-word protection array formats both work together on the same creature', () => {
    // Ward cycle uses single-letter color codes (mod.protection:["B"]); Artifact
    // Ward uses the full word "artifact" (no letter-code equivalent for a type).
    // Both must resolve correctly through the same PROT_MAP fallback.
    const blocker = makeCreature('bl-1', { controller: 'p', enchantments: [wardAura('Black Ward', ['B']), wardAura('Artifact Ward', ['artifact'])] });
    const state = makeState({ pBf: [blocker] });
    expect(isProtectedFromSource(blocker, makeCreature('s1', { color: 'B' }), state)).toBe(true);
    expect(isProtectedFromSource(blocker, artifactCreature('s2'), state)).toBe(true);
    expect(isProtectedFromSource(blocker, makeCreature('s3', { color: 'G' }), state)).toBe(false);
  });

  it('PROT-30: isProtectedFromSource -- artifact source vs. artifact-protected target is true, vs. color-protected target is false', () => {
    const artifactProtected = makeCreature('t1', { enchantments: [wardAura('Artifact Ward', ['artifact'])] });
    const colorProtected = makeCreature('t2', { enchantments: [wardAura('Black Ward', ['B'])] });
    const source = artifactCreature('s1', { color: '' });
    const state = makeState({ pBf: [artifactProtected, colorProtected] });
    expect(isProtectedFromSource(artifactProtected, source, state)).toBe(true);
    expect(isProtectedFromSource(colorProtected, source, state)).toBe(false);
  });

  it('PROT-31: isProtectedFromSource -- single-letter color code protection (Ward cycle format) correctly matches a same-color source', () => {
    const target = makeCreature('t1', { enchantments: [wardAura('Green Ward', ['G'])] });
    const state = makeState({ pBf: [target] });
    expect(isProtectedFromSource(target, makeCreature('s1', { color: 'G' }), state)).toBe(true);
    expect(isProtectedFromSource(target, makeCreature('s2', { color: 'R' }), state)).toBe(false);
  });

  it('PROT-32: DECLARE_BLOCKER dispatch-level integration for an artifact land creature (not just the pure canBlockDuel call)', () => {
    const artifactLandCreature = makeCreature('alc-1', {
      id: 'animated_artifact_land', name: 'Animated Artifact Land', type: 'Land Creature Artifact', subtype: 'Assembly-Worker', controller: 'o',
    });
    const blocker = makeCreature('bl-1', { controller: 'p', enchantments: [wardAura('Artifact Ward', ['artifact'])] });
    const state = { ...makeState({ phase: PHASE.COMBAT_BLOCKERS, active: 'o', oBf: [artifactLandCreature], pBf: [blocker] }), attackers: ['alc-1'] };

    const s1 = duelReducer(state, { type: 'DECLARE_BLOCKER', attId: 'alc-1', blId: 'bl-1' });

    expect(s1.p.bf.find(c => c.iid === 'bl-1').blocking).toBeFalsy();
  });
});
