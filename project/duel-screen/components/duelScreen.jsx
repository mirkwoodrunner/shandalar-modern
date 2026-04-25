// duel-screen/components/duelScreen.jsx
// Main DuelScreen prototype — with tweakable targeting arrows.

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "arrowColor": "#ffd060",
  "arrowThickness": 3,
  "arrowStyle": "solid",
  "arrowGlow": true,
  "arrowAnimate": true,
  "scenario": "spell-creature"
}/*EDITMODE-END*/;

const MOCK_STATE = {
  turn: 4,
  active: "p",
  phase: "MAIN_1",
  selCard: null,
  selTgt: null,
  attackers: [],
  ruleset: { name: "Modern", startingLife: 20, manaBurn: false },
  p: {
    life: 17, lifeAnim: null, max: 20,
    mana: { W:0, U:0, B:0, R:0, G:2, C:0 },
    lib: 32, gy: 4, exile: 0,
    hand: [
      { iid:"h1", name:"Wandering Eremite", cost:"2W", type:"Creature", subtype:"Human Cleric", color:"W", power:2, toughness:3, text:"When this enters, gain 2 life." },
      { iid:"h2", name:"Counterspell", cost:"UU", type:"Instant", color:"U", text:"Counter target spell." },
      { iid:"h3", name:"Forest", cost:"", type:"Land", subtype:"Forest", color:"G", produces:["G"], text:"" },
      { iid:"h4", name:"Wraith of Cinders", cost:"3BB", type:"Creature", subtype:"Spirit", color:"B", power:5, toughness:4, text:"Flying. Whenever this deals damage, opponent discards." },
      { iid:"h5", name:"Lightning Strike", cost:"1R", type:"Instant", color:"R", text:"Deal 3 damage to any target." },
      { iid:"h6", name:"Verdant Growth", cost:"1G", type:"Sorcery", color:"G", text:"Search your library for a basic land." },
    ],
    bf: [
      { iid:"pl1", name:"Forest", type:"Land", subtype:"Forest", color:"G", produces:["G"], tapped:true },
      { iid:"pl2", name:"Forest", type:"Land", subtype:"Forest", color:"G", produces:["G"], tapped:true },
      { iid:"pl3", name:"Mountain", type:"Land", subtype:"Mountain", color:"R", produces:["R"], tapped:false },
      { iid:"pl4", name:"Mountain", type:"Land", subtype:"Mountain", color:"R", produces:["R"], tapped:false },
      { iid:"pc1", name:"Llanowar Elves", cost:"G", type:"Creature", subtype:"Elf Druid", color:"G", power:1, toughness:1, text:"{T}: Add {G}.", tapped:true },
      { iid:"pc2", name:"Grizzled Outrider", cost:"2G", type:"Creature", subtype:"Centaur Warrior", color:"G", power:3, toughness:3, text:"Trample." },
      { iid:"pc3", name:"Hearth Wraith", cost:"3R", type:"Creature", subtype:"Spirit", color:"R", power:3, toughness:2, text:"Haste.", summoningSick:true },
    ],
  },
  o: {
    life: 12, lifeAnim: null, max: 20,
    mana: { W:0, U:0, B:0, R:0, G:0, C:0 },
    lib: 28, gy: 6, exile: 0,
    hand: [1,2,3,4,5],
    bf: [
      { iid:"ol1", name:"Swamp", type:"Land", subtype:"Swamp", color:"B", produces:["B"], tapped:false },
      { iid:"ol2", name:"Swamp", type:"Land", subtype:"Swamp", color:"B", produces:["B"], tapped:false },
      { iid:"ol3", name:"Swamp", type:"Land", subtype:"Swamp", color:"B", produces:["B"], tapped:false },
      { iid:"ol4", name:"Bog Isle", type:"Land", color:"U", produces:["U","B"], tapped:true },
      { iid:"oc1", name:"Carrion Hound", cost:"2B", type:"Creature", subtype:"Zombie Hound", color:"B", power:3, toughness:2, text:"Menace." },
      { iid:"oc2", name:"Drowned Sage", cost:"1UB", type:"Creature", subtype:"Specter", color:"U", power:2, toughness:2, text:"Flying." },
    ],
  },
  log: [
    { kind:"turn", text:"Turn 1 — You" },
    { kind:"play", text:"You play Forest." },
    { kind:"turn", text:"Turn 1 — Opponent" },
    { kind:"opp_play", text:"Opponent plays Swamp." },
    { kind:"turn", text:"Turn 2 — You" },
    { kind:"play", text:"You cast Llanowar Elves." },
    { kind:"turn", text:"Turn 3 — Opponent" },
    { kind:"opp_play", text:"Opponent casts Drowned Sage." },
    { kind:"damage", text:"You take 2 damage. (17 life)" },
    { kind:"turn", text:"Turn 4 — You" },
    { kind:"play", text:"You play Mountain." },
    { kind:"phase", text:"Main Phase 1." },
    { kind:"play", text:"Targeting Lightning Strike → Carrion Hound." },
  ],
};

