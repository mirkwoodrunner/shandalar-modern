// mobileCards.jsx — compact card / pip components for the mobile duel screen.
// Aesthetic matches duel-screen/components/cards.jsx (parchment/brass) but smaller.

const M_CCOLOR = { W:"#f5e060", U:"#66bbff", B:"#cc88ff", R:"#ff8844", G:"#66ee44", "":"#bbb" };
const M_MANA_BG = { W:"#e8d089", U:"#3d6fa8", B:"#5a3478", R:"#a83a22", G:"#3d7a32", C:"#7a6650" };
const M_CFRAME = {
  W: { bg:"#3a3424", bd:"#8a7438", glow:"#d4b870", parch:"#d8cfa6" },
  U: { bg:"#1a2638", bd:"#3d6fa8", glow:"#6a9ad0", parch:"#aac4dc" },
  B: { bg:"#241a2c", bd:"#5a3478", glow:"#8c5cb0", parch:"#b8a4c4" },
  R: { bg:"#2c1a16", bd:"#8a3422", glow:"#c4634a", parch:"#d4b0a0" },
  G: { bg:"#1c2818", bd:"#3d6a32", glow:"#6a9a5a", parch:"#b4c8a4" },
  A: { bg:"#1f2024", bd:"#6a6e76", glow:"#9aa0aa", parch:"#bcc0c8" },
};
function mFrameOf(card) {
  if (card.type === "Artifact") return M_CFRAME.A;
  return M_CFRAME[card.color] || M_CFRAME.A;
}

// ─── Mana pip ─────────────────────────────────────────────────────────────
function MPip({ sym, size = 11 }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: size, height: size, borderRadius: "50%",
      background: M_MANA_BG[sym] || "#5a4a32",
      color: sym === "W" ? "#3a2f10" : "#f4ecd0",
      fontSize: size * 0.6, fontWeight: 700,
      border: "1px solid rgba(20,12,4,.7)",
      boxShadow: "inset 0 1px 1px rgba(255,255,255,.15), inset 0 -1px 1px rgba(0,0,0,.4)",
      flexShrink: 0, lineHeight: 1,
      fontFamily: "'Fira Code',monospace",
    }}>{sym || "?"}</span>
  );
}
function MNumPip({ n, size = 11 }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: size, height: size, borderRadius: "50%",
      background: "#4a3e2a", color: "#e8dcc0",
      fontSize: size * 0.62, fontWeight: 700,
      border: "1px solid rgba(20,12,4,.7)",
      fontFamily: "'Fira Code',monospace", lineHeight: 1, flexShrink: 0,
    }}>{n}</span>
  );
}
function MCost({ cost, size = 10 }) {
  if (!cost) return null;
  const norm = cost.replace(/\{([^}]+)\}/g, '$1').replace(/\//g, '');
  const parts = [];
  let i = 0;
  while (i < norm.length) {
    const ch = norm[i];
    if ('WUBRG'.includes(ch)) { parts.push(<MPip key={`p${i}`} sym={ch} size={size} />); i++; }
    else if (ch === 'C') { parts.push(<MPip key={`c${i}`} sym="C" size={size} />); i++; }
    else if (!isNaN(parseInt(ch, 10))) {
      let n = '';
      while (i < norm.length && !isNaN(parseInt(norm[i], 10))) { n += norm[i]; i++; }
      parts.push(<MNumPip key={`n${i}`} n={n} size={size} />);
    } else { i++; }
  }
  return <span style={{ display: 'inline-flex', gap: 1.5 }}>{parts}</span>;
}
function MPool({ pool, size = 11 }) {
  const tot = Object.values(pool).reduce((a, b) => a + b, 0);
  if (!tot) return null;
  return (
    <span style={{ display: "inline-flex", gap: 1.5, flexWrap: "wrap" }}>
      {["W","U","B","R","G","C"].map(c =>
        pool[c] > 0 && Array.from({ length: pool[c] }).map((_, i) =>
          <MPip key={`${c}${i}`} sym={c} size={size} />
        )
      )}
    </span>
  );
}

