// src/ui/overworld/EncounterModal.jsx
// All overworld modal dialogs: Town, Dungeon, Castle, DeckManager, ScoreScreen.
// Presentation only. Per MECHANICS_INDEX.md S7.2

import React, { useState } from 'react';
import { isCre, isLand } from '../../engine/DuelCore.js';
import { thmOf, CCOLOR, Cost } from '../shared/Card.jsx';
import { MANA_HEX, MANA_SYM, MAGE_NAMES, MAGE_TITLES, CASTLE_NAMES, CASTLE_MODIFIERS, COLORS } from '../../engine/MapGenerator.js';
import { POWERED_NINE_IDS } from '../../data/cards.js';

// --- CARD PRICE HELPER -------------------------------------------------------

const cardPrice = c => Math.round((c.cmc||1)*8 + (c.rarity==="R"?32:c.rarity==="U"?12:0));
const sellPrice = c => Math.max(1, Math.round(cardPrice(c)*0.4));

// --- MINI CARD TILE (used in shop / deck manager) -----------------------------

function CardTile({ c, selected, onClick, priceLabel, side }) {
const ca = CCOLOR[c.color] || "#888";
return (
<div onClick={onClick} style={{
width:90, padding:"7px 7px 5px",
background: selected ? (side==="deck"?"rgba(240,192,64,.15)":"rgba(64,180,240,.15)") : thmOf(c).bg,
border:`2px solid ${selected?(side==="deck"?"#f0c040":"#40b4f0"):thmOf(c).bd}`,
borderRadius:6, cursor:"pointer", position:"relative",
boxShadow: selected?"0 0 10px rgba(200,160,40,.4)":"0 2px 5px rgba(0,0,0,.4)",
transition:"transform .12s", flexShrink:0,
}}
onMouseEnter={e=>e.currentTarget.style.transform="translateY(-2px)"}
onMouseLeave={e=>e.currentTarget.style.transform=""}
>
<div style={{ position:"absolute", top:3, left:3, width:6, height:6, borderRadius:"50%", background:c.rarity==="R"?"#f0c040":c.rarity==="U"?"#88b8d0":"#909090" }} />
<div style={{ position:"absolute", top:3, right:4, fontSize:7, color:ca, fontFamily:"'Fira Code',monospace", fontWeight:700 }}>{c.cost||""}</div>
<div style={{ fontSize:8, fontFamily:"'Cinzel',serif", color:"#e0d080", fontWeight:700, lineHeight:1.3, marginBottom:2, paddingLeft:8, paddingRight:20 }}>{c.name}</div>
<div style={{ fontSize:7, color:"#806040", marginBottom:2 }}>{c.subtype||c.type}</div>
{isCre(c) && <div style={{ fontSize:9, fontWeight:700, color:ca, fontFamily:"'Fira Code',monospace", textAlign:"right" }}>{c.power}/{c.toughness}</div>}
{priceLabel && <div style={{ fontSize:9, color:"#8a6000", fontWeight:700, marginTop:2 }}>{priceLabel}</div>}
</div>
);
}

// --- TOWN MODAL ---------------------------------------------------------------

