// mobileDuelScreen.jsx — mobile-optimized duel layout.
// Two variants are exported: MobileDuel ("stack" with log drawer + peek)
// and MobileDuelCompact (denser, log as full bottom sheet).
// Both render at 402×874 (default iPhone frame size).

const MD_MOCK = {
  turn: 4,
  phase: "MAIN_1",
  ruleset: "Modern",
  p: {
    life: 17, max: 20,
    mana: { W:0, U:0, B:0, R:0, G:2, C:0 },
    lib: 32, gy: 4,
    hand: [
      { iid:"h1", name:"Wandering Eremite", cost:"2W", type:"Creature", subtype:"Human Cleric", color:"W", power:2, toughness:3, text:"When this enters, gain 2 life." },
      { iid:"h2", name:"Counterspell", cost:"UU", type:"Instant", color:"U", text:"Counter target spell." },
      { iid:"h3", name:"Forest", type:"Land", subtype:"Forest", color:"G", produces:["G"], text:"" },
      { iid:"h4", name:"Wraith of Cinders", cost:"3BB", type:"Creature", subtype:"Spirit", color:"B", power:5, toughness:4, text:"Flying." },
      { iid:"h5", name:"Lightning Strike", cost:"1R", type:"Instant", color:"R", text:"Deal 3 damage." },
      { iid:"h6", name:"Verdant Growth", cost:"1G", type:"Sorcery", color:"G", text:"Search for a basic land." },
    ],
    creatures: [
      { iid:"pc1", name:"Llanowar Elves", cost:"G", type:"Creature", subtype:"Elf Druid", color:"G", power:1, toughness:1, text:"{T}: Add {G}.", tapped:true },
      { iid:"pc2", name:"Grizzled Outrider", cost:"2G", type:"Creature", subtype:"Centaur", color:"G", power:3, toughness:3, text:"Trample." },
      { iid:"pc3", name:"Hearth Wraith", cost:"3R", type:"Creature", subtype:"Spirit", color:"R", power:3, toughness:2, text:"Haste.", summoningSick:true },
    ],
    perms: [
      { iid:"pp1", name:"Sol Ring", cost:"1", type:"Artifact", color:"", text:"{T}: Add {C}{C}." },
      { iid:"pp2", name:"Verdant Aegis", cost:"2G", type:"Enchantment", color:"G", text:"Creatures get +1/+1." },
    ],
    lands: [
      { iid:"pl1", name:"Forest", type:"Land", subtype:"Forest", color:"G", produces:["G"], tapped:true },
      { iid:"pl2", name:"Forest", type:"Land", subtype:"Forest", color:"G", produces:["G"], tapped:true },
      { iid:"pl3", name:"Mountain", type:"Land", subtype:"Mountain", color:"R", produces:["R"], tapped:false },
      { iid:"pl4", name:"Mountain", type:"Land", subtype:"Mountain", color:"R", produces:["R"], tapped:false },
    ],
  },
  o: {
    life: 12, max: 20,
    mana: { W:0, U:0, B:0, R:0, G:0, C:0 },
    lib: 28, gy: 6, handCount: 5,
    creatures: [
      { iid:"oc1", name:"Carrion Hound", cost:"2B", type:"Creature", subtype:"Zombie", color:"B", power:3, toughness:2, text:"Menace." },
      { iid:"oc2", name:"Drowned Sage", cost:"1UB", type:"Creature", subtype:"Specter", color:"U", power:2, toughness:2, text:"Flying." },
    ],
    perms: [
      { iid:"op1", name:"Cursed Totem", cost:"2", type:"Artifact", color:"", text:"No activated abilities." },
    ],
    lands: [
      { iid:"ol1", name:"Swamp", type:"Land", subtype:"Swamp", color:"B", produces:["B"], tapped:false },
      { iid:"ol2", name:"Swamp", type:"Land", subtype:"Swamp", color:"B", produces:["B"], tapped:false },
      { iid:"ol3", name:"Swamp", type:"Land", subtype:"Swamp", color:"B", produces:["B"], tapped:false },
      { iid:"ol4", name:"Bog Isle", type:"Land", color:"U", produces:["U","B"], tapped:true },
    ],
  },
  log: [
    { kind:"turn", text:"Turn 1 — You" },
    { kind:"play", text:"You play Forest." },
    { kind:"turn", text:"Turn 1 — Opp" },
    { kind:"opp_play", text:"Opp plays Swamp." },
    { kind:"turn", text:"Turn 2 — You" },
    { kind:"play", text:"You cast Llanowar Elves." },
    { kind:"turn", text:"Turn 3 — Opp" },
    { kind:"opp_play", text:"Opp casts Drowned Sage." },
    { kind:"damage", text:"You take 2 damage. (17 life)" },
    { kind:"turn", text:"Turn 4 — You" },
    { kind:"play", text:"You play Mountain." },
    { kind:"phase", text:"Main Phase 1." },
  ],
};

