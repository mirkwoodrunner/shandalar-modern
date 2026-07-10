import React from 'react';
import { Card } from '../../types/Card';

interface LampPickModalProps {
  cards: Card[];
  onPick: (iid: string) => void;
}

export const LampPickModal: React.FC<LampPickModalProps> = ({ cards, onPick }) => {
  return (
    <div data-testid="lamp-pick-modal" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: '20px',
        maxWidth: '600px',
        maxHeight: '80vh',
        overflow: 'auto',
      }}>
        <h3>Aladdin's Lamp</h3>
        <p>Choose a card to draw. The rest go to the bottom of your library in a random order.</p>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
          gap: '12px',
          marginTop: '16px',
        }}>
          {cards.map(card => (
            <button
              key={card.iid}
              data-testid={`lamp-pick-${card.iid}`}
              onClick={() => onPick(card.iid)}
              style={{
                padding: '12px',
                border: '2px solid #ccc',
                borderRadius: '4px',
                backgroundColor: '#f9f9f9',
                cursor: 'pointer',
                textAlign: 'center',
              }}
            >
              <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{card.name}</div>
              <div style={{ fontSize: '12px', color: '#666' }}>{card.type}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
