// src/ui/overworld/WorldMap.jsx
// Overworld map tile grid, HUD bar, mage status panel, map legend.
// Presentation only. Per MECHANICS_INDEX.md S7.2

import React from 'react';
import { TERRAIN, MANA_HEX, MANA_SYM, MAGE_NAMES, COLORS } from '../../engine/MapGenerator.js';

const TILE_SIZE = 34;

function hexToRgba(hex, a) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

const TERRAIN_CLASS = {
  PLAINS:   'ow-plains',
  FOREST:   'ow-forest',
  SWAMP:    'ow-swamp',
  MOUNTAIN: 'ow-mountain',
  ISLAND:   'ow-island',
  WATER:    'ow-water',
};

const TERRAIN_BG = {
  PLAINS:   '#b09858',
  FOREST:   '#2d5a2d',
  SWAMP:    '#3d3825',
  MOUNTAIN: '#706050',
  ISLAND:   '#2d4a62',
  WATER:    '#111e30',
};

// --- SINGLE TILE -------------------------------------------------------------

export function MapTile({ tile, isPlayer, isFogEdge = false, onClick }) {
  const t = tile.terrain;
  const s = tile.structure;

  if (!tile.revealed) {
    return (
      <div
        className="ow-tile ow-fog"
        onClick={() => onClick(tile)}
      />
    );
  }

  const terrainClass = TERRAIN_CLASS[t.id] ?? '';
  const fogEdgeClass = isFogEdge ? 'ow-fog-edge' : '';
  const ml = tile.manaLink;
  const tileBg = TERRAIN_BG[t.id] ?? t.color;

  const castleColor   = tile.castleData?.color ? MANA_HEX[tile.castleData.color] : '#c4a040';
  const castleDefeated = tile.castleData?.defeated ?? false;
  const plaqueStyle   = s === 'CASTLE' ? {
    '--ring':      castleColor,
    '--ring-glow': hexToRgba(castleColor, 0.55),
  } : undefined;

  return (
    <div
      className={`ow-tile ${terrainClass} ${fogEdgeClass}`}
      style={{ background: tileBg }}
      onClick={() => onClick(tile)}
    >
      {/* Mana link corruption overlay */}
      {ml && (
        <div
          className="ow-mana"
          style={{
            background: `radial-gradient(ellipse at 50% 50%, ${hexToRgba(MANA_HEX[ml], 0.65)}, transparent 70%)`,
          }}
        />
      )}

      {/* Structure — plaque + label */}
      {s && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          zIndex: 2,
        }}>
          <div
            className={[
              'ow-plaque',
              s === 'DUNGEON' ? 'ow-plaque-dungeon' : '',
              s === 'CASTLE'  ? 'ow-plaque-castle'  : '',
              s === 'CASTLE' && castleDefeated ? 'ow-plaque-castle-defeated' : '',
            ].join(' ').trim()}
            style={plaqueStyle}
          >
            {s === 'TOWN'    && '\u{1F3D8}'}
            {s === 'DUNGEON' && '⚔'}
            {s === 'CASTLE'  && (castleDefeated ? '\u{1F3DA}' : '\u{1F3F0}')}
          </div>

          {s === 'TOWN' && tile.townData?.name && (
            <div className="ow-label">
              {tile.townData.name.slice(0, 7)}
            </div>
          )}
          {s === 'CASTLE' && tile.castleData?.mage && (
            <div className="ow-label" style={{ color: castleColor }}>
              {tile.castleData.mage.slice(0, 6)}
            </div>
          )}
        </div>
      )}

      {/* Terrain icon — no structure tiles only, not water */}
      {!s && t.id !== 'WATER' && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, opacity: 0.30, pointerEvents: 'none', zIndex: 1,
        }}>
          {t.icon}
        </div>
      )}

      {/* Player tile highlight — canvas layer draws the actual sprite */}
      {isPlayer && (
        <div style={{
          position: 'absolute', inset: 0,
          boxShadow: 'inset 0 0 8px rgba(245,217,122,0.3)',
          pointerEvents: 'none',
          zIndex: 10,
        }} />
      )}
    </div>
  );
}

// --- MAP GRID -----------------------------------------------------------------

