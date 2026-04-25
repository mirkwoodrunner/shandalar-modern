// duel-screen/components/cards.jsx
// Original weathered card frames. NOT a reproduction of MTG card frames.
// Aesthetic: aged vellum, tarnished brass borders, filigree corners.

const CCOLOR = { W:"#f5e060", U:"#66bbff", B:"#cc88ff", R:"#ff8844", G:"#66ee44", "":"#bbb" };
const MANA_BG = { W:"#e8d089", U:"#3d6fa8", B:"#5a3478", R:"#a83a22", G:"#3d7a32", C:"#7a6650" };

// Color-coded weathered frame backgrounds (original — desaturated, parchment-tinted)
const CFRAME = {
  W: { bg:"#3a3424", bd:"#8a7438", glow:"#d4b870", parch:"#d8cfa6" },
  U: { bg:"#1a2638", bd:"#3d6fa8", glow:"#6a9ad0", parch:"#aac4dc" },
  B: { bg:"#241a2c", bd:"#5a3478", glow:"#8c5cb0", parch:"#b8a4c4" },
  R: { bg:"#2c1a16", bd:"#8a3422", glow:"#c4634a", parch:"#d4b0a0" },
  G: { bg:"#1c2818", bd:"#3d6a32", glow:"#6a9a5a", parch:"#b4c8a4" },
  A: { bg:"#1f2024", bd:"#6a6e76", glow:"#9aa0aa", parch:"#bcc0c8" },  // artifact
};

function frameOf(card) {
  if (card.type === "Artifact") return CFRAME.A;
  return CFRAME[card.color] || CFRAME.A;
}

const CARD_ICON = c => ({
  Land:"🏔", Creature:"⚔", Instant:"✦", Sorcery:"✸", Artifact:"⚙", Enchantment:"◆",
}[c.type] || "◆");

// ─── PIP ─────────────────────────────────────────────────────────────────────

function Pip({ sym, size = 13 }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: size, height: size, borderRadius: "50%",
      background: MANA_BG[sym] || "#5a4a32",
      color: sym === "W" ? "#3a2f10" : "#f4ecd0",
      fontSize: size * 0.58, fontWeight: 700,
      border: "1px solid rgba(20,12,4,.7)",
      boxShadow: "inset 0 1px 1px rgba(255,255,255,.15), inset 0 -1px 1px rgba(0,0,0,.4)",
      flexShrink: 0, lineHeight: 1,
      fontFamily: "'Fira Code',monospace",
    }}>{sym || "?"}</span>
  );
}

function NumPip({ n, size = 13 }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: size, height: size, borderRadius: "50%",
      background: "#4a3e2a", color: "#e8dcc0",
      fontSize: size * 0.6, fontWeight: 700,
      border: "1px solid rgba(20,12,4,.7)",
      boxShadow: "inset 0 1px 1px rgba(255,255,255,.1), inset 0 -1px 1px rgba(0,0,0,.4)",
      fontFamily: "'Fira Code',monospace", lineHeight: 1, flexShrink: 0,
    }}>{n}</span>
  );
}

function Cost({ cost, size = 12 }) {
  if (!cost) return null;
  const norm = cost.replace(/\{([^}]+)\}/g, '$1').replace(/\//g, '');
  const parts = [];
  let i = 0;
  while (i < norm.length) {
    const ch = norm[i];
    if ('WUBRG'.includes(ch)) { parts.push(<Pip key={`p${i}`} sym={ch} size={size} />); i++; }
    else if (ch === 'C') { parts.push(<Pip key={`c${i}`} sym="C" size={size} />); i++; }
    else if (!isNaN(parseInt(ch, 10))) {
      let n = '';
      while (i < norm.length && !isNaN(parseInt(norm[i], 10))) { n += norm[i]; i++; }
      parts.push(<NumPip key={`n${i}`} n={n} size={size} />);
    } else { i++; }
  }
  return <span style={{ display: 'inline-flex', gap: 2 }}>{parts}</span>;
}

