// src/ui/duel/TransmutePayModal.tsx
import React from 'react';

interface TransmutePayModalProps {
  required: number;
  tutoredCard: any;
  currentMana: Record<string, number>;
  snapshotMana: Record<string, number> | null;
  onConfirm: () => void;
  onUndo: () => void;
  onDecline: () => void;
}

export function TransmutePayModal({
  required, tutoredCard, currentMana, snapshotMana,
  onConfirm, onUndo, onDecline,
}: TransmutePayModalProps) {
  const paid       = Object.values(currentMana).reduce((a, b) => a + b, 0);
  const canConfirm = paid >= required;
  const hasUndo    = snapshotMana !== null;

  return (
    <>
      <style>{`
        @keyframes transmuteBannerIn {
          from { opacity: 0; transform: translateY(-10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Compact banner pinned to top -- does NOT cover the battlefield */}
      <div
        data-testid="transmute-pay-modal"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 200,
          background: 'linear-gradient(180deg, rgba(10,8,2,0.97) 0%, rgba(14,12,4,0.94) 100%)',
          borderBottom: '2px solid rgba(180,160,60,.35)',
          boxShadow: '0 4px 24px rgba(0,0,0,.7)',
          animation: 'transmuteBannerIn 180ms ease',
          padding: '8px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Title row */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}>
          <div style={{
            fontSize: 11,
            fontFamily: "'Cinzel', serif",
            color: '#e0c060',
            fontWeight: 700,
            lineHeight: 1.2,
          }}>
            {'◆'} Transmute {'—'} Pay Additional Cost
          </div>

          {/* Paid / Required counter */}
          <div style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 4,
            fontFamily: "'Fira Code', monospace",
            flexShrink: 0,
          }}>
            <span style={{
              fontSize: 22,
              fontWeight: 700,
              color: canConfirm ? '#80d060' : '#e0d080',
              transition: 'color 120ms',
            }}>
              {paid}
            </span>
            <span style={{ fontSize: 13, color: '#4a3820' }}>of</span>
            <span style={{ fontSize: 22, fontWeight: 700, color: '#c4a040' }}>
              {required}
            </span>
          </div>
        </div>

        {/* Subtitle */}
        <div style={{
          fontSize: 9,
          color: '#6a5020',
          fontStyle: 'italic',
        }}>
          {tutoredCard?.name} costs more than the sacrificed artifact. Tap lands below to pay.
        </div>

        {/* Button row */}
        <div style={{
          display: 'flex',
          gap: 6,
          justifyContent: 'flex-end',
          marginTop: 2,
        }}>
          <button
            data-testid="transmute-pay-decline"
            onClick={onDecline}
            style={{
              background: 'rgba(80,20,10,.6)',
              border: '1px solid rgba(180,80,40,.5)',
              color: '#e08060',
              borderRadius: 4,
              padding: '4px 10px',
              cursor: 'pointer',
              fontSize: 10,
              fontFamily: "'Cinzel', serif",
            }}
          >
            Decline
          </button>
          <button
            data-testid="transmute-pay-undo"
            onClick={onUndo}
            disabled={!hasUndo}
            style={{
              background: hasUndo ? 'rgba(30,30,50,.7)' : 'transparent',
              border: `1px solid ${hasUndo ? 'rgba(120,120,180,.5)' : 'rgba(60,60,80,.3)'}`,
              color: hasUndo ? '#c0c0e0' : '#3a3860',
              borderRadius: 4,
              padding: '4px 10px',
              cursor: hasUndo ? 'pointer' : 'default',
              fontSize: 10,
              fontFamily: "'Cinzel', serif",
            }}
          >
            Undo Tap
          </button>
          <button
            data-testid="transmute-pay-confirm"
            onClick={onConfirm}
            disabled={!canConfirm}
            style={{
              background: canConfirm
                ? 'linear-gradient(135deg,#1a2a10,#2a4020)'
                : 'rgba(20,30,15,.4)',
              border: `1px solid ${canConfirm ? '#5a9040' : 'rgba(40,70,30,.3)'}`,
              color: canConfirm ? '#80d060' : '#304030',
              borderRadius: 4,
              padding: '4px 14px',
              cursor: canConfirm ? 'pointer' : 'default',
              fontSize: 10,
              fontFamily: "'Cinzel', serif",
              fontWeight: 700,
            }}
          >
            Confirm
          </button>
        </div>
      </div>
    </>
  );
}
