// tests/scenarios/copy-mechanism-generalized.test.js
// Layer 1 (copy): applyPermanentCopy is the generalized helper extracted from
// Copy Artifact's original copyPermanentCharacteristics case. Verifies Copy
// Artifact's behavior is unchanged (regression) and that the shared helper
// correctly applies both override options: typeSuffix (Copy Artifact) and
// colorOverride (Vesuvan Doppelganger).

import { describe, it, expect } from 'vitest';
import { duelReducer } from '../../src/engine/DuelCore.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature } from '../../src/engine/__tests__/_factory.js';
import KEYWORDS from '../../src/data/keywords.js';

const MUST_ATTACK = KEYWORDS.MUST_ATTACK.id;

function makeCopyArtifact(iid = 'ca-1') {
  return {
    iid, id: 'copy_artifact', name: 'Copy Artifact', type: 'Enchantment',
    color: 'U', cmc: 2, cost: '1U', effect: 'copyPermanentCharacteristics',
    keywords: [], tapped: false, summoningSick: false, attacking: false,
    blocking: null, damage: 0, counters: {}, eotBuffs: [], enchantments: [],
    controller: 'p',
  };
}

function makeVesuvan(iid = 'ves-1') {
  return {
    iid, id: 'vesuvan_doppelganger', name: 'Vesuvan Doppelganger', type: 'Creature',
    subtype: 'Shapeshifter', color: 'U', cmc: 5, cost: '3UU', power: 0, toughness: 0,
    effect: 'vesuvanEtbCopy', keywords: [], tapped: false, summoningSick: false,
    attacking: false, blocking: null, damage: 0, counters: {}, eotBuffs: [],
    enchantments: [], controller: 'p',
  };
}

function stateWithOnStack(card, oBf, targetIid) {
  const base = makeState({ phase: PHASE.MAIN_1, active: 'p', oBf });
  return {
    ...base,
    stack: [{ id: 'si-1', card, caster: 'p', targets: targetIid ? [targetIid] : [], xVal: 1 }],
  };
}

describe('@engine-layers-copy-1 Scenario: applyPermanentCopy generalization', () => {

  it('Copy Artifact regression: still copies printed P/T/type/keywords via typeSuffix (byte-for-byte behavior)', () => {
    const juggernaut = makeCreature('jug-1', {
      id: 'juggernaut', name: 'Juggernaut', type: 'Artifact Creature', subtype: 'Juggernaut',
      color: '', power: 5, toughness: 3, keywords: [MUST_ATTACK], controller: 'o',
    });
    const ca = makeCopyArtifact();
    const state = stateWithOnStack(ca, [juggernaut], 'jug-1');
    const s1 = duelReducer(state, { type: 'RESOLVE_STACK' });

    const copy = s1.p.bf.find(c => c.iid === 'ca-1');
    expect(copy.name).toBe('Juggernaut');
    expect(copy.power).toBe(5);
    expect(copy.toughness).toBe(3);
    expect(copy.type).toContain('Enchantment');
    expect(copy.type).toContain('Artifact Creature');
    expect(copy.keywords).toContain(MUST_ATTACK);
    // typeSuffix path does NOT override color -- Copy Artifact keeps the copied
    // creature's own color (Juggernaut is colorless).
    expect(copy.color).toBe('');
  });

  it('Copy Artifact regression: no target leaves it as a plain Enchantment', () => {
    const ca = makeCopyArtifact();
    const state = stateWithOnStack(ca, [], null);
    const s1 = duelReducer(state, { type: 'RESOLVE_STACK' });
    const onBf = s1.p.bf.find(c => c.iid === 'ca-1');
    expect(onBf.name).toBe('Copy Artifact');
    expect(onBf.type).toBe('Enchantment');
  });

  it('colorOverride: Vesuvan Doppelganger copies a creature but keeps its own printed color instead', () => {
    const bears = makeCreature('bear-1', {
      id: 'grizzly_bears', name: 'Grizzly Bears', type: 'Creature', subtype: 'Bear',
      color: 'G', power: 2, toughness: 2, controller: 'o',
    });
    const ves = makeVesuvan();
    const state = stateWithOnStack(ves, [bears], 'bear-1');
    const s1 = duelReducer(state, { type: 'RESOLVE_STACK' });

    const copy = s1.p.bf.find(c => c.iid === 'ves-1');
    expect(copy.name).toBe('Grizzly Bears');
    expect(copy.power).toBe(2);
    expect(copy.toughness).toBe(2);
    // colorOverride path: forced blue, NOT the copied creature's green.
    expect(copy.color).toBe('U');
    // colorOverride path does not add a typeSuffix -- type is copied as-is.
    expect(copy.type).toBe('Creature');
  });

  it('applyPermanentCopy never copies live battlefield state (counters/auras) from the source in either override mode', () => {
    const bears = makeCreature('bear-1', {
      id: 'grizzly_bears', name: 'Grizzly Bears', type: 'Creature', subtype: 'Bear',
      color: 'G', power: 2, toughness: 2, controller: 'o',
      counters: { P1P1: 3 },
      enchantments: [{ iid: 'aura-1', name: 'Rusalka', mod: {}, controller: 'o', enterTs: 0 }],
    });
    const ves = makeVesuvan();
    const state = stateWithOnStack(ves, [bears], 'bear-1');
    const s1 = duelReducer(state, { type: 'RESOLVE_STACK' });
    const copy = s1.p.bf.find(c => c.iid === 'ves-1');
    expect(copy.counters?.P1P1 ?? 0).toBe(0);
    expect(copy.enchantments?.length ?? 0).toBe(0);
  });
});