// ─── Filigree corner ──────────────────────────────────────────────────────
function MFilCorner({ corner, color }) {
  const tf = { tl:"rotate(0)", tr:"scaleX(-1)", bl:"scaleY(-1)", br:"scale(-1,-1)" };
  const pos = { tl:{top:1,left:1}, tr:{top:1,right:1}, bl:{bottom:1,left:1}, br:{bottom:1,right:1} };
  return (
    <svg width="10" height="10" viewBox="0 0 14 14"
      style={{ position:"absolute", ...pos[corner], transform:tf[corner], pointerEvents:"none", opacity:0.85 }}>
      <path d="M1 1 L7 1 M1 1 L1 7 M1 1 Q5 2 6 5 Q3 6 1 7" stroke={color} strokeWidth="0.8" fill="none" strokeLinecap="round" />
      <circle cx="6" cy="5" r="0.7" fill={color} opacity="0.9" />
    </svg>
  );
}

// ─── Art placeholder ──────────────────────────────────────────────────────
function MArtPlaceholder({ frame, label }) {
  return (
    <div style={{
      width:"100%", height:"100%",
      background:`repeating-linear-gradient(45deg, ${frame.bg} 0 5px, ${frame.bg}cc 5px 10px)`,
      borderRadius:1,
      display:"flex", alignItems:"center", justifyContent:"center",
      position:"relative", overflow:"hidden",
    }}>
      <div style={{ position:"absolute", inset:0, background:`radial-gradient(ellipse at 50% 30%, ${frame.glow}22, transparent 70%)` }} />
      <span style={{
        fontFamily:"'Fira Code',monospace", fontSize:6,
        color:`${frame.parch}88`, letterSpacing:.4, textTransform:"uppercase", position:"relative",
      }}>{label}</span>
    </div>
  );
}

// ─── Mobile Field Card ────────────────────────────────────────────────────
// Two density modes: 'creature' (full info incl P/T) and 'perm' (compact, no text box).
function MFieldCard({ card, selected, attacking, tapped, onClick, density = "creature" }) {
  const frame = mFrameOf(card);
  const isCre = card.type === "Creature";
  const w = density === "perm" ? 50 : 64;
  const h = density === "perm" ? 70 : 90;

  return (
    <div
      onClick={onClick}
      data-iid={card.iid}
      style={{
        width: w, height: h,
        background:`linear-gradient(155deg, ${frame.bg}, #0a0806 75%)`,
        border:`1.5px solid ${selected ? "#ffd060" : attacking ? "#e85420" : frame.bd}`,
        borderRadius:4, cursor:"pointer", position:"relative",
        transform: tapped ? "rotate(90deg)" : "none",
        transition:"transform .35s cubic-bezier(.4,1.4,.6,1), border-color .15s, box-shadow .2s",
        boxShadow: selected
          ? `0 0 10px #ffd06088, inset 0 0 12px rgba(0,0,0,.5)`
          : attacking
          ? "0 0 8px rgba(232,84,32,.7), inset 0 0 12px rgba(0,0,0,.5)"
          : "0 2px 5px rgba(0,0,0,.7), inset 0 0 10px rgba(0,0,0,.4)",
        flexShrink:0, display:"flex", flexDirection:"column",
        padding:2, overflow:"hidden",
      }}
    >
      <MFilCorner corner="tl" color={frame.glow} />
      <MFilCorner corner="tr" color={frame.glow} />
      <MFilCorner corner="bl" color={frame.glow} />
      <MFilCorner corner="br" color={frame.glow} />

      {/* Name */}
      <div style={{
        background:`linear-gradient(90deg, ${frame.bd}55, ${frame.bd}22)`,
        borderBottom:`1px solid ${frame.bd}88`,
        padding:"1px 3px",
        display:"flex", justifyContent:"space-between", alignItems:"center",
        flexShrink:0, gap:2,
      }}>
        <span style={{
          fontSize: density === "perm" ? 5.5 : 6.5,
          fontFamily:"'Cinzel',serif", color:"#e8dcb0", fontWeight:600,
          letterSpacing:.1, flex:1,
          overflow:"hidden", whiteSpace:"nowrap", textOverflow:"ellipsis",
        }}>{card.name}</span>
        {card.cost && density !== "perm" && <MCost cost={card.cost} size={7} />}
      </div>

      {/* Art */}
      <div style={{ flex:1, margin:"1px 0", border:`1px solid ${frame.bd}aa`, boxShadow:"inset 0 0 5px rgba(0,0,0,.7)" }}>
        <MArtPlaceholder frame={frame} label={card.type} />
      </div>

      {/* Type */}
      <div style={{
        background:`linear-gradient(90deg, ${frame.bd}33, transparent)`,
        borderTop:`1px solid ${frame.bd}66`,
        padding:"0px 3px",
        fontSize: density === "perm" ? 5 : 5.5,
        fontFamily:"'Cinzel',serif", color:frame.parch, letterSpacing:.3, flexShrink:0,
        overflow:"hidden", whiteSpace:"nowrap", textOverflow:"ellipsis",
      }}>
        {card.subtype || card.type}
      </div>

      {/* P/T badge */}
      {isCre && (
        <div style={{
          position:"absolute", bottom:2, right:2,
          background:"linear-gradient(180deg,#1a1410,#0a0806)",
          border:`1px solid ${frame.bd}`, borderRadius:2,
          padding:"0px 3px", fontSize:8.5, fontWeight:700,
          color:card.damage > 0 ? "#ff7050" : "#f0e4b8",
          fontFamily:"'Cinzel',serif", textShadow:"0 1px 2px rgba(0,0,0,.9)",
          lineHeight:1.1,
        }}>{card.power}/{card.toughness}</div>
      )}

      {/* Summoning sick veil */}
      {card.summoningSick && (
        <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,.5)",
          display:"flex", alignItems:"center", justifyContent:"center", pointerEvents:"none" }}>
          <span style={{ fontSize:5.5, color:"rgba(220,200,150,.7)", fontFamily:"'Cinzel',serif", letterSpacing:.6 }}>SUMMONING</span>
        </div>
      )}
    </div>
  );
}

