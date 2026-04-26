// src/ui/dungeon/TreasureModal.jsx
// Reveal modal shown when player steps on a TREASURE entity.
// Treasure is already collected by the time this renders; this is pure reveal UI.
// Per SYSTEMS.md S9 (Dungeon System).

import React from 'react';

const RARITY_LABELS = {
  C: { label: 'A common card glints from the wreckage?',   color: '#a0a090' },
  U: { label: 'An uncommon card catches the torchlight?',  color: '#90a0c0' },
  R: { label: 'A rare card shimmers in the chest?',        color: '#d0a040' },
};

export default function TreasureModal({ treasure, onCollect }) {
  const rarity = treasure.cardRarity ? RARITY_LABELS[treasure.cardRarity] : null;

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,.82)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 500,
      fontFamily: "'Crimson Text', serif",
    }}>
      <div style={{
        background: 'linear-gradient(160deg, #1a1508, #100e06)',
        border: '2px solid rgba(200,160,40,.5)',
        borderRadius: 8,
        padding: '28px 36px',
        minWidth: 300, maxWidth: 420,
        textAlign: 'center',
        boxShadow: '0 0 60px rgba(200,140,0,.3)',
      }}>
        {/* Icon */}
        <div style={{ fontSize: 36, marginBottom: 10 }}>?</div>

        {/* Title */}
        <div style={{
          fontSize: 18, fontFamily: "'Cinzel', serif",
          color: '#f0c040', marginBottom: 16, letterSpacing: 1,
        }}>
          Treasure Found!
        </div>

        {/* Gold */}
        <div style={{
          fontSize: 22, color: '#f0d060',
          fontFamily: "'Cinzel', serif", marginBottom: 10,
        }}>
          +{treasure.gold}g
        </div>

        {/* Card rarity flavor */}
        {rarity && (
          <div style={{
            fontSize: 13, color: rarity.color,
            fontStyle: 'italic', marginBottom: 18,
            fontFamily: "'Crimson Text', serif",
          }}>
            {rarity.label}
          </div>
        )}

        {/* Collect button */}
        <button
          onClick={onCollect}
          style={{
            background: 'linear-gradient(135deg, #3a2800, #6a4800)',
            border: '2px solid rgba(200,160,40,.5)',
            color: '#f0c040',
            padding: '10px 32px', borderRadius: 5,
            cursor: 'pointer',
            fontSize: 14, fontFamily: "'Cinzel', serif", letterSpacing: 1,
            boxShadow: '0 0 16px rgba(200,140,0,.3)',
          }}
          autoFocus
        >
          Collect
        </button>
      </div>
    </div>
  );
}
