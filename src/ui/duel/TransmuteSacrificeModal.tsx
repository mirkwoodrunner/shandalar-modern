// src/ui/duel/TransmuteSacrificeModal.tsx
import React from 'react';

const CCOLOR: Record<string, string> = {
  W: '#f8f4d0', U: '#7ab8d8', B: '#9060a0', R: '#e04830', G: '#30a050', C: '#aaaaaa',
};

interface TransmuteSacrificeModalProps {
  artifacts: any[];
  onConfirm: (iid: string) => void;
  onDecline: () => void;
}

export function TransmuteSacrificeModal({ artifacts, onConfirm, onDecline }: TransmuteSacrificeModalProps) {
  return (
    <>
      <style>{`@keyframes tutorFadeIn { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }`}</style>
      <div
        data-testid="transmute-sacrifice-modal"
        style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,.9)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}
      >
        <div
          style={{
            width: '100%', maxWidth: 440,
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
            <div style={{ fontSize: 15, fontFamily: "'Cinzel',serif", color: '#e0c060', fontWeight: 700 }}>
              {'◆'} Transmute Artifact
            </div>
            <div style={{ fontSize: 9, color: '#6a5020', marginTop: 2 }}>
              Choose an artifact to sacrifice, or decline.
            </div>
          </div>

          <div style={{ maxHeight: '45vh', overflowY: 'auto', scrollbarWidth: 'thin' }}>
            {artifacts.length === 0 ? (
              <div style={{ padding: 16, fontSize: 11, color: '#3a2810', fontStyle: 'italic', textAlign: 'center' }}>
                No artifacts to sacrifice.
              </div>
            ) : (
              artifacts.map(art => {
                const colorAccent = CCOLOR[art.color ?? ''] ?? '#888';
                return (
                  <div
                    key={art.iid}
                    data-testid={`transmute-sacrifice-${art.id}`}
                    onClick={() => onConfirm(art.iid)}
                    style={{
                      display: 'flex', alignItems: 'center', padding: '8px 12px', gap: 8,
                      borderBottom: '1px solid rgba(180,160,60,.08)',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'rgba(200,160,40,.10)')}
                    onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
                  >
                    <span style={{ flex: 1, fontSize: 12, fontFamily: "'Cinzel',serif", color: '#e0d080', fontWeight: 600 }}>{art.name}</span>
                    <span style={{ fontSize: 10, color: '#806040' }}>{art.subtype || art.type}</span>
                    <span style={{ fontSize: 10, fontFamily: "'Fira Code',monospace", color: colorAccent, fontWeight: 700, minWidth: 28, textAlign: 'right' }}>
                      CMC {art.cmc ?? 0}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          <div style={{
            padding: '8px 16px',
            borderTop: '1px solid rgba(180,160,60,.12)',
            display: 'flex', justifyContent: 'flex-end', flexShrink: 0,
          }}>
            <button
              data-testid="transmute-sacrifice-decline"
              onClick={onDecline}
              style={{
                background: 'rgba(80,20,10,.6)', border: '1px solid rgba(180,80,40,.5)',
                color: '#e08060', borderRadius: 5, padding: '5px 14px',
                cursor: 'pointer', fontSize: 11, fontFamily: "'Cinzel',serif",
              }}
            >
              Decline
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
