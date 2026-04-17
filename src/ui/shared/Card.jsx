// src/ui/shared/Card.jsx
// Shared card rendering components.
// Presentation only — no game logic. Per MECHANICS_INDEX.md §7.3

import React from 'react';
import { isCre, isLand, isInst, isSort, isArt, isEnch, getPow, getTou, hasKw } from '../../engine/DuelCore.js';
import useCardArt from '../../utils/useCardArt.js';

// ─── COLOR CONSTANTS ─────────────────────────────────────────────────────────

export const CCOLOR = { W:"#f5e060", U:"#66bbff", B:"#cc88ff", R:"#ff8844", G:"#66ee44", "":"#bbb" };

const MANA_BG = { W:"#f9f0d0", U:"#5588cc", B:"#8844bb", R:"#cc4422", G:"#449933", "":"#666", C:"#999" };

const TYPE_THEME = {
Creature:    { bg:"#243a1a", bd:"#5a8840", ac:"#88dd55" },
Land:        { bg:"#302a14", bd:"#907830", ac:"#ddb840" },
Instant:     { bg:"#102238", bd:"#3070b8", ac:"#66aaf0" },
Sorcery:     { bg:"#281030", bd:"#7030a8", ac:"#c060f0" },
Artifact:    { bg:"#282828", bd:"#788888", ac:"#c8d8d8" },
Enchantment: { bg:"#1a1e34", bd:"#4858b0", ac:"#8898f0" },
};

const CFRAME = {
W:{ bg:"#342e18", bd:"#d4b040" },
U:{ bg:"#0e2036", bd:"#3888d0" },
B:{ bg:"#221030", bd:"#9960cc" },
R:{ bg:"#2e1008", bd:"#cc4422" },
G:{ bg:"#102418", bd:"#40a030" },
};

export function thmOf(c) {
if (!c) return TYPE_THEME.Artifact;
if (c.color && CFRAME[c.color]) {
const fr = CFRAME[c.color];
if (isCre(c) || isLand(c)) return { bg: fr.bg, bd: fr.bd, ac: CCOLOR[c.color] };
}
if (isCre(c))  return TYPE_THEME.Creature;
if (isLand(c)) return TYPE_THEME.Land;
if (isInst(c)) return TYPE_THEME.Instant;
if (isSort(c)) return TYPE_THEME.Sorcery;
if (isArt(c))  return TYPE_THEME.Artifact;
if (isEnch(c)) return TYPE_THEME.Enchantment;
return TYPE_THEME.Artifact;
}

const CARD_ICON = c =>
isLand(c) ? "🏔" : isCre(c) ? "⚔" : isInst(c) ? "✦" : isSort(c) ? "✸" : isArt(c) ? "⚙" : "◆";

// ─── PIP ─────────────────────────────────────────────────────────────────────

export function Pip({ sym, size = 13 }) {
return (
<span style={{
display: "inline-flex", alignItems: "center", justifyContent: "center",
width: size, height: size, borderRadius: "50%",
background: MANA_BG[sym] || "#666",
color: sym === "W" ? "#665500" : "#fff",
fontSize: size * 0.58, fontWeight: 700,
border: "1px solid rgba(0,0,0,.4)", flexShrink: 0, lineHeight: 1,
fontFamily: "'Fira Code',monospace",
}}>{sym || "?"}</span>
);
}

// ─── COST ─────────────────────────────────────────────────────────────────────

