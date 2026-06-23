// src/ui/duel/XSelectModal.tsx
// Shared modal for choosing X on X-cost spells before targeting/payment.
// Imported by DuelScreen.tsx and DuelScreenMobile.tsx.

import React from 'react';

interface Props {
  cardName: string;
  xVal: number;
  xMax: number;            // upper bound for stepper (ignored if legalValues set)
  legalValues?: number[];  // if set, stepper jumps only between these (Spell Blast)
  onAdjust: (delta: number) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function XSelectModal({
  cardName,
  xVal,
  xMax,
  legalValues,
  onAdjust,
  onConfirm,
  onCancel,
}: Props) {
  const atMin = legalValues
    ? legalValues.indexOf(xVal) <= 0
    : xVal <= 0;
  const atMax = legalValues
    ? legalValues.indexOf(xVal) >= legalValues.length - 1
    : xVal >= xMax;

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
          Choose X for {cardName}
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 16 }}>
          <button
            onClick={() => onAdjust(-1)}
            disabled={atMin}
            style={{
              width: 40, height: 40, borderRadius: 4,
              border: '1px solid #4080c0',
              background: atMin ? 'rgba(40,40,40,0.4)' : 'rgba(20,40,80,0.6)',
              color: atMin ? '#555' : '#80b0e0',
              fontSize: 20, cursor: atMin ? 'not-allowed' : 'pointer',
            }}
          >
            -
          </button>
          <span style={{ color: '#fff', fontSize: 24, minWidth: 32, textAlign: 'center' }}>
            {xVal}
          </span>
          <button
            onClick={() => onAdjust(1)}
            disabled={atMax}
            style={{
              width: 40, height: 40, borderRadius: 4,
              border: '1px solid #4080c0',
              background: atMax ? 'rgba(40,40,40,0.4)' : 'rgba(20,40,80,0.6)',
              color: atMax ? '#555' : '#80b0e0',
              fontSize: 20, cursor: atMax ? 'not-allowed' : 'pointer',
            }}
          >
            +
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={onConfirm}
            style={{
              border: '1px solid #4080c0',
              background: 'rgba(20,40,80,0.6)',
              color: '#80b0e0',
              padding: '8px 16px',
              borderRadius: 4,
              cursor: 'pointer',
              fontFamily: 'var(--font-display)',
              fontSize: 13,
            }}
          >
            Confirm X={xVal}
          </button>
          <button
            onClick={onCancel}
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
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
