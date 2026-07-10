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
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: 'white',
      border: '2px solid #8B0000',
      borderTopLeftRadius: '12px',
      borderTopRightRadius: '12px',
      padding: '12px',
      boxShadow: '0 -4px 12px rgba(0,0,0,0.3)',
      zIndex: 100,
      maxHeight: '70vh',
      overflow: 'auto',
    }}>
      <h3 style={{ margin: '0 0 8px 0', color: '#8B0000', fontSize: '16px' }}>Choose Sides</h3>
      <p style={{ margin: '0 0 12px 0', fontSize: '11px' }}>
        Choose which pile each attacker can be blocked by
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
        {attackers.map(c => (
          <button
            key={c.iid}
            data-testid={`river-side-${c.iid}`}
            onClick={() => handleToggle(c.iid)}
            style={{
              padding: '10px',
              textAlign: 'center',
              backgroundColor: sides[c.iid] === 'left' ? '#E8F0FF' : '#FFE8E8',
              border: `2px solid ${sides[c.iid] === 'left' ? '#4169E1' : '#DC143C'}`,
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 'bold',
            }}
          >
            <div>{c.name}</div>
            <div style={{ fontSize: '11px', marginTop: '2px' }}>→ {sides[c.iid].toUpperCase()}</div>
          </button>
        ))}
      </div>

      <button
        data-testid="river-sides-confirm"
        onClick={handleConfirm}
        style={{
          width: '100%',
          padding: '12px',
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