function PoolDisplay({ pool, size = 14 }) {
  const tot = Object.values(pool).reduce((a, b) => a + b, 0);
  if (!tot) return <span style={{ fontSize: 10, color: "#5a4a30", fontFamily: "'Cinzel',serif" }}>—</span>;
  return (
    <span style={{ display: "inline-flex", gap: 2, flexWrap: "wrap" }}>
      {["W","U","B","R","G","C"].map(c =>
        pool[c] > 0 && Array.from({ length: pool[c] }).map((_, i) =>
          <Pip key={`${c}${i}`} sym={c} size={size} />
        )
      )}
    </span>
  );
}

// ─── FILIGREE CORNER ORNAMENTS ───────────────────────────────────────────────

function FilCorner({ corner, color }) {
  const transforms = {
    tl: "rotate(0)",
    tr: "scaleX(-1)",
    bl: "scaleY(-1)",
    br: "scale(-1,-1)",
  };
  const pos = {
    tl: { top: 2, left: 2 },
    tr: { top: 2, right: 2 },
    bl: { bottom: 2, left: 2 },
    br: { bottom: 2, right: 2 },
  };
  return (
    <svg width="14" height="14" viewBox="0 0 14 14"
      style={{ position: "absolute", ...pos[corner], transform: transforms[corner], pointerEvents: "none", opacity: 0.85 }}>
      <path d="M1 1 L7 1 M1 1 L1 7 M1 1 Q5 2 6 5 Q3 6 1 7"
        stroke={color} strokeWidth="0.8" fill="none" strokeLinecap="round" />
      <circle cx="6" cy="5" r="0.7" fill={color} opacity="0.9" />
    </svg>
  );
}

// ─── ART PLACEHOLDER ─────────────────────────────────────────────────────────
// Subtly-striped placeholder per design conventions — never draw fake card art.

function ArtPlaceholder({ frame, label, sm }) {
  return (
    <div style={{
      width: "100%", height: "100%",
      background: `repeating-linear-gradient(45deg, ${frame.bg} 0 6px, ${frame.bg}cc 6px 12px)`,
      borderRadius: 2,
      display: "flex", alignItems: "center", justifyContent: "center",
      position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", inset: 0,
        background: `radial-gradient(ellipse at 50% 30%, ${frame.glow}22, transparent 70%)`,
      }} />
      <span style={{
        fontFamily: "'Fira Code',monospace",
        fontSize: sm ? 7 : 8.5,
        color: `${frame.parch}88`,
        letterSpacing: 0.5,
        textTransform: "uppercase",
        position: "relative",
      }}>{label}</span>
    </div>
  );
}

// ─── FIELD CARD (on battlefield) ─────────────────────────────────────────────

