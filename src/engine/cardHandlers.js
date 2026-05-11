// src/engine/cardHandlers.js
// Custom card effect handlers ? per design spec S7.2.
//
// Cards that cannot be expressed by effectSchemas.js get a handler here.
// DuelCore checks CARD_HANDLERS[card.name] before falling through to
// the data-driven effect resolver.
//
// Priority: CARD_HANDLERS > EFFECT_SCHEMAS > resolveEff switch cases
//
// Handlers receive a read-only-style state snapshot, the card instance,
// and the resolved targets array. They return new GameState (pure).
// No imports from DuelCore to avoid circular dependencies ? state ops inline.

import KEYWORDS from '../data/keywords.js';

// --- HELPERS (local ? no DuelCore import) ------------------------------------

function drawN(state, who, n) {
  let ns = state;
  for (let i = 0; i < n; i++) {
    if (!ns[who].lib.length) {
      const loser = who;
      const winner = who === 'p' ? 'o' : 'p';
      return { ...ns, over: { winner, reason: `${loser} drew from empty library` } };
    }
    const [top, ...rest] = ns[who].lib;
    ns = { ...ns, [who]: { ...ns[who], lib: rest, hand: [...ns[who].hand, top] } };
  }
  return ns;
}

function addLog(state, text, type = 'effect') {
  return { ...state, log: [...state.log.slice(-100), { text, type, turn: state.turn }] };
}

// --- CARD HANDLERS ------------------------------------------------------------

export const CARD_HANDLERS = {
  // Black Lotus: sacrifice for 3 mana of any one color.
  // Sets pendingLotus so the UI can prompt for color choice before resolving.
  // The actual mana is added by the CHOOSE_LOTUS_COLOR reducer action.
  'Black Lotus': {
    onResolve: (state, card, _targets) => {
      return addLog(
        { ...state, pendingLotus: true },
        'Black Lotus ? choose a color for 3 mana.',
        'mana',
      );
    },
  },

  // Ancestral Recall: draw 3 cards, or make target player draw 3.
  'Ancestral Recall': {
    onResolve: (state, card, targets) => {
      const rawTgt = targets[0];
      const who = rawTgt === 'opponent' || rawTgt === 'player-o' ? 'o'
                : rawTgt === 'player'   || rawTgt === 'player-p' ? 'p'
                : (rawTgt || 'p');
      const ns = drawN(state, who, 3);
      return addLog(ns, `Ancestral Recall: ${who} draws 3.`, 'draw');
    },
  },

  // Chaos Orb: flip mechanic requires UI involvement.
  // Emits a pendingUIEvent that DuelScreen listens for to run the flip animation,
  // then applies destroy to all permanents it physically overlaps.
  'Chaos Orb': {
    onResolve: (state, card, _targets) => {
      return addLog(
        { ...state, pendingUIEvent: { type: 'CHAOS_ORB_FLIP', sourceIid: card.iid } },
        'Chaos Orb is flipped!',
        'effect',
      );
    },
  },

  // Time Walk: take an extra turn.
  'Time Walk': {
    onResolve: (state, card, _targets) => {
      const caster = card.controller || 'p';
      const ns = { ...state, [caster]: { ...state[caster], extraTurns: (state[caster].extraTurns || 0) + 1 } };
      return addLog(ns, `${caster} takes an extra turn!`, 'effect');
    },
  },

  // Timetwister: each player shuffles hand + graveyard into library and draws 7.
  'Timetwister': {
    onResolve: (state, card, _targets) => {
      let ns = state;
      const shuffleArr = (arr) => {
        const r = [...arr];
        for (let i = r.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [r[i], r[j]] = [r[j], r[i]];
        }
        return r;
      };
      for (const w of ['p', 'o']) {
        const newLib = shuffleArr([...ns[w].lib, ...ns[w].hand, ...ns[w].gy]);
        ns = { ...ns, [w]: { ...ns[w], lib: newLib, hand: [], gy: [] } };
        ns = drawN(ns, w, 7);
      }
      return addLog(ns, 'Timetwister ? all players shuffle and draw 7.', 'effect');
    },
  },

  // Clone: copy a target creature on the battlefield.
  // Fires after Clone enters bf (CAST_SPELL places it there, then calls onResolve).
  'Clone': {
    onResolve: (state, card, targets) => {
      const isCre = c => !!c?.type?.includes('Creature');
      const tgt = targets?.[0];
      const allBF = [...state.p.bf, ...state.o.bf];
      const copyTarget = allBF.find(c => c.iid === tgt && isCre(c));
      if (copyTarget) {
        const controller = card.controller || 'p';
        const cloneCopy = {
          ...copyTarget,
          iid: card.iid,
          controller,
          tapped: false,
          summoningSick: true,
          damage: 0,
          counters: {},
          eotBuffs: [],
          enchantments: [],
          attacking: false,
          blocking: null,
        };
        const ns = { ...state,
          [controller]: { ...state[controller], bf: state[controller].bf.map(c =>
            c.iid === card.iid ? cloneCopy : c
          )}
        };
        return addLog(ns, `Clone copies ${copyTarget.name}.`, 'effect');
      }
      return addLog(state, 'Clone: no valid target — enters as 0/0.', 'effect');
    },
  },

  // Rock Hydra: enters with X +1/+1 counters (xVal = the X from casting).
  // Fires after Rock Hydra enters bf.
  'Rock Hydra': {
    onResolve: (state, card, _targets, xVal) => {
      const controller = card.controller || 'p';
      const ns = { ...state, [controller]: { ...state[controller], bf: state[controller].bf.map(c =>
        c.iid === card.iid ? { ...c, counters: { ...c.counters, P1P1: xVal || 0 } } : c
      )}};
      return addLog(ns, `Rock Hydra enters with ${xVal || 0} +1/+1 counters.`, 'effect');
    },
  },
};

export default CARD_HANDLERS;
