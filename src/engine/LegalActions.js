// src/engine/LegalActions.js
// Enumerates valid AI opponent choices per phase in the format expected by
// GeminiAdvisor.fetchGeminiMove().
//
// DEPENDENCY RULE:
//   LegalActions.js imports from AI.js and DuelCore.js.
//   AI.js and DuelCore.js must NEVER import from LegalActions.js.
//
// CONTRACT: legalActions[0] is ALWAYS { type: 'PASS_PRIORITY' }.
//   GeminiAdvisor.js defaults to index 0 on API failure. This invariant is
//   load-bearing. Never reorder the returned array.
//
// PHASE COVERAGE:
//   MAIN_1, MAIN_2           -- land plays + castable spells
//   COMBAT_ATTACKERS         -- per-creature attack options + attack-all shorthand
//   COMBAT_BLOCKERS          -- legal blocker assignments per incoming attacker
//   All other phases         -- single PASS_PRIORITY entry only

import { PHASE } from './phases.js';
import {
  isCre, isLand,
  getPow, getTou,
  canBlockDuel,
} from './DuelCore.js';
import {
  selectPlayableCards,
  buildTapActions,
} from './AI.js';

const PASS = {
  type: 'PASS_PRIORITY',
  description: 'Pass priority and take no action.',
};

/**
 * Enumerate all valid choices for the AI opponent (who='o') in the given phase.
 *
 * @param {object} state  - Read-only GameState snapshot.
 * @param {string} phase  - Current PHASE constant.
 * @returns {LegalAction[]} Flat array; index 0 is always PASS_PRIORITY.
 */
export function computeLegalActions(state, phase) {
  if (phase === PHASE.MAIN_1 || phase === PHASE.MAIN_2) {
    const actions = [PASS];

    // Land play
    const land = state.o.hand.find(isLand);
    if (land && state.landsPlayed < 1) {
      actions.push({
        type: 'PLAY_LAND',
        iid: land.iid,
        name: land.name,
        description: `Play land: ${land.name}.`,
      });
    }

    // Castable spells
    const playable = selectPlayableCards(state, phase);
    for (const entry of playable) {
      const { card, effectiveCost, xVal } = entry;
      const { affordable } = buildTapActions(state, effectiveCost);
      if (!affordable) continue;

      actions.push({
        type: 'CAST_SPELL',
        iid: card.iid,
        name: card.name,
        cost: effectiveCost,
        xVal: xVal ?? null,
        description: xVal != null
          ? `Cast ${card.name} with X=${xVal}.`
          : `Cast ${card.name} (${effectiveCost}).`,
        // Oracle text only for internal custom assets Gemini won't recognise.
        ...(card._customAsset && card.oracleText
          ? { oracleText: card.oracleText }
          : {}),
      });
    }

    return actions;
  }

  if (phase === PHASE.COMBAT_ATTACKERS) {
    const actions = [PASS];

    const candidates = state.o.bf.filter(
      c => isCre(c) && !c.tapped && !c.summoningSick
    );

    for (const c of candidates) {
      actions.push({
        type: 'DECLARE_ATTACKER',
        iid: c.iid,
        name: c.name,
        power: getPow(c, state),
        toughness: getTou(c, state),
        keywords: c.keywords ?? [],
        description: `Attack with ${c.name} (${getPow(c, state)}/${getTou(c, state)}).`,
      });
    }

    // Grouped attack-all option when more than one attacker is available.
    if (candidates.length > 1) {
      actions.push({
        type: 'ATTACK_ALL',
        attackerIds: candidates.map(c => c.iid),
        description: `Attack with all ${candidates.length} eligible creatures.`,
      });
    }

    return actions;
  }

  if (phase === PHASE.COMBAT_BLOCKERS) {
    const actions = [PASS];

    const incomingIds = state.attackers ?? [];
    const available = state.o.bf.filter(
      c => isCre(c) && !c.tapped && !c.attacking
    );

    for (const attId of incomingIds) {
      // Attackers may be on either side depending on who is active.
      const att =
        state.p.bf.find(c => c.iid === attId) ??
        state.o.bf.find(c => c.iid === attId);
      if (!att) continue;

      const legalBlockers = available.filter(
        b => canBlockDuel(b, att, available, state)
      );

      for (const bl of legalBlockers) {
        actions.push({
          type: 'DECLARE_BLOCKER',
          blId: bl.iid,
          attId,
          blockerName: bl.name,
          attackerName: att.name,
          description: `Block ${att.name} (${getPow(att, state)}/${getTou(att, state)}) with ${bl.name} (${getPow(bl, state)}/${getTou(bl, state)}).`,
        });
      }
    }

    return actions;
  }

  // All other phases: pass only.
  return [PASS];
}
