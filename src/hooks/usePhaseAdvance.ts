import { useCallback } from 'react';
import { PHASE } from '../engine/phases.js';

const PRIORITY_WINDOW_PHASES = new Set([PHASE.MAIN_1, PHASE.MAIN_2, PHASE.END]);

// Phases where the priority window also opens for non-mana activated abilities.
const ABILITY_PRIORITY_PHASES = new Set([
  PHASE.MAIN_1,
  PHASE.MAIN_2,
  PHASE.END,
  PHASE.COMBAT_BEGIN,
  PHASE.COMBAT_AFTER_ATTACKERS,
  PHASE.COMBAT_AFTER_BLOCKERS,
  PHASE.COMBAT_END,
]);

function handHasInstant(hand: any[]): boolean {
  return hand.some((c: any) => c.type === 'Instant' || c.type === 'Interrupt');
}

function bfHasActivated(bf: any[]): boolean {
  return bf.some(
    (c: any) =>
      c.activated &&
      !['addMana', 'addManaAny', 'addMana3Any'].includes(c.activated.effect)
  );
}

export function usePhaseAdvance(
  s: any,
  advancePhase: () => void,
  openPriorityWindow: () => void,
): () => void {
  return useCallback(() => {
    if (s.priorityWindow) return;
    // Stack is non-empty: do nothing here. The priorityWindow useEffect in DuelScreen handles it.
    if (s.stack && s.stack.length > 0) return;

    const inSpellPriorityPhase = PRIORITY_WINDOW_PHASES.has(s.phase);
    const inAbilityPriorityPhase = ABILITY_PRIORITY_PHASES.has(s.phase);

    if (!inAbilityPriorityPhase) {
      advancePhase();
      return;
    }

    const hasInstants = handHasInstant(s.p.hand) || handHasInstant(s.o.hand);
    const hasActivated = bfHasActivated(s.p.bf) || bfHasActivated(s.o.bf);

    // In non-spell phases (combat), only open window if there are activated abilities.
    const anyOptions = inSpellPriorityPhase
      ? (hasInstants || hasActivated)
      : hasActivated;

    if (anyOptions) {
      openPriorityWindow();
    } else {
      advancePhase();
    }
  }, [
    s.priorityWindow,
    s.stack,
    s.phase,
    s.p.hand,
    s.o.hand,
    s.p.bf,
    s.o.bf,
    advancePhase,
    openPriorityWindow,
  ]);
}
