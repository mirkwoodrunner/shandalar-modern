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
  const totalNow    = Object.values(currentMana).reduce((a, b) => a + b, 0);
  const totalBefore = snapshotMana
    ? Object.values(snapshotMana).reduce((a, b) => a + b, 0)
    : totalNow;
  const tapped      = Math.max(0, totalBefore - totalNow);
  const canConfirm  = tapped >= required;

  return (
    <>
      <style>{`@keyframes tutorFadeIn { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }`}</style>
      <div
        data-testid="transmute-pay-modal"
        style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,.88)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}
      >
        <div
          style={{
            width: '100%', maxWidth: 380,
            background: 'linear-gradient(160deg,#0e0c04,#080a04)',
            border: '2px solid rgba(180,160,60,.4)',
            borderRadius: 12,
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 0 60px rgba(0,0,0,.9)',
            overflow: 'hidden',
            animation: 'tutorFadeIn 180ms ease',
          }}
          onClick={e => e.stopPropagation()}
        >
          <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(180,160,60,.2)', flexShrink: 0 }}>
            <div style={{ fontSize: 14, fontFamily: "'Cinzel',serif", color: '#e0c060', fontWeight: 700 }}>
              {'◆'} Transmute Artifact {'—'} Pay Additional Cost
            </div>
            <div style={{ fontSize: 9, color: '#6a5020', marginTop: 2 }}>
              {tutoredCard?.name} has a higher mana value than the sacrificed artifact.
            </div>
          </div>

          <div style={{ padding: '20px 16px' }}>
            <div style={{
              background: '#060503',
              border: '1px solid rgba(180,160,60,.2)',
              borderRadius: 8,
              padding: '16px',
              textAlign: 'center',
            }}>
              <div style={{ fontFamily: "'Fira Code',monospace" }}>
                <span style={{ fontSize: 32, fontWeight: 700, color: canConfirm ? '#80d060' : '#e0d080' }}>
                  {tapped}
                </span>
                <span style={{ fontSize: 20, color: '#4a3820', margin: '0 8px' }}>of</span>
                <span style={{ fontSize: 32, fontWeight: 700, color: '#c4a040' }}>
                  {required}
                </span>
              </div>
              <div style={{ fontSize: 10, color: '#4a3820', marginTop: 6, fontFamily: "'Cinzel',serif" }}>
                mana tapped toward payment
              </div>
            </div>
            <div style={{ fontSize: 10, color: '#3a2810', textAlign: 'center', marginTop: 10, fontStyle: 'italic' }}>
              Tap lands or mana sources on the battlefield to pay.
            </div>
          </div>

          <div style={{
            padding: '8px 16px',
            borderTop: '1px solid rgba(180,160,60,.12)',
            display: 'flex', gap: 8, justifyContent: 'flex-end', flexShrink: 0,
          }}>
            <button
              data-testid="transmute-pay-decline"
              onClick={onDecline}
              style={{
                background: 'rgba(80,20,10,.6)', border: '1px solid rgba(180,80,40,.5)',
                color: '#e08060', borderRadius: 5, padding: '5px 12px',
                cursor: 'pointer', fontSize: 11, fontFamily: "'Cinzel',serif",
              }}
            >
              Decline
            </button>
            <button
              data-testid="transmute-pay-undo"
              onClick={onUndo}
              disabled={!snapshotMana}
              style={{
                background: snapshotMana ? 'rgba(30,30,50,.7)' : 'transparent',
                border: `1px solid ${snapshotMana ? 'rgba(120,120,180,.5)' : 'rgba(60,60,80,.3)'}`,
                color: snapshotMana ? '#c0c0e0' : '#3a3860',
                borderRadius: 5, padding: '5px 12px',
                cursor: snapshotMana ? 'pointer' : 'default',
                fontSize: 11, fontFamily: "'Cinzel',serif",
              }}
            >
              Undo Tap
            </button>
            <button
              data-testid="transmute-pay-confirm"
              onClick={onConfirm}
              disabled={!canConfirm}
              style={{
                background: canConfirm ? 'linear-gradient(135deg,#1a2a10,#2a4020)' : 'rgba(20,30,15,.4)',
                border: `1px solid ${canConfirm ? '#5a9040' : 'rgba(40,70,30,.3)'}`,
                color: canConfirm ? '#80d060' : '#304030',
                borderRadius: 5, padding: '5px 16px',
                cursor: canConfirm ? 'pointer' : 'default',
                fontSize: 11, fontFamily: "'Cinzel',serif", fontWeight: 700,
              }}
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