export function TownModal({ town, player, binder, onClose, onBuy, onSell, onRest, onSage, onTrade, onGemBuy }) {
const [tab, setTab] = useState("shop");
const restCost = Math.max(0, (player.maxHP - player.hp) * 3);

const tabs = [
{ id:"shop",  l:"? Shop" },
{ id:"sell",  l:`? Sell (${binder.length})` },
{ id:"inn",   l:"? Inn" }, ...(town.hasSage ? [{ id:"sage", l:"? Sage" }] : []), ...(town.hasBlackMarket ? [{ id:"bm", l:"? Market" }] : []),
{ id:"gems",  l:`? Gems (${player.gems})` }, ...(town.quest && !town.questDone ? [{ id:"guild", l:"? Guild" }] : []),
];

return (
<div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.78)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200 }}>
<div style={{ width:520, maxHeight:"80vh", background:"linear-gradient(160deg,#1a1008,#0e0c04)", border:"2px solid rgba(200,160,60,.5)", borderRadius:10, boxShadow:"0 0 40px rgba(0,0,0,.8)", display:"flex", flexDirection:"column", overflow:"hidden" }}>

    {/* Header */}
    <div style={{ padding:"12px 16px 0", borderBottom:"1px solid rgba(200,160,60,.2)" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
        <div>
          <div style={{ fontSize:17, fontFamily:"'Cinzel',serif", color:"#f0c060" }}>? {town.name}</div>
          <div style={{ fontSize:10, color:"#6a4820", fontStyle:"italic" }}>A waypoint in Shandalar</div>
        </div>
        <div style={{ display:"flex", gap:10, alignItems:"center" }}>
          <span style={{ fontSize:13, color:"#f0c040", fontFamily:"'Cinzel',serif" }}>? {player.gold}g</span>
          <button onClick={onClose} style={{ background:"transparent", border:"1px solid #5a3020", color:"#c08060", borderRadius:4, padding:"4px 10px", cursor:"pointer", fontSize:12 }}>? Leave</button>
        </div>
      </div>
      <div style={{ display:"flex" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            background: tab===t.id?"rgba(200,160,60,.15)":"transparent",
            border:"none", borderBottom: tab===t.id?"2px solid #f0c060":"2px solid transparent",
            color: tab===t.id?"#f0c060":"#806040",
            padding:"7px 13px", cursor:"pointer", fontSize:10, fontFamily:"'Cinzel',serif",
          }}>{t.l}</button>
        ))}
      </div>
    </div>

    {/* Content */}
    <div style={{ flex:1, overflowY:"auto", padding:16, scrollbarWidth:"thin" }}>

      {tab==="shop" && (
        <div>
          <div style={{ fontSize:11, color:"#8a7050", marginBottom:10, fontStyle:"italic" }}>"{town.name}'s merchant deals in arcane arts."</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:14 }}>
            {town.stock.map((c,i) => (
              <CardTile key={i} c={c} onClick={() => onBuy(c, cardPrice(c))} priceLabel={`${cardPrice(c)}g`} />
            ))}
          </div>
          {(binder.filter(c=>c.rarity==="C").length>=3 || binder.filter(c=>c.rarity==="U").length>=5) && (
            <div style={{ padding:10, background:"rgba(255,255,255,.03)", borderRadius:6, border:"1px solid rgba(200,160,60,.12)" }}>
              <div style={{ fontSize:10, color:"#a08040", fontFamily:"'Cinzel',serif", marginBottom:6 }}>CARD TRADES</div>
              <div style={{ display:"flex", gap:6 }}>
                {binder.filter(c=>c.rarity==="C").length>=3 && (
                  <button onClick={() => onTrade("C")} style={{ background:"rgba(80,80,80,.2)", border:"1px solid #606060", color:"#c0c0c0", padding:"5px 12px", borderRadius:4, cursor:"pointer", fontSize:10, fontFamily:"'Cinzel',serif" }}>3 Commons ? Uncommon</button>
                )}
                {binder.filter(c=>c.rarity==="U").length>=5 && (
                  <button onClick={() => onTrade("U")} style={{ background:"rgba(40,80,120,.2)", border:"1px solid #6080a0", color:"#a0c0d0", padding:"5px 12px", borderRadius:4, cursor:"pointer", fontSize:10, fontFamily:"'Cinzel',serif" }}>5 Uncommons ? Rare</button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {tab==="sell" && (
        <div>
          <div style={{ fontSize:11, color:"#8a7050", marginBottom:12, fontStyle:"italic", fontFamily:"'Crimson Text',serif" }}>"I'll take those off your hands ? not at full price, mind."</div>
          {binder.length===0
            ? <div style={{ color:"#504030", fontSize:12, fontStyle:"italic", textAlign:"center", padding:20 }}>Your binder is empty.</div>
            : <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                {binder.map((c,i) => (
                  <CardTile key={c.iid||i} c={c} onClick={() => onSell(c, sellPrice(c))} priceLabel={`+${sellPrice(c)}g`} />
                ))}
              </div>
          }
        </div>
      )}

      {tab==="inn" && (
        <div style={{ background:"rgba(255,255,255,.04)", borderRadius:8, padding:14, border:"1px solid rgba(200,160,60,.12)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
            <div style={{ width:110, height:10, background:"#1a0a00", borderRadius:5, overflow:"hidden", border:"1px solid #5a3010" }}>
              <div style={{ width:`${(player.hp/player.maxHP)*100}%`, height:"100%", background:"linear-gradient(90deg,#c04020,#e06040)", borderRadius:5 }} />
            </div>
            <span style={{ fontSize:12, color:"#e08060", fontFamily:"'Cinzel',serif" }}>{player.hp}/{player.maxHP} HP</span>
          </div>
          {player.hp < player.maxHP ? (
            <>
              <div style={{ fontSize:12, color:"#a09070", marginBottom:10 }}>Full rest: +<strong style={{ color:"#e08060" }}>{player.maxHP-player.hp} HP</strong> for <strong style={{ color:"#f0c040" }}>{restCost}g</strong></div>
              <button onClick={() => player.gold>=restCost && onRest(restCost)} style={{
                background: player.gold>=restCost?"linear-gradient(135deg,#3a2010,#5a3020)":"rgba(0,0,0,.3)",
                border:`1px solid ${player.gold>=restCost?"#a06030":"#3a2810"}`,
                color: player.gold>=restCost?"#f0c060":"#5a4030",
                padding:"8px 18px", borderRadius:5, cursor:player.gold>=restCost?"pointer":"not-allowed",
                fontFamily:"'Cinzel',serif", fontSize:12,
              }}>? Rest ({restCost}g)</button>
            </>
          ) : (
            <div style={{ fontSize:12, color:"#60a060" }}>? At full health.</div>
          )}
        </div>
      )}

      {tab==="sage" && (
        <div style={{ background:"rgba(255,255,255,.04)", borderRadius:8, padding:14, border:"1px solid rgba(200,160,60,.12)" }}>
          <div style={{ fontSize:12, color:"#a09070", marginBottom:10 }}>Dungeon clue for <strong style={{ color:"#f0c040" }}>25 gold</strong>: reveals a hidden dungeon.</div>
          <button onClick={() => player.gold>=25 && onSage()} style={{
            background: player.gold>=25?"linear-gradient(135deg,#1a2830,#2a4050)":"rgba(0,0,0,.3)",
            border:`1px solid ${player.gold>=25?"#4080a0":"#2a3810"}`,
            color: player.gold>=25?"#80c0e0":"#5a4030",
            padding:"8px 18px", borderRadius:5, cursor:player.gold>=25?"pointer":"not-allowed",
            fontFamily:"'Cinzel',serif", fontSize:12,
          }}>? Seek Dungeon Knowledge (25g)</button>
        </div>
      )}

      {tab==="bm" && (
        <div>
          <div style={{ fontSize:11, color:"#8a7050", marginBottom:10, fontStyle:"italic" }}>"Don't ask where these came from."</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
            {town.stock.filter(c=>c.rarity==="R").map((c,i) => {
              const pr = Math.round(cardPrice(c)*1.5);
              return <CardTile key={i} c={c} onClick={() => onBuy(c, pr)} priceLabel={`${pr}g`} />;
            })}
            {!town.stock.filter(c=>c.rarity==="R").length && <div style={{ color:"#504030", fontSize:12, fontStyle:"italic" }}>No rare goods today.</div>}
          </div>
        </div>
      )}

      {tab==="gems" && (
        <div>
          <div style={{ fontSize:11, color:"#a080e0", marginBottom:12, fontStyle:"italic", fontFamily:"'Crimson Text',serif" }}>"I deal only in the rarest currency."</div>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {[
              { cost:3, label:"Random Rare Card",  desc:"Draw one rare card at random.", action:"rare" },
              { cost:5, label:"Extra Max HP (+5)", desc:"Permanently increase max HP by 5.", action:"hp" },
              { cost:2, label:"Full Heal",          desc:"Restore HP to maximum.", action:"heal" },
            ].map(item => (
              <div key={item.action} style={{ background:"rgba(80,40,100,.2)", borderRadius:7, padding:"12px 14px", border:"1px solid rgba(150,80,200,.3)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div>
                  <div style={{ fontSize:12, color:"#c0a0e0", fontFamily:"'Cinzel',serif", marginBottom:3 }}>{item.label}</div>
                  <div style={{ fontSize:10, color:"#806090", fontFamily:"'Crimson Text',serif" }}>{item.desc}</div>
                </div>
                <button onClick={() => player.gems>=item.cost && onGemBuy(item.action)} disabled={player.gems<item.cost} style={{
                  background: player.gems>=item.cost?"linear-gradient(135deg,#3a1860,#5a2890)":"rgba(0,0,0,.3)",
                  border:`1px solid ${player.gems>=item.cost?"#9060cc":"#3a2850"}`,
                  color: player.gems>=item.cost?"#cc88ff":"#504060",
                  padding:"7px 14px", borderRadius:5, cursor:player.gems>=item.cost?"pointer":"not-allowed",
                  fontFamily:"'Cinzel',serif", fontSize:11, whiteSpace:"nowrap",
                }}>?{item.cost}</button>
              </div>
            ))}
            <div style={{ fontSize:11, color:"#604070", textAlign:"center", marginTop:4 }}>Your gems: <strong style={{ color:"#b080dd" }}>?{player.gems}</strong></div>
          </div>
        </div>
      )}

      {tab==="guild" && town.quest && (
        <div style={{ background:"rgba(255,255,255,.04)", borderRadius:8, padding:14, border:"1px solid rgba(200,160,60,.12)" }}>
          <div style={{ fontSize:14, color:"#e0c060", fontFamily:"'Cinzel',serif", marginBottom:6 }}>? {town.quest.title}</div>
          <div style={{ fontSize:12, color:"#c0a070", marginBottom:10 }}>{town.quest.desc}</div>
          <div style={{ fontSize:11, color:"#80c080", marginBottom:10 }}>
            Reward: {town.quest.rewardType==="card"
              ? <strong>{town.quest.rewardId} (card)</strong>
              : <strong>{town.quest.rewardGold} gold</strong>}
          </div>
          <div style={{ fontSize:10, color:"#6a5020", fontStyle:"italic" }}>Quest rewards granted automatically when conditions are met.</div>
        </div>
      )}
    </div>
  </div>
</div>

);
}

// --- DUNGEON MODAL ------------------------------------------------------------

export function DungeonModal({ dungeon, onClose, onEnter }) {
const m = dungeon.mod;
return (
<div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.82)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200 }}>
<div style={{ width:400, background:"linear-gradient(160deg,#100a04,#0a0804)", border:"2px solid rgba(150,100,50,.4)", borderRadius:10, padding:22, boxShadow:"0 0 50px rgba(0,0,0,.9)" }}>
<div style={{ textAlign:"center", marginBottom:18 }}>
<div style={{ fontSize:26, marginBottom:6 }}>?</div>
<div style={{ fontSize:17, fontFamily:"'Cinzel',serif", color:"#c08040" }}>{dungeon.name}</div>
<div style={{ fontSize:10, color:"#6a4820", fontStyle:"italic" }}>A place of shadow and terrible power?</div>
</div>
<div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
<div style={{ background:"rgba(255,255,255,.04)", borderRadius:6, padding:8, border:"1px solid rgba(150,100,50,.2)" }}>
<div style={{ fontSize:9, color:"#8a6030", fontFamily:"'Cinzel',serif", marginBottom:3 }}>ROOMS</div>
<div style={{ fontSize:18, fontFamily:"'Cinzel',serif", color:"#e0a060" }}>{dungeon.rooms}</div>
</div>
<div style={{ background:"rgba(255,255,255,.04)", borderRadius:6, padding:8, border:"1px solid rgba(150,100,50,.2)" }}>
<div style={{ fontSize:9, color:"#8a6030", fontFamily:"'Cinzel',serif", marginBottom:3 }}>DOMINANT</div>
<span style={{ fontSize:18 }}>{['W','U','B','R','G'].includes(dungeon.domColor) ? dungeon.domColor : "?"}</span>
</div>
</div>
<div style={{ background:"rgba(80,20,0,.2)", borderRadius:6, padding:10, marginBottom:14, border:"1px solid rgba(150,60,20,.3)" }}>
<div style={{ fontSize:9, color:"#a06040", fontFamily:"'Cinzel',serif", marginBottom:3 }}>{m.icon} MODIFIER: {m.name.toUpperCase()}</div>
<div style={{ fontSize:11, color:"#c08050" }}>{m.desc}</div>
</div>
<div style={{ fontSize:10, color:"#8a5020", fontStyle:"italic", marginBottom:14 }}>? HP does not restore between rooms. You cannot exit and return.</div>
<div style={{ display:"flex", gap:10 }}>
<button onClick={onEnter} style={{ flex:1, background:"linear-gradient(135deg,#3a1a08,#5a2a10)", border:"1px solid #a06030", color:"#f0a040", padding:"9px", borderRadius:5, cursor:"pointer", fontFamily:"'Cinzel',serif", fontSize:12, letterSpacing:1 }}>? Enter Dungeon</button>
<button onClick={onClose} style={{ background:"transparent", border:"1px solid #4a3020", color:"#806040", padding:"9px 14px", borderRadius:5, cursor:"pointer", fontFamily:"'Cinzel',serif", fontSize:11 }}>Retreat</button>
</div>
</div>
</div>
);
}

// --- CASTLE MODAL -------------------------------------------------------------

export function CastleModal({ castleData, onClose, onChallenge }) {
const { color, mage, defeated } = castleData;
const hx  = MANA_HEX[color];
const mod = CASTLE_MODIFIERS[color];
const flavor = {
W:"Delenia rules with iron velvet. Her justice is merciless.",
U:"Xylos has watched for centuries, pulling strings like a puppeteer.",
B:"The stench of death precedes Mortis. Power is all he respects.",
R:"Karag does not strategize. He burns. He relishes your challenge.",
G:"Sylvara is ancient beyond reckoning. To fight her is to fight the land.",
};

return (
<div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.87)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200 }}>
<div style={{ width:410, background:"linear-gradient(160deg,#0a0808,#050505)", border:`2px solid ${hx}50`, borderRadius:10, padding:26, boxShadow:`0 0 50px ${hx}30` }}>
<div style={{ textAlign:"center", marginBottom:18 }}>
<div style={{ fontSize:30, marginBottom:8, filter:`drop-shadow(0 0 8px ${hx})` }}>{MANA_SYM[color]}</div>
<div style={{ fontSize:11, color:hx, fontFamily:"'Cinzel',serif", letterSpacing:2, marginBottom:4 }}>{CASTLE_NAMES[color]?.toUpperCase()}</div>
<div style={{ fontSize:20, fontFamily:"'Cinzel',serif", color:"#f0e0c0", marginBottom:4 }}>{mage}</div>
<div style={{ fontSize:12, color:"#8a7060", fontStyle:"italic" }}>{MAGE_TITLES[color]}</div>
</div>
<div style={{ background:`${hx}10`, borderRadius:8, padding:12, marginBottom:12, border:`1px solid ${hx}25` }}>
<div style={{ fontSize:12, color:"#c0a070", fontStyle:"italic" }}>"{flavor[color]}"</div>
</div>
<div style={{ background:"rgba(80,20,0,.2)", borderRadius:6, padding:10, marginBottom:14, border:`1px solid ${hx}30` }}>
<div style={{ fontSize:9, color:hx, fontFamily:"'Cinzel',serif", marginBottom:3 }}>CASTLE MODIFIER: {mod?.name?.toUpperCase()}</div>
<div style={{ fontSize:11, color:"#c08050" }}>{mod?.desc}</div>
</div>
{defeated ? (
<div style={{ textAlign:"center", padding:10 }}>
<div style={{ fontSize:13, color:"#60a060", fontFamily:"'Cinzel',serif" }}>? Defeated. {mage}'s power is broken.</div>
</div>
) : (
<div style={{ display:"flex", gap:10 }}>
<button onClick={onChallenge} style={{ flex:1, background:`linear-gradient(135deg,${hx}20,${hx}10)`, border:`1px solid ${hx}60`, color:hx, padding:"11px", borderRadius:5, cursor:"pointer", fontFamily:"'Cinzel',serif", fontSize:13, letterSpacing:1 }}>? Challenge {mage}</button>
<button onClick={onClose} style={{ background:"transparent", border:"1px solid #4a3020", color:"#806040", padding:"11px 14px", borderRadius:5, cursor:"pointer", fontFamily:"'Cinzel',serif", fontSize:11 }}>Withdraw</button>
</div>
)}
</div>
</div>
);
}

