import React from 'react';
import { GameState } from '../../types/GameState';

interface TempAbilityBarProps {
  state: GameState;
  onActivate: (tempId: string) => void;
}

export const TempAbilityBar: React.FC<TempAbilityBarProps> = ({ state, onActivate }) => {
  if (!state.p.tempAbilities?.length) return null;

  const totalMana = Object.values(state.p.mana).reduce((a, b) => a + b, 0);

  return (
    <div data-testid="temp-ability-bar" style={{
      display: 'flex',
      gap: '8px',
      padding: '8px',
      backgroundColor: '#f0f0f0',
      borderRadius: '4px',
      flexWrap: 'wrap',
      marginTop: '8px',
    }}>
      {state.p.tempAbilities.map(ability => {
        const canAfford = totalMana >= 1;
        const targetGone = ability.targetIid &&
          ![...state.p.bf, ...state.o.bf].some(c => c.iid === ability.targetIid);
        const disabled = !canAfford || targetGone;

        return (
          <button
            key={ability.id}
            data-testid={`temp-ability-${ability.id}`}
            onClick={() => !disabled && onActivate(ability.id)}
            disabled={disabled}
            title={disabled ? (
              targetGone ? 'Target creature has left the battlefield' : 'Not enough mana'
            ) : ability.label}
            style={{
              padding: '4px 8px',
              backgroundColor: disabled ? '#ccc' : '#6495ED',
              color: disabled ? '#666' : 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: disabled ? 'not-allowed' : 'pointer',
              fontSize: '12px',
              fontWeight: 'bold',
              opacity: disabled ? 0.6 : 1,
            }}
          >
            {ability.label} ({ability.cost})
          </button>
        );
      })}
    </div>
  );
};
