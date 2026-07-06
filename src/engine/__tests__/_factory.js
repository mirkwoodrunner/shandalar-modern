// src/engine/__tests__/_factory.js
// Shared test factories. Import these in all __tests__ files and scenario files.
// Do not add game logic here -- pure data construction only.

import { PHASE } from '../phases.js';

export function makePlayerState(overrides = {}) {
  return {
    life: 20,
    lib: [],
    hand: [],
    bf: [],
    gy: [],
    exile: [],
    mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
    extraTurns: 0,
    mulls: 0,
    lifeAnim: null,
    poisonCounters: 0,
    ...overrides,
  };
}

export function makeState({
  pBf = [],
  oBf = [],
  pHand = [],
  oHand = [],
  phase = PHASE.MAIN_1,
  active = 'p',
  turn = 1,
  landsPlayed = 0,
  over = null,
} = {}) {
  return {
    phase,
    active,
    turn,
    landsPlayed,
    spellsThisTurn: 0,
    attackers: [],
    blockers: {},
    stack: [],
    over,
    selCard: null,
    selTgt: null,
    xVal: 1,
    log: [],
    ruleset: {
      startingLife: 20,
      startingHandSize: 7,
      drawOnFirstTurn: false,
      londonMulligan: false,
      deathtouch: true,
    },
    oppArch: { id: 'KARAG', profileId: 'KARAG' },
    castleMod: null,
    pendingLotus: false,
    pendingLotusIid: null,
    pendingBop: false,
    turnState: { damageLog: [] },
    triggerQueue: [],
    pendingChoice: null,
    fogActive: false,
    anteEnabled: false,
    anteP: null,
    anteO: null,
    anteExtraP: [],
    anteExtraO: [],
    ownershipChanges: [],
    pendingAnteChoice: null,
    pendingUpkeepChoice: null,
    pendingUpkeepChoiceQueue: [],
    pendingAnteExchange: null,
    pendingDamageShieldChoice: null,
    p: makePlayerState({ bf: pBf, hand: pHand }),
    o: makePlayerState({ bf: oBf, hand: oHand }),
  };
}

export function makeCreature(iid, overrides = {}) {
  return {
    iid,
    id: 'grizzly_bears',
    name: 'Grizzly Bears',
    type: 'Creature',
    subtype: 'Bear',
    color: 'G',
    cmc: 2,
    cost: '1G',
    power: 2,
    toughness: 2,
    keywords: [],
    tapped: false,
    summoningSick: false,
    attacking: false,
    blocking: null,
    damage: 0,
    counters: {},
    eotBuffs: [],
    enchantments: [],
    controller: 'o',
    ...overrides,
  };
}

export function makeLand(iid, overrides = {}) {
  return {
    iid,
    id: 'forest',
    name: 'Forest',
    type: 'Land',
    subtype: 'Forest',
    color: 'G',
    cmc: 0,
    cost: '',
    keywords: [],
    tapped: false,
    summoningSick: false,
    attacking: false,
    blocking: null,
    damage: 0,
    counters: {},
    eotBuffs: [],
    enchantments: [],
    produces: ['G'],
    controller: 'p',
    ...overrides,
  };
}

export function makeSpell(iid, overrides = {}) {
  return {
    iid,
    id: 'lightning_bolt',
    name: 'Lightning Bolt',
    type: 'Instant',
    color: 'R',
    cmc: 1,
    cost: 'R',
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
    ...overrides,
  };
}

export function makeStackItem(card, caster, targets = [], xVal = 1) {
  return { id: `stack-${Math.random().toString(36).slice(2)}`, card, caster, targets, xVal };
}
