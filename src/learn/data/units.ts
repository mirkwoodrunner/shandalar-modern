// src/learn/data/units.ts
// Slice 1 exercise data. Authored data only. Validated by src/learn/__tests__/units.test.ts.

import type { Unit } from '../engine/types';

export const UNITS: Unit[] = [
  {
    id: '1.1',
    title: 'Lands and mana',
    exercises: [
      {
        kind: 'engine', id: '1.1-01', unit: '1.1', skill: 'tap-for-mana', title: 'Tap a land', guided: true,
        prompt: 'Tap the Forest to make green mana.',
        hint: 'Tap the Forest card.',
        explanation: 'Tapping a land adds one mana to your mana pool. A Forest makes green mana, shown as G.',
        setup: { phase: 'MAIN_1', p: { bf: ['forest'] }, o: { bf: [] } },
        allowed: ['TAP_LAND'],
        goal: { kind: 'MANA_IN_POOL', color: 'G', amount: 1 },
        highlight: ['p-bf-0'],
        solutions: [[{ type: 'TAP_LAND', iid: 'p-bf-0' }]],
      },
      {
        kind: 'engine', id: '1.1-02', unit: '1.1', skill: 'cast-creature', title: 'Cast a creature',
        prompt: 'Grizzly Bears costs 1G. Tap both Forests, then cast it from your hand.',
        hint: 'Tap both Forests first. Then tap Grizzly Bears in your hand.',
        explanation: 'The G means one green mana. The 1 means one mana of any color. Two Forests pay for both.',
        setup: { phase: 'MAIN_1', p: { bf: ['forest', 'forest'], hand: ['grizzly_bears'] }, o: { bf: [] } },
        allowed: ['TAP_LAND', 'CAST_SPELL', 'UNDO_MANA_TAPS'],
        goal: { kind: 'CARD_ON_BATTLEFIELD', cardId: 'grizzly_bears' },
        highlight: ['p-bf-0', 'p-bf-1'],
        solutions: [[{ type: 'TAP_LAND', iid: 'p-bf-0' }, { type: 'TAP_LAND', iid: 'p-bf-1' }, { type: 'CAST_SPELL', iid: 'p-hand-0' }]],
      },
      {
        kind: 'engine', id: '1.1-03', unit: '1.1', skill: 'colored-vs-generic', title: 'Colored mana matters',
        prompt: 'Hurloon Minotaur costs 1RR. Tap the right lands and cast it.',
        hint: 'Each R needs a Mountain. The 1 can come from any land.',
        explanation: 'Colored symbols must be paid with that color. Two Mountains cover RR, and any third land covers the 1.',
        setup: { phase: 'MAIN_1', p: { bf: ['mountain', 'mountain', 'forest', 'island'], hand: ['hurloon_minotaur'] }, o: { bf: [] } },
        allowed: ['TAP_LAND', 'CAST_SPELL', 'UNDO_MANA_TAPS'],
        goal: { kind: 'CARD_ON_BATTLEFIELD', cardId: 'hurloon_minotaur' },
        solutions: [
          [{ type: 'TAP_LAND', iid: 'p-bf-0' }, { type: 'TAP_LAND', iid: 'p-bf-1' }, { type: 'TAP_LAND', iid: 'p-bf-2' }, { type: 'CAST_SPELL', iid: 'p-hand-0' }],
          [{ type: 'TAP_LAND', iid: 'p-bf-0' }, { type: 'TAP_LAND', iid: 'p-bf-1' }, { type: 'TAP_LAND', iid: 'p-bf-3' }, { type: 'CAST_SPELL', iid: 'p-hand-0' }],
        ],
        wrongLines: [
          { steps: [{ type: 'TAP_LAND', iid: 'p-bf-0' }, { type: 'TAP_LAND', iid: 'p-bf-2' }, { type: 'TAP_LAND', iid: 'p-bf-3' }, { type: 'CAST_SPELL', iid: 'p-hand-0' }], expect: 'rejected', reasonIncludes: '1RR' },
        ],
      },
      {
        kind: 'multiSelect', id: '1.1-04', unit: '1.1', skill: 'read-costs', title: 'What can you cast?',
        prompt: 'These three lands are untapped. Pick every spell you could cast right now.',
        hint: 'Count the total mana first. Then check the colored symbols.',
        explanation: 'Grizzly Bears (1G), Llanowar Elves (G), and Gray Ogre (2R) all fit. Hill Giant needs four mana. Hurloon Minotaur needs two red.',
        lands: ['forest', 'forest', 'mountain'],
        options: ['grizzly_bears', 'hill_giant', 'hurloon_minotaur', 'llanowar_elves', 'gray_ogre'],
        answer: ['grizzly_bears', 'llanowar_elves', 'gray_ogre'],
      },
      {
        kind: 'engine', id: '1.1-05', unit: '1.1', skill: 'land-per-turn', title: 'One land per turn',
        prompt: 'Play a land from your hand, then cast Grizzly Bears.',
        hint: 'You can play one land each turn. Play a Forest, then tap two Forests.',
        explanation: 'Each turn you may play one land. That second Forest gives you enough mana for Grizzly Bears.',
        setup: { phase: 'MAIN_1', p: { bf: ['forest'], hand: ['forest', 'forest', 'grizzly_bears'] }, o: { bf: [] } },
        allowed: ['PLAY_LAND', 'TAP_LAND', 'CAST_SPELL', 'UNDO_MANA_TAPS'],
        goal: { kind: 'CARD_ON_BATTLEFIELD', cardId: 'grizzly_bears' },
        solutions: [[{ type: 'PLAY_LAND', iid: 'p-hand-0' }, { type: 'TAP_LAND', iid: 'p-bf-0' }, { type: 'TAP_LAND', iid: 'p-hand-0' }, { type: 'CAST_SPELL', iid: 'p-hand-2' }]],
        wrongLines: [
          { steps: [{ type: 'PLAY_LAND', iid: 'p-hand-0' }, { type: 'PLAY_LAND', iid: 'p-hand-1' }], expect: 'rejected', reasonIncludes: 'one land each turn' },
        ],
      },
    ],
  },
  {
    id: '3.1',
    title: 'Lethal this turn',
    exercises: [
      {
        kind: 'engine', id: '3.1-01', unit: '3.1', skill: 'lethal-evasion', title: 'Fly over',
        prompt: 'Win this turn. The opponent is at 4 life. Pick your attackers.',
        hint: 'Their creatures can\'t block a creature with flying.',
        explanation: 'Wall of Wood and Scathe Zombies can\'t block flyers. Air Elemental\'s 4 damage gets through no matter what.',
        setup: { phase: 'COMBAT_ATTACKERS', p: { bf: ['air_elemental', 'grizzly_bears'] }, o: { life: 4, bf: ['wall_of_wood', 'scathe_zombies'] } },
        allowed: ['DECLARE_ATTACKER'],
        goal: { kind: 'OPPONENT_DEAD_THIS_TURN' },
        solutions: [[{ type: 'ATTACK', attackers: ['p-bf-0'] }], [{ type: 'ATTACK', attackers: ['p-bf-0', 'p-bf-1'] }]],
        wrongLines: [
          { steps: [{ type: 'ATTACK', attackers: ['p-bf-1'] }], expect: 'notLethal', reasonIncludes: 'They\'re at 4' },
        ],
      },
      {
        kind: 'engine', id: '3.1-02', unit: '3.1', skill: 'lethal-outnumber', title: 'More attackers than blockers',
        prompt: 'Win this turn. The opponent is at 3 life. Pick your attackers.',
        hint: 'Wall of Wood can only block one attacker.',
        explanation: 'Send everything. Wall of Wood stops one creature, and the other two still deal at least 4.',
        setup: { phase: 'COMBAT_ATTACKERS', p: { bf: ['grizzly_bears', 'gray_ogre', 'hill_giant'] }, o: { life: 3, bf: ['wall_of_wood'] } },
        allowed: ['DECLARE_ATTACKER'],
        goal: { kind: 'OPPONENT_DEAD_THIS_TURN' },
        solutions: [[{ type: 'ATTACK', attackers: ['p-bf-0', 'p-bf-1', 'p-bf-2'] }]],
        wrongLines: [
          { steps: [{ type: 'ATTACK', attackers: ['p-bf-0', 'p-bf-1'] }], expect: 'notLethal', reasonIncludes: 'Wall of Wood blocks' },
        ],
      },
      {
        kind: 'engine', id: '3.1-03', unit: '3.1', skill: 'lethal-outnumber', title: 'Every point counts',
        prompt: 'Win this turn. The opponent is at 3 life. Pick your attackers.',
        hint: 'Pearled Unicorn can block one attacker, and it can\'t block Scryb Sprites.',
        explanation: 'Attack with all three. Whatever Pearled Unicorn blocks, at least 3 damage gets through.',
        setup: { phase: 'COMBAT_ATTACKERS', p: { bf: ['craw_wurm', 'savannah_lions', 'scryb_sprites'] }, o: { life: 3, bf: ['pearled_unicorn'] } },
        allowed: ['DECLARE_ATTACKER'],
        goal: { kind: 'OPPONENT_DEAD_THIS_TURN' },
        solutions: [[{ type: 'ATTACK', attackers: ['p-bf-0', 'p-bf-1', 'p-bf-2'] }]],
        wrongLines: [
          { steps: [{ type: 'ATTACK', attackers: ['p-bf-0', 'p-bf-1'] }], expect: 'notLethal', reasonIncludes: 'Pearled Unicorn blocks Craw Wurm' },
        ],
      },
      {
        kind: 'engine', id: '3.1-04', unit: '3.1', skill: 'summoning-sickness', title: 'Fresh arrivals',
        prompt: 'Win this turn. The opponent is at 4 life. Pick your attackers.',
        hint: 'Hill Giant came into play this turn.',
        explanation: 'Creatures can\'t attack the turn they arrive. Grizzly Bears and Gray Ogre deal exactly 4.',
        setup: { phase: 'COMBAT_ATTACKERS', p: { bf: [{ id: 'hill_giant', summoningSick: true }, 'grizzly_bears', 'gray_ogre'] }, o: { life: 4, bf: [] } },
        allowed: ['DECLARE_ATTACKER'],
        goal: { kind: 'OPPONENT_DEAD_THIS_TURN' },
        solutions: [[{ type: 'ATTACK', attackers: ['p-bf-1', 'p-bf-2'] }]],
        wrongLines: [
          { steps: [{ type: 'ATTACK', attackers: ['p-bf-0', 'p-bf-1', 'p-bf-2'] }], expect: 'rejected', reasonIncludes: 'can\'t attack yet' },
        ],
      },
    ],
  },
];