const OW_STYLES = `
.ow-tile {
  width: 34px;
  height: 34px;
  position: relative;
  overflow: hidden;
  cursor: pointer;
}

.ow-tile::before {
  content: "";
  position: absolute;
  inset: -2px;
  pointer-events: none;
  mix-blend-mode: soft-light;
  opacity: 0.5;
}

.ow-tile::after {
  content: "";
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at 40% 30%, rgba(255,235,180,.05), transparent 65%);
  pointer-events: none;
}

.ow-plains::before {
  background: repeating-linear-gradient(
    42deg,
    transparent 0 3px,
    rgba(80,55,15,.20) 3px 4px
  );
}

.ow-forest::before {
  background:
    radial-gradient(circle at 25% 35%, rgba(10,25,8,.50) 0 2px, transparent 3px),
    radial-gradient(circle at 72% 62%, rgba(10,25,8,.45) 0 2px, transparent 3px),
    radial-gradient(circle at 50% 85%, rgba(10,25,8,.40) 0 2px, transparent 3px);
  mix-blend-mode: normal;
  opacity: 0.75;
}

.ow-swamp::before {
  background:
    repeating-linear-gradient(0deg, transparent 0 4px, rgba(0,0,0,.18) 4px 5px),
    radial-gradient(circle at 60% 70%, rgba(120,160,70,.15) 0 2px, transparent 3px);
  mix-blend-mode: normal;
  opacity: 0.65;
}

.ow-mountain::before {
  background: repeating-linear-gradient(
    120deg,
    transparent 0 4px,
    rgba(0,0,0,.12) 4px 5px
  );
}

.ow-island::before {
  background: repeating-linear-gradient(
    90deg,
    transparent 0 3px,
    rgba(255,255,255,.06) 3px 4px
  );
}

.ow-water::before {
  background: repeating-linear-gradient(
    90deg,
    transparent 0 5px,
    rgba(140,200,235,.10) 5px 6px,
    transparent 6px 11px
  );
  background-size: 22px 100%;
  mix-blend-mode: screen;
  opacity: 0.5;
  animation: waterShimmer 7s linear infinite;
}

.ow-fog::before {
  background:
    radial-gradient(circle at 30% 40%, rgba(40,30,20,.45) 0 4px, transparent 6px),
    radial-gradient(circle at 70% 65%, rgba(40,30,20,.35) 0 3px, transparent 5px);
  mix-blend-mode: normal;
  opacity: 0.55;
  animation: fogDrift 14s ease-in-out infinite;
}
.ow-fog::after { background: none; }

.ow-fog-edge {
  box-shadow: inset 0 0 18px 3px rgba(0,0,0,.70);
}

.ow-mana {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.50;
  mix-blend-mode: screen;
  animation: manaPulse 3.2s ease-in-out infinite;
}

.ow-plaque {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #1a140a, #0a0604 75%);
  box-shadow:
    0 0 0 1.5px rgba(196,160,64,.60),
    0 0 0 3px rgba(0,0,0,.65),
    0 1px 3px rgba(0,0,0,.80);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  line-height: 1;
}

.ow-plaque-dungeon {
  background: radial-gradient(circle at 35% 30%, #2a0a0a, #100404 75%);
  box-shadow:
    0 0 0 1.5px rgba(180,60,60,.55),
    0 0 0 3px rgba(0,0,0,.65),
    0 1px 3px rgba(0,0,0,.80);
}

.ow-plaque-castle {
  width: 24px;
  height: 24px;
  box-shadow:
    0 0 0 1.5px var(--ring, #c4a040),
    0 0 0 3px rgba(0,0,0,.70),
    0 0 10px var(--ring-glow, rgba(196,160,64,.50));
  animation: castleBreath 4s ease-in-out infinite;
}

.ow-plaque-castle-defeated {
  animation: none;
  filter: grayscale(0.70) brightness(0.70);
  box-shadow:
    0 0 0 1.5px rgba(80,70,55,.60),
    0 0 0 2px rgba(0,0,0,.70);
}

.ow-label {
  position: absolute;
  bottom: 1px;
  left: 0;
  right: 0;
  font-family: 'Cinzel', serif;
  font-size: 5.5px;
  letter-spacing: .08em;
  text-align: center;
  color: rgba(240,210,140,.90);
  text-shadow: 0 1px 0 #000, 0 0 3px #000;
  text-transform: uppercase;
  line-height: 1;
  pointer-events: none;
}

@keyframes manaPulse {
  0%, 100% { opacity: .30; }
  50%       { opacity: .65; }
}

@keyframes waterShimmer {
  0%   { background-position: 0 0; }
  100% { background-position: -22px 0; }
}

@keyframes fogDrift {
  0%,  100% { transform: translate(0,   0);  opacity: .55; }
  50%        { transform: translate(2px,-1px); opacity: .75; }
}

@keyframes castleBreath {
  0%,  100% { box-shadow: 0 0 0 1.5px var(--ring), 0 0 0 3px rgba(0,0,0,.70), 0 0  6px var(--ring-glow); }
  50%        { box-shadow: 0 0 0 1.5px var(--ring), 0 0 0 3px rgba(0,0,0,.70), 0 0 16px var(--ring-glow); }
}

`;

