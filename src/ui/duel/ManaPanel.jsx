// src/ui/duel/ManaPanel.jsx
// Mana pool display and phase tracker. Presentation only.

import React from ‘react’;
import { Pip, PoolDisplay } from ‘../shared/Card.jsx’;
import { PHASE_SEQ, PHASE_LBL, COMBAT_PHASES } from ‘../../engine/DuelCore.js’;

// ─── PHASE BAR ────────────────────────────────────────────────────────────────

export function PhaseBar({ phase }) {
return (
<div style={{ display:“flex”, gap:2, flexWrap:“wrap”, justifyContent:“center” }}>
{PHASE_SEQ.map(p => {
const on = p === phase;
const cmbt = COMBAT_PHASES.includes(p);
return (
<div key={p} style={{
padding: “3px 6px”,
background: on ? (cmbt ? “rgba(220,80,20,.5)” : “rgba(200,160,20,.35)”) : “rgba(255,255,255,.05)”,
border: `1px solid ${on ? (cmbt ? "#ee6020" : "#ddb830") : "rgba(255,255,255,.12)"}`,
borderRadius: 4,
color: on ? (cmbt ? “#ffcc80” : “#ffe060”) : “#806040”,
fontSize: 9, fontFamily:”‘Cinzel’,serif”, fontWeight: on ? 700 : 400,
animation: on ? “phaseGlow 2s infinite” : “none”,
whiteSpace: “nowrap”,
}}>
{PHASE_LBL[p]}
</div>
);
})}
</div>
);
}

// ─── MANA POOL ────────────────────────────────────────────────────────────────

export function ManaPoolDisplay({ pool, manaBurn = false, size = 14 }) {
return (
<div style={{ display:“flex”, alignItems:“center”, gap:4 }}>
<span style={{ fontSize:10, color:”#706040” }}>Pool:</span>
<PoolDisplay pool={pool} size={size} />
{manaBurn && <span style={{ fontSize:10, color:”#ee6030”, fontWeight:700 }}>⚠ BURN</span>}
</div>
);
}

export default { PhaseBar, ManaPoolDisplay };
