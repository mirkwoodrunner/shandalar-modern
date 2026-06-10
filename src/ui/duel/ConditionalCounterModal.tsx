// src/ui/duel/ConditionalCounterModal.tsx
// Shared modal for "counter unless controller pays {N}" spells.
// Handles Force Spike ({1}) and Power Sink ({X}).
// Imported by DuelScreen.tsx; used for both desktop and mobile.

import React from 'react';

interface Props {
  cardName: string;
  targetedSpellName: string;
  cost: number;
  canPay: boolean;
  totalMana: number;
  isPowerSink: boolean;
  onResolve: (paid: boolean) => void;
}

export function ConditionalCounterModal({
  cardName,
  targetedSpellName,
  cost,
  canPay,
  totalMana,
  isPowerSink,
  onResolve,
}: Props) {
  const costLabel = `{${cost}}`;
  const declineConsequence = isPowerSink
    ? `${targetedSpellName} will be countered and all your lands will be tapped.`
    : `${targetedSpellName} will be countered.`;

  return (
    <div className="popover-overlay">
      <div
        className="popover-content"
        onClick={e => e.stopPropagation()}
        style={{
          border: '2px solid #4080c0',
          background: 'rgba(10,15,25,0.97)',
          fontFamily: 'var(--font-display)',
        }}
      >
        <h3 style={{ color: '#4080c0', fontFamily: 'var(--font-display)', marginBottom: 8 }}>
          {cardName}
        </h3>
        <p style={{ color: '#ccc', marginBottom: 8 }}>
          {targetedSpellName} will be countered unless you pay {costLabel}.
        </p>
        <p style={{ color: '#6090b0', fontSize: 12, marginBottom: 16 }}>
          Mana available: {totalMana}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={() => onResolve(true)}
            disabled={!canPay}
            style={{
              border: canPay ? '1px solid #4080c0' : '1px solid #444',
              background: canPay ? 'rgba(20,40,80,0.6)' : 'rgba(40,40,40,0.4)',
              color: canPay ? '#80b0e0' : '#555',
              padding: '8px 16px',
              borderRadius: 4,
              cursor: canPay ? 'pointer' : 'not-allowed',
              fontFamily: 'var(--font-display)',
              fontSize: 13,
            }}
          >
            Pay {costLabel}
          </button>
          <button
            onClick={() => onResolve(false)}
            style={{
              border: '1px solid #a04040',
              background: 'rgba(80,20,20,0.5)',
              color: '#e06060',
              padding: '8px 16px',
              borderRadius: 4,
              cursor: 'pointer',
              fontFamily: 'var(--font-display)',
              fontSize: 13,
            }}
          >
            {declineConsequence}
          </button>
        </div>
      </div>
    </div>
  );
}
