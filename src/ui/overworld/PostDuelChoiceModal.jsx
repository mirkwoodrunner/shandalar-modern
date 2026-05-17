// src/ui/overworld/PostDuelChoiceModal.jsx
// Post-duel reward choice: take a card OR receive a dungeon clue. Presentational only.

import React from 'react';

const RARITY_COLORS = { R: '#f0c040', U: '#88b8d0', C: '#909090' };
const RARITY_LABELS = { R: 'Rare', U: 'Uncommon', C: 'Common' };

const TERRAIN_ICONS = {
  PLAINS:   '🌿',
  FOREST:   '🌲',
  MOUNTAIN: '⛰',
  SWAMP:    '🌑',
  WATER:    '🌊',
};

export default function PostDuelChoiceModal({ cardReward, dungeonClue, onTakeCard, onTakeClue }) {
  const rarityColor = cardReward ? (RARITY_COLORS[cardReward.rarity] ?? '#909090') : '#909090';
  const rarityLabel = cardReward ? (RARITY_LABELS[cardReward.rarity] ?? cardReward.rarity) : '';
  const terrainIcon = TERRAIN_ICONS[dungeonClue?.terrain?.id] ?? '🗺';

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.82)',
      zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'linear-gradient(160deg,#1a1208,#0d0a04)',
        border: '2px solid rgba(200,160,40,.35)',
        borderRadius: 10,
        padding: '28px 32px',
        width: 520,
        maxWidth: '92vw',
        fontFamily: "'Crimson Text', serif",
        boxShadow: '0 8px 40px rgba(0,0,0,.7)',
      }}>
        <div style={{
          textAlign: 'center', marginBottom: 6,
          fontSize: 17, fontFamily: "'Cinzel', serif",
          color: '#d0a030', letterSpacing: 1,
        }}>
          Victory Reward
        </div>
        <div style={{ fontSize: 12, color: '#a08050', textAlign: 'center', marginBottom: 22 }}>
          Choose wisely — you may take only one.
        </div>

        <div style={{ display: 'flex', gap: 16 }}>
          {/* Left: Card */}
          <div style={{
            flex: 1,
            background: cardReward ? 'rgba(0,0,0,.35)' : 'rgba(0,0,0,.2)',
            border: `1px solid ${cardReward ? 'rgba(200,160,40,.4)' : 'rgba(100,80,40,.2)'}`,
            borderRadius: 8, padding: '16px 14px',
            display: 'flex', flexDirection: 'column', gap: 10,
            opacity: cardReward ? 1 : 0.5,
          }}>
            <div style={{ fontSize: 9, fontFamily: "'Cinzel',serif", color: '#a08050', letterSpacing: 1 }}>
              CARD REWARD
            </div>
            {cardReward ? (
              <>
                <div style={{ fontSize: 15, fontFamily: "'Cinzel',serif", color: '#e8d080', lineHeight: 1.3 }}>
                  {cardReward.name}
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{
                    fontSize: 9, fontFamily: "'Cinzel',serif",
                    color: rarityColor,
                    background: `${rarityColor}22`,
                    border: `1px solid ${rarityColor}55`,
                    padding: '2px 6px', borderRadius: 3, letterSpacing: 1,
                  }}>
                    {rarityLabel.toUpperCase()}
                  </span>
                  <span style={{ fontSize: 10, color: '#908060' }}>{cardReward.type}</span>
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12, color: '#706040', fontStyle: 'italic' }}>
                No card available
              </div>
            )}
            <button
              onClick={onTakeCard}
              disabled={!cardReward}
              style={{
                marginTop: 'auto',
                background: cardReward
                  ? 'linear-gradient(135deg,#2a1e08,#4a3210)'
                  : 'rgba(0,0,0,.2)',
                border: `1px solid ${cardReward ? 'rgba(200,160,40,.5)' : 'rgba(100,80,40,.2)'}`,
                color: cardReward ? '#d0a030' : '#504030',
                padding: '10px 0', borderRadius: 5,
                cursor: cardReward ? 'pointer' : 'default',
                fontSize: 12, fontFamily: "'Cinzel',serif", letterSpacing: 1,
                width: '100%',
              }}
            >
              Take Card
            </button>
          </div>

          {/* Right: Dungeon Clue */}
          <div style={{
            flex: 1,
            background: dungeonClue ? 'rgba(0,0,0,.35)' : 'rgba(0,0,0,.2)',
            border: `1px solid ${dungeonClue ? 'rgba(140,60,180,.4)' : 'rgba(80,40,100,.2)'}`,
            borderRadius: 8, padding: '16px 14px',
            display: 'flex', flexDirection: 'column', gap: 10,
            opacity: dungeonClue ? 1 : 0.5,
          }}>
            <div style={{ fontSize: 9, fontFamily: "'Cinzel',serif", color: '#a080c0', letterSpacing: 1 }}>
              DUNGEON CLUE
            </div>
            {dungeonClue ? (
              <>
                <div style={{ fontSize: 15, fontFamily: "'Cinzel',serif", color: '#c8a0e0', lineHeight: 1.3 }}>
                  {dungeonClue.name}
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 14 }}>{terrainIcon}</span>
                  <span style={{ fontSize: 10, color: '#907080' }}>{dungeonClue.mod?.name ?? ''}</span>
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12, color: '#706040', fontStyle: 'italic' }}>
                No unknown dungeons remain
              </div>
            )}
            <button
              onClick={onTakeClue}
              disabled={!dungeonClue}
              style={{
                marginTop: 'auto',
                background: dungeonClue
                  ? 'linear-gradient(135deg,#1a0828,#341050)'
                  : 'rgba(0,0,0,.2)',
                border: `1px solid ${dungeonClue ? 'rgba(140,60,180,.5)' : 'rgba(80,40,100,.2)'}`,
                color: dungeonClue ? '#c090e0' : '#503060',
                padding: '10px 0', borderRadius: 5,
                cursor: dungeonClue ? 'pointer' : 'default',
                fontSize: 12, fontFamily: "'Cinzel',serif", letterSpacing: 1,
                width: '100%',
              }}
            >
              Take Clue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
