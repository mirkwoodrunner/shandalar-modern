// src/ui/duel/CleanupDiscardModal.tsx
// Cleanup-step hand-limit discard modal. Matches TutorModal's visual language.
// Shown when the human player is over their maximum hand size at cleanup --
// selection is mandatory (no decline) and the confirm button only enables once
// exactly `count` cards are selected. See docs/SYSTEMS.md Section 29.

import React, { useState } from 'react';

const CCOLOR: Record<string, string> = {
  W: '#f8f4d0', U: '#7ab8d8', B: '#9060a0', R: '#e04830', G: '#30a050', C: '#aaaaaa',
};

function DiscardCardRow({ card, onClick, isSelected }: {
  card: any; onClick: () => void; isSelected: boolean;
}) {
  const colorAccent = CCOLOR[card.color ?? ''] ?? '#888';
  const rarityColor = card.rarity === 'R' ? '#f0c040' : card.rarity === 'U' ? '#88b8d0' : '#707070';
  return (
    <div
      data-testid={`cleanup-discard-card-${card.iid}`}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '7px 12px',
        gap: 8,
        borderBottom: '1px solid rgba(180,160,60,.08)',
        borderLeft: isSelected ? '3px solid #c0a030' : '3px solid transparent',
        cursor: 'pointer',
        background: isSelected ? 'rgba(200,160,40,.12)' : 'transparent',
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = isSelected ? 'rgba(200,160,40,.12)' : 'rgba(200,160,40,.10)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isSelected ? 'rgba(200,160,40,.12)' : 'transparent'; }}
    >
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: rarityColor, flexShrink: 0 }} />
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: colorAccent, flexShrink: 0 }} />
      <span style={{
        flex: 1,
        fontSize: 12,
        fontFamily: "'Cinzel',serif",
        color: '#e0d080',
        fontWeight: 600,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {card.name}
      </span>
      <span style={{
        fontSize: 10,
        color: '#806040',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        maxWidth: 120,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        {card.subtype ? `${card.type} — ${card.subtype}` : card.type}
      </span>
      <span style={{
        fontSize: 10,
        fontFamily: "'Fira Code',monospace",
        color: colorAccent,
        fontWeight: 700,
        flexShrink: 0,
        minWidth: 28,
        textAlign: 'right',
      }}>
        {card.cost ?? ''}
      </span>
    </div>
  );
}

interface CleanupDiscardModalProps {
  hand: any[];
  count: number;
  onConfirm: (iids: string[]) => void;
}

export function CleanupDiscardModal({ hand, count, onConfirm }: CleanupDiscardModalProps) {
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (iid: string) => {
    setSelected(prev => {
      if (prev.includes(iid)) return prev.filter(x => x !== iid);
      if (prev.length >= count) return prev;
      return [...prev, iid];
    });
  };

  const ready = selected.length === count;

  return (
    <>
      <style>{`@keyframes cleanupDiscardFadeIn { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }`}</style>
      <div
        data-testid="cleanup-discard-modal"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 200,
          background: 'rgba(0,0,0,.9)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 560,
            maxHeight: '90vh',
            background: 'linear-gradient(160deg,#0e0c04,#080a04)',
            border: '2px solid rgba(180,160,60,.4)',
            borderRadius: 12,
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 0 60px rgba(0,0,0,.9)',
            overflow: 'hidden',
            animation: 'cleanupDiscardFadeIn 180ms ease',
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid rgba(180,160,60,.2)',
            flexShrink: 0,
          }}>
            <div style={{ fontSize: 15, fontFamily: "'Cinzel',serif", color: '#e0c060', fontWeight: 700 }}>
              {'◆'} Cleanup — Discard to Hand Size
            </div>
            <div style={{ fontSize: 9, color: '#6a5020', marginTop: 2 }}>
              Select {count} card{count === 1 ? '' : 's'} to discard.
            </div>
          </div>

          {/* Card list */}
          <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'thin' }}>
            {hand.map(card => (
              <DiscardCardRow
                key={card.iid}
                card={card}
                onClick={() => toggle(card.iid)}
                isSelected={selected.includes(card.iid)}
              />
            ))}
          </div>

          {/* Footer */}
          <div style={{
            padding: '8px 16px',
            borderTop: '1px solid rgba(180,160,60,.12)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0,
          }}>
            <span style={{ fontSize: 9, color: '#3a2810', fontStyle: 'italic' }}>
              Selected: {selected.length} / {count}
            </span>
            <button
              data-testid="cleanup-discard-confirm"
              onClick={() => ready && onConfirm(selected)}
              disabled={!ready}
              style={{
                background: ready ? 'rgba(160,120,20,.7)' : 'rgba(60,50,20,.4)',
                border: `1px solid ${ready ? 'rgba(200,160,40,.7)' : 'rgba(120,100,60,.3)'}`,
                color: ready ? '#f0d060' : '#5a5040',
                borderRadius: 5,
                padding: '5px 18px',
                cursor: ready ? 'pointer' : 'default',
                fontSize: 11,
                fontFamily: "'Cinzel',serif",
                fontWeight: 700,
              }}
            >
              Discard
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
