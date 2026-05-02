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

export function Hand({ state, onCardClick, onTipEnter, onTipLeave }) {
return (
<div style={{
flexShrink: 0,
padding: "6px 10px 8px",
display: "flex", gap: 4, alignItems: "flex-end",
background: "linear-gradient(180deg,#0c1808,#141c10)",
overflowX: "auto", minHeight: 120,
borderTop: "1px solid rgba(60,120,30,.4)",
}}>
{state.p.hand.map(c => (
<div key={c.iid}
onMouseMove={e => onTipEnter(c, e)}
onMouseLeave={onTipLeave}
>
<HandCard
card={c}
state={state}
selected={state.selCard === c.iid}
playable={canCastNow(c, state)}
onClick={() => onCardClick(c, "hand")}
/>
</div>
))}
{!state.p.hand.length && (
<span style={{ fontSize:12, color:"#2a3820", fontStyle:"italic", alignSelf:"center", fontFamily:"'Crimson Text',serif" }}>
No cards in hand
</span>
)}
</div>
);
}

export default Hand;
