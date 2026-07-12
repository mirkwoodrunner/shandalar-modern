// tests/scenarios/land-destruction-pyramids.test.js
// Land Destruction Centralization + Pyramids.
// Validates: destroyLand() as the new land-destruction choke point,
// turnState.landDestructionShields, migration parity for all 9 raw
// zMove(...,"gy") land-destroy sites, the sacrifice-vs-destroy boundary
// (sacrifice sites must remain unmigrated and shield-blind), and Pyramids'
// two activated-ability modes. See docs/ENGINE_CONTRACT_SPEC.md -- Land
// Destruction.

import { readFileSync } from 'node:fs';
import { describe, it, expect, vi } from 'vitest';
import {
  duelReducer, resolveEff, destroyLand, makeCardInstance,
} from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import {
  getEffectiveAbilityEffect, isCreatureOnlyTarget, isLandOnlyTarget,
} from '../../src/hooks/useDuelController';
import {
  makeState, makeCreature, makeLand, makeStackItem,
} from '../../src/engine/__tests__/_factory.js';

function withLandShields(base, landDestructionShields) {
  return { ...base, turnState: { ...base.turnState, landDestructionShields } };
}

function makePyramids(iid, overrides = {}) {
  return {
    iid, id: 'pyramids', name: 'Pyramids', type: 'Artifact', color: '', cmc: 6, cost: '6',
    tapped: false, summoningSick: false, attacking: false, blocking: null, damage: 0, counters: {},
    eotBuffs: [], enchantments: [], controller: 'p',
    activatedAbilities: [
      { id: 'pyramids_destroy_aura', cost: { generic: 2 }, effect: 'destroyLandAura', description: 'Destroy target Aura attached to a land' },
      { id: 'pyramids_prevent_destruction', cost: { generic: 2 }, effect: 'preventLandDestructionOnce', description: 'The next time target land would be destroyed this turn, remove all damage marked on it instead' },
    ],
    ...overrides,
  };
}

const SRC = readFileSync(new URL('../../src/engine/DuelCore.js', import.meta.url), 'utf8');

// ─── Infrastructure (LAND-01 .. LAND-09) ─────────────────────────────────────

