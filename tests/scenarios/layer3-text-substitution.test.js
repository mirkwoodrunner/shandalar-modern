// tests/scenarios/layer3-text-substitution.test.js
// Layer 3 (text substitution): Magical Hack (landtype word swap) and
// Sleight of Mind (color word swap). Baked-in mutation + computeCharacteristics.

import { describe, it, expect } from 'vitest';
import { duelReducer, hasKw } from '../../src/engine/DuelCore.js';
import { computeCharacteristics } from '../../src/engine/layers.js';
import { PHASE } from '../../src/engine/phases.js';
import { makeState, makeCreature } from '../../src/engine/__tests__/_factory.js';
import KEYWORDS from '../../src/data/keywords.js';

const SWAMPWALK  = KEYWORDS.SWAMPWALK.id;
const PLAINSWALK = KEYWORDS.PLAINSWALK.id;

describe('@engine-layers-copy-1 Scenario: Layer 3 -- Text Substitution (Magical Hack, Sleight of Mind)', () => {

  // ── Magical Hack (land-type word substitution) ─────────────────────────────

  it('Magical Hack: swaps SWAMPWALK to PLAINSWALK on a creature; baked-in keyword and textSwap stored', () => {
    const target = makeCreature('cr-1', {
      controller: 'o',
      keywords: [SWAMPWALK],
    });
    // Minimal Magical Hack card on the stack.
    const hackCard = {
      iid: 'mh-1',
      id: 'magical_hack',
      name: 'Magical Hack',
      type: 'Instant',
      color: 'U',
      cmc: 1,
      effect: 'textSwapLandtype',
      keywords: [],
      tapped: false,
      summoningSick: false,
      attacking: false,
      blocking: null,
      damage: 0,
      counters: {},
      eotBuffs: [],
      enchantments: [],
      controller: 'p',
    };
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', oBf: [target] });
    const state = {
      ...base,
      stack: [{
        id: 'si-1',
        card: hackCard,
        caster: 'p',
        targets: ['cr-1'],
        xVal: 1,
        fromKw: SWAMPWALK,
        toKw: PLAINSWALK,
      }],
    };
    const s1 = duelReducer(state, { type: 'RESOLVE_STACK' });

    const cr = s1.o.bf.find(c => c.iid === 'cr-1');
    expect(cr).toBeDefined();

    // Baked-in mutation: SWAMPWALK removed, PLAINSWALK added to .keywords on the card.
    expect(cr.keywords).not.toContain(SWAMPWALK);
    expect(cr.keywords).toContain(PLAINSWALK);

    // textSwap field stored for layer tracking.
    expect(cr.textSwap?.type).toBe('landtype');
    expect(cr.textSwap?.from).toBe(SWAMPWALK);
    expect(cr.textSwap?.to).toBe(PLAINSWALK);

    // hasKw reflects the substitution via both baked-in field and Layer 3.
    expect(hasKw(cr, PLAINSWALK, s1)).toBe(true);
    expect(hasKw(cr, SWAMPWALK, s1)).toBe(false);

    // computeCharacteristics applies Layer 3 substitution.
    const chars = computeCharacteristics(cr, s1);
    expect(chars.keywords).toContain(PLAINSWALK);
    expect(chars.keywords).not.toContain(SWAMPWALK);
  });

  it('Magical Hack: does not alter a keyword that is not the swap source', () => {
    const target = makeCreature('cr-1', {
      controller: 'o',
      keywords: [SWAMPWALK, KEYWORDS.FLYING.id],
    });
    const hackCard = {
      iid: 'mh-1',
      id: 'magical_hack',
      name: 'Magical Hack',
      type: 'Instant',
      color: 'U',
      cmc: 1,
      effect: 'textSwapLandtype',
      keywords: [],
      tapped: false,
      summoningSick: false,
      attacking: false,
      blocking: null,
      damage: 0,
      counters: {},
      eotBuffs: [],
      enchantments: [],
      controller: 'p',
    };
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', oBf: [target] });
    const state = {
      ...base,
      stack: [{
        id: 'si-1',
        card: hackCard,
        caster: 'p',
        targets: ['cr-1'],
        xVal: 1,
        fromKw: SWAMPWALK,
        toKw: PLAINSWALK,
      }],
    };
    const s1 = duelReducer(state, { type: 'RESOLVE_STACK' });
    const cr = s1.o.bf.find(c => c.iid === 'cr-1');

    // FLYING is unaffected.
    expect(cr.keywords).toContain(KEYWORDS.FLYING.id);
    expect(cr.keywords).toContain(PLAINSWALK);
    expect(cr.keywords).not.toContain(SWAMPWALK);
  });

  // ── Sleight of Mind (color word substitution) ───────────────────────────────

  it('Sleight of Mind: swaps card color B → U on a permanent; baked-in mutation and textSwap stored', () => {
    const target = makeCreature('cr-1', {
      controller: 'o',
      color: 'B',
    });
    const sleightCard = {
      iid: 'sm-1',
      id: 'sleight_of_mind',
      name: 'Sleight of Mind',
      type: 'Instant',
      color: 'U',
      cmc: 1,
      effect: 'textSwapColor',
      keywords: [],
      tapped: false,
      summoningSick: false,
      attacking: false,
      blocking: null,
      damage: 0,
      counters: {},
      eotBuffs: [],
      enchantments: [],
      controller: 'p',
    };
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', oBf: [target] });
    const state = {
      ...base,
      stack: [{
        id: 'si-1',
        card: sleightCard,
        caster: 'p',
        targets: ['cr-1'],
        xVal: 1,
        fromColor: 'B',
        toColor: 'U',
      }],
    };
    const s1 = duelReducer(state, { type: 'RESOLVE_STACK' });

    const cr = s1.o.bf.find(c => c.iid === 'cr-1');
    expect(cr).toBeDefined();

    // Baked-in mutation: .color is now 'U' on the card in state.
    expect(cr.color).toBe('U');

    // textSwap field stored for layer tracking.
    expect(cr.textSwap?.type).toBe('color');
    expect(cr.textSwap?.from).toBe('B');
    expect(cr.textSwap?.to).toBe('U');

    // computeCharacteristics returns the substituted color.
    const chars = computeCharacteristics(cr, s1);
    expect(chars.color).toBe('U');
  });

  it('Sleight of Mind: no-ops when the card color does not match fromColor', () => {
    const target = makeCreature('cr-1', {
      controller: 'o',
      color: 'R', // not 'B'
    });
    const sleightCard = {
      iid: 'sm-1',
      id: 'sleight_of_mind',
      name: 'Sleight of Mind',
      type: 'Instant',
      color: 'U',
      cmc: 1,
      effect: 'textSwapColor',
      keywords: [],
      tapped: false,
      summoningSick: false,
      attacking: false,
      blocking: null,
      damage: 0,
      counters: {},
      eotBuffs: [],
      enchantments: [],
      controller: 'p',
    };
    const base = makeState({ phase: PHASE.MAIN_1, active: 'p', oBf: [target] });
    const state = {
      ...base,
      stack: [{
        id: 'si-1',
        card: sleightCard,
        caster: 'p',
        targets: ['cr-1'],
        xVal: 1,
        fromColor: 'B',
        toColor: 'U',
      }],
    };
    const s1 = duelReducer(state, { type: 'RESOLVE_STACK' });
    const cr = s1.o.bf.find(c => c.iid === 'cr-1');

    // Color unchanged: target was R, not B.
    expect(cr.color).toBe('R');
    // textSwap still recorded (the text-substitution persists; the color just happened not to match).
    expect(cr.textSwap?.from).toBe('B');
  });

});
