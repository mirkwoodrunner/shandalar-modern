// src/ui/duel/TargetingOverlay.jsx
// Action bar: cast button, X input, stack display, phase nav, combat prompts,
// Black Lotus color picker modal, and activated-ability target prompt.
// Presentation only - dispatches via callbacks. Per MECHANICS_INDEX.md §7.1

import React from 'react';
import { isCre, isLand, canPay } from '../../engine/DuelCore.js';
import { thmOf, CCOLOR, Cost } from '../shared/Card.jsx';

// ─── ACTION BAR ───────────────────────────────────────────────────────────────

export function ActionBar({
state,
onCast,
onAdvancePhase,
onResolveStack,
onSetX,
pendingActivate,
onCancelActivate,
}) {
const selDef  = state.p.hand.find(c => c.iid === state.selCard);
const inMain  = state.phase === "MAIN1" || state.phase === "MAIN2";
const isMyTurn = state.active === "p";

return (
<div style={{
flexShrink: 0, padding: "6px 14px",
background: "rgba(0,0,0,.7)",
borderBottom: "1px solid rgba(200,160,40,.2)",
borderTop:    "1px solid rgba(200,160,40,.15)",
display: "flex", alignItems: "center", gap: 8, minHeight: 44,
}}>

  {/* Cast / Play button */}
  {isMyTurn && inMain && selDef && (
    <button onClick={onCast} style={{
      background: `linear-gradient(135deg,${thmOf(selDef).bg},rgba(0,0,0,.4))`,
      border: `2px solid ${CCOLOR[selDef.color] || "#aaa"}`,
      color: CCOLOR[selDef.color] || "#ccc",
      padding: "5px 14px", borderRadius: 5, cursor: "pointer",
      fontSize: 11, fontFamily: "'Cinzel',serif", fontWeight: 700,
    }}>
      {isLand(selDef) ? "▶ Play" : "▶ Cast"} {selDef.name}
    </button>
  )}

  {/* X input */}
  {selDef?.cost?.includes("X") && (
    <div style={{ display:"flex", alignItems:"center", gap:4 }}>
      <span style={{ fontSize:10, color:"#c0a050", fontFamily:"'Cinzel',serif" }}>X=</span>
      <input
        type="number" min={0} max={20} value={state.xVal}
        onChange={e => onSetX(parseInt(e.target.value) || 0)}
        style={{ width:40, background:"rgba(20,15,0,.8)", border:"1px solid #7a6020", color:"#f0d050", padding:"3px 5px", borderRadius:4, fontSize:13, fontFamily:"'Fira Code',monospace" }}
      />
    </div>
  )}

  {/* Combat phase prompts */}
  {state.phase === "DECLARE_ATTACKERS" && isMyTurn && (
    <span style={{ fontSize:11, color:"#ffaa40", fontFamily:"'Cinzel',serif", animation:"pulse 1.5s infinite", fontWeight:700 }}>
      ⚔ Click your creatures to declare attackers
    </span>
  )}
  {state.phase === "DECLARE_BLOCKERS" && isMyTurn && (
    <span style={{ fontSize:11, color:"#ffaa40", fontFamily:"'Cinzel',serif", animation:"pulse 1.5s infinite", fontWeight:700 }}>
      🛡 Click an opponent attacker, then your blocker
    </span>
  )}

  {/* Attacker count */}
  {state.attackers.length > 0 && (
    <span style={{ fontSize:11, color:"#ff9040", fontFamily:"'Cinzel',serif", fontWeight:700 }}>
      ⚔ {state.attackers.length} attacker{state.attackers.length !== 1 ? "s" : ""}
      {Object.keys(state.blockers).length > 0 ? ` · 🛡 ${Object.keys(state.blockers).length} blocked` : ""}
    </span>
  )}

  {/* Stack */}
  {state.stack.length > 0 && (
    <div style={{ display:"flex", gap:5, alignItems:"center", flex:1 }}>
      <span style={{ fontSize:10, color:"#b090e0", fontFamily:"'Cinzel',serif", fontWeight:700 }}>STACK:</span>
      {state.stack.map(item => (
        <div key={item.id} style={{
          padding: "3px 10px", borderRadius: 5, fontSize: 11,
          background: "rgba(100,60,180,.35)", border: "1px solid rgba(140,100,220,.6)",
          color: "#d0b0ff", animation: "stackIn .2s ease-out", fontFamily: "'Cinzel',serif",
        }}>
          {item.card.name}
        </div>
      ))}
      <button onClick={onResolveStack} style={{
        background:"rgba(60,40,0,.7)", border:"1px solid rgba(200,140,40,.6)", color:"#f0c040",
        padding:"3px 10px", borderRadius:4, cursor:"pointer", fontSize:10, fontFamily:"'Cinzel',serif", fontWeight:700,
      }}>Resolve ↓</button>
    </div>
  )}

  {/* Pending activate prompt */}
  {pendingActivate && (
    <div style={{ display:"flex", alignItems:"center", gap:8, background:"rgba(200,160,40,.15)", border:"1px solid #a08030", borderRadius:5, padding:"4px 10px" }}>
      <span style={{ fontSize:11, color:"#f0c040", fontFamily:"'Cinzel',serif" }}>⚡ {pendingActivate.name}: select a target</span>
      <button onClick={onCancelActivate} style={{ background:"transparent", border:"1px solid #5a3020", color:"#c08060", padding:"2px 8px", borderRadius:3, cursor:"pointer", fontSize:10, fontFamily:"'Cinzel',serif" }}>Cancel</button>
    </div>
  )}

  {/* Next Phase / End Turn */}
  <div style={{ marginLeft:"auto", display:"flex", gap:6 }}>
    {isMyTurn && (
      <button onClick={onAdvancePhase} style={{
        background: "linear-gradient(135deg,#1e1a04,#302808)",
        border: "2px solid rgba(220,180,40,.5)", color: "#f5d040",
        padding: "6px 18px", borderRadius: 6, cursor: "pointer",
        fontSize: 12, fontFamily: "'Cinzel',serif", fontWeight: 700, letterSpacing: 1,
      }}>
        {state.phase === "CLEANUP" ? "↺ End Turn" : "Next Phase →"}
      </button>
    )}
    {!isMyTurn && (
      <span style={{ fontSize:11, color:"#6a5a30", padding:"6px 12px", fontFamily:"'Cinzel',serif", fontStyle:"italic" }}>
        Opponent's turn...
      </span>
    )}
  </div>
</div>

);
}