export function Cost({ cost, size = 12 }) {
if (!cost) return null;
const parts = [];
let i = 0;
while (i < cost.length) {
const ch = cost[i];
if ("WUBRG".includes(ch)) { parts.push(<Pip key={i} sym={ch} size={size} />); i++; }
else if (ch === "X") {
parts.push(<span key={i} style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", width:size, height:size, borderRadius:"50%", background:"#777", color:"#fff", fontSize:size*.6, fontWeight:700, border:"1px solid rgba(0,0,0,.4)" }}>X</span>);
i++;
} else if (ch === "0") {
parts.push(<span key={i} style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", width:size, height:size, borderRadius:"50%", background:"#555", color:"#ddd", fontSize:size*.6, fontWeight:700 }}>0</span>);
i++;
} else if (!isNaN(parseInt(ch))) {
let n = "";
while (i < cost.length && !isNaN(parseInt(cost[i]))) { n += cost[i]; i++; }
parts.push(<span key={i + n} style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", width:size, height:size, borderRadius:"50%", background:"#555", color:"#ddd", fontSize:size*.6, fontWeight:700, border:"1px solid rgba(0,0,0,.4)" }}>{n}</span>);
} else i++;
}
return <span style={{ display: "inline-flex", gap: 2 }}>{parts}</span>;
}

// ─── POOL DISPLAY ────────────────────────────────────────────────────────────

export function PoolDisplay({ pool, size = 14 }) {
const tot = Object.values(pool).reduce((a, b) => a + b, 0);
if (!tot) return <span style={{ fontSize: 10, color: "#4a4030", fontFamily: "'Cinzel',serif" }}>—</span>;
return (
<span style={{ display: "inline-flex", gap: 2, flexWrap: "wrap" }}>
{["W","U","B","R","G","C"].map(c => pool[c] > 0 && Array.from({ length: pool[c] }).map((_, i) => <Pip key={`${c}${i}`} sym={c} size={size} />))}
</span>
);
}

// ─── LAND PIP ─────────────────────────────────────────────────────────────────
// Compact token for horizontal land row. See GDD Bug B7 fix.

export function LandPip({ card, tapped, selected, onClick, onMouseMove, onMouseLeave, isPlayer = false }) {
const manaColor = card.produces?.[0] || "C";
const bg  = { W:"#c8a830", U:"#2860b0", B:"#6030a0", R:"#b02810", G:"#208030", C:"#606060" };
const sym = { W:"☀", U:"💧", B:"💀", R:"🔥", G:"🌿", C:"◆" };
const baseColor = bg[manaColor] || "#555";

return (
<div
onClick={onClick}
onMouseMove={onMouseMove}
onMouseLeave={onMouseLeave}
title={`${card.name}${tapped ? " (tapped)" : ""}`}
style={{
width: 30, height: 30, flexShrink: 0, borderRadius: 5,
background: tapped ? `${baseColor}55` : `${baseColor}cc`,
border: `2px solid ${selected ? (isPlayer ? "#60ff60" : "#ff6060") : tapped ? "rgba(255,255,255,.15)" : "rgba(255,255,255,.35)"}`,
display: "flex", alignItems: "center", justifyContent: "center",
cursor: "pointer",
transform: tapped ? "rotate(90deg)" : "none",
transition: "transform .25s ease,border-color .15s",
boxShadow: selected ? `0 0 8px ${isPlayer ? "#60ff60" : "#ff6060"}` : tapped ? "none" : `0 0 6px ${baseColor}80`,
opacity: tapped ? 0.55 : 1,
}}
>
<span style={{ fontSize: 13, lineHeight: 1, userSelect: "none" }}>{sym[manaColor] || "◆"}</span>
</div>
);
}

// ─── CARD ART DISPLAY ─────────────────────────────────────────────────────────

function CardArtDisplay({ card, sm }) {
  const { url, loading } = useCardArt(card.name);
  if (url) {
    return (
      <img
        src={url}
        alt={card.name}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          borderRadius: 3,
          opacity: loading ? 0 : 1,
          transition: "opacity 0.3s ease"
        }}
      />
    );
  }
  return (
    <span style={{ fontSize: sm ? 22 : 28, opacity: loading ? 0.3 : 0.65 }}>
      {CARD_ICON(card)}
    </span>
  );
}

// ─── FIELD CARD ───────────────────────────────────────────────────────────────

export function FieldCard({ card, state, selected, attacking, onClick, onActivate, sm = false }) {
const { bg, bd, ac } = thmOf(card);
const ca = CCOLOR[card.color] || "#aaa";
const w = sm ? 76 : 92;
const h = sm ? 100 : 124;
const p = isCre(card) ? getPow(card, state) : null;
const t = isCre(card) ? getTou(card, state) : null;
const hasActivated = card.activated && !card.tapped && card.controller === "p";
const rarityColor = card.rarity === "R" ? "#f0c040" : card.rarity === "U" ? "#90b8d0" : "#888";

return (
<div
onClick={onClick}
title={`${card.name}\n${card.text || ""}`}
style={{
width: w, height: h, background: bg,
border: `2px solid ${selected ? "#ffe060" : attacking ? "#ff5010" : bd}`,
borderRadius: 7, cursor: "pointer", position: "relative",
transform: card.tapped ? "rotate(90deg)" : "none",
transition: "transform .3s,border-color .2s,box-shadow .2s",
boxShadow: selected ? "0 0 16px #ffe060,0 0 6px #ffe06080" : attacking ? "0 0 14px rgba(255,80,16,.7)" : "0 3px 10px rgba(0,0,0,.6)",
flexShrink: 0, display: "flex", flexDirection: "column", overflow: "hidden",
}}
>
{/* Rarity gem */}
<div style={{ position:"absolute", top:3, left:3, width:7, height:7, borderRadius:"50%", background:rarityColor, zIndex:5 }} />
{/* Color bar */}
<div style={{ height: 4, background: `linear-gradient(90deg,${ca},${ca}88)`, flexShrink: 0 }} />
{/* Name + cost */}
<div style={{ padding:"4px 5px 2px 10px", display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexShrink:0, borderBottom:`1px solid ${bd}40` }}>
<span style={{ fontSize:sm?7.5:8.5, fontFamily:"'Cinzel',serif", color:"#f0e8c0", fontWeight:700, lineHeight:1.2, flex:1, overflow:"hidden" }}>{card.name}</span>
<Cost cost={card.cost} size={sm ? 10 : 11} />
</div>
{/* Art */}
<div style={{ flex:1, margin:"3px 5px", background:`linear-gradient(135deg,${bg}dd,rgba(0,0,0,.55))`, borderRadius:4, display:"flex", alignItems:"center", justifyContent:"center", position:"relative", overflow:"hidden", border:`1px solid ${bd}60` }}>
<CardArtDisplay card={card} sm={sm} />
{card.damage > 0 && <div style={{ position:"absolute", top:2, right:2, background:"#cc0a0a", color:"#fff", fontSize:9, fontWeight:700, padding:"1px 4px", borderRadius:3 }}>💢{card.damage}</div>}
{card.summoningSick && isCre(card) && <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,.45)", display:"flex", alignItems:"center", justifyContent:"center", borderRadius:4 }}><span style={{ fontSize:8, color:"rgba(255,220,150,.65)", fontFamily:"'Cinzel',serif" }}>SICK</span></div>}
{hasActivated && onActivate && (
<button onClick={e => { e.stopPropagation(); onActivate(card); }} style={{ position:"absolute", bottom:2, left:2, background:"rgba(200,160,40,.85)", border:"none", borderRadius:3, color:"#000", fontSize:7, fontWeight:700, padding:"1px 4px", cursor:"pointer", fontFamily:"'Cinzel',serif" }}>ACT</button>
)}
</div>
{/* Keywords */}
{card.keywords?.length > 0 && (
<div style={{ padding:"2px 5px", display:"flex", flexWrap:"wrap", gap:1 }}>
{card.keywords.slice(0, 2).map(k => <span key={k} style={{ fontSize:6.5, background:`${ac}25`, color:ac, padding:"0 3px", borderRadius:2, fontFamily:"'Cinzel',serif" }}>{k.replace(/_/g," ")}</span>)}
</div>
)}
{/* P/T */}
{isCre(card) && <div style={{ position:"absolute", bottom:4, right:5, fontSize:sm?10:13, fontWeight:700, color:card.damage>0?"#ff6050":ca, fontFamily:"'Fira Code',monospace", background:"rgba(0,0,0,.55)", padding:"0 4px", borderRadius:3, border:`1px solid ${ca}40` }}>{p}/{t}</div>}
</div>
);
}

// ─── HAND CARD ────────────────────────────────────────────────────────────────

export function HandCard({ card, state, selected, playable, onClick }) {
const { bg, bd } = thmOf(card);
const ca = CCOLOR[card.color] || "#aaa";

return (
<div
onClick={onClick}
title={`${card.name}\n${card.text || ""}`}
style={{
width: 82, height: 116, background: bg,
border: `2px solid ${selected ? "#ffe060" : playable ? "#60dd60" : bd}`,
borderRadius: 8, cursor: "pointer", flexShrink: 0,
display: "flex", flexDirection: "column", overflow: "hidden",
boxShadow: selected ? "0 0 16px #ffe060,0 -8px 24px rgba(255,224,96,.2)" : playable ? "0 0 10px #60dd6060,0 -4px 14px rgba(0,0,0,.7)" : "0 -4px 14px rgba(0,0,0,.7)",
transform: selected ? "translateY(-18px) scale(1.06)" : playable ? "translateY(-8px)" : "none",
transition: "transform .2s,box-shadow .2s",
position: "relative",
}}
>
<div style={{ height: 4, background: ca, flexShrink: 0 }} />
<div style={{ padding:"4px 6px 2px", display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexShrink:0, borderBottom:`1px solid ${bd}40` }}>
<span style={{ fontSize:8, fontFamily:"'Cinzel',serif", color:"#f0e8c0", fontWeight:700, lineHeight:1.2, flex:1 }}>{card.name}</span>
<Cost cost={card.cost} size={11} />
</div>
<div style={{ flex:1, margin:"3px 5px", background:`linear-gradient(135deg,${bg}dd,rgba(0,0,0,.5))`, borderRadius:4, display:"flex", alignItems:"center", justifyContent:"center", border:`1px solid ${bd}50` }}>
<CardArtDisplay card={card} sm={sm} />
</div>
<div style={{ padding:"2px 5px", fontSize:7, color:"#b0a070", fontFamily:"'Crimson Text',serif", flexShrink:0 }}>{card.subtype || card.type}</div>
{card.text && <div style={{ padding:"0 5px 2px", fontSize:7, color:"#c0b080", lineHeight:1.3, overflow:"hidden", maxHeight:26 }}>{card.text.slice(0,55)}{card.text.length>55?"…":""}</div>}
{isCre(card) && <div style={{ textAlign:"right", padding:"0 5px 4px", fontSize:11, fontWeight:700, color:ca, fontFamily:"'Fira Code',monospace" }}>{getPow(card,state)}/{getTou(card,state)}</div>}
{playable && !selected && <div style={{ position:"absolute", bottom:0, left:0, right:0, height:3, background:"rgba(96,221,96,.6)", borderRadius:"0 0 6px 6px" }} />}
</div>
);
}

export default { Pip, Cost, PoolDisplay, LandPip, FieldCard, HandCard, thmOf, CCOLOR };
