// duel-screen/components/panels.jsx
// Life totals, phase bar, log panel, action bar, deck/graveyard counts.

const PHASE_SEQ = [
  "UNTAP", "UPKEEP", "DRAW",
  "MAIN_1",
  "COMBAT_BEGIN", "COMBAT_ATTACKERS", "COMBAT_BLOCKERS", "COMBAT_DAMAGE", "COMBAT_END",
  "MAIN_2", "END", "CLEANUP",
];
const PHASE_LBL = {
  UNTAP:"Untap", UPKEEP:"Upkeep", DRAW:"Draw",
  MAIN_1:"Main 1",
  COMBAT_BEGIN:"Begin Combat", COMBAT_ATTACKERS:"Declare Attackers",
  COMBAT_BLOCKERS:"Declare Blockers", COMBAT_DAMAGE:"Damage", COMBAT_END:"End Combat",
  MAIN_2:"Main 2", END:"End", CLEANUP:"Cleanup",
};
const COMBAT_PHASES = ["COMBAT_BEGIN","COMBAT_ATTACKERS","COMBAT_BLOCKERS","COMBAT_DAMAGE","COMBAT_END"];

// ─── PHASE BAR ────────────────────────────────────────────────────────────────

function PhaseBar({ phase }) {
  return (
    <div style={{
      display: "flex", gap: 3, justifyContent: "center", flexWrap: "wrap",
      padding: "4px 0",
    }}>
      {PHASE_SEQ.map(p => {
        const on = p === phase;
        const cmbt = COMBAT_PHASES.includes(p);
        return (
          <div key={p} style={{
            padding: "4px 9px",
            background: on
              ? (cmbt ? "linear-gradient(180deg, rgba(196,80,40,.55), rgba(120,40,20,.4))" : "linear-gradient(180deg, rgba(196,160,60,.45), rgba(120,90,30,.3))")
              : "rgba(20,16,10,.5)",
            border: `1px solid ${on ? (cmbt ? "#c45028" : "#c4a040") : "rgba(120,90,40,.25)"}`,
            borderRadius: 3,
            color: on ? (cmbt ? "#ffcc88" : "#ffe080") : "#7a6a48",
            fontSize: 9.5,
            fontFamily: "'Cinzel',serif",
            fontWeight: on ? 700 : 500,
            letterSpacing: 0.6,
            textTransform: "uppercase",
            boxShadow: on
              ? `0 0 10px ${cmbt ? "rgba(196,80,40,.6)" : "rgba(196,160,60,.5)"}, inset 0 1px 1px rgba(255,255,255,.1)`
              : "none",
            transition: "all .2s",
            whiteSpace: "nowrap",
          }}>
            {PHASE_LBL[p]}
          </div>
        );
      })}
    </div>
  );
}

// ─── LIFE TOTAL ──────────────────────────────────────────────────────────────