// ─── BLACK LOTUS COLOR PICKER ─────────────────────────────────────────────────

export function LotusColorPicker({ onChoose, onCancel }) {
const colors = ["W","U","B","R","G"];
const bg = { W:"#f9f0d0", U:"#3366bb", B:"#6633aa", R:"#bb3311", G:"#226611" };
const label = { W:"W", U:"U", B:"B", R:"R", G:"G" };

return (
<div style={{
position:"fixed", inset:0, background:"rgba(0,0,0,.85)",
display:"flex", alignItems:"center", justifyContent:"center", zIndex:600,
}}>
<div style={{
background:"linear-gradient(160deg,#1a1010,#0a0808)",
border:"2px solid rgba(200,160,40,.5)", borderRadius:10,
padding:24, textAlign:"center",
boxShadow:"0 0 60px rgba(0,0,0,.9)",
}}>
<div style={{ fontSize:18, fontFamily:"'Cinzel',serif", color:"#f0c040", marginBottom:6 }}>⚫ Black Lotus</div>
<div style={{ fontSize:12, color:"#a09060", marginBottom:18, fontFamily:"'Crimson Text',serif", fontStyle:"italic" }}>
Choose which color of mana to add (×3).
</div>
<div style={{ display:"flex", gap:12, justifyContent:"center" }}>
{colors.map(col => (
<button key={col} onClick={() => onChoose(col)} style={{
width:52, height:52, borderRadius:"50%",
background: bg[col], border:"2px solid rgba(255,255,255,.3)",
cursor:"pointer", fontSize:18, fontWeight:700,
color: col === "W" ? "#333" : "#fff",
boxShadow:`0 0 12px ${bg[col]}60`,
}}>
{label[col]}
</button>
))}
</div>
<button onClick={onCancel} style={{
marginTop:16, background:"transparent", border:"1px solid #5a3020",
color:"#806040", padding:"5px 14px", borderRadius:4, cursor:"pointer",
fontSize:11, fontFamily:"'Cinzel',serif",
}}>Cancel</button>
</div>
</div>
);
}

export default { ActionBar, LotusColorPicker };