// --- DECK MANAGER -------------------------------------------------------------

function DeckCardTile({ c, selected, onClick, side }) {
const ca = CCOLOR[c.color] || "#888";
return (
<div onClick={onClick} style={{
width:90, padding:"7px 7px 5px",
background: selected ? (side==="deck"?"rgba(240,192,64,.15)":"rgba(64,180,240,.15)") : thmOf(c).bg,
border:`2px solid ${selected?(side==="deck"?"#f0c040":"#40b4f0"):thmOf(c).bd}`,
borderRadius:6, cursor:"pointer", position:"relative",
boxShadow:selected?"0 0 10px rgba(200,160,40,.4)":"0 2px 5px rgba(0,0,0,.4)",
transition:"transform .12s", flexShrink:0,
}}
onMouseEnter={e=>e.currentTarget.style.transform="translateY(-2px)"}
onMouseLeave={e=>e.currentTarget.style.transform=""}
>
<div style={{ position:"absolute", top:3, left:3, width:6, height:6, borderRadius:"50%", background:c.rarity==="R"?"#f0c040":c.rarity==="U"?"#88b8d0":"#909090" }} />
<div style={{ position:"absolute", top:3, right:4, fontSize:7, color:ca, fontFamily:"'Fira Code',monospace", fontWeight:700 }}>{c.cost||""}</div>
<div style={{ fontSize:8, fontFamily:"'Cinzel',serif", color:"#e0d080", fontWeight:700, lineHeight:1.3, marginBottom:2, paddingLeft:8, paddingRight:20 }}>{c.name}</div>
<div style={{ fontSize:7, color:"#806040", marginBottom:2 }}>{c.subtype||c.type}</div>
{isCre(c) && <div style={{ fontSize:9, fontWeight:700, color:ca, fontFamily:"'Fira Code',monospace", textAlign:"right" }}>{c.power}/{c.toughness}</div>}
</div>
);
}