function LifeTotal({ life, max, label, side, anim, onClick }) {
  // side: "opp" or "you"
  const isOpp = side === "opp";
  const accent = isOpp ? "#c45040" : "#7ab84a";
  const lifeColor = life <= 5 ? "#ff3030" : life <= 10 ? "#e0703a" : (isOpp ? "#ff9070" : "#a8e070");

  return (
    <div
      data-iid={isOpp ? "player-o" : "player-p"}
      onClick={onClick}
      style={{
        cursor: onClick ? "pointer" : "default",
      display: "flex", alignItems: "center", gap: 14,
      padding: "8px 16px",
      background: `linear-gradient(180deg, rgba(20,16,10,.7), rgba(10,8,6,.85))`,
      border: `1px solid ${isOpp ? "rgba(180,80,30,.4)" : "rgba(80,140,40,.4)"}`,
      borderRadius: 4,
      boxShadow: `inset 0 1px 0 rgba(180,140,70,.15), 0 2px 6px rgba(0,0,0,.6)`,
      position: "relative",
      }}>
      <div style={{ display: "none" }}></div>
      {/* Filigree edge accent */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 1,
        background: `linear-gradient(90deg, transparent, ${accent}55, transparent)`,
      }} />

      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1 }}>
        <span style={{
          fontSize: 9, color: accent,
          fontFamily: "'Cinzel',serif", letterSpacing: 2,
          fontWeight: 700, textTransform: "uppercase",
          textShadow: `0 0 6px ${accent}66`,
        }}>{label}</span>
        <span style={{
          fontSize: 11, color: "#7a6a48",
          fontFamily: "'Crimson Text',serif", fontStyle: "italic",
        }}>Life</span>
      </div>

      {/* Big life number */}
      <div style={{
        position: "relative",
        fontSize: 52,
        fontFamily: "'Cinzel',serif",
        fontWeight: 700,
        color: lifeColor,
        lineHeight: 1,
        textShadow: `0 0 14px ${lifeColor}55, 0 2px 4px rgba(0,0,0,.9)`,
        animation: life <= 5 ? "pulse 1s infinite" : (anim === "damage" ? "damageFlash .4s ease-out" : anim === "heal" ? "healFlash .4s ease-out" : "none"),
        minWidth: 64, textAlign: "center",
      }}>
        {life}
        <span style={{
          position: "absolute", top: 6, right: -8,
          fontSize: 12, color: "#5a4a30",
          fontFamily: "'Crimson Text',serif",
        }}>/{max}</span>
      </div>

      {/* Bar */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 100 }}>
        <div style={{
          height: 10,
          background: "#0a0604",
          borderRadius: 2,
          border: "1px solid rgba(120,90,40,.4)",
          overflow: "hidden",
          boxShadow: "inset 0 1px 3px rgba(0,0,0,.8)",
        }}>
          <div style={{
            width: `${Math.max(0, (life / max) * 100)}%`,
            height: "100%",
            background: life <= 5
              ? "linear-gradient(90deg, #c41818, #ee3030)"
              : isOpp
              ? "linear-gradient(90deg, #8a2818, #c45028)"
              : "linear-gradient(90deg, #2a8030, #5ac040)",
            transition: "width .5s",
            boxShadow: "inset 0 1px 1px rgba(255,255,255,.2)",
          }} />
        </div>
      </div>
    </div>
  );
}

// ─── ZONE COUNT (deck / graveyard) ────────────────────────────────────────────

function ZoneCount({ icon, label, count, glyph, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
        background: "linear-gradient(180deg, #1a1610, #0a0806)",
        border: "1px solid rgba(120,90,40,.4)",
        borderRadius: 4,
        padding: "5px 9px",
        cursor: "pointer",
        boxShadow: "inset 0 1px 0 rgba(180,140,70,.15), 0 2px 4px rgba(0,0,0,.7)",
        minWidth: 44,
      }}
    >
      <span style={{ fontSize: 16, lineHeight: 1 }}>{glyph}</span>
      <span style={{
        fontSize: 14, fontFamily: "'Cinzel',serif", fontWeight: 700,
        color: "#e8dcb0", lineHeight: 1,
      }}>{count}</span>
      <span style={{
        fontSize: 7.5, color: "#7a6a48",
        fontFamily: "'Cinzel',serif", letterSpacing: 1, textTransform: "uppercase",
      }}>{label}</span>
    </button>
  );
}

// ─── GAME LOG ────────────────────────────────────────────────────────────────

function DuelLog({ log }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [log.length]);

  return (
    <div ref={ref} style={{
      flex: 1, overflow: "auto",
      padding: "6px 10px",
      fontFamily: "'Crimson Text',serif",
      fontSize: 11, lineHeight: 1.4,
      background: "linear-gradient(180deg, #0c0806, #080604)",
      borderTop: "1px solid rgba(120,90,40,.2)",
    }}>
      {log.map((entry, i) => {
        const tone = entry.kind || "info";
        const colors = {
          turn: "#c4a040",
          phase: "#7a8a9a",
          play: "#a8e070",
          opp_play: "#ff9070",
          damage: "#ff5a3a",
          heal: "#7ad0a0",
          info: "#a89878",
          system: "#c4a040",
        };
        return (
          <div key={i} style={{
            color: colors[tone] || "#a89878",
            marginBottom: 3,
            opacity: i === log.length - 1 ? 1 : 0.85,
            paddingLeft: tone === "turn" ? 0 : 8,
            borderLeft: tone === "turn" ? "none" : `2px solid ${colors[tone] || "#5a4a32"}33`,
            fontStyle: tone === "phase" ? "italic" : "normal",
            fontWeight: tone === "turn" ? 700 : 400,
            textTransform: tone === "turn" ? "uppercase" : "none",
            letterSpacing: tone === "turn" ? 1.2 : 0,
            fontSize: tone === "turn" ? 10 : 11,
            fontFamily: tone === "turn" ? "'Cinzel',serif" : "'Crimson Text',serif",
          }}>
            {tone === "turn" && "═══ "}{entry.text}{tone === "turn" && " ═══"}
          </div>
        );
      })}
    </div>
  );
}