const MD_PHASE_SEQ = ["UNTAP","UPKEEP","DRAW","MAIN_1","COMBAT_BEGIN","COMBAT_ATTACKERS","COMBAT_BLOCKERS","COMBAT_DAMAGE","COMBAT_END","MAIN_2","END","CLEANUP"];
const MD_PHASE_SHORT = {
  UNTAP:"UNT", UPKEEP:"UPK", DRAW:"DRW",
  MAIN_1:"M1", COMBAT_BEGIN:"CB", COMBAT_ATTACKERS:"ATK",
  COMBAT_BLOCKERS:"BLK", COMBAT_DAMAGE:"DMG", COMBAT_END:"CE",
  MAIN_2:"M2", END:"END", CLEANUP:"CLN",
};
const MD_PHASE_LBL = {
  UNTAP:"Untap", UPKEEP:"Upkeep", DRAW:"Draw",
  MAIN_1:"Main · 1", COMBAT_BEGIN:"Begin Combat", COMBAT_ATTACKERS:"Declare Attackers",
  COMBAT_BLOCKERS:"Declare Blockers", COMBAT_DAMAGE:"Combat Damage", COMBAT_END:"End of Combat",
  MAIN_2:"Main · 2", END:"End Step", CLEANUP:"Cleanup",
};

// ─── Shared: zone counter chip (icon glyph + count + label) ────────────────
function MZoneChip({ glyph, count, label, accent }) {
  return (
    <div style={{
      display:"flex", alignItems:"center", gap:5,
      padding:"3px 7px",
      background:"linear-gradient(180deg, #1a1610, #0a0806)",
      border:`1px solid ${accent || "rgba(120,90,40,.45)"}`,
      borderRadius:3,
      boxShadow:"inset 0 1px 0 rgba(180,140,70,.12), 0 1px 3px rgba(0,0,0,.6)",
      minWidth:38,
    }}>
      <span style={{ fontSize:12, lineHeight:1 }}>{glyph}</span>
      <div style={{ display:"flex", flexDirection:"column", lineHeight:1, gap:1 }}>
        <span style={{ fontSize:11, fontFamily:"'Cinzel',serif", fontWeight:700, color:"#e8dcb0" }}>{count}</span>
        <span style={{ fontSize:6, fontFamily:"'Cinzel',serif", color:"#7a6a48", letterSpacing:.6, textTransform:"uppercase" }}>{label}</span>
      </div>
    </div>
  );
}

// ─── Phase bar (horizontal scroll, current centered) ────────────────────────
function MPhaseBar({ phase, onTap }) {
  return (
    <div style={{
      display:"flex", gap:2, overflowX:"auto", padding:"3px 8px",
      background:"linear-gradient(180deg, rgba(0,0,0,.6), rgba(20,12,6,.4))",
      borderBottom:"1px solid rgba(180,140,70,.2)",
      scrollbarWidth:"none",
    }}>
      <style>{`.md-phase-bar::-webkit-scrollbar { display: none; }`}</style>
      {MD_PHASE_SEQ.map(p => {
        const on = p === phase;
        const combat = p.startsWith("COMBAT");
        return (
          <div key={p} onClick={() => onTap && onTap(p)}
            style={{
              padding:"3px 6px",
              background: on
                ? (combat ? "linear-gradient(180deg, rgba(196,80,40,.55), rgba(120,40,20,.4))" : "linear-gradient(180deg, rgba(196,160,60,.45), rgba(120,90,30,.3))")
                : "rgba(20,16,10,.5)",
              border: `1px solid ${on ? (combat ? "#c45028" : "#c4a040") : "rgba(120,90,40,.25)"}`,
              borderRadius: 2,
              color: on ? (combat ? "#ffcc88" : "#ffe080") : "#7a6a48",
              fontSize: 8.5, fontFamily:"'Cinzel',serif",
              fontWeight: on ? 700 : 500, letterSpacing:.5, textTransform:"uppercase",
              whiteSpace:"nowrap", cursor:"pointer",
              boxShadow: on ? `0 0 6px ${combat ? "rgba(196,80,40,.6)" : "rgba(196,160,60,.5)"}` : "none",
            }}>{MD_PHASE_SHORT[p]}</div>
        );
      })}
    </div>
  );
}

