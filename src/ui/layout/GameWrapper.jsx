// src/ui/layout/GameWrapper.jsx
// Title screen and top-level screen state router.
// Per MECHANICS_INDEX.md S7.4 and GDD S7

import React, { useState } from 'react';
import { MANA_HEX, MANA_SYM, COLORS } from '../../engine/MapGenerator.js';

const COLOR_META = {
W: { name:"White", label:"Order & Protection",  hp:22, gold:40, flavor:"The light of justice guides your blade." },
U: { name:"Blue",  label:"Control & Knowledge", hp:18, gold:50, flavor:"Knowledge is the mightiest spell of all." },
B: { name:"Black", label:"Power & Sacrifice",   hp:18, gold:35, flavor:"Power demands sacrifice ? others' or yours." },
R: { name:"Red",   label:"Speed & Chaos",       hp:20, gold:40, flavor:"Strike first. Strike hard. Ask questions never." },
G: { name:"Green", label:"Growth & Might",      hp:22, gold:30, flavor:"The land itself rises to answer your call." },
};

// --- TITLE SCREEN -------------------------------------------------------------

export function TitleScreen({ onStart }) {
const [col, setCol]     = useState(null);
const [name, setName]   = useState("");
const [step, setStep]   = useState("intro"); // intro | choose | name

return (
<div style={{
minHeight: "100vh", background: "#050302",
display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
fontFamily: "'Cinzel',serif",
backgroundImage: "radial-gradient(ellipse at 50% 30%,rgba(80,40,10,.4) 0%,transparent 70%)",
}}>
<style>{`@keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} } @keyframes pulse { 0%,100%{opacity:.7} 50%{opacity:1} } @keyframes wizPulse { 0%,100%{box-shadow:0 0 10px rgba(255,240,100,.8)} 50%{box-shadow:0 0 22px rgba(255,240,100,1)} } @keyframes alertDrop { from{transform:translateX(-50%) translateY(-18px);opacity:0} to{transform:translateX(-50%) translateY(0);opacity:1} } @keyframes phaseGlow { 0%,100%{box-shadow:0 0 6px rgba(200,160,40,.4)} 50%{box-shadow:0 0 14px rgba(200,160,40,.8)} } @keyframes stackIn { from{transform:translateX(36px);opacity:0} to{transform:none;opacity:1} } @keyframes scoreReveal { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} } @keyframes damageFlash { 0%{filter:none;transform:translateX(0)} 20%{filter:brightness(2.5) saturate(.2);transform:translateX(-3px)} 60%{transform:translateX(2px)} 100%{filter:none;transform:translateX(0)} } @keyframes healFlash { 0%,100%{filter:none;transform:scale(1)} 50%{filter:brightness(1.5) hue-rotate(100deg);transform:scale(1.05)} } ::-webkit-scrollbar{width:5px;height:5px} ::-webkit-scrollbar-track{background:#080502} ::-webkit-scrollbar-thumb{background:#4a3010;border-radius:3px}`}</style>

  <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:"linear-gradient(90deg,transparent,rgba(200,160,40,.6),transparent)" }} />

  <div style={{ textAlign:"center", maxWidth:620, padding:"0 20px" }}>
    <div style={{ marginBottom:6, fontSize:11, letterSpacing:4, color:"rgba(180,140,40,.5)" }}>? ? ? MAGIC: THE GATHERING ? ? ?</div>
    <h1 style={{
      fontSize:52, fontFamily:"'Cinzel Decorative',serif", color:"transparent",
      background:"linear-gradient(180deg,#f0d080,#8a6010)",
      WebkitBackgroundClip:"text", backgroundClip:"text",
      margin:"0 0 4px", lineHeight:1.1, letterSpacing:4,
    }}>SHANDALAR</h1>
    <div style={{ fontSize:13, color:"rgba(180,140,60,.5)", letterSpacing:3, marginBottom:36 }}>MODERN EDITION</div>

    {step === "intro" && (
      <div style={{ animation:"fadeIn 1s ease-out" }}>
        <div style={{ fontSize:14, color:"#8a7050", fontFamily:"'Crimson Text',serif", fontStyle:"italic", lineHeight:1.8, marginBottom:28, maxWidth:460, margin:"0 auto 28px" }}>
          The plane of Shandalar trembles. Five mages vie for dominion, and the planeswalker Arzakon waits beyond the barrier.<br/><br/>
          You are the last hope. Build your deck. Master the arcane. Seal the fate of Shandalar.
        </div>
        <button onClick={() => setStep("choose")} style={{
          background:"linear-gradient(135deg,#1a1004,#2e1c08)",
          border:"2px solid rgba(200,160,40,.5)", color:"#f0c040",
          padding:"13px 46px", borderRadius:6, cursor:"pointer",
          fontSize:14, fontFamily:"'Cinzel',serif", letterSpacing:2,
        }}>BEGIN YOUR JOURNEY</button>
        <div style={{ marginTop:18 }}>
          <button onClick={() => onStart({ color:"W", name:"The Archivist", seed:Date.now(), sandbox:true })} style={{
            background:"transparent",
            border:"1px solid rgba(96,192,255,.35)", color:"rgba(96,192,255,.7)",
            padding:"8px 22px", borderRadius:5, cursor:"pointer",
            fontSize:11, fontFamily:"'Cinzel',serif", letterSpacing:1,
          }}>? Sandbox Mode</button>
          <div style={{ fontSize:9, color:"rgba(96,192,255,.35)", marginTop:5, fontFamily:"'Crimson Text',serif", fontStyle:"italic" }}>
            All cards ? unlimited copies ? dev testing
          </div>
        </div>
      </div>
    )}

    {step === "choose" && (
      <div style={{ animation:"fadeIn .5s ease-out" }}>
        <div style={{ fontSize:12, color:"#8a6040", marginBottom:16, fontFamily:"'Crimson Text',serif", fontStyle:"italic" }}>Choose the color of your magic.</div>
        <div style={{ display:"flex", gap:10, justifyContent:"center", marginBottom:22 }}>
          {COLORS.map(c => {
            const m = COLOR_META[c];
            const hx = MANA_HEX[c];
            const sel = col === c;
            return (
              <div key={c} onClick={() => setCol(c)} style={{
                width:100, padding:"14px 8px", cursor:"pointer",
                background: sel ? `${hx}18` : "rgba(255,255,255,.02)",
                border:`2px solid ${sel?hx:"rgba(255,255,255,.08)"}`,
                borderRadius:8, boxShadow:sel?`0 0 16px ${hx}50`:"none",
                transition:"all .2s", transform:sel?"translateY(-4px)":"none",
              }}>
                <div style={{ fontSize:38, marginBottom:6, textAlign:"center", color:hx, lineHeight:1 }}>{MANA_SYM[c]}</div>
                <div style={{ fontSize:11, fontFamily:"'Cinzel',serif", color:sel?hx:"#6a5030", marginBottom:3 }}>{m.name}</div>
                <div style={{ fontSize:8, color:"#5a4020", lineHeight:1.4 }}>{m.label}</div>
                <div style={{ marginTop:6, fontSize:9, color:sel?hx:"#4a3010" }}>?{m.hp} ?{m.gold}g</div>
              </div>
            );
          })}
        </div>
        {col && <div style={{ marginBottom:14, fontStyle:"italic", fontSize:12, color:"#a09060", fontFamily:"'Crimson Text',serif" }}>"{COLOR_META[col].flavor}"</div>}
        <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
          <button onClick={() => setStep("intro")} style={{ background:"transparent", border:"1px solid #3a2810", color:"#6a4820", padding:"8px 18px", borderRadius:5, cursor:"pointer", fontSize:11, fontFamily:"'Cinzel',serif" }}>? Back</button>
          <button disabled={!col} onClick={() => setStep("name")} style={{ background:col?"linear-gradient(135deg,#1a1004,#2e1c08)":"rgba(0,0,0,.3)", border:`1px solid ${col?MANA_HEX[col]:"#2a1804"}`, color:col?MANA_HEX[col]:"#3a2810", padding:"9px 26px", borderRadius:5, cursor:col?"pointer":"not-allowed", fontSize:12, fontFamily:"'Cinzel',serif" }}>Name Your Wizard ?</button>
        </div>
      </div>
    )}

    {step === "name" && col && (
      <div style={{ animation:"fadeIn .5s ease-out" }}>
        <div style={{ fontSize:12, color:"#8a6040", marginBottom:14, fontFamily:"'Crimson Text',serif", fontStyle:"italic" }}>What is the name by which you shall be known in Shandalar?</div>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && onStart({ color:col, name:name.trim()||`The ${COLOR_META[col].name} Mage`, seed:Date.now() })}
          placeholder="Enter your wizard's name?"
          maxLength={24}
          style={{ background:"rgba(0,0,0,.5)", border:"1px solid rgba(200,160,40,.4)", color:"#f0d080", padding:"10px 16px", borderRadius:6, fontSize:15, fontFamily:"'Cinzel',serif", width:280, outline:"none", marginBottom:18, letterSpacing:1 }}
        />
        <br/>
        <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
          <button onClick={() => setStep("choose")} style={{ background:"transparent", border:"1px solid #3a2810", color:"#6a4820", padding:"8px 18px", borderRadius:5, cursor:"pointer", fontSize:11, fontFamily:"'Cinzel',serif" }}>? Back</button>
          <button onClick={() => onStart({ color:col, name:name.trim()||`The ${COLOR_META[col].name} Mage`, seed:Date.now() })} style={{
            background:`linear-gradient(135deg,${MANA_HEX[col]}20,${MANA_HEX[col]}10)`,
            border:`2px solid ${MANA_HEX[col]}`, color:MANA_HEX[col],
            padding:"11px 30px", borderRadius:6, cursor:"pointer",
            fontSize:13, fontFamily:"'Cinzel',serif", letterSpacing:2,
          }}>? Enter Shandalar</button>
        </div>
      </div>
    )}
  </div>

  <div style={{ position:"absolute", bottom:18, fontSize:10, color:"rgba(100,80,40,.4)", letterSpacing:2 }}>
    ALPHA?FOURTH EDITION ? CLASSIC RULES
  </div>
</div>

);
}

export default TitleScreen;