describe('@engine Scenario: destroyLand -- basic behavior', () => {
  it('LAND-01: no shield present -- land moves to gy, dlog matches pre-migration text', () => {
    const land = makeLand('l1', { name: 'Forest', controller: 'p' });
    const state = makeState({ pBf: [land] });
    const s1 = destroyLand(state, 'l1', 'Test Source');
    expect(s1.p.bf.some(c => c.iid === 'l1')).toBe(false);
    expect(s1.p.gy.some(c => c.iid === 'l1')).toBe(true);
    expect(s1.log[s1.log.length - 1].text).toBe('Test Source destroys Forest.');
  });

  it('LAND-02: target not found -- console.error, state unchanged', () => {
    const state = makeState({});
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const s1 = destroyLand(state, 'nonexistent-iid', 'Test Source');
    expect(s1).toBe(state);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('@engine Scenario: destroyLand -- landDestructionShields', () => {
  it('LAND-03: shield present -- land survives, shield consumed, no gy move', () => {
    const land = makeLand('l1', { name: 'Forest', controller: 'p' });
    const base = makeState({ pBf: [land] });
    const state = withLandShields(base, { l1: [{ shieldSourceIid: 'pyr-1', shieldSourceName: 'Pyramids' }] });
    const s1 = destroyLand(state, 'l1', 'Armageddon');
    expect(s1.p.bf.some(c => c.iid === 'l1')).toBe(true);
    expect(s1.p.gy.some(c => c.iid === 'l1')).toBe(false);
    expect(s1.turnState.landDestructionShields.l1).toEqual([]);
    expect(s1.log[s1.log.length - 1].text).toBe('Pyramids: Forest is not destroyed.');
  });

  it('LAND-04: shield consumed leaves any OTHER land\'s shields (different iid) untouched', () => {
    const a = makeLand('a1', { name: 'Forest A', controller: 'p' });
    const b = makeLand('b1', { name: 'Forest B', controller: 'p' });
    const base = makeState({ pBf: [a, b] });
    const state = withLandShields(base, {
      a1: [{ shieldSourceIid: 'pyr-1', shieldSourceName: 'Pyramids' }],
      b1: [{ shieldSourceIid: 'pyr-2', shieldSourceName: 'Pyramids' }],
    });
    const s1 = destroyLand(state, 'a1', 'Armageddon');
    expect(s1.turnState.landDestructionShields.a1).toEqual([]);
    expect(s1.turnState.landDestructionShields.b1).toHaveLength(1);
  });

  it('LAND-05: shields do not persist across turns -- cleared by turn-reset alongside damageShields/creatureDamageShields', () => {
    const land = makeLand('l1', { name: 'Forest', controller: 'p' });
    const base = makeState({ phase: PHASE.END, active: 'p', pBf: [land] });
    const state = withLandShields(base, { l1: [{ shieldSourceIid: 'pyr-1', shieldSourceName: 'Pyramids' }] });
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // END -> CLEANUP
    expect(s1.phase).toBe(PHASE.CLEANUP);
    expect(s1.turnState.landDestructionShields).toEqual({});
  });

  it('LAND-06: two shields stacked on the same land -- one attempt consumes exactly one, land survives, one remains', () => {
    const land = makeLand('l1', { name: 'Forest', controller: 'p' });
    const base = makeState({ pBf: [land] });
    const state = withLandShields(base, {
      l1: [
        { shieldSourceIid: 'pyr-1', shieldSourceName: 'Pyramids' },
        { shieldSourceIid: 'pyr-2', shieldSourceName: 'Pyramids' },
      ],
    });
    const s1 = destroyLand(state, 'l1', 'Armageddon');
    expect(s1.p.bf.some(c => c.iid === 'l1')).toBe(true);
    expect(s1.turnState.landDestructionShields.l1).toHaveLength(1);
  });
});

describe('@engine Scenario: getEffectiveAbilityEffect -- three-shape priority', () => {
  it('LAND-07: returns the array-sourced effect, the single activated.effect, or card.effect, in priority order', () => {
    const pyr = makePyramids('pyr-1');
    expect(getEffectiveAbilityEffect(pyr, 'pyramids_prevent_destruction')).toBe('preventLandDestructionOnce');
    expect(getEffectiveAbilityEffect(pyr, 'pyramids_destroy_aura')).toBe('destroyLandAura');

    const jm = { id: 'jade_monolith', activated: { cost: '1', effect: 'chooseDamageShieldSourceForTarget' } };
    expect(getEffectiveAbilityEffect(jm)).toBe('chooseDamageShieldSourceForTarget');

    const bolt = { id: 'lightning_bolt', effect: 'damage3' };
    expect(getEffectiveAbilityEffect(bolt)).toBe('damage3');
  });
});

describe('@engine Scenario: land destruction centralization -- migration tripwire', () => {
  it('LAND-08: none of the 9 migrated sites still contain their pre-migration raw zMove(...,"gy") call', () => {
    expect(SRC).not.toContain('if (tgtC && isLand(tgtC)) { ns = zMove(ns, tgtC.iid, tgtC.controller, tgtC.controller, "gy"); ns = dlog(ns, `${card.name} destroys ${tgtC.name}.`, "effect"); }');
    expect(SRC).not.toContain('for (const w of ["p","o"]) for (const c of [...ns[w].bf].filter(isLand)) ns = zMove(ns, c.iid, w, w, "gy");');
    expect(SRC).not.toContain('for (const w of ["p","o"]) for (const c of [...ns[w].bf].filter(c => isLand(c) && c.subtype?.includes("Island"))) ns = zMove(ns, c.iid, w, w, "gy");');
    expect(SRC).not.toContain('for (const w of ["p","o"]) for (const c of [...ns[w].bf].filter(c => isLand(c) && c.subtype?.includes("Plains"))) ns = zMove(ns, c.iid, w, w, "gy");');
    expect(SRC).not.toContain("for (const f of forests) ns = zMove(ns, f.iid, w, w, 'gy');");
    expect(SRC).not.toContain('ns = zMove(ns, enchLand.iid, landCtrl, landCtrl, "gy");');
    expect(SRC).not.toContain('ns = zMove(ns, c.iid, w, w, "gy");\n      ns = dlog(ns, "Erosion destroys the enchanted land.", "effect");');
    expect(SRC).not.toContain('const ns = zMove(s, choice.iid, owner, owner, "gy");\n      return dlog(ns, "Erosion destroys the enchanted land.", "effect");');
    expect(SRC).not.toContain('let s = zMove(state, hostIid, hostOwner, hostOwner, "gy");\n      return dlog(s, "Blight destroys the enchanted land.", \'effect\');');
    // Kudzu's own non-land zMove calls (falls off / no lands remain) remain untouched.
    expect(SRC).toContain('ns = zMove(ns, c.iid, w, w, "gy");\n    ns = dlog(ns, "Kudzu: not attached to a land — goes to graveyard.", "effect");');
    expect(SRC).toContain('ns = zMove(ns, c.iid, w, w, "gy");\n    ns = dlog(ns, "Kudzu: no lands remain — goes to graveyard.", "effect");');
  });

  it('LAND-09: getEffectiveAbilityEffect refactor does not change Jade Monolith\'s existing creature-only click restriction', () => {
    const jm = { id: 'jade_monolith', activated: { cost: '1', effect: 'chooseDamageShieldSourceForTarget' } };
    const land = makeLand('land-1');
    const creature = makeCreature('cre-1');
    // No abilityId involved -- Jade Monolith uses the single activated.effect shape.
    expect(isCreatureOnlyTarget(jm)).toBe(true);
    expect(isCreatureOnlyTarget(jm) && land.type !== 'Creature').toBe(true); // land click: illegal, no-op
    expect(isCreatureOnlyTarget(jm) && creature.type !== 'Creature').toBe(false); // creature click: legal
    const unrelated = { id: 'grizzly_bears', activated: { cost: '1', effect: 'pumpCreature' } };
    expect(isCreatureOnlyTarget(unrelated)).toBe(false);
  });
});

// ─── Migration parity (LAND-P01 .. LAND-P09) ─────────────────────────────────

describe('@engine Scenario: migrated raw-site parity', () => {
  it('LAND-P01: destroyTargetLand -- indestructible land is NOT destroyed, non-indestructible land is destroyed via destroyLand()', () => {
    const indestructibleLand = makeLand('l1', { name: 'Forest', controller: 'o', keywords: ['INDESTRUCTIBLE'] });
    const src = { id: 'stone_rain', name: 'Stone Rain', effect: 'destroyTargetLand', iid: 'sr-1' };
    const base = makeState({ oBf: [indestructibleLand] });
    const item1 = makeStackItem(src, 'p', ['l1'], 1);
    const s1 = resolveEff(base, item1);
    expect(s1.o.bf.some(c => c.iid === 'l1')).toBe(true);
    expect(s1.log[s1.log.length - 1].text).toBe('Forest is indestructible.');

    const plainLand = makeLand('l2', { name: 'Forest', controller: 'o' });
    const base2 = makeState({ oBf: [plainLand] });
    const item2 = makeStackItem(src, 'p', ['l2'], 1);
    const s2 = resolveEff(base2, item2);
    expect(s2.o.bf.some(c => c.iid === 'l2')).toBe(false);
    expect(s2.o.gy.some(c => c.iid === 'l2')).toBe(true);
  });

  it('LAND-P02: destroyAllLands (Armageddon) -- both players\' lands destroyed, dlog text unchanged', () => {
    const pLand = makeLand('p1', { controller: 'p' });
    const oLand = makeLand('o1', { controller: 'o' });
    const src = { id: 'armageddon', name: 'Armageddon', effect: 'destroyAllLands', iid: 'arm-1' };
    const base = makeState({ pBf: [pLand], oBf: [oLand] });
    const item = makeStackItem(src, 'p', [], 1);
    const s1 = resolveEff(base, item);
    expect(s1.p.bf.some(c => c.iid === 'p1')).toBe(false);
    expect(s1.o.bf.some(c => c.iid === 'o1')).toBe(false);
    expect(s1.log.some(l => l.text === 'Armageddon — all lands destroyed!')).toBe(true);
  });

  it('LAND-P03: destroyIslands -- only Islands destroyed, other lands untouched', () => {
    const island = makeLand('i1', { subtype: 'Island', controller: 'p' });
    const forest = makeLand('f1', { subtype: 'Forest', controller: 'p' });
    const src = { id: 'flashfires', name: 'Flashfires', effect: 'destroyIslands', iid: 'ff-1' };
    const base = makeState({ pBf: [island, forest] });
    const item = makeStackItem(src, 'p', [], 1);
    const s1 = resolveEff(base, item);
    expect(s1.p.bf.some(c => c.iid === 'i1')).toBe(false);
    expect(s1.p.bf.some(c => c.iid === 'f1')).toBe(true);
  });

  it('LAND-P04: destroyPlains -- only Plains destroyed, other lands untouched', () => {
    const plains = makeLand('pl1', { subtype: 'Plains', controller: 'p' });
    const forest = makeLand('f1', { subtype: 'Forest', controller: 'p' });
    const src = { id: 'boil_esque', name: 'Sandstorm', effect: 'destroyPlains', iid: 'ss-1' };
    const base = makeState({ pBf: [plains, forest] });
    const item = makeStackItem(src, 'p', [], 1);
    const s1 = resolveEff(base, item);
    expect(s1.p.bf.some(c => c.iid === 'pl1')).toBe(false);
    expect(s1.p.bf.some(c => c.iid === 'f1')).toBe(true);
  });

  it('LAND-P05: destroyForests -- only Forests destroyed, other lands untouched', () => {
    const forest = makeLand('f1', { subtype: 'Forest', controller: 'p' });
    const island = makeLand('i1', { subtype: 'Island', controller: 'p' });
    const src = { id: 'tsunami_esque', name: 'Tsunami', effect: 'destroyForests', iid: 'ts-1' };
    const base = makeState({ pBf: [forest, island] });
    const item = makeStackItem(src, 'p', [], 1);
    const s1 = resolveEff(base, item);
    expect(s1.p.bf.some(c => c.iid === 'f1')).toBe(false);
    expect(s1.p.bf.some(c => c.iid === 'i1')).toBe(true);
  });

  it('LAND-P06: kudzuUpkeep -- enchanted land destroyed via destroyLand(); Kudzu-falls-off zMove is untouched', () => {
    const host = makeLand('host-1', { name: 'Forest', controller: 'p' });
    const kudzu = makeCreature('kudzu-1', { id: 'kudzu', name: 'Kudzu', type: 'Enchantment', upkeep: 'kudzuUpkeep', enchantedLandIid: 'host-1', controller: 'p' });
    const base = makeState({ phase: PHASE.UNTAP, active: 'p', pBf: [host, kudzu] });
    const s1 = duelReducer(base, { type: 'ADVANCE_PHASE' }); // UNTAP -> UPKEEP
    expect(s1.p.bf.some(c => c.iid === 'host-1')).toBe(false);
    expect(s1.p.gy.some(c => c.iid === 'host-1')).toBe(true);
    expect(s1.log.some(l => l.text === 'Kudzu destroys Forest.')).toBe(true);

    // Kudzu-falls-off branch (unattached, no host found): unmigrated zMove untouched.
    const kudzuAlone = makeCreature('kudzu-2', { id: 'kudzu', name: 'Kudzu', type: 'Enchantment', upkeep: 'kudzuUpkeep', enchantedLandIid: 'nonexistent', controller: 'p' });
    const base2 = makeState({ phase: PHASE.UNTAP, active: 'p', pBf: [kudzuAlone] });
    const s2 = duelReducer(base2, { type: 'ADVANCE_PHASE' });
    expect(s2.p.bf.some(c => c.iid === 'kudzu-2')).toBe(false);
    expect(s2.p.gy.some(c => c.iid === 'kudzu-2')).toBe(true);
    expect(s2.log.some(l => l.text === 'Kudzu: not attached to a land — goes to graveyard.')).toBe(true);
  });

  it('LAND-P07: Erosion, AI branch -- land destroyed when the AI can\'t/won\'t pay', () => {
    const host = makeLand('host-1', { name: 'Island', controller: 'o', enchantments: [{ name: 'Erosion' }] });
    const base = makeState({ phase: PHASE.UNTAP, active: 'o', oBf: [host] });
    const state = { ...base, o: { ...base.o, life: 1, mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } } };
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // UNTAP -> UPKEEP
    expect(s1.o.bf.some(c => c.iid === 'host-1')).toBe(false);
    expect(s1.o.gy.some(c => c.iid === 'host-1')).toBe(true);
    expect(s1.log.some(l => l.text === 'Erosion destroys the enchanted land.')).toBe(true);
  });

  it('LAND-P08: Erosion, human erosionUpkeep choice-resolve -- land destroyed via the human path', () => {
    const host = makeLand('host-1', { name: 'Island', controller: 'p', enchantments: [{ name: 'Erosion' }] });
    const base = makeState({ phase: PHASE.UNTAP, active: 'p', pBf: [host] });
    const state = { ...base, p: { ...base.p, mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } } };
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // UNTAP -> UPKEEP
    expect(s1.pendingUpkeepChoice).not.toBeNull();
    expect(s1.pendingUpkeepChoice.handlerKey).toBe('erosionUpkeep');
    const s2 = duelReducer(s1, { type: 'UPKEEP_CHOICE_RESOLVE', choice: 'DECLINE' });
    expect(s2.p.bf.some(c => c.iid === 'host-1')).toBe(false);
    expect(s2.p.gy.some(c => c.iid === 'host-1')).toBe(true);
    expect(s2.log.some(l => l.text === 'Erosion destroys the enchanted land.')).toBe(true);
  });

  it('LAND-P09: blightDestroyHost -- enchanted land destroyed via destroyLand() when its host is tapped', () => {
    const host = makeLand('host-1', { controller: 'o', produces: ['G'] });
    const blightInst = makeCardInstance('blight', 'p');
    const blight = { ...blightInst, iid: 'blight-1', summoningSick: false, tapped: false, eotBuffs: [], enchantedLandIid: 'host-1' };
    const state = makeState({ pBf: [blight], oBf: [host] });
    const s1 = duelReducer(state, { type: 'TAP_LAND', who: 'o', iid: 'host-1' });
    expect(s1.o.bf.some(c => c.iid === 'host-1')).toBe(false);
    expect(s1.o.gy.some(c => c.iid === 'host-1')).toBe(true);
    expect(s1.log.some(l => l.text === 'Blight destroys the enchanted land.')).toBe(true);
  });
});

// ─── Regression, sacrifice sites (LAND-R01 .. LAND-R04) ──────────────────────

describe('@engine Scenario: sacrifice-vs-destroy boundary -- unmigrated sites ignore landDestructionShields', () => {
  it('LAND-R01: Balance\'s excess-land sacrifice proceeds even with a shield present on an excess land', () => {
    const p1 = makeLand('p1', { controller: 'p' });
    const p2 = makeLand('p2', { controller: 'p' });
    const p3 = makeLand('p3', { controller: 'p' }); // excess -- will be trimmed
    const src = { id: 'balance', name: 'Balance', effect: 'balance', iid: 'bal-1' };
    const base = makeState({ pBf: [p1, p2, p3], oBf: [] });
    const state = withLandShields(base, { p3: [{ shieldSourceIid: 'pyr-1', shieldSourceName: 'Pyramids' }] });
    const item = makeStackItem(src, 'p', [], 1);
    const s1 = resolveEff(state, item);
    // Only 0 opponent lands -> minLands=0 -> both p3 and one more are trimmed; shield does nothing.
    expect(s1.p.bf.filter(c => c.iid === 'p3').length).toBe(0);
  });

  it('LAND-R02: Elder Spawn\'s Island-sacrifice upkeep -- same non-interaction with a shield present', () => {
    const island = makeLand('i1', { subtype: 'Island', controller: 'o' });
    const elderSpawn = makeCreature('es-1', { id: 'elder_spawn', name: 'Elder Spawn', upkeep: 'elderSpawnUpkeep', controller: 'o' });
    const base = makeState({ phase: PHASE.UNTAP, active: 'o', oBf: [island, elderSpawn] });
    const state = withLandShields(base, { i1: [{ shieldSourceIid: 'pyr-1', shieldSourceName: 'Pyramids' }] });
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // UNTAP -> UPKEEP
    expect(s1.o.bf.some(c => c.iid === 'i1')).toBe(false);
    expect(s1.turnState.landDestructionShields.i1).toHaveLength(1); // shield never consulted
  });

  it('LAND-R03: Leviathan\'s two-Island sacrifice, AI path -- same non-interaction', () => {
    const i1 = makeLand('i1', { subtype: 'Island', controller: 'o' });
    const i2 = makeLand('i2', { subtype: 'Island', controller: 'o' });
    const leviathan = makeCreature('lev-1', { id: 'leviathan', name: 'Leviathan', tapped: true, upkeep: 'sacIslandsToUntapSelf', controller: 'o' });
    const base = makeState({ phase: PHASE.UNTAP, active: 'o', oBf: [i1, i2, leviathan] });
    const state = withLandShields(base, { i1: [{ shieldSourceIid: 'pyr-1', shieldSourceName: 'Pyramids' }] });
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // UNTAP -> UPKEEP
    expect(s1.o.bf.some(c => c.iid === 'i1')).toBe(false);
    expect(s1.o.bf.some(c => c.iid === 'i2')).toBe(false);
    expect(s1.turnState.landDestructionShields.i1).toHaveLength(1); // shield never consulted
  });

  it('LAND-R04: Leviathan\'s two-Island sacrifice, human path -- same non-interaction', () => {
    const i1 = makeLand('i1', { subtype: 'Island', controller: 'p' });
    const i2 = makeLand('i2', { subtype: 'Island', controller: 'p' });
    const leviathan = makeCreature('lev-1', { id: 'leviathan', name: 'Leviathan', tapped: true, upkeep: 'sacIslandsToUntapSelf', controller: 'p' });
    const base = makeState({ phase: PHASE.UNTAP, active: 'p', pBf: [i1, i2, leviathan] });
    const state = withLandShields(base, { i1: [{ shieldSourceIid: 'pyr-1', shieldSourceName: 'Pyramids' }] });
    const s1 = duelReducer(state, { type: 'ADVANCE_PHASE' }); // UNTAP -> UPKEEP
    expect(s1.pendingUpkeepChoice?.handlerKey).toBe('sacIslandsToUntapSelf');
    const s2 = duelReducer(s1, { type: 'UPKEEP_CHOICE_RESOLVE', choice: 'PAY' });
    expect(s2.p.bf.some(c => c.iid === 'i1')).toBe(false);
    expect(s2.p.bf.some(c => c.iid === 'i2')).toBe(false);
    expect(s2.turnState.landDestructionShields.i1).toHaveLength(1); // shield never consulted
  });
});

// ─── Pyramids card-level (PYR-01 .. PYR-03) ──────────────────────────────────

describe('@engine Scenario: Pyramids', () => {
  it('PYR-01: mode 1 (destroyLandAura) activation destroys a targeted Aura attached to a land, identical to Savaen Elves\' existing behavior', () => {
    const pyr = makePyramids('pyr-1', { controller: 'p' });
    const aura = makeCreature('aura-1', { id: 'some_land_aura', name: 'Some Land Aura', type: 'Enchantment', subtype: 'Aura', enchantedLandIid: 'host-1', controller: 'o' });
    const host = makeLand('host-1', { controller: 'o' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [pyr], oBf: [host, aura] });
    const state = { ...base, p: { ...base.p, mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 2 } } };
    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'pyr-1', tgt: 'aura-1', abilityId: 'pyramids_destroy_aura' });
    expect(s1.o.bf.some(c => c.iid === 'aura-1')).toBe(false);
    expect(s1.o.gy.some(c => c.iid === 'aura-1')).toBe(true);
    expect(s1.o.bf.some(c => c.iid === 'host-1')).toBe(true); // the land itself is untouched
    expect(s1.p.mana.C).toBe(0); // {2} generic paid
  });

  it('PYR-02: mode 2 (preventLandDestructionOnce) shields a targeted land from a subsequent mass-destruction effect', () => {
    const pyr = makePyramids('pyr-1', { controller: 'p' });
    const shielded = makeLand('l1', { name: 'Forest', controller: 'p' });
    const other = makeLand('l2', { name: 'Island', controller: 'p' });
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [pyr, shielded, other] });
    const state = { ...base, p: { ...base.p, mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 2 } } };
    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'pyr-1', tgt: 'l1', abilityId: 'pyramids_prevent_destruction' });
    expect(s1.turnState.landDestructionShields.l1).toHaveLength(1);

    const src = { id: 'armageddon', name: 'Armageddon', effect: 'destroyAllLands', iid: 'arm-1' };
    const item = makeStackItem(src, 'p', [], 1);
    const s2 = resolveEff(s1, item);
    expect(s2.p.bf.some(c => c.iid === 'l1')).toBe(true); // shielded, survives
    expect(s2.p.bf.some(c => c.iid === 'l2')).toBe(false); // not shielded, destroyed
  });

  it('PYR-03: clicking a creature or artifact during mode 2\'s targeting step is a no-op (isLandOnlyTarget guard), driven through the actual controller hook', () => {
    const pyr = makePyramids('pyr-1');
    const creature = makeCreature('cre-1');
    const artifact = { id: 'some_artifact', type: 'Artifact' };
    const land = makeLand('land-1');
    // Mirrors the guard used at both screens' click handlers:
    //   isLandOnlyTarget(castingCard, castFlow.abilityId) && !isLand(card)
    expect(isLandOnlyTarget(pyr, 'pyramids_prevent_destruction')).toBe(true);
    expect(isLandOnlyTarget(pyr, 'pyramids_prevent_destruction') && creature.type !== 'Land').toBe(true); // creature click: illegal, no-op
    expect(isLandOnlyTarget(pyr, 'pyramids_prevent_destruction') && artifact.type !== 'Land').toBe(true); // artifact click: illegal, no-op
    expect(isLandOnlyTarget(pyr, 'pyramids_prevent_destruction') && land.type !== 'Land').toBe(false); // land click: legal
    // Mode 1's abilityId must not trigger the land-only guard.
    expect(isLandOnlyTarget(pyr, 'pyramids_destroy_aura')).toBe(false);

    // Resolve-time defense-in-depth: a non-land target dispatched directly (bypassing the UI) fizzles.
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', pBf: [pyr, creature] });
    const state = { ...base, p: { ...base.p, mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 2 } } };
    const s1 = duelReducer(state, { type: 'ACTIVATE_ABILITY', who: 'p', iid: 'pyr-1', tgt: 'cre-1', abilityId: 'pyramids_prevent_destruction' });
    expect(s1.turnState.landDestructionShields ?? {}).toEqual({});
    expect(s1.log[s1.log.length - 1].text).toBe('Pyramids fizzles -- no valid land target.');
  });
});
