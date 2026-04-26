// src/ui/shared/Tooltip.jsx
// Hover card detail popup. Presentation only.

import React from 'react';
import { isCre, getPow, getTou } from '../../engine/DuelCore.js';
import { Cost, thmOf, CCOLOR } from './Card.jsx';

export function Tooltip({ card, state, pos }) {
if (!card) return null;
const { bg, ac } = thmOf(card);
const ca = CCOLOR[card.color] || "#888";
const p = isCre(card) ? getPow(card, state) : null;
const t = isCre(card) ? getTou(card, state) : null;

return (
<div style={{
position: "fixed",
left: Math.min(pos.x + 12, window.innerWidth - 210),
top:  Math.min(pos.y - 20,  window.innerHeight - 280),
width: 200, zIndex: 1000, pointerEvents: "none",
background: `linear-gradient(160deg,${bg},rgba(5,3,1,.98))`,
border: `2px solid ${ca}60`, borderRadius: 8, padding: 12,
boxShadow: `0 0 30px rgba(0,0,0,.9),0 0 10px ${ca}30`,
animation: "fadeIn .15s ease-out",
}}>
<div style={{ height: 3, background: ca, marginBottom: 8, borderRadius: 2 }} />
<div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
<span style={{ fontSize:12, fontFamily:"'Cinzel',serif", color:"#e0d090", fontWeight:700, flex:1 }}>{card.name}</span>
<Cost cost={card.cost} size={13} />
</div>
<div style={{ fontSize:9, color:"#7a6040", marginBottom:6 }}>{card.type}{card.subtype ? ` ? ${card.subtype}` : ""}</div>
{card.keywords?.length > 0 && (
<div style={{ marginBottom:6 }}>
{card.keywords.map(k => (
<div key={k} style={{ fontSize:9, color:ac||"#90d060", marginBottom:2 }}>
<strong>{k.replace(/_/g," ")}</strong>
</div>
))}
</div>
)}
{card.text && <div style={{ fontSize:10, color:"#c0b090", lineHeight:1.5, marginBottom:6 }}>{card.text}</div>}
{isCre(card) && <div style={{ textAlign:"right", fontSize:14, fontWeight:700, color:ca, fontFamily:"'Fira Code',monospace" }}>{p}/{t}</div>}
<div style={{ marginTop:4, fontSize:8, color:"#4a3820", fontFamily:"'Cinzel',serif" }}>
<span style={{ background: card.rarity==="R"?"#6a4010":card.rarity==="U"?"#1a3050":"#2a2a2a", padding:"1px 4px", borderRadius:3 }}>
{card.rarity==="R"?"Rare":card.rarity==="U"?"Uncommon":"Common"}
</span>
</div>
</div>
);
}

export default Tooltip;