export function DeckManager({ deck, binder, onClose, onSwap, onMoveToDeck, onMoveToBinder }) {
const [selD, setSelD] = useState(null);
const [selB, setSelB] = useState(null);
const [colorFilt, setColorFilt] = useState("ALL");
const [search, setSearch]   = useState("");
const [sortBy, setSortBy]   = useState("cmc");

const apply = cards => {
let r = [...cards];
if (colorFilt !== "ALL") r = r.filter(c => c.color === colorFilt);
if (search.trim()) r = r.filter(c => c.name.toLowerCase().includes(search.trim().toLowerCase()));
if (sortBy==="cmc")  r.sort((a,b) => a.cmc-b.cmc||a.name.localeCompare(b.name));
if (sortBy==="name") r.sort((a,b) => a.name.localeCompare(b.name));
if (sortBy==="type") r.sort((a,b) => (a.type||"").localeCompare(b.type||"")||a.name.localeCompare(b.name));
return r;
};
const fD = apply(deck);
const fB = apply(binder);
const lands = deck.filter(isLand).length;
const avgCmc = deck.filter(c=>!isLand(c)).length
? (deck.filter(c=>!isLand(c)).reduce((a,c)=>a+(c.cmc||0),0)/deck.filter(c=>!isLand(c)).length).toFixed(1)
: "?";

return (
<div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.9)", display:"flex", alignItems:"stretch", justifyContent:"center", zIndex:200, padding:16 }}>
<div style={{ width:"100%", maxWidth:760, background:"linear-gradient(160deg,#0e0c04,#080a04)", border:"2px solid rgba(180,160,60,.4)", borderRadius:12, display:"flex", flexDirection:"column", boxShadow:"0 0 60px rgba(0,0,0,.9)", overflow:"hidden" }}>

    {/* Header */}
    <div style={{ padding:"12px 16px", borderBottom:"1px solid rgba(180,160,60,.2)", display:"flex", justifyContent:"space-between", alignItems:"center", flexShrink:0, flexWrap:"wrap", gap:8 }}>
      <div>
        <div style={{ fontSize:16, fontFamily:"'Cinzel',serif", color:"#e0c060", fontWeight:700 }}>? Deck Manager</div>
        <div style={{ fontSize:10, color:"#6a5020", marginTop:2, display:"flex", gap:10 }}>
          <span style={{ color:"#80c080" }}>{deck.length} cards</span>
          <span>{lands} lands ? {deck.filter(isCre).length} creatures ? {deck.filter(c=>!isLand(c)&&!isCre(c)).length} spells</span>
          <span>Avg CMC: {avgCmc}</span>
        </div>
      </div>
      <button onClick={onClose} style={{ background:"rgba(80,20,10,.6)", border:"1px solid rgba(180,80,40,.5)", color:"#e08060", borderRadius:5, padding:"5px 14px", cursor:"pointer", fontSize:12, fontFamily:"'Cinzel',serif" }}>? Close</button>
    </div>

    {/* Controls */}
    <div style={{ padding:"8px 16px", borderBottom:"1px solid rgba(180,160,60,.12)", display:"flex", gap:8, flexWrap:"wrap", alignItems:"center", flexShrink:0, background:"rgba(0,0,0,.2)" }}>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search cards?" style={{ background:"rgba(0,0,0,.5)", border:"1px solid #5a4020", color:"#f0d080", padding:"4px 10px", borderRadius:5, fontSize:11, fontFamily:"'Cinzel',serif", width:140, outline:"none" }}/>
      <div style={{ display:"flex", gap:3 }}>
        {["ALL","W","U","B","R","G",""].map(f => (
          <button key={f} onClick={()=>setColorFilt(f)} style={{ background:colorFilt===f?"rgba(200,160,40,.25)":"transparent", border:`1px solid ${colorFilt===f?"#c0a030":"#3a3010"}`, color:colorFilt===f?"#f0c040":"#6a5020", padding:"3px 8px", borderRadius:4, cursor:"pointer", fontSize:9, fontFamily:"'Cinzel',serif" }}>{f||"?"}</button>
        ))}
      </div>
      <div style={{ display:"flex", gap:3, marginLeft:"auto" }}>
        <span style={{ fontSize:9, color:"#6a5020", lineHeight:"24px" }}>Sort:</span>
        {[["cmc","CMC"],["name","Name"],["type","Type"]].map(([k,l]) => (
          <button key={k} onClick={()=>setSortBy(k)} style={{ background:sortBy===k?"rgba(200,160,40,.2)":"transparent", border:`1px solid ${sortBy===k?"#a08030":"#3a3010"}`, color:sortBy===k?"#f0c040":"#6a5020", padding:"3px 8px", borderRadius:4, cursor:"pointer", fontSize:9, fontFamily:"'Cinzel',serif" }}>{l}</button>
        ))}
      </div>
    </div>

    {/* Action bar when selection made */}
    {(selD!==null||selB!==null) && (
      <div style={{ padding:"8px 16px", borderBottom:"1px solid rgba(180,160,60,.12)", background:"rgba(200,160,40,.08)", display:"flex", gap:10, alignItems:"center", flexShrink:0 }}>
        {selD!==null && selB!==null && (
          <>
            <span style={{ fontSize:11, color:"#c0a860", flex:1 }}>Swap <strong style={{color:"#f0d060"}}>{fD[selD]?.name}</strong> ? <strong style={{color:"#60c0f0"}}>{fB[selB]?.name}</strong></span>
            <button onClick={()=>{onSwap(fD[selD],fB[selB]);setSelD(null);setSelB(null);}} style={{ background:"linear-gradient(135deg,#1a2a10,#2a4020)", border:"1px solid #5a9040", color:"#80d060", padding:"6px 14px", borderRadius:5, cursor:"pointer", fontFamily:"'Cinzel',serif", fontSize:11, fontWeight:700 }}>? Swap</button>
          </>
        )}
        {selD!==null && selB===null && (
          <>
            <span style={{ fontSize:11, color:"#c0a860", flex:1 }}><strong style={{color:"#f0d060"}}>{fD[selD]?.name}</strong> selected from deck</span>
            <button onClick={()=>{onMoveToBinder(fD[selD]);setSelD(null);}} style={{ background:"rgba(80,40,20,.5)", border:"1px solid #a06030", color:"#f0a050", padding:"6px 14px", borderRadius:5, cursor:"pointer", fontFamily:"'Cinzel',serif", fontSize:11 }}>? Move to Binder</button>
          </>
        )}
        {selB!==null && selD===null && (
          <>
            <span style={{ fontSize:11, color:"#c0a860", flex:1 }}><strong style={{color:"#60c0f0"}}>{fB[selB]?.name}</strong> selected from binder</span>
            <button onClick={()=>{onMoveToDeck(fB[selB]);setSelB(null);}} style={{ background:"rgba(20,60,30,.6)", border:"1px solid #408050", color:"#60e080", padding:"6px 14px", borderRadius:5, cursor:"pointer", fontFamily:"'Cinzel',serif", fontSize:11 }}>? Add to Deck</button>
          </>
        )}
        <button onClick={()=>{setSelD(null);setSelB(null);}} style={{ background:"transparent", border:"1px solid #5a3020", color:"#806040", padding:"5px 10px", borderRadius:4, cursor:"pointer", fontSize:10, fontFamily:"'Cinzel',serif" }}>?</button>
      </div>
    )}

    {/* Two-panel grid */}
    <div style={{ flex:1, display:"grid", gridTemplateColumns:"1fr 1fr", overflow:"hidden", minHeight:0 }}>
      {[
        { label:`? DECK (${deck.length})${fD.length!==deck.length?` ? showing ${fD.length}`:""}`, cards:fD, sel:selD, setSel:setSelD, side:"deck" },
        { label:`? BINDER (${binder.length})${fB.length!==binder.length?` ? showing ${fB.length}`:""}`, cards:fB, sel:selB, setSel:setSelB, side:"binder" },
      ].map(({ label, cards, sel, setSel, side }, pi) => (
        <div key={pi} style={{ borderRight:pi===0?"1px solid rgba(180,160,60,.15)":"none", display:"flex", flexDirection:"column", overflow:"hidden" }}>
          <div style={{ padding:"8px 12px 6px", fontSize:10, fontFamily:"'Cinzel',serif", color:pi===0?"#d0a040":"#40a0d0", fontWeight:700, borderBottom:"1px solid rgba(180,160,60,.08)", flexShrink:0 }}>{label}</div>
          <div style={{ flex:1, overflowY:"auto", padding:8, display:"flex", flexWrap:"wrap", gap:5, alignContent:"flex-start", scrollbarWidth:"thin" }}>
            {cards.map((c,i) => (
              <DeckCardTile key={c.iid||i} c={c} selected={sel===i} onClick={()=>setSel(sel===i?null:i)} side={side} />
            ))}
            {!cards.length && <div style={{ fontSize:10, color:"#3a2810", fontStyle:"italic", padding:8 }}>{cards.length===0&&binder.length===0?"Empty.":"No cards match filter."}</div>}
          </div>
        </div>
      ))}
    </div>

    <div style={{ padding:"8px 16px", borderTop:"1px solid rgba(180,160,60,.12)", fontSize:10, color:"#4a3820", fontStyle:"italic", flexShrink:0, textAlign:"center" }}>
      Click a card in one panel to select it ? Select from both to swap ? Select from one to move
    </div>
  </div>
</div>

);
}

