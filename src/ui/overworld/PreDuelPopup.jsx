// src/ui/overworld/PreDuelPopup.jsx
// Pre-duel interstitial modal. Presentational only — no game logic.

import React from 'react';
import { CCOLOR } from '../shared/Card.jsx';

const RARITY_COLORS = { R: '#f0c040', U: '#88b8d0', C: '#909090' };
const RARITY_LABELS = { R: 'Rare', U: 'Uncommon', C: 'Common' };

function AnteCardBox({ label, card, emptyText, accentColor }) {
  return (
    <div style={{
      flex: 1,
      background: 'rgba(0,0,0,.3)',
      border: `1px solid ${accentColor}40`,
      borderRadius: 6,
      padding: '8px 10px',
      minWidth: 0,
    }}>
      <div style={{
        fontSize: 9, fontFamily: "'Cinzel',serif",
        color: accentColor, marginBottom: 6, letterSpacing: 1,
      }}>
        {label.toUpperCase()}
      </div>
      {card ? (
        <>
          <div style={{
            fontSize: 11, fontFamily: "'Cinzel',serif",
            color: '#e0d080', fontWeight: 700, marginBottom: 3, lineHeight: 1.3,
          }}>
            {card.name}
          </div>
          <div style={{ fontSize: 9, color: '#806040', marginBottom: 4 }}>
            {card.subtype || card.type}
          </div>
          <div style={{
            display: 'inline-block',
            fontSize: 8,
            color: RARITY_COLORS[card.rarity] || '#909090',
            border: `1px solid ${RARITY_COLORS[card.rarity] || '#606060'}60`,
            borderRadius: 3,
            padding: '1px 5px',
            fontFamily: "'Cinzel',serif",
          }}>
            {RARITY_LABELS[card.rarity] || 'Common'}
          </div>
        </>
      ) : (
        <div style={{ fontSize: 11, color: '#504030', fontStyle: 'italic' }}>
          {emptyText}
        </div>
      )}
    </div>
  );
}

export default function PreDuelPopup({ popup, player, anteEnabled, onFight, onFlee, onClose }) {
  const {
    monsterName, monsterFlavor, monsterColor,
    playerAnteCard, opponentAnteCard,
    fleeCost, canFlee, context,
  } = popup;

  const accentColor = CCOLOR[monsterColor] || CCOLOR[''];
  const icon = context === 'castle' ? '♔' : '⚔';
  const canAffordFlee = player.gold >= fleeCost;
  const showAnte = anteEnabled && (playerAnteCard !== null || opponentAnteCard !== null);

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.82)',
      zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: 420,
        background: 'linear-gradient(135deg, #1a1008, #2a1a0a)',
        border: `2px solid ${accentColor}50`,
        borderRadius: 10,
        boxShadow: `0 0 40px rgba(0,0,0,.9), 0 0 20px ${accentColor}20`,
        overflow: 'hidden',
        fontFamily: "'Crimson Text',serif",
      }}>

        {/* Header */}
        <div style={{
          padding: '18px 22px 14px',
          background: `${accentColor}12`,
          borderBottom: `1px solid ${accentColor}30`,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 32, marginBottom: 8, filter: `drop-shadow(0 0 8px ${accentColor})` }}>
            {icon}
          </div>
          <div style={{
            fontSize: 20, fontFamily: "'Cinzel',serif",
            color: accentColor, marginBottom: 6, letterSpacing: 1,
          }}>
            {monsterName}
          </div>
          <div style={{ fontSize: 13, color: '#c0a070', fontStyle: 'italic' }}>
            {monsterFlavor}
          </div>
        </div>

        {/* Ante section — absent from DOM when not applicable */}
        {showAnte && (
          <>
            <div style={{ padding: '14px 22px 0' }}>
              <div style={{
                fontSize: 10, fontFamily: "'Cinzel',serif",
                color: '#8a6030', textAlign: 'center', letterSpacing: 2, marginBottom: 10,
              }}>
                — The Stakes —
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <AnteCardBox
                  label="Your Ante"
                  card={playerAnteCard}
                  emptyText="None"
                  accentColor="#f0c040"
                />
                <AnteCardBox
                  label="Their Ante"
                  card={opponentAnteCard}
                  emptyText="Unknown"
                  accentColor="#cc4040"
                />
              </div>
            </div>
            <div style={{ height: 1, background: 'rgba(200,160,60,.2)', margin: '14px 22px 0' }} />
          </>
        )}

        {/* Action row */}
        <div style={{ padding: '14px 22px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>

            {/* Fight — always present */}
            <button
              onClick={onFight}
              style={{
                flex: 1,
                background: 'linear-gradient(135deg, #3a2008, #5a3010)',
                border: `1px solid ${accentColor}80`,
                color: accentColor,
                padding: '10px',
                borderRadius: 5,
                cursor: 'pointer',
                fontFamily: "'Cinzel',serif",
                fontSize: 13,
                letterSpacing: 1,
              }}
            >
              ⚔ Fight
            </button>

            {/* Flee — or "cannot be bought off" when canFlee is false */}
            {canFlee ? (
              <button
                onClick={() => canAffordFlee && onFlee(fleeCost)}
                disabled={!canAffordFlee}
                style={{
                  flex: 1,
                  background: canAffordFlee
                    ? 'linear-gradient(135deg, #1a2808, #2a3a10)'
                    : 'rgba(0,0,0,.3)',
                  border: `1px solid ${canAffordFlee ? '#80a040' : '#3a3010'}`,
                  color: canAffordFlee ? '#a0c060' : '#4a4020',
                  padding: '10px',
                  borderRadius: 5,
                  cursor: canAffordFlee ? 'pointer' : 'not-allowed',
                  fontFamily: "'Cinzel',serif",
                  fontSize: 11,
                }}
              >
                💰 Pay {fleeCost}g to Flee
              </button>
            ) : (
              <div style={{
                flex: 1,
                padding: '10px',
                color: '#994040',
                fontStyle: 'italic',
                fontSize: 11,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                textAlign: 'center',
                fontFamily: "'Crimson Text',serif",
              }}>
                This enemy cannot be bought off.
              </div>
            )}
          </div>

          {/* Withdraw — only shown when canFlee is true */}
          {canFlee && (
            <div style={{ textAlign: 'center' }}>
              <button
                onClick={onClose}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(160,120,60,.3)',
                  color: '#806040',
                  padding: '5px 20px',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 10,
                  fontFamily: "'Cinzel',serif",
                }}
              >
                ✕ Withdraw
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