function FieldCard({ card, selected, attacking, tapped, onClick, sm = false }) {
  const frame = frameOf(card);
  const ca = CCOLOR[card.color] || frame.glow;
  const w = sm ? 78 : 96;
  const h = sm ? 109 : 134;
  const isCre = card.type === "Creature";

  return (
    <div
      onClick={onClick}
      data-iid={card.iid}
      title={`${card.name}\n${card.text || ""}`}
      style={{
        width: w, height: h,
        background: `linear-gradient(155deg, ${frame.bg}, #0a0806 75%)`,
        border: `2px solid ${selected ? "#ffd060" : attacking ? "#e85420" : frame.bd}`,
        borderRadius: 6, cursor: "pointer", position: "relative",
        transform: tapped ? "rotate(90deg)" : "none",
        transition: "transform .35s cubic-bezier(.4,1.4,.6,1), border-color .15s, box-shadow .2s",
        boxShadow: selected
          ? `0 0 14px #ffd06088, 0 0 4px #ffd060, inset 0 0 18px rgba(0,0,0,.5)`
          : attacking
          ? "0 0 12px rgba(232,84,32,.7), inset 0 0 18px rgba(0,0,0,.5)"
          : "0 3px 8px rgba(0,0,0,.7), inset 0 0 14px rgba(0,0,0,.4)",
        flexShrink: 0, display: "flex", flexDirection: "column",
        padding: 3, overflow: "hidden",
      }}
    >
      {/* Filigree corners */}
      <FilCorner corner="tl" color={frame.glow} />
      <FilCorner corner="tr" color={frame.glow} />
      <FilCorner corner="bl" color={frame.glow} />
      <FilCorner corner="br" color={frame.glow} />

      {/* Name bar */}
      <div style={{
        background: `linear-gradient(90deg, ${frame.bd}55, ${frame.bd}22)`,
        borderBottom: `1px solid ${frame.bd}88`,
        padding: "2px 4px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        flexShrink: 0,
      }}>
        <span style={{
          fontSize: sm ? 7.5 : 8.5, fontFamily: "'Cinzel',serif",
          color: "#e8dcb0", fontWeight: 600,
          letterSpacing: 0.2, textShadow: "0 1px 1px rgba(0,0,0,.8)",
          flex: 1, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
        }}>{card.name}</span>
        {card.cost && <Cost cost={card.cost} size={sm ? 9 : 10} />}
      </div>

      {/* Art window */}
      <div style={{
        flex: 1, margin: "2px 0",
        border: `1px solid ${frame.bd}aa`,
        boxShadow: `inset 0 0 8px rgba(0,0,0,.7)`,
      }}>
        <ArtPlaceholder frame={frame} label={`${card.type} art`} sm={sm} />
      </div>

      {/* Type bar */}
      <div style={{
        background: `linear-gradient(90deg, ${frame.bd}33, transparent)`,
        borderTop: `1px solid ${frame.bd}66`,
        borderBottom: `1px solid ${frame.bd}66`,
        padding: "1px 4px",
        fontSize: sm ? 6.5 : 7.5,
        fontFamily: "'Cinzel',serif",
        color: frame.parch,
        letterSpacing: 0.4,
        flexShrink: 0,
      }}>
        {card.subtype ? `${card.type} — ${card.subtype}` : card.type}
      </div>

      {/* Text box (vellum) */}
      <div style={{
        background: `linear-gradient(180deg, #2a241a 0%, #1e1812 100%)`,
        boxShadow: "inset 0 1px 2px rgba(0,0,0,.6)",
        flexShrink: 0,
        padding: "2px 4px",
        minHeight: sm ? 16 : 22,
        fontSize: sm ? 6 : 7,
        color: "#a89878",
        fontFamily: "'Crimson Text',serif",
        lineHeight: 1.25,
        overflow: "hidden",
      }}>
        {card.text || ""}
      </div>

      {/* P/T or loyalty */}
      {isCre && (
        <div style={{
          position: "absolute", bottom: 4, right: 4,
          background: "linear-gradient(180deg, #1a1410, #0a0806)",
          border: `1px solid ${frame.bd}`,
          borderRadius: 3,
          padding: "1px 5px",
          fontSize: sm ? 9.5 : 11,
          fontWeight: 700,
          color: card.damage > 0 ? "#ff7050" : "#f0e4b8",
          fontFamily: "'Cinzel',serif",
          textShadow: "0 1px 2px rgba(0,0,0,.9)",
          boxShadow: "0 1px 3px rgba(0,0,0,.7)",
        }}>
          {card.power}/{card.toughness}
        </div>
      )}

      {/* Status overlays */}
      {card.summoningSick && (
        <div style={{
          position: "absolute", inset: 0,
          background: "rgba(0,0,0,.5)",
          display: "flex", alignItems: "center", justifyContent: "center",
          pointerEvents: "none",
        }}>
          <span style={{
            fontSize: 8, color: "rgba(220,200,150,.7)",
            fontFamily: "'Cinzel',serif", letterSpacing: 1,
          }}>SUMMONING</span>
        </div>
      )}
    </div>
  );
}

// ─── HAND CARD (in player's hand) ────────────────────────────────────────────