export function WorldMap({ tiles, playerPos, viewport, viewW, viewH, onTileClick, canvasRef }) {
  const tileAt = (x, y) => tiles[y]?.[x] ?? null;
  const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  const gridWidth  = viewW * 34 + 16; // 34px tiles + 8px padding each side
  const gridHeight = viewH * 34 + 16;

  return (
    <>
      <style>{OW_STYLES}</style>
      <div style={{ position: 'relative', display: 'inline-block' }}>
        {/* Terrain grid — unchanged */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${viewW}, 34px)`,
          gridTemplateRows:    `repeat(${viewH}, 34px)`,
          gap: 0,
          padding: 8,
          background: 'radial-gradient(ellipse at center, #0c0906 0%, #050302 100%)',
          boxShadow: 'inset 0 0 60px rgba(0,0,0,.80)',
          borderRadius: 2,
        }}>
          {Array.from({ length: viewH }, (_, vy) =>
            Array.from({ length: viewW }, (_, vx) => {
              const x = viewport.x + vx;
              const y = viewport.y + vy;
              const tile = tileAt(x, y);

              if (!tile) {
                return (
                  <div
                    key={`${vx}-${vy}`}
                    style={{ width: 34, height: 34, background: '#030202' }}
                  />
                );
              }

              const isFogEdge = tile.revealed && DIRS.some(([dx, dy]) => {
                const n = tileAt(x + dx, y + dy);
                return n && !n.revealed;
              });

              return (
                <MapTile
                  key={`${x}-${y}`}
                  tile={tile}
                  isPlayer={x === playerPos.x && y === playerPos.y}
                  isFogEdge={isFogEdge}
                  onClick={onTileClick}
                />
              );
            })
          )}
        </div>

        {/* Canvas overlay — characters only, pointer-events:none so clicks pass through */}
        <canvas
          ref={canvasRef}
          width={gridWidth}
          height={gridHeight}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            pointerEvents: 'none',
            zIndex: 20,
          }}
        />
      </div>
    </>
  );
}

// --- HUD BAR -----------------------------------------------------------------

export function HUDBar({ player, manaLinks, magesDefeated, artifacts, moves }) {
const hasWard = artifacts.some(a => a.id === "ward" && a.owned);
const threshold = hasWard ? 5 : 3;

return (
<div style={{
display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
padding: "6px 12px", background: "rgba(0,0,0,.5)",
borderBottom: "1px solid rgba(200,160,60,.3)",
}}>
{/* HP bar */}
<div style={{ display:"flex", alignItems:"center", gap:5 }}>
<span style={{ fontSize:11, color:"#c8a060", fontFamily:"'Cinzel',serif" }}>HP</span>
<div style={{ width:78, height:12, background:"#1a0a00", borderRadius:6, border:"1px solid #5a3010", overflow:"hidden" }}>
<div style={{
width: `${(player.hp / player.maxHP) * 100}%`, height:"100%",
background: player.hp > player.maxHP*.5 ? "linear-gradient(90deg,#c04020,#e06040)" : "linear-gradient(90deg,#800010,#c01020)",
transition: "width .4s", borderRadius: 6,
}} />
</div>
<span style={{ fontSize:11, color:"#e08060", fontFamily:"'Cinzel',serif", minWidth:36 }}>{player.hp}/{player.maxHP}</span>
</div>

  <span style={{ fontSize:12, color:"#f0c040", fontFamily:"'Cinzel',serif" }}>🪙 {player.gold}g</span>
  <span style={{ fontSize:12, color:"#a080e0", fontFamily:"'Cinzel',serif" }}>💎 {player.gems}</span>
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

);
}

// --- MAP LEGEND ---------------------------------------------------------------

export function MapLegend() {
return (
<div style={{
position:"absolute", top:8, left:8, zIndex:10,
background:"rgba(0,0,0,.75)", borderRadius:6, padding:"8px 12px",
border:"1px solid rgba(200,160,60,.2)", fontSize:10, color:"#8a7050",
fontFamily:"'Cinzel',serif",
}}>
<div style={{ marginBottom:4, fontSize:9, color:"#6a5030", letterSpacing:1 }}>LEGEND</div>
{[['\u{1F9D9}','You'],['\u{1F3D8}','Town'],['⚔','Dungeon'],['\u{1F3F0}','Castle']].map(([ic, lb]) => (
<div key={lb} style={{ display:"flex", alignItems:"center", gap:5, marginBottom:2 }}>
<span style={{ fontSize:12 }}>{ic}</span>{lb}
</div>
))}
</div>
);
}

// --- MAGE STATUS PANEL -------------------------------------------------------

export function MageStatusPanel({ manaLinks, magesDefeated, artifacts }) {
const hasWard = artifacts.some(a => a.id === "ward" && a.owned);
const threshold = hasWard ? 5 : 3;

return (
<div style={{
position:"absolute", top:8, right:8, zIndex:10,
background:"rgba(0,0,0,.75)", borderRadius:6, padding:"8px 12px",
border:"1px solid rgba(200,160,60,.2)", fontSize:10, fontFamily:"'Cinzel',serif",
}}>
<div style={{ fontSize:9, color:"#6a5030", letterSpacing:1, marginBottom:6 }}>FIVE MAGES</div>
{COLORS.map(c => {
const def = magesDefeated.includes(c);
const lnk = manaLinks[c] || 0;
return (
<div key={c} style={{ display:"flex", alignItems:"center", gap:5, marginBottom:3 }}>
<span style={{
fontSize:10,
color: def?"#405030":lnk>=threshold?"#e02020":lnk>=threshold-1?"#e08020":"#a09070",
}}>{MANA_SYM[c]}</span>
<span style={{ color:def?"#405030":lnk>=threshold?"#e02020":"#a09070", fontSize:10 }}>{MAGE_NAMES[c]}</span>
<span style={{ color:"#6a5030", fontSize:9 }}>{def?"✓":lnk+"/"+threshold}</span>
</div>
);
})}
</div>
);
}

// --- MANA LINK ALERT ---------------------------------------------------------

export function ManaLinkAlert({ events, onRespond, onDismiss }) {
if (!events.length) return null;
const ev = events[0];
const hx = MANA_HEX[ev.color];

return (
<div style={{
position:"absolute", top:10, left:"50%", transform:"translateX(-50%)",
zIndex:100,
background: `linear-gradient(135deg,#1a0808,${hx}20)`,
border:`2px solid ${hx}`, borderRadius:7, padding:"10px 16px",
maxWidth:430, boxShadow:`0 0 20px ${hx}60`,
animation:"alertDrop .3s ease-out",
}}>
<div style={{ fontSize:11, fontFamily:"'Cinzel',serif", color:hx, marginBottom:4, letterSpacing:1 }}>
{MANA_SYM[ev.color]} MANA LINK ALERT
</div>
<div style={{ fontSize:12, color:"#e0c090", marginBottom:8 }}>
<strong>{MAGE_NAMES[ev.color]}</strong> sends <strong>{ev.minionName}</strong> to seize <strong>{ev.townName}</strong>!{" "}
<strong style={{ color:"#ff8040" }}>{ev.movesLeft} moves</strong> remaining.
</div>
<div style={{ display:"flex", gap:6 }}>
<button onClick={() => onRespond(ev)} style={{
flex:2, background:`${hx}20`, border:`1px solid ${hx}`, color:hx,
padding:"5px 12px", borderRadius:4, cursor:"pointer", fontFamily:"'Cinzel',serif", fontSize:11,
}}>⚡ Rush to {ev.townName}</button>
<button onClick={() => onDismiss(ev)} style={{
flex:1, background:"transparent", border:"1px solid #5a3020", color:"#806040",
padding:"5px", borderRadius:4, cursor:"pointer", fontFamily:"'Cinzel',serif", fontSize:10,
}}>Ignore</button>
</div>
</div>
);
}

export default { WorldMap, MapTile, HUDBar, MapLegend, MageStatusPanel, ManaLinkAlert };
