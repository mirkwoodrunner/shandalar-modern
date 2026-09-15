// src/learn/ui/EngineExercise.tsx
// Presentation only. Calls hook callbacks; no rules logic.

import React from 'react';
import { LearnCard } from './LearnCard';
import type { EngineExercise as EngineExerciseData } from '../engine/types';

const MANA_ORDER = ['W', 'U', 'B', 'R', 'G', 'C'] as const;

type EngineExerciseProps = {
  ex: EngineExerciseData;
  state: any;
  selectedAttackers: string[];
  tapCard: (iid: string) => void;
  undoTaps: () => void;
  attack: () => void;
};

export function EngineExercise({ ex, state, selectedAttackers, tapCard, undoTaps, attack }: EngineExerciseProps) {
  if (!state) return null;

  const highlight = new Set(ex.highlight ?? []);
  const manaText = MANA_ORDER
    .map(color => ({ color, amount: state.p.mana?.[color] ?? 0 }))
    .filter(({ amount }) => amount > 0)
    .map(({ color, amount }) => `${color} ${amount}`)
    .join(', ');

  return (
    <div className="learn-engine-exercise">
      <p data-testid="opp-life" className="learn-opp-life">Opponent: {state.o.life}</p>
      <div data-testid="opp-bf" className="learn-card-row">
        {state.o.bf.map((c: any) => (
          <LearnCard key={c.iid} card={c} highlighted={highlight.has(c.iid)} />
        ))}
      </div>
      <div data-testid="player-bf" className="learn-card-row">
        {state.p.bf.map((c: any) => (
          <LearnCard
            key={c.iid}
            card={c}
            selected={selectedAttackers.includes(c.iid)}
            highlighted={highlight.has(c.iid)}
            onClick={() => tapCard(c.iid)}
          />
        ))}
      </div>
      <p data-testid="player-mana-pool" className="learn-mana-pool">Mana: {manaText || 'none'}</p>
      <div data-testid="player-hand" className="learn-card-row">
        {state.p.hand.map((c: any) => (
          <LearnCard key={c.iid} card={c} highlighted={highlight.has(c.iid)} onClick={() => tapCard(c.iid)} />
        ))}
      </div>
      {ex.allowed.includes('UNDO_MANA_TAPS') && (
        <button data-testid="undo-taps" className="learn-button learn-button-secondary" onClick={undoTaps}>
          Undo Taps
        </button>
      )}
      {state.phase === 'COMBAT_ATTACKERS' && (
        <button
          data-testid="attack-button"
          className="learn-button learn-button-primary"
          disabled={selectedAttackers.length === 0}
          onClick={attack}
        >
          Attack
        </button>
      )}
    </div>
  );
}