// --- SCORE SCREEN -------------------------------------------------------------

export function ScoreScreen({ stats, onNewGame }) {
const { playerName, playerColor, magesDefeated, dungeonsCleared, townsSaved, collection, manaLinksEstablished, won } = stats;
const p9 = (collection || []).filter(c => POWERED_NINE_IDS.includes(c.id)).length;
const base       = won ? 1000 : 0;
const mageScore  = magesDefeated.length * 50;
const dungScore  = dungeonsCleared * 10;
const townScore  = townsSaved * 5;
const cardScore  = (collection||[]).length * 2;
const p9Score    = p9 * 100;
const linkPenalty = manaLinksEstablished * 25;
const total      = Math.max(0, base+mageScore+dungScore+townScore+cardScore+p9Score-linkPenalty);

const rows = [
{ label:"Victory",                                       val:base,        color:"#f0d040", show:won },
{ label:`Mages Defeated (?${magesDefeated.length})`,    val:mageScore,   color:"#ff9060" },
{ label:`Dungeons Cleared (?${dungeonsCleared})`,       val:dungScore,   color:"#aa88ff" },
{ label:`Towns Saved (?${townsSaved})`,                 val:townScore,   color:"#60d080" },
{ label:`Cards Collected (?${(collection||[]).length})`,val:cardScore,   color:"#88ccff" },
{ label:`Powered Nine (?${p9})`,                        val:p9Score,     color:"#f0c040", show:p9>0 },
{ label:`Mana Links Established (?${manaLinksEstablished})`, val:-linkPenalty, color:"#ff5040", show:manaLinksEstablished>0 },
];

const colorName = { W:"White",U:"Blue",B:"Black",R:"Red",G:"Green" }[playerColor] || playerColor;

return (
<div style={{ minHeight:"100vh", background:"#060402", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", fontFamily:"'Cinzel',serif", backgroundImage:"radial-gradient(ellipse at 50% 30%,rgba(100,60,10,.5) 0%,transparent 70%)" }}>
<div style={{ width:520, background:"linear-gradient(160deg,#1a1408,#0e0c04)", border:"2px solid rgba(200,160,40,.4)", borderRadius:12, padding:36, boxShadow:"0 0 60px rgba(0,0,0,.9)" }}>
<div style={{ textAlign:"center", marginBottom:28 }}>
<div style={{ fontSize:36, marginBottom:8 }}>{won?"?":"?"}</div>
<div style={{ fontSize:24, fontFamily:"'Cinzel Decorative',serif", color:won?"#f0d060":"#e04040", marginBottom:4 }}>{won?"Shandalar Saved!":"The Plane Falls"}</div>
<div style={{ fontSize:13, color:"#a09060", fontFamily:"'Crimson Text',serif", fontStyle:"italic" }}>{playerName} ? {colorName} Mage ? {magesDefeated.length}/5 Mages Defeated</div>
</div>
<div style={{ marginBottom:24 }}>
{rows.filter(r=>r.show!==false).map((r,i) => (
<div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 12px", marginBottom:4, background:"rgba(255,255,255,.03)", borderRadius:5, border:"1px solid rgba(255,255,255,.06)", animation:`scoreReveal .4s ease-out ${i*80}ms both` }}>
<span style={{ fontSize:12, color:"#c0b080" }}>{r.label}</span>
<span style={{ fontSize:13, fontWeight:700, color:r.color, fontFamily:"'Fira Code',monospace" }}>{r.val>=0?"+":""}{r.val}</span>
</div>
))}
<div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 12px", marginTop:8, background:"rgba(200,160,40,.12)", borderRadius:6, border:"2px solid rgba(200,160,40,.4)" }}>
<span style={{ fontSize:14, fontFamily:"'Cinzel',serif", color:"#f0c040", fontWeight:700, letterSpacing:1 }}>FINAL SCORE</span>
<span style={{ fontSize:22, fontWeight:700, color:"#f0c040", fontFamily:"'Cinzel Decorative',serif" }}>{total.toLocaleString()}</span>
</div>
</div>
<div style={{ display:"flex", gap:12, justifyContent:"center" }}>
<button onClick={onNewGame} style={{ background:"linear-gradient(135deg,#1a1004,#2e1c08)", border:"2px solid rgba(200,160,40,.5)", color:"#f0c040", padding:"12px 28px", borderRadius:6, cursor:"pointer", fontSize:13, fontFamily:"'Cinzel',serif", letterSpacing:1 }}>New Game</button>
</div>
</div>
</div>
);
}

export default { TownModal, DungeonModal, CastleModal, DeckManager, ScoreScreen };
