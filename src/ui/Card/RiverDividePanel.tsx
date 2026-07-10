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
      bottom: '20px',
      left: '20px',
      right: '20px',
      backgroundColor: 'white',
      border: '2px solid #8B0000',
      borderRadius: '8px',
      padding: '16px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      zIndex: 100,
      maxHeight: '50vh',
      overflow: 'auto',
    }}>
      <h3 style={{ margin: '0 0 12px 0', color: '#8B0000' }}>Raging River — Divide Creatures</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
        <div>
          <h4 style={{ margin: '0 0 8px 0' }}>Left Pile</h4>
          {leftCards.length === 0 ? (
            <p style={{ margin: 0, color: '#666', fontSize: '12px' }}>(none)</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {leftCards.map(c => (
                <span key={c.iid} style={{ fontSize: '12px' }}>{c.name}</span>
              ))}
            </div>
          )}
        </div>
        <div>
          <h4 style={{ margin: '0 0 8px 0' }}>Right Pile</h4>
          {rightCards.length === 0 ? (
            <p style={{ margin: 0, color: '#666', fontSize: '12px' }}>(none)</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {rightCards.map(c => (
                <span key={c.iid} style={{ fontSize: '12px' }}>{c.name}</span>
              ))}
            </div>
          )}
        </div>
      </div>
      <div style={{ marginBottom: '16px' }}>
        <h4 style={{ margin: '0 0 8px 0' }}>Click to toggle pile:</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {nonFlyers.map(c => (
            <button
              key={c.iid}
              data-testid={`river-toggle-${c.iid}`}
              onClick={() => handleToggle(c.iid)}
              style={{
                padding: '6px 8px',
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
      </div>
      <button
        data-testid="river-divide-confirm"
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
        Confirm Division
      </button>
    </div>
  );
};
