// src/hooks/useDuel.js
// React ↔ DuelCore adapter layer.
// Per SYSTEMS.md §11 and MECHANICS_INDEX.md §6.1
//
// STRICT PROHIBITIONS (ENGINE_CONTRACT_SPEC.md §6):
//   ✗ Cannot resolve game rules
//   ✗ Cannot mutate GameState
//   ✗ Cannot simulate combat outcomes
//   ✗ Cannot bypass DuelCore
//
// This hook's ONLY job:
//   - Dispatch GameAction objects to DuelCore via useReducer
//   - Subscribe to GameState updates
//   - Expose UI-safe derived state

import { useReducer, useCallback } from 'react';
import { duelReducer, buildDuelState } from '../engine/DuelCore.js';

/**

- Initialize and manage a duel game state.
- 
- @param {string[]}  pDeckIds    - Player's deck card IDs
- @param {string}    oppArchKey  - Opponent archetype key
- @param {object}    ruleset     - Ruleset config from rulesets.js
- @param {number}    [overworldHP] - Player's HP from overworld (or undefined = use ruleset default)
- @param {object}    [castleMod]   - Castle modifier if applicable
- @param {boolean}   [anteEnabled] - Whether ante is active
  */
  export function useDuel(pDeckIds, oppArchKey, ruleset, overworldHP, castleMod, anteEnabled = false) {
  const initialState = buildDuelState(pDeckIds, oppArchKey, ruleset, overworldHP, castleMod, anteEnabled);
  const [state, dispatch] = useReducer(duelReducer, initialState);

// ── Action dispatchers ─────────────────────────────────────────────────────
// Each wrapper validates nothing - that is DuelCore's job.
// These are thin wrappers that construct GameAction objects.

const tapLand = useCallback((iid, mana) =>
dispatch({ type: "TAP_LAND", who: "p", iid, mana }), []);

const tapArtifactMana = useCallback((iid) =>
dispatch({ type: "TAP_ART_MANA", who: "p", iid }), []);

const playLand = useCallback((iid) =>
dispatch({ type: "PLAY_LAND", who: "p", iid }), []);

const castSpell = useCallback((iid, tgt = null, xVal = 1) =>
dispatch({ type: "CAST_SPELL", who: "p", iid, tgt, xVal }), []);

const resolveStack = useCallback(() =>
dispatch({ type: "RESOLVE_STACK" }), []);

const declareAttacker = useCallback((iid) =>
dispatch({ type: "DECLARE_ATTACKER", iid }), []);

const declareBlocker = useCallback((blId, attId) =>
dispatch({ type: "DECLARE_BLOCKER", blId, attId }), []);

const advancePhase = useCallback(() =>
dispatch({ type: "ADVANCE_PHASE" }), []);

const selectCard = useCallback((iid) =>
dispatch({ type: "SEL_CARD", iid }), []);

const selectTarget = useCallback((iid) =>
dispatch({ type: "SEL_TGT", iid }), []);

const setX = useCallback((val) =>
dispatch({ type: "SET_X", val }), []);

const mulligan = useCallback(() =>
dispatch({ type: "MULLIGAN", who: "p" }), []);

const activateAbility = useCallback((iid, tgt = null, chosenColor = null) =>
dispatch({ type: "ACTIVATE_ABILITY", iid, tgt, chosenColor }), []);

const chooseLotusColor = useCallback((color) =>
dispatch({ type: "CHOOSE_LOTUS_COLOR", color }), []);

const setPendingLotus = useCallback(() =>
dispatch({ type: "SET_PENDING_LOTUS" }), []);

/** Dispatch all AI actions at once (produced by AI.js). */
const applyAiActions = useCallback((acts) =>
dispatch({ type: "AI_ACTS", acts }), []);

return {
state,
dispatch,
// Named dispatchers (preferred over raw dispatch in UI)
tapLand,
tapArtifactMana,
playLand,
castSpell,
resolveStack,
declareAttacker,
declareBlocker,
advancePhase,
selectCard,
selectTarget,
setX,
mulligan,
activateAbility,
chooseLotusColor,
setPendingLotus,
applyAiActions,
};
}

export default useDuel;
