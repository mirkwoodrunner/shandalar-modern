// src/engine/events.js
// Event bus constants for the Shandalar duel engine.
// Per design spec S10.1 ? DuelCore emits these; cards subscribe via event bus.

export const GAME_EVENTS = {
  PHASE_CHANGED:         'PHASE_CHANGED',
  SPELL_CAST:            'SPELL_CAST',
  ABILITY_ACTIVATED:     'ABILITY_ACTIVATED',
  PERMANENT_ENTERED:     'PERMANENT_ENTERED',
  PERMANENT_LEFT:        'PERMANENT_LEFT',
  ATTACKERS_DECLARED:    'ATTACKERS_DECLARED',
  BLOCKERS_DECLARED:     'BLOCKERS_DECLARED',
  DAMAGE_DEALT:          'DAMAGE_DEALT',
  CARD_DRAWN:            'CARD_DRAWN',
  LIFE_CHANGED:          'LIFE_CHANGED',
  MANA_ADDED:            'MANA_ADDED',
  MANA_BURN:             'MANA_BURN',
  STACK_OBJECT_ADDED:    'STACK_OBJECT_ADDED',
  STACK_OBJECT_RESOLVED: 'STACK_OBJECT_RESOLVED',
  DUEL_COMPLETE:         'DUEL_COMPLETE',
  LOG:                   'LOG',
};

export default GAME_EVENTS;
