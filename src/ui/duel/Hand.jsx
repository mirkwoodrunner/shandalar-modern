// src/ui/duel/Hand.jsx
// Player hand card row. Presentation only. Per MECHANICS_INDEX.md S7.1

import React from 'react';
import { canPay, isLand } from '../../engine/DuelCore.js';
import { HandCard } from '../shared/Card.jsx';

/**
- Determines if a card in hand is currently castable by the player.
- Read-only check ? DuelCore enforces the actual rule at dispatch time.
  */
  function canCastNow(card, state) {
  const active = state.active === "p";
  const mainPhase = state.phase === "MAIN_1" || state.phase === "MAIN_2";
  const isInstant = card.type === "Instant";

if (isLand(card)) return active && mainPhase && state.landsPlayed < 1;
if (isInstant)    return canPay(state.p.mana, card.cost);
return active && mainPhase && state.stack.length === 0 && canPay(state.p.mana, card.cost);
}

const MAX_SPREAD_DEG = 18;
const MAX_LIFT_PX    = 14;

export function Hand({ state, onCardClick, onTipEnter, onTipLeave }) {
  const count = state.p.hand.length;
  const mid = (count - 1) / 2;

  return (
    <div style={{
      flexShrink: 0,
      position: 'relative',
      height: 148,
      background: 'linear-gradient(180deg, #080c06, #0c1008)',
      borderTop: '1px solid rgba(60,100,30,.35)',
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'center',
      paddingBottom: 8,
      overflow: 'visible',
    }}>
      {count > 0 ? state.p.hand.map((c, i) => {
        const norm = count > 1 ? (i - mid) / mid : 0;
        const rotateDeg = norm * (MAX_SPREAD_DEG / 2);
        const liftPx = (1 - norm * norm) * MAX_LIFT_PX;

        return (
          <div
            key={c.iid}
            onMouseMove={e => onTipEnter(c, e)}
            style={{
              position: 'relative',
              marginLeft: i === 0 ? 0 : -18,
              transform: `rotate(${rotateDeg}deg) translateY(${-liftPx}px)`,
              transformOrigin: 'bottom center',
              transition: 'transform .2s ease, z-index 0s',
              zIndex: i,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.zIndex = 50;
              e.currentTarget.style.transform = `rotate(${rotateDeg}deg) translateY(${-(liftPx + 20)}px) scale(1.06)`;
            }}
            onFocus={e => {
              e.currentTarget.style.zIndex = 50;
              e.currentTarget.style.transform = `rotate(${rotateDeg}deg) translateY(${-(liftPx + 20)}px) scale(1.06)`;
            }}
            onMouseLeave={e => {
              e.currentTarget.style.zIndex = i;
              e.currentTarget.style.transform = `rotate(${rotateDeg}deg) translateY(${-liftPx}px)`;
              onTipLeave();
            }}
          >
            <HandCard
              card={c}
              state={state}
              selected={state.selCard === c.iid}
              playable={canCastNow(c, state)}
              onClick={() => onCardClick(c, 'hand')}
            />
          </div>
        );
      }) : (
        <span style={{
          fontSize: 12, color: '#2a3820', fontStyle: 'italic',
          fontFamily: "'Crimson Text', serif", alignSelf: 'center',
        }}>
          No cards in hand
        </span>
      )}
    </div>
  );
}

export default Hand;
