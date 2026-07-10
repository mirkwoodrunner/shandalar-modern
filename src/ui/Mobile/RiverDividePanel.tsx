import React, { useState } from 'react';
import { Card } from '../../types/Card';

interface RiverDividePanelProps {
  nonFlyers: Card[];
  onConfirm: (leftIids: string[], rightIids: string[]) => void;
}

export const RiverDividePanel: React.FC<RiverDividePanelProps> = ({ nonFlyers, onConfirm }) => {
  const [division, setDivision] = useState<Record<string, 'left' | 'right'>>(
    Object.fromEntries(nonFlyers.map(c => [c.iid, 'left']))
  );

  const leftCards = nonFlyers.filter(c => division[c.iid] === 'left');
  const rightCards = nonFlyers.filter(c => division[c.iid] === 'right');

  const handleToggle = (iid: string) => {
    setDivision(prev => ({
      ...prev,
      [iid]: prev[iid] === 'left' ? 'right' : 'left',
    }));
  };

  const handleConfirm = () => {
    onConfirm(
      leftCards.map(c => c.iid),
      rightCards.map(c => c.iid)
    );
  };

  return (
    <div data-testid="river-divide-panel" style={{
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
      <h3 style={{ margin: '0 0 8px 0', color: '#8B0000', fontSize: '16px' }}>Raging River</h3>
      <p style={{ margin: '0 0 12px 0', fontSize: '12px' }}>Divide creatures into left/right piles</p>

      <div style={{ marginBottom: '12px' }}>
        <h4 style={{ margin: '0 0 6px 0', fontSize: '12px' }}>Left: {leftCards.length} creature(s)</h4>
        <div style={{ fontSize: '11px', color: '#666', marginBottom: '8px' }}>
          {leftCards.length === 0 ? '(none)' : leftCards.map(c => c.name).join(', ')}
        </div>
        <h4 style={{ margin: '0 0 6px 0', fontSize: '12px' }}>Right: {rightCards.length} creature(s)</h4>
        <div style={{ fontSize: '11px', color: '#666' }}>
          {rightCards.length === 0 ? '(none)' : rightCards.map(c => c.name).join(', ')}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '12px' }}>
        {nonFlyers.map(c => (
          <button
            key={c.iid}
            data-testid={`river-toggle-${c.iid}`}
            onClick={() => handleToggle(c.iid)}
            style={{
              padding: '8px',
              textAlign: 'left',
              backgroundColor: division[c.iid] === 'left' ? '#E8F0FF' : '#FFE8E8',
              border: `2px solid ${division[c.iid] === 'left' ? '#4169E1' : '#DC143C'}`,
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 'bold',
            }}
          >
            {c.name} → {division[c.iid].toUpperCase()}
          </button>
        ))}
      </div>

      <button
        data-testid="river-divide-confirm"
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
        Confirm Division
      </button>
    </div>
  );
};