// ─── ACTION BAR ──────────────────────────────────────────────────────────────

function ActionBar({ phase, canEndTurn, hasSelection, onEndTurn, onPassPriority, onCancel, onCast }) {
  const inMain = phase === "MAIN_1" || phase === "MAIN_2";

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
      padding: "10px 16px",
      background: `
        linear-gradient(180deg, #1a1410 0%, #0c0806 100%)
      `,
      borderTop: "1px solid rgba(180,140,70,.25)",
      borderBottom: "1px solid rgba(180,140,70,.25)",
      boxShadow: "inset 0 1px 0 rgba(180,140,70,.1), 0 2px 8px rgba(0,0,0,.6)",
      position: "relative",
    }}>
      {/* Decorative top filigree */}
      <div style={{
        position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
        width: 200, height: 2,
        background: "linear-gradient(90deg, transparent, #c4a040, transparent)",
      }} />

      {hasSelection && inMain && (
        <ActionButton variant="primary" onClick={onCast}>
          ✦ Cast Spell
        </ActionButton>
      )}
      {hasSelection && (
        <ActionButton variant="ghost" onClick={onCancel}>
          Cancel
        </ActionButton>
      )}
      <ActionButton variant="default" onClick={onPassPriority}>
        Pass Priority
      </ActionButton>
      <ActionButton variant="end" onClick={onEndTurn}>
        End Turn ▸
      </ActionButton>
    </div>
  );
}

function ActionButton({ children, onClick, variant = "default", disabled }) {
  const styles = {
    default: {
      bg: "linear-gradient(180deg, #2a2218, #14100a)",
      bd: "#7a5a30",
      color: "#e8dcb0",
      shadow: "0 0 0 rgba(0,0,0,0)",
    },
    primary: {
      bg: "linear-gradient(180deg, #4a3a18, #2a1e0a)",
      bd: "#c4a040",
      color: "#ffe080",
      shadow: "0 0 12px rgba(196,160,64,.4)",
    },
    end: {
      bg: "linear-gradient(180deg, #3a2018, #1c0e0a)",
      bd: "#a85030",
      color: "#ffb090",
      shadow: "0 0 8px rgba(168,80,48,.3)",
    },
    ghost: {
      bg: "transparent",
      bd: "rgba(120,90,40,.4)",
      color: "#a89878",
      shadow: "none",
    },
  };
  const s = styles[variant];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: s.bg,
        border: `1.5px solid ${s.bd}`,
        color: s.color,
        padding: "8px 18px",
        borderRadius: 3,
        cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: "'Cinzel',serif",
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 1.2,
        textTransform: "uppercase",
        boxShadow: `${s.shadow}, inset 0 1px 0 rgba(255,255,255,.06)`,
        opacity: disabled ? 0.4 : 1,
        transition: "all .15s",
        textShadow: "0 1px 2px rgba(0,0,0,.7)",
      }}
      onMouseEnter={e => {
        if (!disabled) {
          e.currentTarget.style.filter = "brightness(1.25)";
          e.currentTarget.style.transform = "translateY(-1px)";
        }
      }}
      onMouseLeave={e => {
        e.currentTarget.style.filter = "none";
        e.currentTarget.style.transform = "none";
      }}
    >
      {children}
    </button>
  );
}

Object.assign(window, { PhaseBar, LifeTotal, ZoneCount, DuelLog, ActionBar, ActionButton });