// ─── Player banner (life + zone chips + mana pool) ──────────────────────────
function MPlayerBanner({ side, p, label }) {
  const isOpp = side === "opp";
  const accent = isOpp ? "#c45040" : "#7ab84a";
  const lifeColor = p.life <= 5 ? "#ff3030" : p.life <= 10 ? "#e0703a" : (isOpp ? "#ff9070" : "#a8e070");
  const manaTot = Object.values(p.mana).reduce((a,b)=>a+b, 0);

  return (
    <div style={{
      padding:"6px 10px",
      background: isOpp
        ? "linear-gradient(90deg, rgba(60,20,10,.65), rgba(40,12,6,.4), rgba(60,20,10,.65))"
        : "linear-gradient(90deg, rgba(20,40,10,.65), rgba(14,28,6,.4), rgba(20,40,10,.65))",
      borderTop: `1px solid ${isOpp ? "rgba(180,80,30,.35)" : "rgba(80,140,40,.35)"}`,
      borderBottom: `1px solid ${isOpp ? "rgba(180,80,30,.35)" : "rgba(80,140,40,.35)"}`,
      display:"flex", alignItems:"center", gap:8,
    }}>
      {/* Life block */}
      <div style={{ display:"flex", alignItems:"center", gap:6, minWidth:0 }}>
        <div style={{ display:"flex", flexDirection:"column", lineHeight:1, gap:1 }}>
          <span style={{ fontSize:7.5, color:accent, fontFamily:"'Cinzel',serif", fontWeight:700, letterSpacing:1.5, textShadow:`0 0 5px ${accent}66` }}>
            {(label || (isOpp ? "OPPONENT" : "YOU")).toUpperCase()}
          </span>
          <span style={{ fontSize:8, color:"#7a6a48", fontStyle:"italic", fontFamily:"'Crimson Text',serif" }}>Life</span>
        </div>
        <div style={{ position:"relative", display:"flex", alignItems:"baseline" }}>
          <span style={{
            fontSize:30, fontFamily:"'Cinzel',serif", fontWeight:700,
            color: lifeColor, lineHeight:1,
            textShadow:`0 0 10px ${lifeColor}55, 0 2px 3px rgba(0,0,0,.9)`,
            animation: p.life <= 5 ? "pulse 1s infinite" : "none",
          }}>{p.life}</span>
          <span style={{ fontSize:9, color:"#5a4a30", marginLeft:1, fontFamily:"'Crimson Text',serif" }}>/{p.max}</span>
        </div>
        {/* Mini life bar */}
        <div style={{ width:32, height:6, background:"#0a0604", borderRadius:1,
          border:"1px solid rgba(120,90,40,.4)", overflow:"hidden",
          boxShadow:"inset 0 1px 2px rgba(0,0,0,.8)" }}>
          <div style={{
            width:`${Math.max(0,(p.life/p.max)*100)}%`, height:"100%",
            background: p.life <= 5
              ? "linear-gradient(90deg, #c41818, #ee3030)"
              : isOpp
              ? "linear-gradient(90deg, #8a2818, #c45028)"
              : "linear-gradient(90deg, #2a8030, #5ac040)",
          }} />
        </div>
      </div>

      {/* Zone counts */}
      <div style={{ display:"flex", gap:4 }}>
        <MZoneChip glyph="📚" count={p.lib} label="LIB" />
        <MZoneChip glyph="🪦" count={p.gy} label="GY" />
        {isOpp && p.handCount !== undefined && (
          <MZoneChip glyph="🂠" count={p.handCount} label="HAND" />
        )}
      </div>

      <div style={{ flex:1 }} />

      {/* Mana pool */}
      {manaTot > 0 ? (
        <div style={{ display:"flex", alignItems:"center", gap:3, padding:"3px 6px",
          background:"rgba(0,0,0,.4)", border:"1px solid rgba(120,90,40,.3)", borderRadius:2 }}>
          <span style={{ fontSize:6.5, color:"#7a6a48", fontFamily:"'Cinzel',serif", letterSpacing:.8 }}>POOL</span>
          <MPool pool={p.mana} size={11} />
        </div>
      ) : (
        <span style={{ fontSize:7, color:"#5a4a30", fontFamily:"'Cinzel',serif", letterSpacing:1, fontStyle:"italic" }}>NO MANA</span>
      )}
    </div>
  );
}

// ─── Battlefield row (header + horizontally-scrollable card row) ────────────
function MRow({ label, count, accent, children, minH = 96, dashed = true, bgFade }) {
  return (
    <div style={{
      flexShrink:0,
      background: bgFade || "transparent",
      borderBottom: dashed ? "1px dashed rgba(120,90,40,.18)" : "1px solid rgba(120,90,40,.2)",
    }}>
      <div style={{ padding:"3px 10px 2px", display:"flex", alignItems:"center", justifyContent:"space-between", background:"rgba(0,0,0,.22)" }}>
        <span style={{ fontSize:7.5, color:accent || "#7a6a48", fontFamily:"'Cinzel',serif", letterSpacing:1.2, fontWeight:600 }}>
          {label}
        </span>
        <span style={{ fontSize:7.5, color:"#5a4a30", fontFamily:"'Fira Code',monospace" }}>
          {count}
        </span>
      </div>
      <div style={{
        padding:"4px 8px",
        display:"flex", gap:4, alignItems:"flex-start",
        overflowX:"auto", overflowY:"hidden", minHeight: minH,
        scrollbarWidth:"none",
      }}>
        <style>{`.md-row::-webkit-scrollbar { display: none; }`}</style>
        {children}
      </div>
    </div>
  );
}

function MPipRow({ label, count, accent, children }) {
  return (
    <div style={{
      flexShrink:0,
      borderBottom:"1px dashed rgba(120,90,40,.18)",
    }}>
      <div style={{ padding:"3px 10px 2px", display:"flex", alignItems:"center", justifyContent:"space-between", background:"rgba(0,0,0,.22)" }}>
        <span style={{ fontSize:7.5, color:accent || "#7a6a48", fontFamily:"'Cinzel',serif", letterSpacing:1.2, fontWeight:600 }}>
          {label}
        </span>
        <span style={{ fontSize:7.5, color:"#5a4a30", fontFamily:"'Fira Code',monospace" }}>{count}</span>
      </div>
      <div style={{ padding:"4px 8px", display:"flex", gap:3, flexWrap:"wrap", minHeight:34 }}>
        {children}
      </div>
    </div>
  );
}