function HandCard({ card, selected, playable, onClick, fanAngle = 0, fanY = 0 }) {
  const frame = frameOf(card);
  const ca = CCOLOR[card.color] || frame.glow;

  return (
    <div
      onClick={onClick}
      data-iid={card.iid}
      title={`${card.name}\n${card.text || ""}`}
      style={{
        width: 96, height: 134,
        background: `linear-gradient(155deg, ${frame.bg}, #0a0806 80%)`,
        border: `2px solid ${selected ? "#ffd060" : playable ? "#7ab84a" : frame.bd}`,
        borderRadius: 6, cursor: "pointer", flexShrink: 0,
        display: "flex", flexDirection: "column",
        padding: 3, position: "relative", overflow: "hidden",
        transform: selected
          ? `rotate(${fanAngle}deg) translateY(${fanY - 28}px) scale(1.08)`
          : `rotate(${fanAngle}deg) translateY(${fanY}px)`,
        transformOrigin: "50% 130%",
        transition: "transform .25s cubic-bezier(.3,1.3,.5,1), box-shadow .2s, border-color .15s",
        boxShadow: selected
          ? `0 0 18px #ffd06099, 0 -6px 22px rgba(255,208,96,.25), 0 6px 14px rgba(0,0,0,.7)`
          : playable
          ? `0 0 10px rgba(122,184,74,.45), 0 6px 14px rgba(0,0,0,.7)`
          : "0 6px 14px rgba(0,0,0,.8), inset 0 0 12px rgba(0,0,0,.4)",
        marginLeft: -28,
        zIndex: selected ? 100 : "auto",
      }}
    >
      <FilCorner corner="tl" color={frame.glow} />
      <FilCorner corner="tr" color={frame.glow} />
      <FilCorner corner="bl" color={frame.glow} />
      <FilCorner corner="br" color={frame.glow} />

      <div style={{
        background: `linear-gradient(90deg, ${frame.bd}55, ${frame.bd}22)`,
        borderBottom: `1px solid ${frame.bd}88`,
        padding: "2px 4px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        flexShrink: 0,
      }}>
        <span style={{
          fontSize: 8.5, fontFamily: "'Cinzel',serif",
          color: "#e8dcb0", fontWeight: 600, letterSpacing: 0.2,
          textShadow: "0 1px 1px rgba(0,0,0,.8)",
          flex: 1, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
        }}>{card.name}</span>
        {card.cost && <Cost cost={card.cost} size={10} />}
      </div>

      <div style={{
        flex: 1, margin: "2px 0",
        border: `1px solid ${frame.bd}aa`,
        boxShadow: "inset 0 0 8px rgba(0,0,0,.7)",
      }}>
        <ArtPlaceholder frame={frame} label={`${card.type} art`} />
      </div>

      <div style={{
        background: `linear-gradient(90deg, ${frame.bd}33, transparent)`,
        borderTop: `1px solid ${frame.bd}66`,
        borderBottom: `1px solid ${frame.bd}66`,
        padding: "1px 4px",
        fontSize: 7.5, fontFamily: "'Cinzel',serif",
        color: frame.parch, letterSpacing: 0.4, flexShrink: 0,
      }}>
        {card.subtype ? `${card.type} — ${card.subtype}` : card.type}
      </div>

      <div style={{
        background: "linear-gradient(180deg, #2a241a, #1e1812)",
        boxShadow: "inset 0 1px 2px rgba(0,0,0,.6)",
        padding: "2px 4px",
        minHeight: 24,
        fontSize: 7, color: "#a89878",
        fontFamily: "'Crimson Text',serif", lineHeight: 1.25,
        overflow: "hidden",
      }}>
        {card.text || ""}
      </div>

      {card.type === "Creature" && (
        <div style={{
          position: "absolute", bottom: 4, right: 4,
          background: "linear-gradient(180deg,#1a1410,#0a0806)",
          border: `1px solid ${frame.bd}`,
          borderRadius: 3,
          padding: "1px 5px",
          fontSize: 11, fontWeight: 700,
          color: "#f0e4b8",
          fontFamily: "'Cinzel',serif",
          textShadow: "0 1px 2px rgba(0,0,0,.9)",
        }}>
          {card.power}/{card.toughness}
        </div>
      )}

      {playable && !selected && (
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0, height: 2,
          background: "linear-gradient(90deg, transparent, #7ab84a, transparent)",
        }} />
      )}
    </div>
  );
}