// Predefined targeting scenarios for the tweak panel
const SCENARIOS = {
  "none":            { label: "None", source: null, target: null, log: "" },
  "spell-creature":  { label: "Spell → Opp Creature",  source: "h5",  target: "oc1", log: "Lightning Strike → Carrion Hound" },
  "spell-player":    { label: "Spell → Opp Player",    source: "h5",  target: "player-o", log: "Lightning Strike → Opponent" },
  "creature-attack": { label: "Creature → Opp Player", source: "pc2", target: "player-o", log: "Grizzled Outrider attacks" },
  "ability-own":     { label: "Ability → Own Creature", source: "pc1", target: "pc2",   log: "Llanowar Elves boosts Outrider" },
  "opp-targets-you": { label: "Opp Creature → You",    source: "oc2", target: "player-p", log: "Drowned Sage attacks you" },
  "opp-targets-yours": { label: "Opp → Your Creature", source: "oc1", target: "pc3", log: "Carrion Hound blocks Hearth Wraith" },
};

function DuelScreen() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [state, setState] = React.useState(MOCK_STATE);
  const [hoverTarget, setHoverTarget] = React.useState(null);

  const scenario = SCENARIOS[t.scenario] || SCENARIOS.none;

  const handleCardClick = (card, zone) => {
    setState(s => {
      if (zone === "hand") {
        return { ...s, selCard: s.selCard === card.iid ? null : card.iid, selTgt: null };
      }
      return { ...s, selTgt: s.selTgt === card.iid ? null : card.iid };
    });
  };

  const handleEndTurn = () => {
    setState(s => ({ ...s, phase: "CLEANUP" }));
    setTimeout(() => setState(s => ({ ...s, phase: "UNTAP", turn: s.turn + 1 })), 400);
  };

  const handlePassPriority = () => {
    const seq = ["UNTAP","UPKEEP","DRAW","MAIN_1","COMBAT_BEGIN","COMBAT_ATTACKERS","COMBAT_BLOCKERS","COMBAT_DAMAGE","COMBAT_END","MAIN_2","END","CLEANUP"];
    const idx = seq.indexOf(state.phase);
    setState(s => ({ ...s, phase: seq[(idx + 1) % seq.length] }));
  };

  const handleCancel = () => setState(s => ({ ...s, selCard: null, selTgt: null }));

  const s = state;
  const pManaTot = Object.values(s.p.mana).reduce((a,b)=>a+b,0);
  const oManaTot = Object.values(s.o.mana).reduce((a,b)=>a+b,0);

  const fanCard = (i, n) => {
    const center = (n - 1) / 2;
    const offset = i - center;
    return { angle: offset * 4, y: Math.abs(offset) * 6 };
  };

  // Compute active arrow source/target — selected card targeting a target trumps scenario
  const arrowSource = s.selCard && s.selTgt ? s.selCard : scenario.source;
  const arrowTarget = s.selCard && s.selTgt ? s.selTgt : (s.selCard && hoverTarget ? hoverTarget : scenario.target);

  const opLands = s.o.bf.filter(c => c.type === "Land");
  const opNonLands = s.o.bf.filter(c => c.type !== "Land");
  const pLands = s.p.bf.filter(c => c.type === "Land");
  const pNonLands = s.p.bf.filter(c => c.type !== "Land");

  return (
    <div style={{
      width: "100vw", height: "100vh",
      background: `radial-gradient(ellipse at 50% 50%, #1a1208 0%, #0a0604 70%, #050302 100%)`,
      color: "#e8dcb0",
      display: "flex", flexDirection: "column", overflow: "hidden",
      fontFamily: "'Crimson Text',serif",
    }}>
      {/* TOP BAR */}
      <div style={{
        flexShrink: 0, padding: "6px 14px",
        background: "linear-gradient(180deg, rgba(0,0,0,.85), rgba(20,12,6,.7))",
        borderBottom: "1px solid rgba(180,140,70,.3)",
        display: "flex", flexDirection: "column", gap: 4,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 13, fontFamily: "'Cinzel',serif", color: "#c4a040", fontWeight: 700, letterSpacing: 2, textShadow: "0 0 8px rgba(196,160,64,.3)" }}>SHANDALAR</span>
            <span style={{ fontSize: 10, color: "#5a4a30" }}>•</span>
            <span style={{ fontSize: 11, color: "#a89878", fontFamily: "'Cinzel',serif", letterSpacing: 1 }}>{s.ruleset.name}</span>
            <span style={{ fontSize: 10, color: "#5a4a30" }}>•</span>
            <span style={{ fontSize: 11, color: "#c4a040", fontFamily: "'Fira Code',monospace", padding: "2px 8px", background: "rgba(196,160,64,.1)", border: "1px solid rgba(196,160,64,.3)", borderRadius: 2 }}>TURN {s.turn}</span>
            <span style={{ fontSize: 10, color: s.active === "p" ? "#7ab84a" : "#c45040", fontFamily: "'Cinzel',serif", letterSpacing: 1 }}>
              {s.active === "p" ? "YOUR TURN" : "Opponent thinking…"}
            </span>
          </div>
          <button style={{ background: "rgba(60,20,12,.5)", border: "1px solid rgba(168,80,48,.5)", color: "#e07050", padding: "4px 14px", borderRadius: 3, fontFamily: "'Cinzel',serif", fontSize: 10, letterSpacing: 1, cursor: "pointer" }}>Forfeit</button>
        </div>
        <PhaseBar phase={s.phase} />
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

          {/* OPP HAND */}
          <div style={{ flexShrink: 0, padding: "8px 16px 4px", display: "flex", justifyContent: "center", alignItems: "flex-start", background: "linear-gradient(180deg, rgba(40,16,8,.4), transparent)", minHeight: 70 }}>
            <div style={{ display: "flex", alignItems: "flex-start", transform: "scaleY(-1) translateY(20px)", paddingLeft: 16 }}>
              {s.o.hand.map((_, i) => {
                const { angle, y } = fanCard(i, s.o.hand.length);
                return <CardBack key={i} fanAngle={angle} fanY={y} size="sm" />;
              })}
            </div>
          </div>

          {/* OPP BANNER */}
          <div style={{ flexShrink: 0, padding: "8px 14px", background: "linear-gradient(90deg, rgba(60,20,10,.5), rgba(40,12,6,.3), rgba(60,20,10,.5))", borderTop: "1px solid rgba(180,80,30,.3)", borderBottom: "1px solid rgba(180,80,30,.3)", display: "flex", alignItems: "center", gap: 16 }}>
            <LifeTotal life={s.o.life} max={s.o.max} label="Opponent" side="opp" anim={s.o.lifeAnim} />
            <ZoneCount label="Library" count={s.o.lib} glyph="📚" />
            <ZoneCount label="Graveyard" count={s.o.gy} glyph="🪦" />
            {oManaTot > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", background: "rgba(0,0,0,.4)", border: "1px solid rgba(120,90,40,.3)", borderRadius: 3 }}>
                <span style={{ fontSize: 9, color: "#7a6a48", fontFamily: "'Cinzel',serif", letterSpacing: 1 }}>POOL</span>
                <PoolDisplay pool={s.o.mana} size={13} />
              </div>
            )}
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 10, color: "#7a6a48", fontStyle: "italic" }}>Black/Blue • Necrotic Discard</span>
          </div>

          {/* OPP BATTLEFIELD */}
          <div style={{ flexShrink: 0, background: "linear-gradient(180deg, rgba(40,16,8,.5), rgba(20,8,6,.6))", borderBottom: "1px solid rgba(120,90,40,.2)" }}>
            <div style={{ padding: "5px 14px 4px", borderBottom: "1px dashed rgba(120,90,40,.15)", background: "rgba(0,0,0,.25)" }}>
              <div style={{ fontSize: 8.5, color: "#7a6a48", fontFamily: "'Cinzel',serif", letterSpacing: 1.5, marginBottom: 4 }}>LANDS · {opLands.length}</div>
              <div style={{ display: "flex", gap: 4, minHeight: 36 }}>
                {opLands.map(c => (
                  <LandPip key={c.iid} card={c} tapped={c.tapped}
                    selected={s.selTgt === c.iid}
                    onClick={() => handleCardClick(c, "oBf")} />
                ))}
              </div>
            </div>
            <div style={{ padding: "8px 14px", minHeight: 130, display: "flex", gap: 6, alignItems: "flex-start", overflowX: "auto" }}>
              {opNonLands.map(c => (
                <div key={c.iid}
                  onMouseEnter={() => s.selCard && setHoverTarget(c.iid)}
                  onMouseLeave={() => setHoverTarget(null)}>
                  <FieldCard card={c} sm
                    selected={s.selTgt === c.iid}
                    attacking={s.attackers.includes(c.iid)}
                    tapped={c.tapped}
                    onClick={() => handleCardClick(c, "oBf")} />
                </div>
              ))}
            </div>
          </div>

          {/* DIVIDER + PHASE */}
          <div style={{ flexShrink: 0, position: "relative", height: 40, background: "linear-gradient(180deg, rgba(60,20,10,.4), rgba(20,16,8,.6), rgba(20,40,10,.4))", borderTop: "1px solid rgba(180,140,70,.4)", borderBottom: "1px solid rgba(180,140,70,.4)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "inset 0 0 16px rgba(0,0,0,.7)" }}>
            <div style={{ position: "absolute", left: 0, right: 0, top: "50%", height: 1, background: "linear-gradient(90deg, transparent, rgba(196,160,64,.5), transparent)" }} />
            <div style={{ padding: "5px 22px", background: "linear-gradient(180deg, #2a1c10, #14100a)", border: "1px solid #8a6830", borderRadius: 3, boxShadow: "0 0 16px rgba(196,160,64,.3), inset 0 1px 0 rgba(255,220,140,.15)", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 9, color: "#7a6a48", fontFamily: "'Cinzel',serif", letterSpacing: 2 }}>PHASE</span>
              <span style={{ fontSize: 10, color: "#5a4a30" }}>·</span>
              <span style={{ fontSize: 13, fontFamily: "'Cinzel',serif", color: "#ffe080", fontWeight: 700, letterSpacing: 1.5, textShadow: "0 0 8px rgba(255,224,128,.5)", textTransform: "uppercase" }}>
                {{ MAIN_1:"Main · 1", MAIN_2:"Main · 2", UNTAP:"Untap", UPKEEP:"Upkeep", DRAW:"Draw", COMBAT_BEGIN:"Begin Combat", COMBAT_ATTACKERS:"Declare Attackers", COMBAT_BLOCKERS:"Declare Blockers", COMBAT_DAMAGE:"Combat Damage", COMBAT_END:"End of Combat", END:"End Step", CLEANUP:"Cleanup" }[s.phase] || s.phase}
              </span>
            </div>
          </div>

          {/* PLAYER BATTLEFIELD */}
          <div style={{ flex: 1, background: "linear-gradient(180deg, rgba(20,28,12,.5), rgba(14,18,8,.6))", display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
            <div style={{ flexShrink: 0, padding: "5px 14px 4px", borderBottom: "1px dashed rgba(80,140,40,.2)", background: "rgba(0,0,0,.25)" }}>
              <div style={{ fontSize: 8.5, color: "#6a8848", fontFamily: "'Cinzel',serif", letterSpacing: 1.5, marginBottom: 4 }}>YOUR LANDS · {pLands.length}</div>
              <div style={{ display: "flex", gap: 4, minHeight: 36 }}>
                {pLands.map(c => (
                  <LandPip key={c.iid} card={c} tapped={c.tapped} isPlayer
                    selected={s.selCard === c.iid || s.selTgt === c.iid}
                    onClick={() => handleCardClick(c, "pBf")} />
                ))}
              </div>
            </div>
            <div style={{ flex: 1, padding: "8px 14px", display: "flex", gap: 6, alignItems: "flex-start", overflow: "auto" }}>
              {pNonLands.map(c => (
                <div key={c.iid}
                  onMouseEnter={() => s.selCard && setHoverTarget(c.iid)}
                  onMouseLeave={() => setHoverTarget(null)}>
                  <FieldCard card={c}
                    selected={s.selCard === c.iid || s.selTgt === c.iid}
                    attacking={s.attackers.includes(c.iid)}
                    tapped={c.tapped}
                    onClick={() => handleCardClick(c, "pBf")} />
                </div>
              ))}
            </div>
          </div>

          {/* PLAYER BANNER */}
          <div style={{ flexShrink: 0, padding: "8px 14px", background: "linear-gradient(90deg, rgba(20,40,10,.5), rgba(14,28,6,.3), rgba(20,40,10,.5))", borderTop: "1px solid rgba(80,140,40,.3)", borderBottom: "1px solid rgba(80,140,40,.3)", display: "flex", alignItems: "center", gap: 16 }}>
            <LifeTotal life={s.p.life} max={s.p.max} label="You" side="you" anim={s.p.lifeAnim} />
            <ZoneCount label="Library" count={s.p.lib} glyph="📚" />
            <ZoneCount label="Graveyard" count={s.p.gy} glyph="🪦" />
            {pManaTot > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", background: "rgba(0,0,0,.4)", border: "1px solid rgba(120,90,40,.3)", borderRadius: 3 }}>
                <span style={{ fontSize: 9, color: "#7a6a48", fontFamily: "'Cinzel',serif", letterSpacing: 1 }}>POOL</span>
                <PoolDisplay pool={s.p.mana} size={14} />
              </div>
            )}
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 10, color: "#7a6a48", fontStyle: "italic" }}>Red/Green • Stomp</span>
          </div>

          {/* ACTION BAR */}
          <ActionBar
            phase={s.phase}
            hasSelection={!!s.selCard}
            onCast={() => alert("Cast (mock)")}
            onPassPriority={handlePassPriority}
            onCancel={handleCancel}
            onEndTurn={handleEndTurn}
          />

          {/* PLAYER HAND */}
          <div style={{ flexShrink: 0, padding: "16px 16px 12px", display: "flex", justifyContent: "center", alignItems: "flex-end", background: "linear-gradient(180deg, transparent, rgba(20,40,10,.35))", minHeight: 158, overflow: "visible" }}>
            <div style={{ display: "flex", alignItems: "flex-end", paddingLeft: 28 }}>
              {s.p.hand.map((c, i) => {
                const { angle, y } = fanCard(i, s.p.hand.length);
                const playable = c.type === "Land" || c.type === "Instant" || (c.type === "Creature" && c.cost === "G");
                return (
                  <HandCard key={c.iid} card={c}
                    selected={s.selCard === c.iid}
                    playable={playable}
                    onClick={() => handleCardClick(c, "hand")}
                    fanAngle={angle} fanY={y} />
                );
              })}
            </div>
          </div>
        </div>

        {/* SIDEBAR */}
        <div style={{ width: 280, flexShrink: 0, borderLeft: "1px solid rgba(180,140,70,.3)", background: "linear-gradient(180deg, #14100a, #0c0806)", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "10px 14px 8px", borderBottom: "1px solid rgba(180,140,70,.2)", background: "linear-gradient(90deg, rgba(196,160,64,.08), transparent)" }}>
            <div style={{ fontSize: 11, color: "#c4a040", fontFamily: "'Cinzel',serif", letterSpacing: 2, fontWeight: 700, textTransform: "uppercase", textShadow: "0 0 6px rgba(196,160,64,.4)" }}>Chronicle</div>
            <div style={{ fontSize: 10, color: "#7a6a48", fontStyle: "italic", marginTop: 1 }}>The duel unfolds…</div>
          </div>
          <DuelLog log={s.log} />
          <div style={{ padding: "8px 14px", borderTop: "1px solid rgba(180,140,70,.15)", background: "rgba(0,0,0,.4)", fontSize: 9.5, fontFamily: "'Fira Code',monospace", color: "#7a6a48", display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span>SEL.CARD</span><span style={{ color: "#c4a040" }}>{s.selCard || "—"}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span>SEL.TARGET</span><span style={{ color: "#c4a040" }}>{s.selTgt || "—"}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span>ARROW</span><span style={{ color: "#c4a040" }}>{arrowSource && arrowTarget ? `${arrowSource}→${arrowTarget}` : "—"}</span></div>
          </div>
        </div>
      </div>

      {/* TARGETING ARROW OVERLAY */}
      <TargetArrow
        sourceIid={arrowSource}
        targetIid={arrowTarget}
        color={t.arrowColor}
        thickness={t.arrowThickness}
        style={t.arrowStyle}
        glow={t.arrowGlow}
        animate={t.arrowAnimate}
      />

      {/* TWEAKS PANEL */}
      <TweaksPanel>
        <TweakSection label="Targeting Arrow" />
        <TweakSelect label="Scenario" value={t.scenario}
          options={Object.keys(SCENARIOS).map(k => ({ value: k, label: SCENARIOS[k].label }))}
          onChange={(v) => setTweak("scenario", v)} />
        <TweakColor label="Color" value={t.arrowColor}
          onChange={(v) => setTweak("arrowColor", v)} />
        <TweakSlider label="Thickness" value={t.arrowThickness} min={1} max={8} step={0.5} unit="px"
          onChange={(v) => setTweak("arrowThickness", v)} />
        <TweakRadio label="Line style" value={t.arrowStyle}
          options={["solid", "dashed", "dotted"]}
          onChange={(v) => setTweak("arrowStyle", v)} />
        <TweakToggle label="Glow" value={t.arrowGlow}
          onChange={(v) => setTweak("arrowGlow", v)} />
        <TweakToggle label="Animate" value={t.arrowAnimate}
          onChange={(v) => setTweak("arrowAnimate", v)} />
        <TweakSection label="Try it live" />
        <div style={{ fontSize: 10.5, lineHeight: 1.45, color: "rgba(41,38,27,.7)" }}>
          Click a card in your hand, then hover over any creature or life total to see the arrow follow.
        </div>
      </TweaksPanel>
    </div>
  );
}

Object.assign(window, { DuelScreen });