// ─── Top chrome (turn / phase ticker / log button / forfeit) ───────────────
function MTopChrome({ turn, phase, onOpenLog, onOpenMenu, ruleset }) {
  return (
    <div style={{
      flexShrink:0,
      background:"linear-gradient(180deg, rgba(0,0,0,.92), rgba(20,12,6,.75))",
      borderBottom:"1px solid rgba(180,140,70,.3)",
    }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"6px 10px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:6, minWidth:0 }}>
          <span style={{ fontSize:11, fontFamily:"'Cinzel',serif", color:"#c4a040", fontWeight:700, letterSpacing:1.8, textShadow:"0 0 6px rgba(196,160,64,.3)" }}>SHANDALAR</span>
          <span style={{ fontSize:9, color:"#5a4a30" }}>·</span>
          <span style={{ fontSize:9, color:"#c4a040", fontFamily:"'Fira Code',monospace", padding:"1px 5px",
            background:"rgba(196,160,64,.1)", border:"1px solid rgba(196,160,64,.3)", borderRadius:2 }}>
            T{turn}
          </span>
          <span style={{ fontSize:9, color:"#7ab84a", fontFamily:"'Cinzel',serif", letterSpacing:.8 }}>YOUR TURN</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:5 }}>
          <button onClick={onOpenLog}
            style={{ background:"rgba(196,160,64,.12)", border:"1px solid rgba(196,160,64,.35)",
              color:"#e0c060", padding:"3px 8px", borderRadius:2,
              fontFamily:"'Cinzel',serif", fontSize:9, letterSpacing:1, cursor:"pointer",
              display:"flex", alignItems:"center", gap:4 }}>
            <span>📜</span> LOG
          </button>
          <button onClick={onOpenMenu}
            style={{ background:"rgba(60,20,12,.5)", border:"1px solid rgba(168,80,48,.5)",
              color:"#e07050", padding:"3px 7px", borderRadius:2,
              fontFamily:"'Cinzel',serif", fontSize:9, letterSpacing:.8, cursor:"pointer" }}>
            ⋯
          </button>
        </div>
      </div>
      <MPhaseBar phase={phase} />
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", padding:"2px 0",
        background:"linear-gradient(180deg, rgba(60,40,16,.4), transparent)" }}>
        <span style={{ fontSize:8, color:"#7a6a48", fontFamily:"'Cinzel',serif", letterSpacing:1.5 }}>PHASE</span>
        <span style={{ fontSize:8, color:"#5a4a30", margin:"0 4px" }}>·</span>
        <span style={{ fontSize:10, fontFamily:"'Cinzel',serif", color:"#ffe080", fontWeight:700, letterSpacing:1, textShadow:"0 0 5px rgba(255,224,128,.4)", textTransform:"uppercase" }}>
          {MD_PHASE_LBL[phase] || phase}
        </span>
      </div>
    </div>
  );
}

// ─── Action bar (context-aware) ─────────────────────────────────────────────
// sel: null | { iid, zone: 'hand' | 'bf', card }
function MActionBar({ sel, onCast, onActivate, onCancel, onPass, onEnd }) {
  const baseBtn = {
    padding:"7px 6px", borderRadius:2,
    fontFamily:"'Cinzel',serif", fontSize:10, fontWeight:600,
    letterSpacing:.8, textTransform:"uppercase", cursor:"pointer",
    textShadow:"0 1px 2px rgba(0,0,0,.7)",
  };
  const btn = (color, bg, label, onClick, primary, flexVal) => (
    <button onClick={onClick} style={{
      ...baseBtn,
      flex: flexVal || 1,
      background: bg, border:`1px solid ${color}`,
      color: primary ? "#ffe080" : "#e8dcb0",
      boxShadow: primary ? `0 0 8px ${color}55, inset 0 1px 0 rgba(255,255,255,.07)` : "inset 0 1px 0 rgba(255,255,255,.05)",
    }}>{label}</button>
  );

  // No selection — phase actions
  if (!sel) {
    return (
      <div style={{
        flexShrink:0, display:"flex", gap:4, padding:"6px 8px",
        background:"linear-gradient(180deg, #1a1410, #0c0806)",
        borderTop:"1px solid rgba(180,140,70,.3)",
        borderBottom:"1px solid rgba(180,140,70,.2)",
      }}>
        {btn("#7a5a30", "linear-gradient(180deg, #2a2218, #14100a)", "Pass Priority", onPass)}
        {btn("#a85030", "linear-gradient(180deg, #3a2018, #1c0e0a)", "End Turn ▸", onEnd, true)}
      </div>
    );
  }

  // Hand card selected — big prominent play/cast button
  if (sel.zone === "hand") {
    const card = sel.card;
    const isLand = card.type === "Land";
    const verb = isLand ? "▸ PLAY" : "✦ CAST";
    const accent = isLand ? "#7ab84a" : "#ffd060";
    const bg = isLand
      ? "linear-gradient(180deg, #2a4a18, #14280a)"
      : "linear-gradient(180deg, #5a4218, #2a1e0a)";
    return (
      <div style={{
        flexShrink:0, display:"flex", gap:5, padding:"8px 8px",
        background:"linear-gradient(180deg, #1a1410, #0c0806)",
        borderTop:`1.5px solid ${accent}88`,
        borderBottom:"1px solid rgba(180,140,70,.2)",
        boxShadow:`inset 0 10px 22px -10px ${accent}40`,
      }}>
        <button onClick={onCast} style={{
          ...baseBtn,
          flex: 3,
          background: bg,
          border:`1.5px solid ${accent}`,
          color: isLand ? "#dcffb8" : "#ffe080",
          fontSize:12, padding:"10px 8px",
          letterSpacing:1, fontWeight:700,
          boxShadow:`0 0 16px ${accent}66, inset 0 1px 0 rgba(255,255,255,.12)`,
          animation:"mdPlayPulse 1.4s ease-in-out infinite",
          display:"flex", alignItems:"center", justifyContent:"center", gap:6,
        }}>
          <span style={{ fontSize:13, letterSpacing:1.2 }}>{verb}</span>
          <span style={{
            fontSize:11, fontWeight:600, opacity:.95,
            maxWidth:140, overflow:"hidden", whiteSpace:"nowrap", textOverflow:"ellipsis",
            textTransform:"none", letterSpacing:.3,
          }}>{card.name}</span>
        </button>
        {btn("rgba(120,90,40,.5)", "transparent", "Cancel", onCancel, false, 1)}
      </div>
    );
  }

  // Battlefield card selected — activate / target
  return (
    <div style={{
      flexShrink:0, display:"flex", gap:4, padding:"6px 8px",
      background:"linear-gradient(180deg, #1a1410, #0c0806)",
      borderTop:"1px solid rgba(196,160,64,.4)",
      borderBottom:"1px solid rgba(180,140,70,.2)",
    }}>
      {btn("#c4a040", "linear-gradient(180deg, #4a3a18, #2a1e0a)", "⚡ Activate", onActivate, true, 3)}
      {btn("rgba(120,90,40,.5)", "transparent", "Cancel", onCancel, false, 1)}
    </div>
  );
}