// ─── Mobile Hand Card ─────────────────────────────────────────────────────
// Wider than a field card so text is readable. Horizontal scroll, no fan.
function MHandCard({ card, selected, playable, onClick }) {
  const frame = mFrameOf(card);
  const w = 88, h = 126;

  return (
    <div
      onClick={onClick}
      data-iid={card.iid}
      style={{
        width:w, height:h,
        background:`linear-gradient(155deg, ${frame.bg}, #0a0806 80%)`,
        border:`1.5px solid ${selected ? "#ffd060" : playable ? "#7ab84a" : frame.bd}`,
        borderRadius:5, cursor:"pointer", flexShrink:0,
        display:"flex", flexDirection:"column",
        padding:3, position:"relative", overflow:"hidden",
        transform: selected ? "translateY(-18px) scale(1.08)" : "translateY(0)",
        transition:"transform .22s cubic-bezier(.3,1.3,.5,1), box-shadow .2s, border-color .15s",
        boxShadow: selected
          ? `0 0 14px #ffd06099, 0 -4px 14px rgba(255,208,96,.25), 0 4px 10px rgba(0,0,0,.7)`
          : playable
          ? `0 0 8px rgba(122,184,74,.45), 0 3px 8px rgba(0,0,0,.7)`
          : "0 3px 8px rgba(0,0,0,.7), inset 0 0 10px rgba(0,0,0,.4)",
        zIndex: selected ? 10 : "auto",
      }}
    >
      <MFilCorner corner="tl" color={frame.glow} />
      <MFilCorner corner="tr" color={frame.glow} />
      <MFilCorner corner="bl" color={frame.glow} />
      <MFilCorner corner="br" color={frame.glow} />

      <div style={{
        background:`linear-gradient(90deg, ${frame.bd}55, ${frame.bd}22)`,
        borderBottom:`1px solid ${frame.bd}88`,
        padding:"2px 4px",
        display:"flex", justifyContent:"space-between", alignItems:"center",
        flexShrink:0, gap:3,
      }}>
        <span style={{
          fontSize:8.5, fontFamily:"'Cinzel',serif", color:"#e8dcb0", fontWeight:600,
          letterSpacing:.15, flex:1, overflow:"hidden", whiteSpace:"nowrap", textOverflow:"ellipsis",
        }}>{card.name}</span>
        {card.cost && <MCost cost={card.cost} size={9.5} />}
      </div>

      <div style={{ flex:1, margin:"2px 0", border:`1px solid ${frame.bd}aa`, boxShadow:"inset 0 0 6px rgba(0,0,0,.7)" }}>
        <MArtPlaceholder frame={frame} label={card.type} />
      </div>

      <div style={{
        background:`linear-gradient(90deg, ${frame.bd}33, transparent)`,
        borderTop:`1px solid ${frame.bd}66`,
        padding:"1px 4px",
        fontSize:7, fontFamily:"'Cinzel',serif", color:frame.parch, letterSpacing:.3, flexShrink:0,
        overflow:"hidden", whiteSpace:"nowrap", textOverflow:"ellipsis",
      }}>{card.subtype || card.type}</div>

      <div style={{
        background:"linear-gradient(180deg, #2a241a, #1e1812)",
        padding:"2px 4px", minHeight:22,
        fontSize:6.5, color:"#a89878",
        fontFamily:"'Crimson Text',serif", lineHeight:1.25,
        overflow:"hidden",
      }}>{card.text || ""}</div>

      {card.type === "Creature" && (
        <div style={{
          position:"absolute", bottom:3, right:3,
          background:"linear-gradient(180deg,#1a1410,#0a0806)",
          border:`1px solid ${frame.bd}`, borderRadius:2,
          padding:"1px 4px", fontSize:10.5, fontWeight:700,
          color:"#f0e4b8", fontFamily:"'Cinzel',serif",
          textShadow:"0 1px 2px rgba(0,0,0,.9)", lineHeight:1.1,
        }}>{card.power}/{card.toughness}</div>
      )}
      {playable && !selected && (
        <div style={{ position:"absolute", bottom:0, left:0, right:0, height:2,
          background:"linear-gradient(90deg, transparent, #7ab84a, transparent)" }} />
      )}
    </div>
  );
}