// ─── CARD BACK (opponent's hand) ─────────────────────────────────────────────

function CardBack({ fanAngle = 0, fanY = 0, size = "lg" }) {
  const w = size === "sm" ? 42 : 96;
  const h = size === "sm" ? 60 : 134;
  return (
    <div style={{
      width: w, height: h,
      background: `
        radial-gradient(ellipse at 50% 50%, #2a1a0e 0%, #14080a 60%, #0a0406 100%)
      `,
      border: "2px solid #4a2818",
      borderRadius: 6,
      flexShrink: 0,
      transform: `rotate(${fanAngle}deg) translateY(${fanY}px)`,
      transformOrigin: "50% 130%",
      marginLeft: size === "sm" ? -16 : -28,
      position: "relative",
      boxShadow: "0 4px 10px rgba(0,0,0,.8), inset 0 0 14px rgba(0,0,0,.6)",
      overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", inset: 4,
        border: "1px solid #6a3820",
        borderRadius: 3,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: `repeating-linear-gradient(45deg, transparent 0 3px, rgba(106,56,32,.08) 3px 6px)`,
      }}>
        <svg width={size === "sm" ? "20" : "44"} height={size === "sm" ? "20" : "44"} viewBox="0 0 44 44">
          {/* Original sigil — rune-like, not branded */}
          <circle cx="22" cy="22" r="18" stroke="#7a4828" strokeWidth="0.8" fill="none" opacity="0.7" />
          <circle cx="22" cy="22" r="13" stroke="#7a4828" strokeWidth="0.6" fill="none" opacity="0.5" />
          <path d="M22 6 L26 22 L22 38 L18 22 Z" fill="#5a3018" stroke="#8a5028" strokeWidth="0.5" opacity="0.85" />
          <path d="M6 22 L22 18 L38 22 L22 26 Z" fill="#5a3018" stroke="#8a5028" strokeWidth="0.5" opacity="0.85" />
          <circle cx="22" cy="22" r="2.5" fill="#a26830" />
        </svg>
      </div>
      {/* Tarnished gold inner highlight */}
      <div style={{
        position: "absolute", inset: 0,
        boxShadow: "inset 0 1px 0 rgba(160,100,50,.3)",
        borderRadius: 4, pointerEvents: "none",
      }} />
    </div>
  );
}

// ─── LAND PIP ────────────────────────────────────────────────────────────────

function LandPip({ card, tapped, selected, onClick, isPlayer = false }) {
  const manaColor = card.produces?.[0] || "C";
  const bg = MANA_BG[manaColor] || "#5a4a32";
  const sym = { W:"☀", U:"💧", B:"💀", R:"🔥", G:"🌿", C:"◆" }[manaColor] || "◆";

  return (
    <div
      onClick={onClick}
      data-iid={card.iid}
      title={`${card.name}${tapped ? " (tapped)" : ""}`}
      style={{
        width: 32, height: 32, flexShrink: 0, borderRadius: 5,
        background: tapped ? `${bg}55` : `linear-gradient(155deg, ${bg}dd, ${bg}77)`,
        border: `1.5px solid ${selected ? (isPlayer ? "#7ab84a" : "#c45040") : "rgba(180,140,70,.4)"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer",
        transform: tapped ? "rotate(90deg)" : "none",
        transition: "transform .3s cubic-bezier(.4,1.4,.6,1), border-color .15s, box-shadow .15s",
        boxShadow: selected
          ? `0 0 8px ${isPlayer ? "#7ab84a" : "#c45040"}`
          : tapped ? "none" : `0 0 5px ${bg}66, inset 0 1px 1px rgba(255,255,255,.15)`,
        opacity: tapped ? 0.55 : 1,
      }}
    >
      <span style={{ fontSize: 14, lineHeight: 1, userSelect: "none" }}>{sym}</span>
    </div>
  );
}

// Export to global scope for cross-script use
Object.assign(window, { Pip, NumPip, Cost, PoolDisplay, FieldCard, HandCard, CardBack, LandPip, CCOLOR, MANA_BG });