// ─── Log drawer (bottom sheet) ─────────────────────────────────────────────
function MLogDrawer({ open, onClose, log, peek = false }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (open && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [open, log.length]);

  const colors = {
    turn: "#c4a040", phase: "#7a8a9a", play: "#a8e070", opp_play: "#ff9070",
    damage: "#ff5a3a", heal: "#7ad0a0", info: "#a89878", system: "#c4a040",
  };

  if (peek && !open) {
    const tail = log.slice(-2);
    return (
      <div style={{
        flexShrink:0, padding:"4px 10px",
        background:"linear-gradient(180deg, rgba(20,12,8,.85), rgba(10,6,4,.95))",
        borderTop:"1px solid rgba(196,160,64,.2)",
        display:"flex", flexDirection:"column", gap:1, maxHeight:34, overflow:"hidden",
      }}>
        {tail.map((e, i) => (
          <div key={i} style={{
            fontSize:9, color: colors[e.kind] || "#a89878",
            fontFamily: e.kind === "turn" ? "'Cinzel',serif" : "'Crimson Text',serif",
            fontWeight: e.kind === "turn" ? 700 : 400,
            letterSpacing: e.kind === "turn" ? 1 : 0,
            textTransform: e.kind === "turn" ? "uppercase" : "none",
            opacity: i === tail.length - 1 ? 1 : 0.65,
            whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis",
          }}>{e.text}</div>
        ))}
      </div>
    );
  }

  return (
    <div style={{
      position:"absolute", inset:0,
      pointerEvents: open ? "auto" : "none",
      background: open ? "rgba(0,0,0,.55)" : "transparent",
      transition:"background .25s",
      zIndex:20,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{
          position:"absolute", left:0, right:0, bottom:0,
          height:"60%",
          background:"linear-gradient(180deg, #14100a, #0c0806)",
          borderTop:"1px solid rgba(196,160,64,.4)",
          borderRadius:"10px 10px 0 0",
          transform: open ? "translateY(0)" : "translateY(100%)",
          transition:"transform .28s cubic-bezier(.3,1.1,.5,1)",
          display:"flex", flexDirection:"column",
          boxShadow:"0 -10px 30px rgba(0,0,0,.7)",
        }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"10px 14px 8px",
          borderBottom:"1px solid rgba(196,160,64,.2)",
          background:"linear-gradient(90deg, rgba(196,160,64,.08), transparent)",
        }}>
          <div>
            <div style={{ fontSize:12, color:"#c4a040", fontFamily:"'Cinzel',serif", letterSpacing:2, fontWeight:700, textShadow:"0 0 6px rgba(196,160,64,.4)" }}>CHRONICLE</div>
            <div style={{ fontSize:9, color:"#7a6a48", fontStyle:"italic", marginTop:1 }}>The duel unfolds…</div>
          </div>
          <button onClick={onClose} style={{
            background:"rgba(60,20,12,.5)", border:"1px solid rgba(168,80,48,.5)",
            color:"#e07050", padding:"4px 12px", borderRadius:2,
            fontFamily:"'Cinzel',serif", fontSize:10, letterSpacing:1, cursor:"pointer",
          }}>✕ CLOSE</button>
        </div>
        <div ref={ref} style={{
          flex:1, overflow:"auto", padding:"8px 14px",
          fontFamily:"'Crimson Text',serif", fontSize:11.5, lineHeight:1.4,
          background:"linear-gradient(180deg, #0c0806, #080604)",
        }}>
          {log.map((e, i) => (
            <div key={i} style={{
              color: colors[e.kind] || "#a89878",
              marginBottom:3,
              opacity: i === log.length - 1 ? 1 : 0.85,
              paddingLeft: e.kind === "turn" ? 0 : 8,
              borderLeft: e.kind === "turn" ? "none" : `2px solid ${(colors[e.kind] || "#5a4a32")}33`,
              fontStyle: e.kind === "phase" ? "italic" : "normal",
              fontWeight: e.kind === "turn" ? 700 : 400,
              textTransform: e.kind === "turn" ? "uppercase" : "none",
              letterSpacing: e.kind === "turn" ? 1.2 : 0,
              fontSize: e.kind === "turn" ? 10 : 11.5,
              fontFamily: e.kind === "turn" ? "'Cinzel',serif" : "'Crimson Text',serif",
            }}>
              {e.kind === "turn" && "═══ "}{e.text}{e.kind === "turn" && " ═══"}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── MOBILE DUEL (variant A — stack with log peek) ─────────────────────────
function MobileDuel({ initialState }) {
  const [s, setS] = React.useState(initialState || MD_MOCK);
  const [sel, setSel] = React.useState(null); // { iid, zone, card } | null
  const [logOpen, setLogOpen] = React.useState(false);

  const tap = (card, zone) => setSel(prev => prev && prev.iid === card.iid ? null : { iid: card.iid, zone, card });
  const selCard = sel ? sel.iid : null;
  const passPhase = () => {
    const i = MD_PHASE_SEQ.indexOf(s.phase);
    setS({ ...s, phase: MD_PHASE_SEQ[(i+1) % MD_PHASE_SEQ.length] });
  };
  const endTurn = () => {
    setS({ ...s, phase: "CLEANUP" });
    setTimeout(() => setS(st => ({ ...st, phase:"UNTAP", turn: st.turn + 1 })), 350);
  };

  return (
    <div style={{
      width:"100%", height:"100%", position:"relative",
      background:"radial-gradient(ellipse at 50% 50%, #1a1208 0%, #0a0604 70%, #050302 100%)",
      color:"#e8dcb0", fontFamily:"'Crimson Text',serif",
      display:"flex", flexDirection:"column", overflow:"hidden",
    }}>
      {/* TOP CHROME */}
      <MTopChrome turn={s.turn} phase={s.phase}
        onOpenLog={() => setLogOpen(true)}
        onOpenMenu={() => {}} />

      {/* OPP BANNER */}
      <MPlayerBanner side="opp" p={s.o} />

      {/* BATTLEFIELD — Opp (lands → perms → creatures, closing toward center) */}
      <MPipRow label="OPP · LANDS" count={s.o.lands.length} accent="#c45040">
        {s.o.lands.map(c =>
          <MLandPip key={c.iid} card={c} tapped={c.tapped}
            selected={selCard === c.iid}
            onClick={() => tap(c, "bf")} />
        )}
      </MPipRow>
      <MRow label="OPP · OTHER PERMANENTS" count={s.o.perms.length}
        accent="#c45040"
        bgFade="linear-gradient(180deg, rgba(40,16,8,.25), rgba(20,8,6,.3))"
        minH={76}>
        {s.o.perms.length === 0
          ? <span style={{ fontSize:8, color:"#5a4a30", fontStyle:"italic", padding:"22px 0", margin:"auto" }}>none</span>
          : s.o.perms.map(c =>
              <MFieldCard key={c.iid} card={c} density="perm"
                selected={selCard === c.iid}
                onClick={() => tap(c, "bf")} />
            )}
      </MRow>
      <MRow label="OPP · CREATURES" count={s.o.creatures.length}
        accent="#c45040"
        bgFade="linear-gradient(180deg, rgba(40,16,8,.35), rgba(20,8,6,.4))"
        minH={96}>
        {s.o.creatures.length === 0
          ? <span style={{ fontSize:8, color:"#5a4a30", fontStyle:"italic", padding:"30px 0", margin:"auto" }}>none</span>
          : s.o.creatures.map(c =>
              <MFieldCard key={c.iid} card={c}
                selected={selCard === c.iid}
                onClick={() => tap(c, "bf")} />
            )}
      </MRow>

      {/* PHASE DIVIDER */}
      <div style={{
        flexShrink:0, padding:"3px 0", textAlign:"center",
        background:"linear-gradient(180deg, rgba(60,20,10,.4), rgba(20,40,10,.4))",
        borderTop:"1px solid rgba(180,140,70,.25)",
        borderBottom:"1px solid rgba(180,140,70,.25)",
        position:"relative",
      }}>
        <span style={{ fontSize:8, color:"#c4a040", fontFamily:"'Cinzel',serif", letterSpacing:2, fontWeight:600 }}>
          ⟡  BATTLEFIELD  ⟡
        </span>
      </div>

      {/* BATTLEFIELD — You (creatures meet at center, lands at outer edge) */}
      <MRow label="YOUR · CREATURES" count={s.p.creatures.length}
        accent="#7ab84a"
        bgFade="linear-gradient(180deg, rgba(20,40,10,.4), rgba(14,28,6,.45))"
        minH={96}>
        {s.p.creatures.length === 0
          ? <span style={{ fontSize:8, color:"#5a4a30", fontStyle:"italic", padding:"30px 0", margin:"auto" }}>none</span>
          : s.p.creatures.map(c =>
              <MFieldCard key={c.iid} card={c}
                selected={selCard === c.iid}
                attacking={c.attacking}
                tapped={c.tapped}
                onClick={() => tap(c, "bf")} />
            )}
      </MRow>
      <MRow label="YOUR · OTHER PERMANENTS" count={s.p.perms.length}
        accent="#7ab84a"
        bgFade="linear-gradient(180deg, rgba(20,28,12,.3), rgba(14,18,8,.4))"
        minH={76}>
        {s.p.perms.length === 0
          ? <span style={{ fontSize:8, color:"#5a4a30", fontStyle:"italic", padding:"22px 0", margin:"auto" }}>none</span>
          : s.p.perms.map(c =>
              <MFieldCard key={c.iid} card={c} density="perm"
                selected={selCard === c.iid}
                onClick={() => tap(c, "bf")} />
            )}
      </MRow>
      <MPipRow label="YOUR LANDS" count={s.p.lands.length} accent="#7ab84a">
        {s.p.lands.map(c =>
          <MLandPip key={c.iid} card={c} tapped={c.tapped} isPlayer
            selected={selCard === c.iid}
            onClick={() => tap(c, "bf")} />
        )}
      </MPipRow>

      {/* YOU BANNER */}
      <MPlayerBanner side="you" p={s.p} />

      {/* ACTION BAR */}
      <MActionBar
        sel={sel}
        onCast={() => { alert("Cast " + (sel && sel.card.name)); setSel(null); }}
        onCancel={() => setSel(null)}
        onActivate={() => { alert("Activate " + (sel && sel.card.name)); setSel(null); }}
        onPass={passPhase}
        onEnd={endTurn}
      />

      {/* LOG PEEK */}
      <MLogDrawer log={s.log} peek open={false} onClose={() => setLogOpen(false)} />

      {/* PLAYER HAND */}
      <div style={{
        flexShrink:0, position:"relative",
        padding:"0 0 6px",
        background:"linear-gradient(180deg, rgba(20,40,10,.55), rgba(14,28,6,.8))",
        borderTop:"1.5px solid rgba(122,184,74,.45)",
        boxShadow:"inset 0 18px 28px -18px rgba(122,184,74,.5), 0 -4px 14px rgba(0,0,0,.5)",
      }}>
        {/* Hand header strip */}
        <div style={{
          display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"4px 10px 2px",
          background:"linear-gradient(90deg, rgba(122,184,74,.18), rgba(20,40,10,.4), rgba(122,184,74,.18))",
          borderBottom:"1px solid rgba(122,184,74,.25)",
        }}>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <span style={{ fontSize:9, color:"#a8d870", fontFamily:"'Cinzel',serif", letterSpacing:1.5, fontWeight:700, textShadow:"0 0 5px rgba(122,184,74,.4)" }}>
              YOUR HAND
            </span>
            <span style={{
              fontSize:9.5, color:"#dcffb8", fontFamily:"'Fira Code',monospace", fontWeight:600,
              padding:"1px 6px",
              background:"rgba(20,40,10,.7)",
              border:"1px solid rgba(122,184,74,.4)",
              borderRadius:8,
            }}>{s.p.hand.length}</span>
          </div>
          <span style={{ fontSize:7.5, color:"#7a9858", fontFamily:"'Crimson Text',serif", fontStyle:"italic" }}>
            tap a card to play
          </span>
        </div>
        {/* Cards row — extra top padding to clear lift animation */}
        <div style={{
          display:"flex", gap:5, alignItems:"flex-end",
          overflowX:"auto", padding:"22px 8px 4px",
          scrollbarWidth:"none",
        }}>
          {s.p.hand.map(c => {
            const playable = c.type === "Land" || c.type === "Instant" || (c.type === "Creature" && c.cost === "G");
            return (
              <MHandCard key={c.iid} card={c}
                selected={selCard === c.iid}
                playable={playable}
                onClick={() => tap(c, "hand")} />
            );
          })}
        </div>
      </div>

      {/* LOG DRAWER OVERLAY (open state) */}
      <MLogDrawer log={s.log} open={logOpen} onClose={() => setLogOpen(false)} />
    </div>
  );
}

// ─── MOBILE DUEL (variant B — compact, denser, log via full sheet only) ─────
function MobileDuelCompact({ initialState }) {
  const [s, setS] = React.useState(initialState || MD_MOCK);
  const [sel, setSel] = React.useState(null);
  const [logOpen, setLogOpen] = React.useState(false);

  const tap = (card, zone) => setSel(prev => prev && prev.iid === card.iid ? null : { iid: card.iid, zone, card });
  const selCard = sel ? sel.iid : null;
  const passPhase = () => {
    const i = MD_PHASE_SEQ.indexOf(s.phase);
    setS({ ...s, phase: MD_PHASE_SEQ[(i+1) % MD_PHASE_SEQ.length] });
  };
  const endTurn = () => {
    setS({ ...s, phase: "CLEANUP" });
    setTimeout(() => setS(st => ({ ...st, phase:"UNTAP", turn: st.turn + 1 })), 350);
  };

  // Combine perms + lands into a single "Other Permanents" row, smaller cards everywhere.
  return (
    <div style={{
      width:"100%", height:"100%", position:"relative",
      background:"radial-gradient(ellipse at 50% 50%, #1a1208 0%, #0a0604 70%, #050302 100%)",
      color:"#e8dcb0", fontFamily:"'Crimson Text',serif",
      display:"flex", flexDirection:"column", overflow:"hidden",
    }}>
      <MTopChrome turn={s.turn} phase={s.phase}
        onOpenLog={() => setLogOpen(true)}
        onOpenMenu={() => {}} />
      <MPlayerBanner side="opp" p={s.o} />

      {/* Opp lands → perms → creatures (closing toward center) */}
      <MPipRow label="OPP · LANDS" count={s.o.lands.length} accent="#c45040">
        {s.o.lands.map(c =>
          <MLandPip key={c.iid} card={c} tapped={c.tapped}
            selected={selCard === c.iid}
            onClick={() => tap(c, "bf")} />
        )}
      </MPipRow>
      <MRow label="OPP · PERMANENTS" count={s.o.perms.length}
        accent="#c45040"
        bgFade="linear-gradient(180deg, rgba(40,16,8,.25), rgba(20,8,6,.3))"
        minH={76}>
        {s.o.perms.length === 0
          ? <span style={{ fontSize:8, color:"#5a4a30", fontStyle:"italic", padding:"22px 0", margin:"auto" }}>none</span>
          : s.o.perms.map(c =>
              <MFieldCard key={c.iid} card={c} density="perm"
                selected={selCard === c.iid}
                onClick={() => tap(c, "bf")} />
            )}
      </MRow>
      <MRow label="OPP · CREATURES" count={s.o.creatures.length}
        accent="#c45040"
        bgFade="linear-gradient(180deg, rgba(40,16,8,.35), rgba(20,8,6,.4))"
        minH={84}>
        {s.o.creatures.length === 0
          ? <span style={{ fontSize:8, color:"#5a4a30", fontStyle:"italic", padding:"26px 0", margin:"auto" }}>none</span>
          : s.o.creatures.map(c =>
              <MFieldCard key={c.iid} card={c} density="perm"
                selected={selCard === c.iid}
                onClick={() => tap(c, "bf")} />
            )}
      </MRow>

      <div style={{
        flexShrink:0, padding:"3px 0", textAlign:"center",
        background:"linear-gradient(180deg, rgba(60,20,10,.4), rgba(20,40,10,.4))",
        borderTop:"1px solid rgba(180,140,70,.25)",
        borderBottom:"1px solid rgba(180,140,70,.25)",
      }}>
        <span style={{ fontSize:8, color:"#c4a040", fontFamily:"'Cinzel',serif", letterSpacing:2, fontWeight:600 }}>
          ⟡  BATTLEFIELD  ⟡
        </span>
      </div>

      <MRow label="YOUR · CREATURES" count={s.p.creatures.length}
        accent="#7ab84a"
        bgFade="linear-gradient(180deg, rgba(20,40,10,.4), rgba(14,28,6,.45))"
        minH={96}>
        {s.p.creatures.length === 0
          ? <span style={{ fontSize:8, color:"#5a4a30", fontStyle:"italic", padding:"30px 0", margin:"auto" }}>none</span>
          : s.p.creatures.map(c =>
              <MFieldCard key={c.iid} card={c}
                selected={selCard === c.iid}
                onClick={() => tap(c, "bf")} />
            )}
      </MRow>
      <MRow label="YOUR · PERMANENTS" count={s.p.perms.length}
        accent="#7ab84a"
        bgFade="linear-gradient(180deg, rgba(20,28,12,.3), rgba(14,18,8,.4))"
        minH={76}>
        {s.p.perms.length === 0
          ? <span style={{ fontSize:8, color:"#5a4a30", fontStyle:"italic", padding:"22px 0", margin:"auto" }}>none</span>
          : s.p.perms.map(c =>
              <MFieldCard key={c.iid} card={c} density="perm"
                selected={selCard === c.iid}
                onClick={() => tap(c, "bf")} />
            )}
      </MRow>
      <MPipRow label="YOUR LANDS" count={s.p.lands.length} accent="#7ab84a">
        {s.p.lands.map(c =>
          <MLandPip key={c.iid} card={c} tapped={c.tapped} isPlayer
            selected={selCard === c.iid}
            onClick={() => tap(c, "bf")} />
        )}
      </MPipRow>

      <MPlayerBanner side="you" p={s.p} />
      <MActionBar
        sel={sel}
        onCast={() => { alert("Cast " + (sel && sel.card.name)); setSel(null); }}
        onCancel={() => setSel(null)}
        onActivate={() => { alert("Activate " + (sel && sel.card.name)); setSel(null); }}
        onPass={passPhase}
        onEnd={endTurn}
      />

      {/* Hand */}
      <div style={{
        flexShrink:0, position:"relative",
        padding:"0 0 6px",
        background:"linear-gradient(180deg, rgba(20,40,10,.55), rgba(14,28,6,.8))",
        borderTop:"1.5px solid rgba(122,184,74,.45)",
        boxShadow:"inset 0 18px 28px -18px rgba(122,184,74,.5), 0 -4px 14px rgba(0,0,0,.5)",
      }}>
        <div style={{
          display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"4px 10px 2px",
          background:"linear-gradient(90deg, rgba(122,184,74,.18), rgba(20,40,10,.4), rgba(122,184,74,.18))",
          borderBottom:"1px solid rgba(122,184,74,.25)",
        }}>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <span style={{ fontSize:9, color:"#a8d870", fontFamily:"'Cinzel',serif", letterSpacing:1.5, fontWeight:700, textShadow:"0 0 5px rgba(122,184,74,.4)" }}>
              YOUR HAND
            </span>
            <span style={{
              fontSize:9.5, color:"#dcffb8", fontFamily:"'Fira Code',monospace", fontWeight:600,
              padding:"1px 6px",
              background:"rgba(20,40,10,.7)",
              border:"1px solid rgba(122,184,74,.4)",
              borderRadius:8,
            }}>{s.p.hand.length}</span>
          </div>
          <span style={{ fontSize:7.5, color:"#7a9858", fontFamily:"'Crimson Text',serif", fontStyle:"italic" }}>
            tap a card to play
          </span>
        </div>
        <div style={{
          display:"flex", gap:5, alignItems:"flex-end",
          overflowX:"auto", padding:"22px 8px 4px",
          scrollbarWidth:"none",
        }}>
          {s.p.hand.map(c => {
            const playable = c.type === "Land" || c.type === "Instant" || (c.type === "Creature" && c.cost === "G");
            return (
              <MHandCard key={c.iid} card={c}
                selected={selCard === c.iid}
                playable={playable}
                onClick={() => tap(c, "hand")} />
            );
          })}
        </div>
      </div>

      <MLogDrawer log={s.log} open={logOpen} onClose={() => setLogOpen(false)} />
    </div>
  );
}

Object.assign(window, { MobileDuel, MobileDuelCompact, MD_MOCK });
