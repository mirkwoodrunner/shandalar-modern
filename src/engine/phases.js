// src/engine/phases.js
// Authoritative phase enum and sequence for the Shandalar duel engine.
// Per design spec S1.1 ? consumed by DuelCore, AI, and event system.

import KEYWORDS from '../data/keywords.js';

export const PHASE = {
  UNTAP:            'UNTAP',
  UPKEEP:           'UPKEEP',
  DRAW:             'DRAW',
  MAIN_1:           'MAIN_1',
  COMBAT_BEGIN:     'COMBAT_BEGIN',
  COMBAT_ATTACKERS: 'COMBAT_ATTACKERS',
  COMBAT_BLOCKERS:  'COMBAT_BLOCKERS',
  COMBAT_DAMAGE:    'COMBAT_DAMAGE',
  COMBAT_END:       'COMBAT_END',
  MAIN_2:           'MAIN_2',
  END:              'END',
  CLEANUP:          'CLEANUP',
};

export const PHASE_SEQUENCE = [
  PHASE.UNTAP,
  PHASE.UPKEEP,
  PHASE.DRAW,
  PHASE.MAIN_1,
  PHASE.COMBAT_BEGIN,
  PHASE.COMBAT_ATTACKERS,
  PHASE.COMBAT_BLOCKERS,
  PHASE.COMBAT_DAMAGE,
  PHASE.COMBAT_END,
  PHASE.MAIN_2,
  PHASE.END,
  PHASE.CLEANUP,
];

// Phases where the active player may cast spells at sorcery speed
export const SORCERY_SPEED_PHASES = [PHASE.MAIN_1, PHASE.MAIN_2];

// Phases where priority is passed and instant-speed responses are legal
export const PRIORITY_PHASES = [
  PHASE.UPKEEP,
  PHASE.MAIN_1,
  PHASE.COMBAT_BEGIN,
  PHASE.COMBAT_ATTACKERS,
  PHASE.COMBAT_BLOCKERS,
  PHASE.COMBAT_DAMAGE,
  PHASE.COMBAT_END,
  PHASE.MAIN_2,
  PHASE.END,
];

export default PHASE;
