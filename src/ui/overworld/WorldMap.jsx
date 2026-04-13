// src/ui/overworld/WorldMap.jsx
// Overworld map tile grid, HUD bar, mage status panel, map legend.
// Presentation only. Per MECHANICS_INDEX.md §7.2

import React from ‘react’;
import { TERRAIN, MANA_HEX, MANA_SYM, MAGE_NAMES, COLORS } from ‘../../engine/MapGenerator.js’;

const TILE_SIZE = 34;

// ─── SINGLE TILE ─────────────────────────────────────────────────────────────

export function MapTile({ tile, isPlayer, onClick }) {
const t = tile.terrain;
const s = tile.structure;

if (!tile.revealed) {
return (
<div onClick={() => onClick(tile)}
style={{ width:TILE_SIZE, height:TILE_SIZE, background:”#0a0806”, border:“1px solid #100e08”, cursor:“pointer” }}
/>
);
}

const ml = tile.manaLink;

return (
<div onClick={() => onClick(tile)} style={{
width: TILE_SIZE, height: TILE_SIZE,
background: t.color,
border: “1px solid rgba(0,0,0,.25)”,
cursor: “pointer”,
display: “flex”, alignItems: “center”, justifyContent: “center”,
position: “relative”, overflow: “hidden”,
boxShadow: isPlayer ? “0 0 10px rgba(255,240,100,.8)” : “none”,
}}>
{/* Mana link corruption overlay */}
{ml && (
<div style={{ position:“absolute”, inset:0, background:`${MANA_HEX[ml]}40`, border:`2px solid ${MANA_HEX[ml]}80`, animation:“pulse 2s infinite” }} />
)}

```
  {/* Structure icons with labels */}
  {s === "TOWN" && (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", zIndex:2, gap:1 }}>
      <div style={{ fontSize:TILE_SIZE*.42, lineHeight:1 }}>⌂</div>
      <div style={{ fontSize:6, color:"#f0d090", fontFamily:"'Cinzel',serif", whiteSpace:"nowrap", textShadow:"0 1px 3px rgba(0,0,0,.9)", overflow:"hidden", maxWidth:TILE_SIZE-4, textAlign:"center" }}>
        {tile.townData?.name?.slice(0,7) || ""}
      </div>
    </div>
  )}
  {s === "DUNGEON" && <div style={{ fontSize:TILE_SIZE*.38, lineHeight:1, zIndex:2 }}>⚑</div>}
  {s === "CASTLE" && (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", zIndex:2, gap:1 }}>
      <div style={{
        fontSize: TILE_SIZE*.38, lineHeight:1,
        filter: `drop-shadow(0 0 6px ${MANA_HEX[tile.castleData?.color] || "#fff"})`,
        animation: tile.castleData?.defeated ? "none" : "pulse 3s infinite",
      }}>
        {tile.castleData?.defeated ? "✓" : "♔"}
      </div>
      <div style={{ fontSize:5.5, color:MANA_HEX[tile.castleData?.color]||"#fff", fontFamily:"'Cinzel',serif", textShadow:"0 1px 3px rgba(0,0,0,.9)", opacity:.9 }}>
        {tile.castleData?.mage?.slice(0,6) || ""}
      </div>
    </div>
  )}

  {/* Terrain icon (no structure) */}
  {!s && t !== TERRAIN.WATER && (
    <div style={{ fontSize:TILE_SIZE*.36, opacity:.45 }}>{t.icon}</div>
  )}

  {/* Player wizard token */}
  {isPlayer && (
    <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", zIndex:10 }}>
      <div style={{
        width: TILE_SIZE*.55, height: TILE_SIZE*.55, borderRadius:"50%",
        background: "radial-gradient(circle at 35% 35%,#fff8e0,#e0c050)",
        border: "2px solid rgba(255,255,255,.8)",
        boxShadow: "0 0 10px rgba(255,240,100,.8)",
        display: "flex", alignItems:"center", justifyContent:"center",
        fontSize: TILE_SIZE*.28,
        animation: "wizPulse 2s ease-in-out infinite",
      }}>🧙</div>
    </div>
  )}
</div>
```

);
}

// ─── MAP GRID ─────────────────────────────────────────────────────────────────

export function WorldMap({ tiles, playerPos, viewport, viewW, viewH, onTileClick }) {
return (
<div style={{
display: “grid”,
gridTemplateColumns: `repeat(${viewW},${TILE_SIZE}px)`,
gridTemplateRows:    `repeat(${viewH},${TILE_SIZE}px)`,
gap: 1, padding: 8, background: “#080604”,
}}>
{Array.from({ length: viewH }, (*, vy) =>
Array.from({ length: viewW }, (*, vx) => {
const x = viewport.x + vx;
const y = viewport.y + vy;
const tile = tiles[y]?.[x];
if (!tile) return <div key={`${vx}-${vy}`} style={{ width:TILE_SIZE, height:TILE_SIZE, background:”#030202” }} />;
return (
<MapTile
key={`${x}-${y}`}
tile={tile}
isPlayer={x === playerPos.x && y === playerPos.y}
onClick={onTileClick}
/>
);
})
)}
</div>
);
}

// ─── HUD BAR ─────────────────────────────────────────────────────────────────

export function HUDBar({ player, manaLinks, magesDefeated, artifacts, moves }) {
const hasWard = artifacts.some(a => a.id === “ward” && a.owned);
const threshold = hasWard ? 5 : 3;

return (
<div style={{
display: “flex”, gap: 10, alignItems: “center”, flexWrap: “wrap”,
padding: “6px 12px”, background: “rgba(0,0,0,.5)”,
borderBottom: “1px solid rgba(200,160,60,.3)”,
}}>
{/* HP bar */}
<div style={{ display:“flex”, alignItems:“center”, gap:5 }}>
<span style={{ fontSize:11, color:”#c8a060”, fontFamily:”‘Cinzel’,serif” }}>HP</span>
<div style={{ width:78, height:12, background:”#1a0a00”, borderRadius:6, border:“1px solid #5a3010”, overflow:“hidden” }}>
<div style={{
width: `${(player.hp / player.maxHP) * 100}%`, height:“100%”,
background: player.hp > player.maxHP*.5 ? “linear-gradient(90deg,#c04020,#e06040)” : “linear-gradient(90deg,#800010,#c01020)”,
transition: “width .4s”, borderRadius: 6,
}} />
</div>
<span style={{ fontSize:11, color:”#e08060”, fontFamily:”‘Cinzel’,serif”, minWidth:36 }}>{player.hp}/{player.maxHP}</span>
</div>

```
  <span style={{ fontSize:12, color:"#f0c040", fontFamily:"'Cinzel',serif" }}>⚙ {player.gold}g</span>
  <span style={{ fontSize:12, color:"#a080e0", fontFamily:"'Cinzel',serif" }}>◆ {player.gems}</span>
  <span style={{ fontSize:10, color:"#8090a0", fontFamily:"'Cinzel',serif" }}>Move {moves}</span>

  {/* Mana link pips */}
  <div style={{ display:"flex", gap:5, alignItems:"center" }}>
    <span style={{ fontSize:10, color:"#a08060", fontFamily:"'Cinzel',serif" }}>LINKS:</span>
    {COLORS.map(c => {
      const lnk = manaLinks[c] || 0;
      const def = magesDefeated.includes(c);
      return (
        <div key={c} title={`${MAGE_NAMES[c]}: ${lnk}/${threshold}${def?" (defeated)":""}`}
          style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:1 }}>
          <div style={{ fontSize:10, color:def?"#405030":lnk>=threshold?"#ff2020":lnk>=threshold-1?"#f08020":"#a09070" }}>
            {MANA_SYM[c]}
          </div>
          <div style={{ display:"flex", gap:1 }}>
            {Array.from({ length: threshold }).map((_, i) => (
              <div key={i} style={{
                width:5, height:5, borderRadius:1,
                background: def?"#2a3020":i<lnk?MANA_HEX[c]:"rgba(255,255,255,.1)",
                border:"1px solid rgba(255,255,255,.1)",
              }} />
            ))}
          </div>
        </div>
      );
    })}
  </div>

  {/* Artifact icons */}
  {artifacts.filter(a => a.owned).map(a => (
    <div key={a.id} title={`${a.name}: ${a.desc}`}
      style={{ fontSize:14, filter:"drop-shadow(0 0 3px rgba(200,160,80,.6))", cursor:"help" }}>
      {a.icon}
    </div>
  ))}
</div>
```

);
}

// ─── MAP LEGEND ───────────────────────────────────────────────────────────────

export function MapLegend() {
return (
<div style={{
position:“absolute”, top:8, left:8, zIndex:10,
background:“rgba(0,0,0,.75)”, borderRadius:6, padding:“8px 12px”,
border:“1px solid rgba(200,160,60,.2)”, fontSize:10, color:”#8a7050”,
fontFamily:”‘Cinzel’,serif”,
}}>
<div style={{ marginBottom:4, fontSize:9, color:”#6a5030”, letterSpacing:1 }}>LEGEND</div>
{[[“🧙”,“You”],[“⌂”,“Town”],[“⚑”,“Dungeon”],[“♔”,“Castle”]].map(([ic, lb]) => (
<div key={lb} style={{ display:“flex”, alignItems:“center”, gap:5, marginBottom:2 }}>
<span style={{ fontSize:12 }}>{ic}</span>{lb}
</div>
))}
</div>
);
}

// ─── MAGE STATUS PANEL ───────────────────────────────────────────────────────

export function MageStatusPanel({ manaLinks, magesDefeated, artifacts }) {
const hasWard = artifacts.some(a => a.id === “ward” && a.owned);
const threshold = hasWard ? 5 : 3;

return (
<div style={{
position:“absolute”, top:8, right:8, zIndex:10,
background:“rgba(0,0,0,.75)”, borderRadius:6, padding:“8px 12px”,
border:“1px solid rgba(200,160,60,.2)”, fontSize:10, fontFamily:”‘Cinzel’,serif”,
}}>
<div style={{ fontSize:9, color:”#6a5030”, letterSpacing:1, marginBottom:6 }}>FIVE MAGES</div>
{COLORS.map(c => {
const def = magesDefeated.includes(c);
const lnk = manaLinks[c] || 0;
return (
<div key={c} style={{ display:“flex”, alignItems:“center”, gap:5, marginBottom:3 }}>
<span style={{
fontSize:10,
color: def?”#405030”:lnk>=threshold?”#e02020”:lnk>=threshold-1?”#e08020”:”#a09070”,
}}>{MANA_SYM[c]}</span>
<span style={{ color:def?”#405030”:lnk>=threshold?”#e02020”:”#a09070”, fontSize:10 }}>{MAGE_NAMES[c]}</span>
<span style={{ color:”#6a5030”, fontSize:9 }}>{def?“✓”:lnk+”/”+threshold}</span>
</div>
);
})}
</div>
);
}

// ─── MANA LINK ALERT ─────────────────────────────────────────────────────────

export function ManaLinkAlert({ events, onRespond, onDismiss }) {
if (!events.length) return null;
const ev = events[0];
const hx = MANA_HEX[ev.color];

return (
<div style={{
position:“absolute”, top:10, left:“50%”, transform:“translateX(-50%)”,
zIndex:100,
background: `linear-gradient(135deg,#1a0808,${hx}20)`,
border:`2px solid ${hx}`, borderRadius:7, padding:“10px 16px”,
maxWidth:430, boxShadow:`0 0 20px ${hx}60`,
animation:“alertDrop .3s ease-out”,
}}>
<div style={{ fontSize:11, fontFamily:”‘Cinzel’,serif”, color:hx, marginBottom:4, letterSpacing:1 }}>
{MANA_SYM[ev.color]} MANA LINK ALERT
</div>
<div style={{ fontSize:12, color:”#e0c090”, marginBottom:8 }}>
<strong>{MAGE_NAMES[ev.color]}</strong> sends <strong>{ev.minionName}</strong> to seize <strong>{ev.townName}</strong>!{” “}
<strong style={{ color:”#ff8040” }}>{ev.movesLeft} moves</strong> remaining.
</div>
<div style={{ display:“flex”, gap:6 }}>
<button onClick={() => onRespond(ev)} style={{
flex:2, background:`${hx}20`, border:`1px solid ${hx}`, color:hx,
padding:“5px 12px”, borderRadius:4, cursor:“pointer”, fontFamily:”‘Cinzel’,serif”, fontSize:11,
}}>⚔ Rush to {ev.townName}</button>
<button onClick={() => onDismiss(ev)} style={{
flex:1, background:“transparent”, border:“1px solid #5a3020”, color:”#806040”,
padding:“5px”, borderRadius:4, cursor:“pointer”, fontFamily:”‘Cinzel’,serif”, fontSize:10,
}}>Ignore</button>
</div>
</div>
);
}

export default { WorldMap, MapTile, HUDBar, MapLegend, MageStatusPanel, ManaLinkAlert };