// ─── Mobile Card Back (for opp hand count visualization) ──────────────────
function MCardBack({ size = "xs" }) {
  const w = size === "xs" ? 22 : 36;
  const h = size === "xs" ? 30 : 50;
  return (
    <div style={{
      width:w, height:h,
      background:`radial-gradient(ellipse at 50% 50%, #2a1a0e 0%, #14080a 60%, #0a0406 100%)`,
      border:"1px solid #4a2818", borderRadius:3,
      flexShrink:0, marginLeft:-10,
      position:"relative", boxShadow:"0 2px 5px rgba(0,0,0,.8), inset 0 0 8px rgba(0,0,0,.6)",
      overflow:"hidden",
    }}>
      <div style={{
        position:"absolute", inset:2, border:"0.5px solid #6a3820", borderRadius:2,
        display:"flex", alignItems:"center", justifyContent:"center",
        background:"repeating-linear-gradient(45deg, transparent 0 2px, rgba(106,56,32,.08) 2px 4px)",
      }}>
        <svg width={size === "xs" ? "10" : "16"} height={size === "xs" ? "10" : "16"} viewBox="0 0 44 44">
          <circle cx="22" cy="22" r="18" stroke="#7a4828" strokeWidth="1.2" fill="none" opacity="0.7" />
          <path d="M22 6 L26 22 L22 38 L18 22 Z" fill="#5a3018" stroke="#8a5028" strokeWidth="0.5" opacity="0.85" />
          <path d="M6 22 L22 18 L38 22 L22 26 Z" fill="#5a3018" stroke="#8a5028" strokeWidth="0.5" opacity="0.85" />
          <circle cx="22" cy="22" r="3" fill="#a26830" />
        </svg>
      </div>
    </div>
  );
}

// ─── Mobile Land Pip ──────────────────────────────────────────────────────
function MLandPip({ card, tapped, selected, onClick, isPlayer = false }) {
  const manaColor = card.produces?.[0] || "C";
  const bg = M_MANA_BG[manaColor] || "#5a4a32";
  const sym = { W:"☀", U:"💧", B:"💀", R:"🔥", G:"🌿", C:"◆" }[manaColor] || "◆";

  return (
    <div
      onClick={onClick}
      data-iid={card.iid}
      title={`${card.name}${tapped ? " (tapped)" : ""}`}
      style={{
        width:26, height:26, flexShrink:0, borderRadius:4,
        background: tapped ? `${bg}55` : `linear-gradient(155deg, ${bg}dd, ${bg}77)`,
        border:`1.5px solid ${selected ? (isPlayer ? "#7ab84a" : "#c45040") : "rgba(180,140,70,.4)"}`,
        display:"flex", alignItems:"center", justifyContent:"center",
        cursor:"pointer",
        transform: tapped ? "rotate(90deg)" : "none",
        transition:"transform .3s cubic-bezier(.4,1.4,.6,1), border-color .15s, box-shadow .15s",
        boxShadow: selected
          ? `0 0 6px ${isPlayer ? "#7ab84a" : "#c45040"}`
          : tapped ? "none" : `0 0 4px ${bg}66, inset 0 1px 1px rgba(255,255,255,.15)`,
        opacity: tapped ? 0.55 : 1,
      }}
    >
      <span style={{ fontSize:11, lineHeight:1, userSelect:"none" }}>{sym}</span>
    </div>
  );
}

Object.assign(window, {
  MPip, MNumPip, MCost, MPool,
  MFieldCard, MHandCard, MCardBack, MLandPip,
  M_CCOLOR, M_MANA_BG, M_CFRAME, mFrameOf,
});
