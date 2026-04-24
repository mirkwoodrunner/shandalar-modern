// src/ui/duel/Battlefield.jsx
// Renders both players’ battlefield zones (land row + creatures).
// Presentation only — no game logic. Per MECHANICS_INDEX.md §7.1

import React from ‘react’;
import { isLand, isCre } from ‘../../engine/DuelCore.js’;
import { LandPip, FieldCard } from ‘../shared/Card.jsx’;

// ─── OPPONENT BATTLEFIELD ────────────────────────────────────────────────────

export function OpponentBattlefield({ state, onCardClick, onTipEnter, onTipLeave }) {
const lands    = state.o.bf.filter(isLand);
const nonLands = state.o.bf.filter(c => !isLand(c));

return (
<div style={{ display:“flex”, flexDirection:“column” }}>
{/* Land row */}
<div style={{ padding:“5px 10px 4px”, borderBottom:“1px solid rgba(120,80,20,.2)”, background:“rgba(0,0,0,.25)” }}>
<div style={{ fontSize:8, color:”#706028”, fontFamily:”‘Cinzel’,serif”, letterSpacing:1, marginBottom:4 }}>
LANDS ({lands.length})
</div>
<div style={{ display:“flex”, gap:4, overflowX:“auto”, paddingBottom:4, minHeight:36 }}>
{lands.map(c => (
<LandPip
key={c.iid} card={c} tapped={c.tapped}
selected={state.selTgt === c.iid}
onClick={() => onCardClick(c, “oBf”)}
onMouseMove={e => onTipEnter(c, e)}
onMouseLeave={onTipLeave}
/>
))}
{!lands.length && <span style={{ fontSize:9, color:”#2a1808”, fontStyle:“italic”, lineHeight:“28px” }}>—</span>}
</div>
</div>

```
  {/* Creatures / spells */}
  <div style={{ padding:"6px 10px 8px", minHeight:90, display:"flex", flexWrap:"wrap", gap:5, alignContent:"flex-start" }}>
    {nonLands.map(c => (
      <div key={c.iid}
        onMouseMove={e => onTipEnter(c, e)}
        onMouseLeave={onTipLeave}
      >
        <FieldCard
          card={c} state={state}
          selected={state.selTgt === c.iid}
          attacking={state.attackers.includes(c.iid)}
          onClick={() => onCardClick(c, "oBf")}
          sm
        />
      </div>
    ))}
    {!nonLands.length && (
      <span style={{ fontSize:10, color:"#2a1808", fontStyle:"italic" }}>No creatures in play</span>
    )}
  </div>
</div>
```

);
}

// ─── PLAYER BATTLEFIELD ───────────────────────────────────────────────────────

export function PlayerBattlefield({ state, onCardClick, onActivate, onTipEnter, onTipLeave }) {
const lands    = state.p.bf.filter(isLand);
const nonLands = state.p.bf.filter(c => !isLand(c));

return (
<div style={{ flex:1, display:“flex”, flexDirection:“column”, minHeight:0 }}>
{/* Land row — horizontal scroll, fixed height per GDD Bug B7 fix */}
<div style={{ flexShrink:0, padding:“5px 10px 4px”, borderBottom:“1px solid rgba(60,120,20,.2)”, background:“rgba(0,0,0,.2)” }}>
<div style={{ fontSize:8, color:”#407028”, fontFamily:”‘Cinzel’,serif”, letterSpacing:1, marginBottom:4 }}>
YOUR LANDS ({lands.length})
</div>
<div style={{ display:“flex”, gap:4, overflowX:“auto”, paddingBottom:4, minHeight:36 }}>
{lands.map(c => (
<LandPip
key={c.iid} card={c} tapped={c.tapped}
selected={state.selCard === c.iid || state.selTgt === c.iid}
isPlayer
onClick={() => onCardClick(c, “pBf”)}
onMouseMove={e => onTipEnter(c, e)}
onMouseLeave={onTipLeave}
/>
))}
{!lands.length && <span style={{ fontSize:9, color:”#182808”, fontStyle:“italic”, lineHeight:“28px” }}>—</span>}
</div>
</div>

```
  {/* Creatures — flex fills remaining space */}
  <div style={{ flex:1, padding:"6px 10px", overflow:"auto", display:"flex", flexWrap:"wrap", gap:5, alignContent:"flex-start" }}>
    {nonLands.map(c => (
      <div key={c.iid}
        onMouseMove={e => onTipEnter(c, e)}
        onMouseLeave={onTipLeave}
      >
        <FieldCard
          card={c} state={state}
          selected={state.selCard === c.iid || state.selTgt === c.iid}
          attacking={state.attackers.includes(c.iid)}
          onClick={() => onCardClick(c, "pBf")}
          onActivate={onActivate}
        />
      </div>
    ))}
    {!nonLands.length && (
      <span style={{ fontSize:10, color:"#182808", fontStyle:"italic" }}>No permanents in play</span>
    )}
  </div>
</div>
```

);
}

export default { OpponentBattlefield, PlayerBattlefield };
