// src/data/effectSchemas.js
// Data-driven effect schema registry ? per design spec S7.1.
//
// Each schema entry describes the parameters an effect expects.
// The actual resolve implementations live in DuelCore.resolveEff,
// which maps card.effect strings to these schemas. This file is the
// canonical parameter contract; DuelCore is the execution authority.
//
// Schema shape:
//   params   ? ordered list of required parameter names
//   target   ? 'creature' | 'player' | 'any' | 'stack' | 'none'
//   duration ? 'instant' | 'permanent' | 'end_of_turn' | 'combat'
//   desc     ? human-readable summary for debugging / UI tooltips

export const EFFECT_SCHEMAS = {
  DAMAGE_TARGET: {
    params: ['amount', 'target'],
    target: 'any',
    duration: 'instant',
    desc: 'Deal {amount} damage to target creature or player.',
  },
  DESTROY_TARGET_CREATURE: {
    params: ['target'],
    target: 'creature',
    duration: 'instant',
    desc: 'Destroy target creature.',
  },
  DRAW_CARDS: {
    params: ['amount', 'player'],
    target: 'none',
    duration: 'instant',
    desc: 'Target player draws {amount} cards.',
  },
  GAIN_LIFE: {
    params: ['amount', 'player'],
    target: 'none',
    duration: 'instant',
    desc: 'Target player gains {amount} life.',
  },
  COUNTER_SPELL: {
    params: ['targetStackId'],
    target: 'stack',
    duration: 'instant',
    desc: 'Counter target spell on the stack.',
  },
  CREATE_TOKEN: {
    params: ['name', 'power', 'toughness', 'keywords', 'controller'],
    target: 'none',
    duration: 'permanent',
    desc: 'Create a {power}/{toughness} {name} token.',
  },
  PUMP_CREATURE: {
    params: ['target', 'powerBonus', 'toughnessBonus', 'duration'],
    target: 'creature',
    duration: 'end_of_turn',
    desc: 'Target creature gets +{powerBonus}/+{toughnessBonus} until end of turn.',
  },
  DISCARD: {
    params: ['player', 'amount'],
    target: 'none',
    duration: 'instant',
    desc: 'Target player discards {amount} card(s).',
  },
  TAP_TARGET: {
    params: ['target'],
    target: 'creature',
    duration: 'instant',
    desc: 'Tap target permanent.',
  },
  RETURN_TO_HAND: {
    params: ['target'],
    target: 'any',
    duration: 'instant',
    desc: 'Return target permanent to its owner\'s hand.',
  },
  ADD_MANA: {
    params: ['colors', 'amount'],
    target: 'none',
    duration: 'instant',
    desc: 'Add {amount} mana of the chosen color(s) to your mana pool.',
  },
  DESTROY_ALL_CREATURES: {
    params: [],
    target: 'none',
    duration: 'instant',
    desc: 'Destroy all creatures.',
  },
  ENCHANT_CREATURE: {
    params: ['target', 'powerMod', 'toughnessMod', 'keywordsMod'],
    target: 'creature',
    duration: 'permanent',
    desc: 'Enchant target creature with a permanent modifier.',
  },
  DEAL_DAMAGE_ALL: {
    params: ['amount', 'filter'],
    target: 'none',
    duration: 'instant',
    desc: 'Deal {amount} damage to all {filter} creatures and/or players.',
  },
};

export default EFFECT_SCHEMAS;
