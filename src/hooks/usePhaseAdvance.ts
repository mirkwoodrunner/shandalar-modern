import { useCallback } from 'react';
import { PHASE } from '../engine/phases.js';

const PRIORITY_WINDOW_PHASES = new Set([PHASE.MAIN_1, PHASE.MAIN_2, PHASE.END]);

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
    // Never fire during AI turn
    if (s.active !== 'p') return;
    if (s.priorityWindow) return;
    if (s.stack && s.stack.length > 0) return;
    if (!PRIORITY_WINDOW_PHASES.has(s.phase)) {
      advancePhase();
      return;
    }
    const anyOptions =
      handHasInstant(s.p.hand) ||
      handHasInstant(s.o.hand) ||
      bfHasActivated(s.p.bf) ||
      bfHasActivated(s.o.bf);
    if (anyOptions) {
      openPriorityWindow();
    } else {
      advancePhase();
    }
  }, [
    s.active,
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
