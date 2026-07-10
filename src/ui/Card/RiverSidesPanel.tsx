import React, { useState } from 'react';
import { Card } from '../../types/Card';

interface RiverSidesPanelProps {
  attackers: Card[];
  onConfirm: (sides: Record<string, 'left' | 'right'>) => void;
}

export const RiverSidesPanel: React.FC<RiverSidesPanelProps> = ({ attackers, onConfirm }) => {
  const [sides, setSides] = useState<Record<string, 'left' | 'right'>>(
    Object.fromEntries(attackers.map(c => [c.iid, 'left']))
  );

  const handleToggle = (iid: string) => {
    setSides(prev => ({
      ...prev,
      [iid]: prev[iid] === 'left' ? 'right' : 'left',
    }));
  };

  const handleConfirm = () => {
    onConfirm(sides);
  };

  return (
    <div data-testid="river-sides-panel" style={{
      position: 'fixed',
      bottom: '20px',
      left: '20px',
      right: '20px',
      backgroundColor: 'white',
      border: '2px solid #8B0000',
      borderRadius: '8px',
      padding: '16px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      zIndex: 100,
      maxHeight: '60vh',
      overflow: 'auto',
    }}>
      <h3 style={{ margin: '0 0 12px 0', color: '#8B0000' }}>Raging River — Choose Sides</h3>
      <p style={{ margin: '0 0 12px 0', fontSize: '12px' }}>
        For each attacking creature, choose which pile it can be blocked by:
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
        {attackers.map(c => (
          <div key={c.iid} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ flex: 1, fontSize: '12px', fontWeight: 'bold' }}>{c.name}</span>
            <button
              data-testid={`river-side-${c.iid}`}
              onClick={() => handleToggle(c.iid)}
              style={{
                padding: '6px 12px',
                backgroundColor: sides[c.iid] === 'left' ? '#E8F0FF' : '#FFE8E8',
                border: `2px solid ${sides[c.iid] === 'left' ? '#4169E1' : '#DC143C'}`,
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 'bold',
                minWidth: '80px',
              }}
            >
              {sides[c.iid].toUpperCase()}
            </button>
          </div>
        ))}
      </div>
      <button
        data-testid="river-sides-confirm"
        onClick={handleConfirm}
        style={{
          width: '100%',
          padding: '10px',
          backgroundColor: '#8B0000',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontWeight: 'bold',
          fontSize: '14px',
        }}
      >
        Confirm Sides
      </button>
    </div>
  );
};
