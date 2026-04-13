import { useState, useEffect, useCallback, useRef, useMemo } from "react";

// ============================================================
// CONSTANTS & DATA
// ============================================================

const MAP_W = 32;
const MAP_H = 22;
const TILE_SIZE = 36;

const TERRAIN = {
  PLAINS:   { id: "PLAINS",   color: "#B5C87A", darkColor: "#8fa052", label: "Plains",   icon: "☀", moveC: 1, manaColor: "W" },
  FOREST:   { id: "FOREST",   color: "#4a7c59", darkColor: "#2d5c3a", label: "Forest",   icon: "🌲", moveC: 2, manaColor: "G" },
  SWAMP:    { id: "SWAMP",    color: "#4a5568", darkColor: "#2d3748", label: "Swamp",    icon: "🌿", moveC: 3, manaColor: "B" },
  MOUNTAIN: { id: "MOUNTAIN", color: "#9b7355", darkColor: "#7a5533", label: "Mountain", icon: "⛰", moveC: 2, manaColor: "R" },
  ISLAND:   { id: "ISLAND",   color: "#4a90b8", darkColor: "#2c6d94", label: "Island",   icon: "~",  moveC: 2, manaColor: "U" },
  WATER:    { id: "WATER",    color: "#1a3a5c", darkColor: "#0f2235", label: "Water",    icon: "≈",  moveC: 99, manaColor: "U" },
};

const STRUCTURE = {
  TOWN:      { id: "TOWN",      icon: "⌂", label: "Town" },
  DUNGEON:   { id: "DUNGEON",   icon: "⚑", label: "Dungeon" },
  CASTLE_W:  { id: "CASTLE_W",  icon: "♔", label: "White Keep",  color: "#f0e6c8", mage: "Delenia",  manaColor: "W" },
  CASTLE_U:  { id: "CASTLE_U",  icon: "♔", label: "Azure Tower", color: "#8ec8f0", mage: "Xylos",    manaColor: "U" },
  CASTLE_B:  { id: "CASTLE_B",  icon: "♔", label: "Shadow Spire",color: "#a080c0", mage: "Mortis",   manaColor: "B" },
  CASTLE_R:  { id: "CASTLE_R",  icon: "♔", label: "Fire Citadel",color: "#f08060", mage: "Karag",    manaColor: "R" },
  CASTLE_G:  { id: "CASTLE_G",  icon: "♔", label: "Root Throne", color: "#80c070", mage: "Sylvara",  manaColor: "G" },
};

const MAGE_COLORS = ["W","U","B","R","G"];
const MAGE_NAMES  = { W:"Delenia", U:"Xylos", B:"Mortis", R:"Karag", G:"Sylvara" };
const MAGE_TITLES = { W:"the White Tyrant", U:"the Blue Schemer", B:"the Black Necromancer", R:"the Red Warlord", G:"the Green Ancient" };
const MANA_SYMBOLS= { W:"☀", U:"💧", B:"💀", R:"🔥", G:"🌿" };
const MANA_COLORS_HEX = { W:"#f9f2d8", U:"#99ccee", B:"#bb99dd", R:"#ee8855", G:"#88cc66" };

const COLOR_STARTERS = {
  W: { name:"White", label:"Order & Protection", startDeck:["Savannah Lions","Swords to Plowshares","White Knight","Serra Angel","Wrath of God","Plains","Plains","Plains","Plains","Plains","Plains","Plains","Plains","Plains","Plains"], startHP:22, startGold:40, flavor:"The light of justice guides your blade." },
  U: { name:"Blue",  label:"Control & Knowledge", startDeck:["Counterspell","Merfolk of the Pearl Trident","Air Elemental","Ancestral Recall","Island","Island","Island","Island","Island","Island","Island","Island","Island","Island","Island"], startHP:18, startGold:50, flavor:"Knowledge is the mightiest spell of all." },
  B: { name:"Black", label:"Power & Sacrifice",   startDeck:["Dark Ritual","Hypnotic Specter","Terror","Sengir Vampire","Demonic Tutor","Swamp","Swamp","Swamp","Swamp","Swamp","Swamp","Swamp","Swamp","Swamp","Swamp"], startHP:18, startGold:35, flavor:"Power demands sacrifice — others' or yours." },
  R: { name:"Red",   label:"Speed & Chaos",       startDeck:["Lightning Bolt","Goblin King","Fireball","Mountain","Mountain","Mountain","Mountain","Mountain","Mountain","Mountain","Mountain","Mountain","Mountain","Mountain","Mountain"], startHP:20, startGold:40, flavor:"Strike first. Strike hard. Ask questions never." },
  G: { name:"Green", label:"Growth & Might",      startDeck:["Llanowar Elves","Craw Wurm","Stream of Life","Forest","Forest","Forest","Forest","Forest","Forest","Forest","Forest","Forest","Forest","Forest","Forest"], startHP:22, startGold:30, flavor:"The land itself rises to answer your call." },
};

const TOWN_NAMES = [
  "Ardestan","Veldatha","Morheim","Caelthas","Sunspire","Duskwall","Greymere",
  "Thornhaven","Ironwake","Silverbend","Coldwater","Emberfield","Ashwood","Deepmoor",
  "Starfall","Crestholm","Mistpeak","Dawncroft","Stonebridge","Oakhearth"
];

const DUNGEON_NAMES = [
  "Tomb of the Ancients","Cavern of Echoes","Vault of Shadows","The Sunken Library",
  "Crypts of Mortum","Maze of Lost Souls","The Shattered Keep","Den of the Beast",
  "Forgotten Catacombs","The Spiral Descent","Lair of the Wyrm","The Iron Labyrinth"
];

const DUNGEON_MODIFIERS = [
  { id:"POWER_STRUGGLE", name:"Power Struggle", desc:"Each turn, a random card swaps between players' hands.", icon:"⇄" },
  { id:"CURSED_GROUND",  name:"Cursed Ground",  desc:"All creatures enter play with a -1/-1 counter.", icon:"☠" },
  { id:"MANA_SURGE",     name:"Mana Surge",     desc:"Both players gain +1 mana each turn.", icon:"⚡" },
  { id:"SILENCE",        name:"Silence",        desc:"No instants may be cast. All spells are sorcery speed.", icon:"🤐" },
  { id:"TWILIGHT",       name:"Eternal Twilight",desc:"No creatures may attack until turn 3.", icon:"🌘" },
  { id:"OVERLOAD",       name:"Overload",       desc:"Spells cost 1 less mana, to a minimum of 1.", icon:"✦" },
];

const SHOP_CARDS = [
  { name:"Lightning Bolt",      cost:"R",    cmc:1, type:"Instant",  rarity:"C", text:"Lightning Bolt deals 3 damage to any target.", color:"R", price:8 },
  { name:"Counterspell",        cost:"UU",   cmc:2, type:"Instant",  rarity:"U", text:"Counter target spell.", color:"U", price:15 },
  { name:"Dark Ritual",         cost:"B",    cmc:1, type:"Instant",  rarity:"C", text:"Add BBB.", color:"B", price:6 },
  { name:"Llanowar Elves",      cost:"G",    cmc:1, type:"Creature", rarity:"C", text:"T: Add G.", color:"G", price:5, power:"1", toughness:"1" },
  { name:"Savannah Lions",      cost:"W",    cmc:1, type:"Creature", rarity:"R", text:"", color:"W", price:20, power:"2", toughness:"1" },
  { name:"Terror",              cost:"1B",   cmc:2, type:"Instant",  rarity:"C", text:"Destroy target non-artifact, non-black creature.", color:"B", price:7 },
  { name:"Giant Growth",        cost:"G",    cmc:1, type:"Instant",  rarity:"C", text:"Target creature gets +3/+3 until end of turn.", color:"G", price:4 },
  { name:"Healing Salve",       cost:"W",    cmc:1, type:"Instant",  rarity:"C", text:"Target player gains 3 life.", color:"W", price:3 },
  { name:"Ancestral Recall",    cost:"U",    cmc:1, type:"Instant",  rarity:"R", text:"Target player draws three cards.", color:"U", price:80 },
  { name:"Swords to Plowshares",cost:"W",    cmc:1, type:"Instant",  rarity:"U", text:"Exile target creature. Its controller gains life equal to its power.", color:"W", price:18 },
  { name:"Hypnotic Specter",    cost:"1BB",  cmc:3, type:"Creature", rarity:"U", text:"Flying. Whenever deals combat damage, opponent discards a card at random.", color:"B", price:22, power:"2", toughness:"2" },
  { name:"Serra Angel",         cost:"3WW",  cmc:5, type:"Creature", rarity:"U", text:"Flying, vigilance.", color:"W", price:25, power:"4", toughness:"4" },
  { name:"Air Elemental",       cost:"3UU",  cmc:5, type:"Creature", rarity:"U", text:"Flying.", color:"U", price:18, power:"4", toughness:"4" },
  { name:"Fireball",            cost:"XR",   cmc:2, type:"Sorcery",  rarity:"C", text:"Deals X damage divided among any number of targets.", color:"R", price:8 },
  { name:"Stone Rain",          cost:"2R",   cmc:3, type:"Sorcery",  rarity:"C", text:"Destroy target land.", color:"R", price:6 },
  { name:"Craw Wurm",           cost:"4GG",  cmc:6, type:"Creature", rarity:"C", text:"", color:"G", price:4, power:"6", toughness:"4" },
  { name:"White Knight",        cost:"WW",   cmc:2, type:"Creature", rarity:"U", text:"First strike, protection from black.", color:"W", price:14, power:"2", toughness:"2" },
  { name:"Goblin King",         cost:"1RR",  cmc:3, type:"Creature", rarity:"R", text:"Other Goblins get +1/+1 and have mountainwalk.", color:"R", price:30, power:"2", toughness:"2" },
  { name:"Merfolk of the Pearl Trident", cost:"U", cmc:1, type:"Creature", rarity:"C", text:"Islandwalk.", color:"U", price:4, power:"1", toughness:"1" },
  { name:"Wrath of God",        cost:"2WW",  cmc:4, type:"Sorcery",  rarity:"R", text:"Destroy all creatures. They can't be regenerated.", color:"W", price:35 },
  { name:"Demonic Tutor",       cost:"1B",   cmc:2, type:"Sorcery",  rarity:"U", text:"Search your library for a card. Put that card into your hand.", color:"B", price:40 },
  { name:"Disenchant",          cost:"1W",   cmc:2, type:"Instant",  rarity:"C", text:"Destroy target artifact or enchantment.", color:"W", price:5 },
  { name:"Stream of Life",      cost:"XG",   cmc:2, type:"Sorcery",  rarity:"C", text:"Target player gains X life.", color:"G", price:5 },
  { name:"Force of Nature",     cost:"2GGGG",cmc:8, type:"Creature", rarity:"R", text:"Trample. At the beginning of your upkeep, pay GGGG or Force of Nature deals 8 damage to you.", color:"G", price:28, power:"8", toughness:"8" },
  { name:"Armageddon",          cost:"3W",   cmc:4, type:"Sorcery",  rarity:"R", text:"Destroy all lands.", color:"W", price:32 },
  { name:"Black Lotus",         cost:"0",    cmc:0, type:"Artifact", rarity:"R", text:"T, Sacrifice Black Lotus: Add three mana of any one color.", color:"", price:999 },
];

const MONSTERS_BY_TERRAIN = {
  PLAINS:   [{ name:"Pegasus Cavalry", hp:20, deckColor:"W", tier:1 },{ name:"Knight of the Keep", hp:22, deckColor:"W", tier:2 }],
  FOREST:   [{ name:"Forest Spider", hp:20, deckColor:"G", tier:1 },{ name:"Elder Druid", hp:24, deckColor:"G", tier:2 }],
  SWAMP:    [{ name:"Risen Zombie", hp:20, deckColor:"B", tier:1 },{ name:"Shadow Specter", hp:22, deckColor:"B", tier:2 }],
  MOUNTAIN: [{ name:"Goblin Raider", hp:18, deckColor:"R", tier:1 },{ name:"Mountain Ogre", hp:24, deckColor:"R", tier:2 }],
  ISLAND:   [{ name:"Sea Serpent", hp:20, deckColor:"U", tier:1 },{ name:"Tidal Sorcerer", hp:22, deckColor:"U", tier:2 }],
};

const GUILD_QUESTS = [
  { id:"q1", title:"Purge the Risen", desc:"Defeat 2 undead creatures in the nearby swamp.", reward:"Swords to Plowshares", rewardType:"card", rewardGold:0 },
  { id:"q2", title:"Recover the Tome",desc:"Retrieve the lost tome from the dungeon to the east.", reward:null, rewardType:"gold", rewardGold:60 },
  { id:"q3", title:"Defend the Gate", desc:"Fend off the goblin horde that approaches from the mountains.", reward:"Wrath of God", rewardType:"card", rewardGold:0 },
  { id:"q4", title:"Chart the Wilds", desc:"Explore 5 unrevealed tiles and report back.", reward:null, rewardType:"gold", rewardGold:40 },
  { id:"q5", title:"The Lost Spell",  desc:"Find a sage who knows the ancient counterspell and retrieve it.", reward:"Counterspell", rewardType:"card", rewardGold:0 },
];

const ARTIFACTS = [
  { id:"boots",   name:"Magical Boots",   icon:"👢", desc:"Movement cost –1 on all terrain (minimum 1).", owned:false },
  { id:"amulet",  name:"Amulet of Life",  icon:"💎", desc:"Maximum HP +5.", owned:false },
  { id:"focus",   name:"Mage's Focus",    icon:"🔮", desc:"Draw 1 extra card at the start of each duel.", owned:false },
  { id:"ward",    name:"Arzakon's Ward",  icon:"🛡", desc:"Mana link defeat threshold raised from 3 to 5.", owned:false },
  { id:"stone",   name:"Scrying Stone",   icon:"🔯", desc:"Reveal 1 dungeon per town visit for free.", owned:false },
];

const LOG_TYPES = { INFO:"info", WARN:"warn", DANGER:"danger", SUCCESS:"success", EVENT:"event" };

// ============================================================
// SEEDED RNG
// ============================================================
function mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ============================================================
// MAP GENERATION
// ============================================================
function generateMap(seed) {
  const rng = mulberry32(seed);
  const tiles = [];

  // Base terrain using simplex-like noise (approximate with RNG layers)
  for (let y = 0; y < MAP_H; y++) {
    tiles[y] = [];
    for (let x = 0; x < MAP_W; x++) {
      const nx = x / MAP_W - 0.5;
      const ny = y / MAP_H - 0.5;
      const distCenter = Math.sqrt(nx*nx + ny*ny);
      const noiseVal = rng();

      let terrain;
      if (distCenter > 0.45 && noiseVal > 0.3) {
        terrain = TERRAIN.WATER;
      } else if (noiseVal < 0.18) {
        terrain = TERRAIN.MOUNTAIN;
      } else if (noiseVal < 0.32) {
        terrain = TERRAIN.SWAMP;
      } else if (noiseVal < 0.52) {
        terrain = TERRAIN.FOREST;
      } else if (noiseVal < 0.72) {
        terrain = TERRAIN.PLAINS;
      } else {
        terrain = TERRAIN.ISLAND;
      }

      tiles[y][x] = {
        x, y,
        terrain,
        structure: null,
        revealed: false,
        encounterChance: terrain === TERRAIN.WATER ? 0 : 0.15 + (distCenter * 0.2),
        manaLink: null,
        townData: null,
        dungeonData: null,
      };
    }
  }

  // Place structures
  const usedPositions = new Set();
  const occupy = (x, y) => usedPositions.has(`${x},${y}`);
  const claim   = (x, y) => usedPositions.add(`${x},${y}`);

  const findSpot = (preferTerrain, minX, maxX, minY, maxY, minDist=4) => {
    for (let attempt = 0; attempt < 200; attempt++) {
      const x = Math.floor(minX + rng() * (maxX - minX));
      const y = Math.floor(minY + rng() * (maxY - minY));
      if (tiles[y]?.[x]?.terrain === TERRAIN.WATER) continue;
      if (occupy(x, y)) continue;
      let tooClose = false;
      for (const key of usedPositions) {
        const [ox, oy] = key.split(",").map(Number);
        if (Math.abs(ox-x) + Math.abs(oy-y) < minDist) { tooClose = true; break; }
      }
      if (!tooClose) {
        if (preferTerrain && tiles[y][x].terrain !== preferTerrain) {
          if (rng() > 0.4) continue;
        }
        return { x, y };
      }
    }
    return null;
  };

  // Towns (8–10)
  const townCount = 8 + Math.floor(rng() * 3);
  const townNamesShuffled = [...TOWN_NAMES].sort(() => rng() - 0.5);
  for (let i = 0; i < townCount; i++) {
    const pos = findSpot(null, 2, MAP_W-2, 2, MAP_H-2, 3);
    if (!pos) continue;
    claim(pos.x, pos.y);
    const shopStock = [...SHOP_CARDS].sort(() => rng()-0.5).slice(0, 6+Math.floor(rng()*5));
    tiles[pos.y][pos.x].structure = STRUCTURE.TOWN;
    tiles[pos.y][pos.x].townData = {
      name: townNamesShuffled[i] || `Village ${i+1}`,
      shopStock,
      innCostPerHP: 3,
      hasSage: rng() > 0.5,
      hasBlackMarket: rng() > 0.75,
      quest: rng() > 0.4 ? GUILD_QUESTS[Math.floor(rng()*GUILD_QUESTS.length)] : null,
    };
  }

  // Dungeons (6–8)
  const dungeonCount = 6 + Math.floor(rng() * 3);
  const dungeonNamesShuffled = [...DUNGEON_NAMES].sort(() => rng()-0.5);
  for (let i = 0; i < dungeonCount; i++) {
    const pos = findSpot(null, 2, MAP_W-2, 2, MAP_H-2, 4);
    if (!pos) continue;
    claim(pos.x, pos.y);
    const modifier = DUNGEON_MODIFIERS[Math.floor(rng()*DUNGEON_MODIFIERS.length)];
    const rooms = 3 + Math.floor(rng()*3);
    tiles[pos.y][pos.x].structure = STRUCTURE.DUNGEON;
    tiles[pos.y][pos.x].dungeonData = {
      name: dungeonNamesShuffled[i] || `Dungeon ${i+1}`,
      modifier,
      rooms,
      dominantColor: MAGE_COLORS[Math.floor(rng()*5)],
      cluesFound: 0,
      loot: [...SHOP_CARDS].filter(c=>c.rarity==="R").sort(()=>rng()-0.5).slice(0,2),
      explored: false,
    };
  }

  // Mage Castles (one per color, in different quadrants)
  const castlePositions = [
    { minX:2,        maxX:MAP_W/2-2, minY:2,        maxY:MAP_H/2-2 },
    { minX:MAP_W/2+2,maxX:MAP_W-2,   minY:2,        maxY:MAP_H/2-2 },
    { minX:2,        maxX:MAP_W/2-2, minY:MAP_H/2+2,maxY:MAP_H-2   },
    { minX:MAP_W/2+2,maxX:MAP_W-2,   minY:MAP_H/2+2,maxY:MAP_H-2   },
    { minX:MAP_W/2-3,maxX:MAP_W/2+3, minY:MAP_H/2-3,maxY:MAP_H/2+3 },
  ];
  const castleColors = [...MAGE_COLORS].sort(()=>rng()-0.5);
  const castleStructIds = { W:"CASTLE_W", U:"CASTLE_U", B:"CASTLE_B", R:"CASTLE_R", G:"CASTLE_G" };
  castleColors.forEach((color, i) => {
    const quad = castlePositions[i];
    const pos = findSpot(null, quad.minX, quad.maxX, quad.minY, quad.maxY, 5);
    if (!pos) return;
    claim(pos.x, pos.y);
    tiles[pos.y][pos.x].structure = STRUCTURE[castleStructIds[color]];
    tiles[pos.y][pos.x].castleData = { color, mage: MAGE_NAMES[color], defeated: false, manaLinks: 0 };
  });

  // Player start: near center, not on water
  let startX = Math.floor(MAP_W/2), startY = Math.floor(MAP_H/2);
  for (let r = 0; r < 10; r++) {
    if (tiles[startY]?.[startX]?.terrain !== TERRAIN.WATER && !tiles[startY]?.[startX]?.structure) break;
    startX += (rng()>0.5?1:-1);
    startY += (rng()>0.5?1:-1);
    startX = Math.max(1, Math.min(MAP_W-2, startX));
    startY = Math.max(1, Math.min(MAP_H-2, startY));
  }

  // Reveal starting area
  for (let dy=-2; dy<=2; dy++) for (let dx=-2; dx<=2; dx++) {
    if (tiles[startY+dy]?.[startX+dx]) tiles[startY+dy][startX+dx].revealed = true;
  }

  return { tiles, startX, startY, seed };
}

// ============================================================
// PATHFINDING (BFS, ignores unrevealed and water)
// ============================================================
function findPath(tiles, sx, sy, ex, ey, hasBoots) {
  if (!tiles[ey]?.[ex] || tiles[ey][ex].terrain === TERRAIN.WATER) return null;
  const visited = new Set([`${sx},${sy}`]);
  const queue = [{ x:sx, y:sy, path:[] }];
  const dirs = [[0,1],[0,-1],[1,0],[-1,0]];
  while (queue.length) {
    const { x, y, path } = queue.shift();
    if (x===ex && y===ey) return path;
    for (const [dx,dy] of dirs) {
      const nx=x+dx, ny=y+dy;
      const key=`${nx},${ny}`;
      if (visited.has(key)) continue;
      const t=tiles[ny]?.[nx];
      if (!t || !t.revealed || t.terrain===TERRAIN.WATER) continue;
      visited.add(key);
      queue.push({ x:nx, y:ny, path:[...path,{x:nx,y:ny}] });
    }
  }
  return null;
}

// ============================================================
// MANA SYMBOL COMPONENT
// ============================================================
function ManaSymbol({ sym, size=14 }) {
  const bg = { W:"#f9f0d0", U:"#6699cc", B:"#8855bb", R:"#cc5533", G:"#55aa44", "":"#888" };
  const label = { W:"W", U:"U", B:"B", R:"R", G:"G", "":"?" };
  return (
    <span style={{
      display:"inline-flex", alignItems:"center", justifyContent:"center",
      width:size, height:size, borderRadius:"50%",
      background:bg[sym]||"#888", color:sym==="W"?"#665500":"#fff",
      fontSize:size*0.55, fontWeight:700, border:"1px solid rgba(0,0,0,0.4)",
      flexShrink:0, lineHeight:1,
    }}>{label[sym]||sym}</span>
  );
}

// ============================================================
// CARD COMPONENT
// ============================================================
function CardMini({ card, compact=false, onClick, selected=false, showPrice=false }) {
  if (!card) return null;
  const colorBg = {
    W:"linear-gradient(135deg,#f9f2d8,#e8dfc0)",
    U:"linear-gradient(135deg,#c8dff0,#a0c4e0)",
    B:"linear-gradient(135deg,#c8b8d8,#a090b8)",
    R:"linear-gradient(135deg,#f0c8a8,#e0a080)",
    G:"linear-gradient(135deg,#b8d8a0,#90c070)",
    "":"linear-gradient(135deg,#d0d0c8,#b0b0a8)",
  };
  const bg = colorBg[card.color]||colorBg[""];
  const isCreature = card.type?.includes("Creature");

  return (
    <div onClick={onClick} style={{
      background:bg,
      border: selected ? "2px solid #f0c040":"2px solid rgba(0,0,0,0.25)",
      borderRadius:6,
      padding: compact?"4px 6px":"8px",
      cursor: onClick?"pointer":"default",
      width: compact?110:130,
      minHeight: compact?50:80,
      position:"relative",
      boxShadow: selected?"0 0 8px #f0c040, 0 2px 6px rgba(0,0,0,0.4)":"0 2px 6px rgba(0,0,0,0.3)",
      transition:"transform 0.15s, box-shadow 0.15s",
      flexShrink:0,
    }} onMouseEnter={e=>{ if(onClick){e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow=selected?"0 0 10px #f0c040,0 6px 12px rgba(0,0,0,0.5)":"0 6px 12px rgba(0,0,0,0.5)"; }}}
    onMouseLeave={e=>{ e.currentTarget.style.transform="";e.currentTarget.style.boxShadow=selected?"0 0 8px #f0c040,0 2px 6px rgba(0,0,0,0.4)":"0 2px 6px rgba(0,0,0,0.3)"; }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:2 }}>
        <span style={{ fontSize:compact?9:10, fontWeight:700, color:"#2a1800", fontFamily:"'Cinzel',serif", lineHeight:1.2, flex:1 }}>{card.name}</span>
        <div style={{ display:"flex", gap:1, marginLeft:3 }}>
          {(card.cost||"").split("").map((c,i)=><ManaSymbol key={i} sym={c} size={compact?10:12}/>)}
        </div>
      </div>
      <div style={{ fontSize:8, color:"#5a3a10", marginBottom:2, fontStyle:"italic" }}>{card.type}</div>
      {!compact && <div style={{ fontSize:8, color:"#3a2800", lineHeight:1.3 }}>{card.text?.slice(0,60)}{card.text?.length>60?"…":""}</div>}
      {isCreature && <div style={{ position:"absolute", bottom:4, right:6, fontSize:compact?9:11, fontWeight:700, color:"#2a1800" }}>{card.power}/{card.toughness}</div>}
      {showPrice && <div style={{ position:"absolute", bottom:4, left:6, fontSize:9, color:"#8a6000", fontWeight:700 }}>{card.price}g</div>}
      <div style={{ position:"absolute", top:3, left:3, width:5, height:5, borderRadius:"50%",
        background:card.rarity==="R"?"#f0c040":card.rarity==="U"?"#a0b8d0":"#c0c0c0" }}/>
    </div>
  );
}

// ============================================================
// LOG PANEL
// ============================================================
function LogPanel({ log }) {
  const ref = useRef(null);
  useEffect(()=>{ if(ref.current) ref.current.scrollTop=ref.current.scrollHeight; },[log]);
  const colors = { info:"#a8c0a0", warn:"#f0c060", danger:"#e06050", success:"#60c080", event:"#c0a0e0" };
  return (
    <div ref={ref} style={{
      height:160, overflowY:"auto", padding:"8px 10px",
      background:"rgba(0,0,0,0.35)", borderRadius:6,
      border:"1px solid rgba(200,170,100,0.2)",
      scrollbarWidth:"thin", scrollbarColor:"#8a6020 #1a1000",
    }}>
      {log.map((entry,i)=>(
        <div key={i} style={{ fontSize:11, color:colors[entry.type]||"#a0b090", marginBottom:3, lineHeight:1.4, fontFamily:"'Crimson Text',serif" }}>
          <span style={{ color:"rgba(180,150,80,0.5)", marginRight:6, fontSize:10 }}>{entry.turn ? `T${entry.turn}` : "—"}</span>
          {entry.text}
        </div>
      ))}
    </div>
  );
}

// ============================================================
// HUD
// ============================================================
function HUD({ player, manaLinks, magesDefeated, artifacts, moveCount }) {
  const hasWard = artifacts.some(a=>a.id==="ward"&&a.owned);
  const threshold = hasWard ? 5 : 3;

  return (
    <div style={{
      display:"flex", gap:10, alignItems:"center", flexWrap:"wrap",
      padding:"8px 12px", background:"rgba(0,0,0,0.5)",
      borderBottom:"1px solid rgba(200,170,100,0.3)",
    }}>
      {/* HP */}
      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
        <div style={{ fontSize:11, color:"#c8a060", fontFamily:"'Cinzel',serif" }}>HP</div>
        <div style={{ width:90, height:14, background:"#1a0a00", borderRadius:7, border:"1px solid #5a3010", overflow:"hidden" }}>
          <div style={{ width:`${(player.hp/player.maxHP)*100}%`, height:"100%",
            background: player.hp > player.maxHP*0.5 ? "linear-gradient(90deg,#c04020,#e06040)" :
                        player.hp > player.maxHP*0.25 ? "linear-gradient(90deg,#a03010,#c05030)" :
                        "linear-gradient(90deg,#800010,#c01020)",
            transition:"width 0.4s", borderRadius:7 }}/>
        </div>
        <span style={{ fontSize:11, color:"#e08060", fontFamily:"'Cinzel',serif", minWidth:40 }}>{player.hp}/{player.maxHP}</span>
      </div>

      {/* Gold & Gems */}
      <div style={{ display:"flex", gap:10 }}>
        <div style={{ fontSize:12, color:"#f0c040", fontFamily:"'Cinzel',serif" }}>⚙ {player.gold}g</div>
        <div style={{ fontSize:12, color:"#a080e0", fontFamily:"'Cinzel',serif" }}>◆ {player.gems}</div>
        <div style={{ fontSize:11, color:"#8090a0", fontFamily:"'Cinzel',serif" }}>Move {moveCount}</div>
      </div>

      {/* Mana Links */}
      <div style={{ display:"flex", gap:6, alignItems:"center" }}>
        <span style={{ fontSize:10, color:"#a08060", fontFamily:"'Cinzel',serif" }}>LINKS:</span>
        {MAGE_COLORS.map(c=>{
          const links = manaLinks[c]||0;
          const defeated = magesDefeated.includes(c);
          return (
            <div key={c} title={`${MAGE_NAMES[c]}: ${links}/${threshold} mana links${defeated?" (DEFEATED)":""}`}
              style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:1 }}>
              <div style={{ fontSize:10, fontFamily:"'Cinzel',serif",
                color: defeated?"#405030" : links>=threshold?"#ff2020" : links>=threshold-1?"#f08020" : "#a09070" }}>
                {MANA_SYMBOLS[c]}
              </div>
              <div style={{ display:"flex", gap:1 }}>
                {[...Array(threshold)].map((_,i)=>(
                  <div key={i} style={{ width:5, height:5, borderRadius:1,
                    background: defeated?"#2a3020" : i<links ? MANA_COLORS_HEX[c] : "rgba(255,255,255,0.1)",
                    border:"1px solid rgba(255,255,255,0.1)" }}/>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Artifacts */}
      <div style={{ display:"flex", gap:4 }}>
        {artifacts.filter(a=>a.owned).map(a=>(
          <div key={a.id} title={`${a.name}: ${a.desc}`}
            style={{ fontSize:14, filter:"drop-shadow(0 0 3px rgba(200,160,80,0.6))", cursor:"help" }}>
            {a.icon}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// TILE RENDERER
// ============================================================
function MapTile({ tile, isPlayer, isSelected, onClick, scale=1 }) {
  const ts = TILE_SIZE * scale;
  const t = tile.terrain;
  const s = tile.structure;

  if (!tile.revealed) {
    return (
      <div onClick={()=>onClick(tile)} style={{
        width:ts, height:ts, background:"#0a0808",
        border:"1px solid #1a1210", cursor:"pointer",
        display:"flex", alignItems:"center", justifyContent:"center",
        fontSize:ts*0.35, color:"rgba(255,255,255,0.03)",
      }}>▪</div>
    );
  }

  const bgColor = t.color;
  const hasManaLink = tile.manaLink;
  const manaLinkColor = hasManaLink ? MANA_COLORS_HEX[hasManaLink] : null;

  return (
    <div onClick={()=>onClick(tile)} style={{
      width:ts, height:ts,
      background: bgColor,
      border: isSelected ? "2px solid #f0c040" : isPlayer ? "2px solid #ffffff" : "1px solid rgba(0,0,0,0.25)",
      cursor:"pointer",
      display:"flex", alignItems:"center", justifyContent:"center",
      position:"relative",
      boxShadow: isPlayer ? "0 0 8px rgba(255,255,220,0.8)" : isSelected ? "0 0 6px rgba(240,192,64,0.6)" : "none",
      transition:"border 0.1s",
      overflow:"hidden",
    }}>
      {/* terrain texture */}
      <div style={{ position:"absolute", inset:0, opacity:0.3,
        background: t===TERRAIN.WATER ? "repeating-linear-gradient(45deg,transparent,transparent 4px,rgba(255,255,255,0.1) 4px,rgba(255,255,255,0.1) 5px)" :
          t===TERRAIN.MOUNTAIN ? "radial-gradient(ellipse at 50% 80%,rgba(0,0,0,0.3),transparent 70%)" : "none" }}/>

      {/* mana link corruption overlay */}
      {hasManaLink && (
        <div style={{ position:"absolute", inset:0, background:`${manaLinkColor}40`,
          border:`2px solid ${manaLinkColor}80`, animation:"pulse 2s infinite" }}/>
      )}

      {/* structure icon */}
      {s && (
        <div style={{ fontSize:ts*0.42, lineHeight:1, zIndex:2, filter:"drop-shadow(0 1px 2px rgba(0,0,0,0.7))" }}>
          {s.icon}
        </div>
      )}

      {/* terrain icon (if no structure) */}
      {!s && t!==TERRAIN.WATER && (
        <div style={{ fontSize:ts*0.38, lineHeight:1, opacity:0.6, zIndex:1 }}>
          {t.icon}
        </div>
      )}
      {!s && t===TERRAIN.WATER && (
        <div style={{ fontSize:ts*0.3, color:"#4a90b8", opacity:0.5 }}>≈</div>
      )}

      {/* player token */}
      {isPlayer && (
        <div style={{
          position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", zIndex:10,
        }}>
          <div style={{
            width:ts*0.55, height:ts*0.55, borderRadius:"50%",
            background:"radial-gradient(circle at 35% 35%, #fff8e0, #e0c050)",
            border:"2px solid rgba(255,255,255,0.8)",
            boxShadow:"0 0 10px rgba(255,240,100,0.8), 0 2px 4px rgba(0,0,0,0.5)",
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:ts*0.3, animation:"wizardPulse 2s ease-in-out infinite",
          }}>🧙</div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// TOWN MODAL
// ============================================================
function TownModal({ town, player, onClose, onBuy, onRest, onGetClue, moveCount }) {
  const [tab, setTab] = useState("shop");
  const restCost = Math.max(0, (player.maxHP - player.hp) * town.innCostPerHP);
  const canRest = player.hp < player.maxHP && player.gold >= restCost;

  const tabs = [
    { id:"shop", label:"⚜ Card Shop" },
    { id:"inn",  label:"🏠 Inn" },
    ...(town.hasSage?[{ id:"sage", label:"📜 Sage" }]:[]),
    ...(town.hasBlackMarket?[{ id:"black", label:"⚫ Black Market" }]:[]),
    ...(town.quest?[{ id:"guild", label:"⚔ Guild Hall" }]:[]),
  ];

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200 }}>
      <div style={{
        width:520, maxHeight:"80vh", background:"linear-gradient(160deg,#1a1008,#0e0c04)",
        border:"2px solid rgba(200,160,60,0.5)", borderRadius:10,
        boxShadow:"0 0 40px rgba(0,0,0,0.8), inset 0 0 30px rgba(200,160,40,0.05)",
        display:"flex", flexDirection:"column", overflow:"hidden",
      }}>
        {/* Header */}
        <div style={{ padding:"14px 18px 0", borderBottom:"1px solid rgba(200,160,60,0.2)" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
            <div>
              <div style={{ fontSize:18, fontFamily:"'Cinzel',serif", color:"#f0c060" }}>⌂ {town.name}</div>
              <div style={{ fontSize:11, color:"#806040", marginTop:2, fontFamily:"'Crimson Text',serif", fontStyle:"italic" }}>A waypoint in the realm of Shandalar</div>
            </div>
            <div style={{ display:"flex", gap:12, alignItems:"center" }}>
              <span style={{ fontSize:13, color:"#f0c040", fontFamily:"'Cinzel',serif" }}>⚙ {player.gold}g</span>
              <button onClick={onClose} style={{ background:"transparent", border:"1px solid #5a3020", color:"#c08060", borderRadius:4, padding:"4px 10px", cursor:"pointer", fontSize:12 }}>✕ Leave</button>
            </div>
          </div>
          <div style={{ display:"flex", gap:0 }}>
            {tabs.map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)} style={{
                background: tab===t.id ? "rgba(200,160,60,0.15)" : "transparent",
                border:"none", borderBottom: tab===t.id ? "2px solid #f0c060" : "2px solid transparent",
                color: tab===t.id ? "#f0c060" : "#806040",
                padding:"8px 14px", cursor:"pointer", fontSize:11, fontFamily:"'Cinzel',serif",
                transition:"all 0.2s",
              }}>{t.label}</button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex:1, overflowY:"auto", padding:18, scrollbarWidth:"thin", scrollbarColor:"#8a6020 #1a1000" }}>
          {tab==="shop" && (
            <div>
              <div style={{ fontSize:11, color:"#a08050", marginBottom:12, fontFamily:"'Crimson Text',serif", fontStyle:"italic" }}>
                "{town.name}'s merchant deals in cards of the arcane arts. Select wisely."
              </div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                {town.shopStock.map((card,i)=>(
                  <div key={i}>
                    <CardMini card={card} showPrice compact onClick={()=>onBuy(card)} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab==="inn" && (
            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              <div style={{ fontSize:11, color:"#a08050", fontFamily:"'Crimson Text',serif", fontStyle:"italic" }}>
                "Rest here, weary traveler. The fires of {town.name} burn warm against the darkness."
              </div>
              <div style={{ background:"rgba(255,255,255,0.04)", borderRadius:8, padding:16, border:"1px solid rgba(200,160,60,0.15)" }}>
                <div style={{ fontSize:13, color:"#c0a060", fontFamily:"'Cinzel',serif", marginBottom:8 }}>Your Condition</div>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
                  <div style={{ width:120, height:12, background:"#1a0a00", borderRadius:6, overflow:"hidden", border:"1px solid #5a3010" }}>
                    <div style={{ width:`${(player.hp/player.maxHP)*100}%`, height:"100%", background:"linear-gradient(90deg,#c04020,#e06040)", borderRadius:6 }}/>
                  </div>
                  <span style={{ fontSize:13, color:"#e08060", fontFamily:"'Cinzel',serif" }}>{player.hp} / {player.maxHP} HP</span>
                </div>
                {player.hp < player.maxHP ? (
                  <>
                    <div style={{ fontSize:12, color:"#a09070", marginBottom:12 }}>
                      Full rest will restore <strong style={{color:"#e08060"}}>{player.maxHP - player.hp} HP</strong> for <strong style={{color:"#f0c040"}}>{restCost} gold</strong>.
                    </div>
                    <button onClick={()=>canRest&&onRest(restCost)} style={{
                      background: canRest ? "linear-gradient(135deg,#3a2010,#5a3020)" : "rgba(0,0,0,0.3)",
                      border:`1px solid ${canRest?"#a06030":"#3a2810"}`,
                      color: canRest?"#f0c060":"#5a4030",
                      padding:"8px 20px", borderRadius:6, cursor:canRest?"pointer":"not-allowed",
                      fontFamily:"'Cinzel',serif", fontSize:13,
                    }}>🏠 Rest & Recover ({restCost}g)</button>
                    {!canRest && player.gold < restCost && <div style={{fontSize:11,color:"#a05030",marginTop:8}}>Insufficient gold.</div>}
                  </>
                ) : (
                  <div style={{ fontSize:13, color:"#60a060", fontFamily:"'Crimson Text',serif" }}>✓ You are at full health. No rest needed.</div>
                )}
              </div>
            </div>
          )}

          {tab==="sage" && (
            <div>
              <div style={{ fontSize:11, color:"#a08050", marginBottom:12, fontFamily:"'Crimson Text',serif", fontStyle:"italic" }}>
                "I have studied the old texts. For a price, I can reveal the secrets of a nearby dungeon..."
              </div>
              <div style={{ background:"rgba(255,255,255,0.04)", borderRadius:8, padding:14, border:"1px solid rgba(200,160,60,0.15)" }}>
                <div style={{ fontSize:12, color:"#c0a060", fontFamily:"'Cinzel',serif", marginBottom:8 }}>Dungeon Intelligence</div>
                <div style={{ fontSize:12, color:"#a09070", marginBottom:12 }}>
                  The sage can reveal the location of a hidden dungeon and one of its secrets for <strong style={{color:"#f0c040"}}>25 gold</strong>.
                </div>
                <button onClick={()=>player.gold>=25&&onGetClue()} style={{
                  background: player.gold>=25 ? "linear-gradient(135deg,#1a2830,#2a4050)" : "rgba(0,0,0,0.3)",
                  border:`1px solid ${player.gold>=25?"#4080a0":"#2a3810"}`,
                  color: player.gold>=25?"#80c0e0":"#5a4030",
                  padding:"8px 20px", borderRadius:6, cursor:player.gold>=25?"pointer":"not-allowed",
                  fontFamily:"'Cinzel',serif", fontSize:13,
                }}>📜 Seek Dungeon Knowledge (25g)</button>
              </div>
            </div>
          )}

          {tab==="black" && (
            <div>
              <div style={{ fontSize:11, color:"#a08050", marginBottom:12, fontFamily:"'Crimson Text',serif", fontStyle:"italic" }}>
                "Don't ask where these came from. Just... take what you need and leave no trace."
              </div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                {town.shopStock.filter(c=>c.rarity==="R").map((card,i)=>(
                  <div key={i}>
                    <CardMini card={{...card, price:Math.floor(card.price*1.5)}} showPrice compact onClick={()=>onBuy({...card,price:Math.floor(card.price*1.5)})} />
                  </div>
                ))}
                {town.shopStock.filter(c=>c.rarity==="R").length===0&&<div style={{color:"#605040",fontSize:12,fontStyle:"italic"}}>No rare goods available today.</div>}
              </div>
            </div>
          )}

          {tab==="guild" && town.quest && (
            <div>
              <div style={{ fontSize:11, color:"#a08050", marginBottom:12, fontFamily:"'Crimson Text',serif", fontStyle:"italic" }}>
                "Brave wizard — we have need of your talents. Will you answer the call?"
              </div>
              <div style={{ background:"rgba(255,255,255,0.04)", borderRadius:8, padding:16, border:"1px solid rgba(200,160,60,0.15)" }}>
                <div style={{ fontSize:14, color:"#e0c060", fontFamily:"'Cinzel',serif", marginBottom:6 }}>⚔ {town.quest.title}</div>
                <div style={{ fontSize:12, color:"#c0a070", marginBottom:12, fontFamily:"'Crimson Text',serif" }}>{town.quest.desc}</div>
                <div style={{ fontSize:11, color:"#80c080" }}>
                  Reward: {town.quest.rewardType==="card" ? <><strong>{town.quest.reward}</strong> (card)</> : <><strong>{town.quest.rewardGold} gold</strong></>}
                </div>
                <button style={{
                  marginTop:12, background:"linear-gradient(135deg,#2a1a08,#4a2a10)",
                  border:"1px solid #8a6020", color:"#f0c060",
                  padding:"8px 20px", borderRadius:6, cursor:"pointer",
                  fontFamily:"'Cinzel',serif", fontSize:12,
                }}>Accept Quest</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// DUNGEON MODAL
// ============================================================
function DungeonModal({ dungeon, onClose, onEnter }) {
  const mod = dungeon.modifier;
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.8)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200 }}>
      <div style={{
        width:440, background:"linear-gradient(160deg,#100a04,#0a0804)",
        border:"2px solid rgba(150,100,50,0.4)", borderRadius:10,
        boxShadow:"0 0 50px rgba(0,0,0,0.9), inset 0 0 20px rgba(100,60,20,0.05)",
        padding:24,
      }}>
        <div style={{ textAlign:"center", marginBottom:20 }}>
          <div style={{ fontSize:28, marginBottom:8 }}>⚑</div>
          <div style={{ fontSize:18, fontFamily:"'Cinzel',serif", color:"#c08040", marginBottom:4 }}>{dungeon.name}</div>
          <div style={{ fontSize:11, color:"#6a4820", fontFamily:"'Crimson Text',serif", fontStyle:"italic" }}>
            A place of shadow and terrible power...
          </div>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
          <div style={{ background:"rgba(255,255,255,0.04)", borderRadius:6, padding:10, border:"1px solid rgba(150,100,50,0.2)" }}>
            <div style={{ fontSize:10, color:"#8a6030", fontFamily:"'Cinzel',serif", marginBottom:4 }}>ROOMS</div>
            <div style={{ fontSize:20, fontFamily:"'Cinzel',serif", color:"#e0a060" }}>{dungeon.rooms}</div>
          </div>
          <div style={{ background:"rgba(255,255,255,0.04)", borderRadius:6, padding:10, border:"1px solid rgba(150,100,50,0.2)" }}>
            <div style={{ fontSize:10, color:"#8a6030", fontFamily:"'Cinzel',serif", marginBottom:4 }}>DOMINANT COLOR</div>
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              <ManaSymbol sym={dungeon.dominantColor} size={18}/>
              <span style={{ fontSize:13, color:"#c0a060", fontFamily:"'Cinzel',serif" }}>{MAGE_COLORS.map(c=>c)[0]}</span>
            </div>
          </div>
        </div>

        <div style={{ background:"rgba(80,20,0,0.2)", borderRadius:6, padding:12, marginBottom:16, border:"1px solid rgba(150,60,20,0.3)" }}>
          <div style={{ fontSize:10, color:"#a06040", fontFamily:"'Cinzel',serif", marginBottom:4 }}>{mod.icon} DUNGEON MODIFIER: {mod.name.toUpperCase()}</div>
          <div style={{ fontSize:12, color:"#c08050", fontFamily:"'Crimson Text',serif" }}>{mod.desc}</div>
        </div>

        {dungeon.loot.length>0 && (
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:10, color:"#8a6030", fontFamily:"'Cinzel',serif", marginBottom:8 }}>KNOWN LOOT (from clues)</div>
            <div style={{ display:"flex", gap:8 }}>
              {dungeon.loot.map((c,i)=><CardMini key={i} card={c} compact/>)}
            </div>
          </div>
        )}

        <div style={{ fontSize:11, color:"#8a5020", fontFamily:"'Crimson Text',serif", marginBottom:16, fontStyle:"italic" }}>
          ⚠ Warning: Your life total does not restore between rooms. You cannot exit and return.
        </div>

        <div style={{ display:"flex", gap:10 }}>
          <button onClick={onEnter} style={{
            flex:1, background:"linear-gradient(135deg,#3a1a08,#5a2a10)",
            border:"1px solid #a06030", color:"#f0a040",
            padding:"10px", borderRadius:6, cursor:"pointer",
            fontFamily:"'Cinzel',serif", fontSize:13, letterSpacing:1,
          }}>⚑ Enter Dungeon</button>
          <button onClick={onClose} style={{
            background:"transparent", border:"1px solid #4a3020", color:"#806040",
            padding:"10px 16px", borderRadius:6, cursor:"pointer",
            fontFamily:"'Cinzel',serif", fontSize:12,
          }}>Retreat</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MAGE CASTLE MODAL
// ============================================================
function CastleModal({ castleData, structure, onClose, onChallenge }) {
  const mageColor = castleData.color;
  const mage = MAGE_NAMES[mageColor];
  const title = MAGE_TITLES[mageColor];
  const sym = MANA_SYMBOLS[mageColor];
  const hexColor = MANA_COLORS_HEX[mageColor];

  const descriptions = {
    W: "Delenia rules with an iron fist clothed in white velvet. Her knights are impeccable. Her justice, merciless.",
    U: "Xylos has watched from his tower for centuries, manipulating events like pieces on a board. He knows you are coming.",
    B: "The stench of death precedes Mortis. His undead legions stretch to the horizon. Power is all he respects.",
    R: "Karag does not strategize. He burns. Cities fall before him like kindling. He relishes your challenge.",
    G: "Sylvara is ancient beyond reckoning. The forest itself is her ally. To fight her is to fight the land.",
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200 }}>
      <div style={{
        width:440, background:"linear-gradient(160deg,#0a0808,#050505)",
        border:`2px solid ${hexColor}50`, borderRadius:10,
        boxShadow:`0 0 50px ${hexColor}30, 0 0 80px rgba(0,0,0,0.9)`,
        padding:28,
      }}>
        <div style={{ textAlign:"center", marginBottom:20 }}>
          <div style={{ fontSize:32, marginBottom:8, filter:`drop-shadow(0 0 8px ${hexColor})` }}>{sym}</div>
          <div style={{ fontSize:11, color:`${hexColor}`, fontFamily:"'Cinzel',serif", letterSpacing:2, marginBottom:4 }}>
            {structure.label.toUpperCase()}
          </div>
          <div style={{ fontSize:22, fontFamily:"'Cinzel',serif", color:"#f0e0c0", marginBottom:4 }}>{mage}</div>
          <div style={{ fontSize:13, color:"#8a7060", fontFamily:"'Crimson Text',serif", fontStyle:"italic" }}>{title}</div>
        </div>

        <div style={{ background:`${hexColor}10`, borderRadius:8, padding:14, marginBottom:16, border:`1px solid ${hexColor}25` }}>
          <div style={{ fontSize:13, color:"#c0a070", fontFamily:"'Crimson Text',serif", lineHeight:1.6, fontStyle:"italic" }}>
            "{descriptions[mageColor]}"
          </div>
        </div>

        {castleData.defeated ? (
          <div style={{ textAlign:"center", padding:16 }}>
            <div style={{ fontSize:14, color:"#60a060", fontFamily:"'Cinzel',serif" }}>✓ Defeated</div>
            <div style={{ fontSize:11, color:"#506040", marginTop:4, fontFamily:"'Crimson Text',serif" }}>
              {mage}'s power has been broken. The {structure.label} stands silent.
            </div>
          </div>
        ) : (
          <div style={{ display:"flex", gap:10 }}>
            <button onClick={onChallenge} style={{
              flex:1, background:`linear-gradient(135deg, ${hexColor}20, ${hexColor}10)`,
              border:`1px solid ${hexColor}60`, color:hexColor,
              padding:"12px", borderRadius:6, cursor:"pointer",
              fontFamily:"'Cinzel',serif", fontSize:14, letterSpacing:1,
            }}>⚔ Challenge {mage}</button>
            <button onClick={onClose} style={{
              background:"transparent", border:"1px solid #4a3020", color:"#806040",
              padding:"10px 16px", borderRadius:6, cursor:"pointer",
              fontFamily:"'Cinzel',serif", fontSize:12,
            }}>Withdraw</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// ENCOUNTER MODAL (duel stub)
// ============================================================
function EncounterModal({ monster, playerHP, playerMaxHP, onWin, onFlee, moveCount }) {
  const [result, setResult] = useState(null); // null | "win" | "lose"
  const [rolled, setRolled] = useState(false);

  const resolveEncounter = (flee) => {
    if (flee) { onFlee(); return; }
    // Stub: random outcome weighted by monster tier
    const winChance = monster.tier===1 ? 0.72 : monster.tier===2 ? 0.58 : 0.42;
    const won = Math.random() < winChance;
    setResult(won?"win":"lose");
    setRolled(true);
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.82)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200 }}>
      <div style={{
        width:400, background:"linear-gradient(160deg,#0e0804,#080604)",
        border:"2px solid rgba(180,80,40,0.4)", borderRadius:10,
        boxShadow:"0 0 40px rgba(180,60,20,0.2)",
        padding:24,
      }}>
        <div style={{ textAlign:"center", marginBottom:20 }}>
          <div style={{ fontSize:28, marginBottom:6 }}>⚔</div>
          <div style={{ fontSize:11, color:"#a05030", fontFamily:"'Cinzel',serif", letterSpacing:2 }}>ENCOUNTER</div>
          <div style={{ fontSize:18, fontFamily:"'Cinzel',serif", color:"#f0a060", marginTop:4 }}>{monster.name}</div>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
          <div style={{ background:"rgba(255,255,255,0.04)", borderRadius:6, padding:10, textAlign:"center" }}>
            <div style={{ fontSize:10, color:"#8a5030", fontFamily:"'Cinzel',serif" }}>OPPONENT HP</div>
            <div style={{ fontSize:20, color:"#e08060", fontFamily:"'Cinzel',serif", marginTop:4 }}>{monster.hp}</div>
          </div>
          <div style={{ background:"rgba(255,255,255,0.04)", borderRadius:6, padding:10, textAlign:"center" }}>
            <div style={{ fontSize:10, color:"#8a5030", fontFamily:"'Cinzel',serif" }}>YOUR HP</div>
            <div style={{ fontSize:20, color:"#e08060", fontFamily:"'Cinzel',serif", marginTop:4 }}>{playerHP}/{playerMaxHP}</div>
          </div>
        </div>

        <div style={{ background:"rgba(0,0,0,0.3)", borderRadius:6, padding:10, marginBottom:16, border:"1px solid rgba(150,80,40,0.2)" }}>
          <div style={{ fontSize:11, color:"#a07050", fontFamily:"'Crimson Text',serif", fontStyle:"italic" }}>
            Color alignment: <ManaSymbol sym={monster.deckColor} size={12}/> &nbsp;
            Tier {monster.tier} opponent. {monster.tier===1?"A straightforward challenge.":monster.tier===2?"A seasoned adversary.":"A formidable foe. Prepare carefully."}
          </div>
        </div>

        {!rolled ? (
          <div style={{ display:"flex", gap:10 }}>
            <button onClick={()=>resolveEncounter(false)} style={{
              flex:2, background:"linear-gradient(135deg,#3a1008,#5a1810)",
              border:"1px solid #a03020", color:"#f09060",
              padding:"10px", borderRadius:6, cursor:"pointer",
              fontFamily:"'Cinzel',serif", fontSize:13,
            }}>⚔ Engage in Duel</button>
            <button onClick={()=>resolveEncounter(true)} style={{
              flex:1, background:"transparent",
              border:"1px solid #4a3020", color:"#806040",
              padding:"10px", borderRadius:6, cursor:"pointer",
              fontFamily:"'Cinzel',serif", fontSize:12,
            }}>Flee</button>
          </div>
        ) : (
          <div>
            <div style={{
              textAlign:"center", padding:"16px 0",
              fontSize:16, fontFamily:"'Cinzel',serif",
              color: result==="win" ? "#60d060" : "#e03030",
            }}>
              {result==="win" ? "✦ Victory!" : "✕ Defeated"}
            </div>
            <div style={{ fontSize:12, color:"#a08060", fontFamily:"'Crimson Text',serif", textAlign:"center", marginBottom:14 }}>
              {result==="win" 
                ? "You have bested your opponent. A card and gold are yours."
                : "Your opponent proved too powerful. You lose your ante card."}
            </div>
            <button onClick={()=>result&&(result==="win"?onWin(monster):onFlee())} style={{
              width:"100%",
              background: result==="win" ? "linear-gradient(135deg,#0a3010,#154020)" : "linear-gradient(135deg,#1a0808,#2a1010)",
              border:`1px solid ${result==="win"?"#40a050":"#a02020"}`,
              color: result==="win" ? "#60d060" : "#e04040",
              padding:"10px", borderRadius:6, cursor:"pointer",
              fontFamily:"'Cinzel',serif", fontSize:13,
            }}>{result==="win" ? "Claim Rewards →" : "Retreat in Defeat →"}</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// DECK MANAGER
// ============================================================
function DeckManager({ deck, binder, onClose, onSwap }) {
  const [selectedBinder, setSelectedBinder] = useState(null);
  const [selectedDeck, setSelectedDeck] = useState(null);
  const [filter, setFilter] = useState("ALL");

  const filterColors = ["ALL","W","U","B","R","G",""];
  const filterLabels = { ALL:"All", W:"White", U:"Blue", B:"Black", R:"Red", G:"Green", "":"Colorless" };

  const filteredBinder = binder.filter(c=>filter==="ALL"||c.color===filter);
  const filteredDeck   = deck.filter(c=>filter==="ALL"||c.color===filter);

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200 }}>
      <div style={{
        width:700, maxHeight:"88vh", background:"linear-gradient(160deg,#0e0c04,#080a04)",
        border:"2px solid rgba(180,160,60,0.35)", borderRadius:10,
        boxShadow:"0 0 50px rgba(0,0,0,0.9)",
        display:"flex", flexDirection:"column",
      }}>
        {/* Header */}
        <div style={{ padding:"14px 18px", borderBottom:"1px solid rgba(180,160,60,0.2)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <div style={{ fontSize:16, fontFamily:"'Cinzel',serif", color:"#e0c060" }}>📖 Deck Manager</div>
            <div style={{ fontSize:10, color:"#6a5020", marginTop:2 }}>Deck: {deck.length} cards &nbsp;|&nbsp; Binder: {binder.length} cards</div>
          </div>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            {filterColors.map(f=>(
              <button key={f} onClick={()=>setFilter(f)} style={{
                background: filter===f ? "rgba(200,160,40,0.2)" : "transparent",
                border: filter===f ? "1px solid #a08030" : "1px solid #3a3010",
                color: filter===f ? "#f0c040" : "#6a5020",
                padding:"3px 8px", borderRadius:4, cursor:"pointer", fontSize:10,
                fontFamily:"'Cinzel',serif",
              }}>{filterLabels[f]}</button>
            ))}
            <button onClick={onClose} style={{ background:"transparent", border:"1px solid #5a3020", color:"#c08060", borderRadius:4, padding:"4px 10px", cursor:"pointer", fontSize:12 }}>✕</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex:1, display:"grid", gridTemplateColumns:"1fr 1fr", overflow:"hidden" }}>
          {/* Deck */}
          <div style={{ borderRight:"1px solid rgba(180,160,60,0.15)", overflow:"hidden", display:"flex", flexDirection:"column" }}>
            <div style={{ padding:"10px 14px", fontSize:11, fontFamily:"'Cinzel',serif", color:"#a08040", borderBottom:"1px solid rgba(180,160,60,0.1)" }}>
              ⚔ ACTIVE DECK ({deck.length})
              {deck.length < 40 && <span style={{ color:"#e05030", marginLeft:8 }}>⚠ Below 40 minimum</span>}
            </div>
            <div style={{ flex:1, overflowY:"auto", padding:10, display:"flex", flexWrap:"wrap", gap:6, alignContent:"flex-start", scrollbarWidth:"thin", scrollbarColor:"#8a6020 #1a1000" }}>
              {filteredDeck.map((card,i)=>(
                <CardMini key={i} card={card} compact
                  selected={selectedDeck===i}
                  onClick={()=>setSelectedDeck(selectedDeck===i?null:i)}/>
              ))}
            </div>
          </div>

          {/* Binder */}
          <div style={{ overflow:"hidden", display:"flex", flexDirection:"column" }}>
            <div style={{ padding:"10px 14px", fontSize:11, fontFamily:"'Cinzel',serif", color:"#a08040", borderBottom:"1px solid rgba(180,160,60,0.1)" }}>
              📦 BINDER ({binder.length})
            </div>
            <div style={{ flex:1, overflowY:"auto", padding:10, display:"flex", flexWrap:"wrap", gap:6, alignContent:"flex-start", scrollbarWidth:"thin", scrollbarColor:"#8a6020 #1a1000" }}>
              {filteredBinder.map((card,i)=>(
                <CardMini key={i} card={card} compact
                  selected={selectedBinder===i}
                  onClick={()=>setSelectedBinder(selectedBinder===i?null:i)}/>
              ))}
              {filteredBinder.length===0&&<div style={{fontSize:11,color:"#4a3820",fontStyle:"italic",padding:8}}>No cards in binder for this filter.</div>}
            </div>
          </div>
        </div>

        {/* Swap bar */}
        <div style={{ padding:"10px 18px", borderTop:"1px solid rgba(180,160,60,0.15)", display:"flex", gap:10, alignItems:"center" }}>
          {selectedDeck!==null && selectedBinder!==null ? (
            <>
              <div style={{ fontSize:11, color:"#a09060", flex:1, fontFamily:"'Crimson Text',serif" }}>
                Swap <strong style={{color:"#f0c060"}}>{filteredDeck[selectedDeck]?.name}</strong> ↔ <strong style={{color:"#f0c060"}}>{filteredBinder[selectedBinder]?.name}</strong>
              </div>
              <button onClick={()=>{ onSwap(filteredDeck[selectedDeck],filteredBinder[selectedBinder]); setSelectedDeck(null); setSelectedBinder(null); }} style={{
                background:"linear-gradient(135deg,#1a2a10,#2a4020)",
                border:"1px solid #5a9040", color:"#80d060",
                padding:"6px 16px", borderRadius:5, cursor:"pointer",
                fontFamily:"'Cinzel',serif", fontSize:12,
              }}>⇄ Swap Cards</button>
            </>
          ) : (
            <div style={{ fontSize:11, color:"#5a4820", fontFamily:"'Crimson Text',serif", fontStyle:"italic" }}>
              Select one card from your deck and one from your binder to swap them.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MANA LINK EVENT (alert banner)
// ============================================================
function ManaLinkAlert({ events, onRespond, onDismiss }) {
  if (!events.length) return null;
  const ev = events[0];
  const hexColor = MANA_COLORS_HEX[ev.color];
  return (
    <div style={{
      position:"fixed", top:80, left:"50%", transform:"translateX(-50%)",
      zIndex:300, background:`linear-gradient(135deg,#1a0808,${hexColor}20)`,
      border:`2px solid ${hexColor}`, borderRadius:8, padding:"12px 20px",
      maxWidth:460, boxShadow:`0 0 20px ${hexColor}60, 0 4px 20px rgba(0,0,0,0.8)`,
      animation:"alertPulse 1.5s ease-in-out infinite",
    }}>
      <div style={{ fontSize:12, fontFamily:"'Cinzel',serif", color:hexColor, marginBottom:6, letterSpacing:1 }}>
        {MANA_SYMBOLS[ev.color]} MANA LINK ALERT
      </div>
      <div style={{ fontSize:13, color:"#e0c090", fontFamily:"'Crimson Text',serif", marginBottom:10 }}>
        <strong>{MAGE_NAMES[ev.color]}</strong> sends <strong>{ev.minionName}</strong> to seize <strong>{ev.townName}</strong>!
        Respond within <strong style={{color:"#ff8040"}}>{ev.movesLeft} moves</strong> or a mana link is established.
      </div>
      <div style={{ display:"flex", gap:8 }}>
        <button onClick={()=>onRespond(ev)} style={{
          flex:2, background:`${hexColor}20`, border:`1px solid ${hexColor}`,
          color:hexColor, padding:"6px 14px", borderRadius:5, cursor:"pointer",
          fontFamily:"'Cinzel',serif", fontSize:12,
        }}>⚔ Rush to {ev.townName}</button>
        <button onClick={()=>onDismiss(ev)} style={{
          flex:1, background:"transparent", border:"1px solid #5a3020",
          color:"#806040", padding:"6px", borderRadius:5, cursor:"pointer",
          fontFamily:"'Cinzel',serif", fontSize:11,
        }}>Ignore</button>
      </div>
    </div>
  );
}

// ============================================================
// TITLE SCREEN
// ============================================================
function TitleScreen({ onStart }) {
  const [chosenColor, setChosenColor] = useState(null);
  const [wizardName, setWizardName] = useState("");
  const [step, setStep] = useState("intro"); // intro | choose | confirm

  return (
    <div style={{
      minHeight:"100vh", background:"#050302",
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      fontFamily:"'Cinzel',serif",
      backgroundImage:"radial-gradient(ellipse at 50% 30%, rgba(80,40,10,0.4) 0%, transparent 70%)",
    }}>
      {/* Decorative top border */}
      <div style={{ position:"absolute", top:0, left:0, right:0, height:3,
        background:"linear-gradient(90deg,transparent,rgba(200,160,40,0.6),transparent)" }}/>

      <div style={{ textAlign:"center", maxWidth:640, padding:"0 20px" }}>
        {/* Logo */}
        <div style={{ marginBottom:6, fontSize:11, letterSpacing:4, color:"rgba(180,140,40,0.5)" }}>
          ✦ ✦ ✦ MAGIC: THE GATHERING ✦ ✦ ✦
        </div>
        <h1 style={{
          fontSize:52, fontFamily:"'Cinzel Decorative',serif", color:"transparent",
          background:"linear-gradient(180deg, #f0d080 0%, #c09030 40%, #8a6010 100%)",
          WebkitBackgroundClip:"text", backgroundClip:"text",
          margin:"0 0 4px", lineHeight:1.1, letterSpacing:4,
          textShadow:"none", filter:"drop-shadow(0 0 20px rgba(200,140,20,0.3))",
        }}>SHANDALAR</h1>
        <div style={{ fontSize:13, color:"rgba(180,140,60,0.6)", letterSpacing:3, marginBottom:40 }}>
          MODERN EDITION
        </div>

        {step==="intro" && (
          <div style={{ animation:"fadeIn 1s ease-out" }}>
            <div style={{
              fontSize:14, color:"#8a7050", fontFamily:"'Crimson Text',serif",
              fontStyle:"italic", lineHeight:1.8, marginBottom:32, maxWidth:480, margin:"0 auto 32px",
            }}>
              The plane of Shandalar trembles. Five mages vie for dominion,
              and the planeswalker Arzakon waits beyond the barrier, hungry
              to claim this mana-rich world for his own.
              <br/><br/>
              You are the last hope. Build your deck. Master the arcane.
              Seal the fate of Shandalar.
            </div>
            <button onClick={()=>setStep("choose")} style={{
              background:"linear-gradient(135deg,#1a1004,#2e1c08)",
              border:"2px solid rgba(200,160,40,0.5)",
              color:"#f0c040", padding:"14px 48px", borderRadius:6,
              cursor:"pointer", fontSize:15, fontFamily:"'Cinzel',serif",
              letterSpacing:2,
              boxShadow:"0 0 20px rgba(200,140,20,0.2), inset 0 0 10px rgba(200,140,20,0.05)",
              transition:"all 0.3s",
            }} onMouseEnter={e=>{e.target.style.boxShadow="0 0 30px rgba(200,140,20,0.4), inset 0 0 15px rgba(200,140,20,0.1)";}}
            onMouseLeave={e=>{e.target.style.boxShadow="0 0 20px rgba(200,140,20,0.2), inset 0 0 10px rgba(200,140,20,0.05)";}}>
              BEGIN YOUR JOURNEY
            </button>
          </div>
        )}

        {step==="choose" && (
          <div style={{ animation:"fadeIn 0.5s ease-out" }}>
            <div style={{ fontSize:13, color:"#8a6040", marginBottom:20, fontFamily:"'Crimson Text',serif", fontStyle:"italic" }}>
              Choose the color of your magic. This defines your starting deck and playstyle.
            </div>
            <div style={{ display:"flex", gap:12, justifyContent:"center", marginBottom:28 }}>
              {MAGE_COLORS.map(c=>{
                const cd = COLOR_STARTERS[c];
                const hx = MANA_COLORS_HEX[c];
                const sel = chosenColor===c;
                return (
                  <div key={c} onClick={()=>setChosenColor(c)} style={{
                    width:108, padding:"16px 10px", cursor:"pointer",
                    background: sel ? `${hx}18` : "rgba(255,255,255,0.02)",
                    border: sel ? `2px solid ${hx}` : "2px solid rgba(255,255,255,0.08)",
                    borderRadius:8,
                    boxShadow: sel ? `0 0 16px ${hx}50` : "none",
                    transition:"all 0.2s",
                    transform: sel ? "translateY(-4px)" : "none",
                  }}>
                    <div style={{ fontSize:28, marginBottom:8 }}>{MANA_SYMBOLS[c]}</div>
                    <div style={{ fontSize:12, fontFamily:"'Cinzel',serif", color:sel?hx:"#6a5030", marginBottom:4 }}>{cd.name}</div>
                    <div style={{ fontSize:9, color:"#5a4020", lineHeight:1.4 }}>{cd.label}</div>
                    <div style={{ marginTop:8, display:"flex", gap:3, justifyContent:"center", flexWrap:"wrap" }}>
                      <span style={{ fontSize:9, color:sel?hx:"#4a3010" }}>♥ {cd.startHP}</span>
                      <span style={{ fontSize:9, color:sel?hx:"#4a3010" }}>⚙ {cd.startGold}g</span>
                    </div>
                  </div>
                );
              })}
            </div>
            {chosenColor && (
              <div style={{ marginBottom:20, fontStyle:"italic", fontSize:13, color:"#a09060", fontFamily:"'Crimson Text',serif" }}>
                "{COLOR_STARTERS[chosenColor].flavor}"
              </div>
            )}
            <div style={{ display:"flex", gap:12, justifyContent:"center" }}>
              <button onClick={()=>setStep("intro")} style={{
                background:"transparent", border:"1px solid #3a2810", color:"#6a4820",
                padding:"8px 20px", borderRadius:5, cursor:"pointer", fontSize:12, fontFamily:"'Cinzel',serif",
              }}>← Back</button>
              <button disabled={!chosenColor} onClick={()=>setStep("confirm")} style={{
                background: chosenColor?"linear-gradient(135deg,#1a1004,#2e1c08)":"rgba(0,0,0,0.3)",
                border:`1px solid ${chosenColor?MANA_COLORS_HEX[chosenColor]:"#2a1804"}`,
                color: chosenColor?MANA_COLORS_HEX[chosenColor]:"#3a2810",
                padding:"10px 28px", borderRadius:5, cursor:chosenColor?"pointer":"not-allowed",
                fontSize:13, fontFamily:"'Cinzel',serif", transition:"all 0.2s",
              }}>Name Your Wizard →</button>
            </div>
          </div>
        )}

        {step==="confirm" && chosenColor && (
          <div style={{ animation:"fadeIn 0.5s ease-out" }}>
            <div style={{ fontSize:13, color:"#8a6040", marginBottom:16, fontFamily:"'Crimson Text',serif", fontStyle:"italic" }}>
              What is the name by which you shall be known in Shandalar?
            </div>
            <input
              value={wizardName}
              onChange={e=>setWizardName(e.target.value)}
              placeholder="Enter your wizard's name..."
              maxLength={24}
              style={{
                background:"rgba(0,0,0,0.5)", border:"1px solid rgba(200,160,40,0.4)",
                color:"#f0d080", padding:"10px 16px", borderRadius:6, fontSize:16,
                fontFamily:"'Cinzel',serif", width:280, outline:"none",
                marginBottom:20, letterSpacing:1,
              }}
            />
            <br/>
            <div style={{ display:"flex", gap:12, justifyContent:"center" }}>
              <button onClick={()=>setStep("choose")} style={{
                background:"transparent", border:"1px solid #3a2810", color:"#6a4820",
                padding:"8px 20px", borderRadius:5, cursor:"pointer", fontSize:12, fontFamily:"'Cinzel',serif",
              }}>← Back</button>
              <button onClick={()=>{
                const name = wizardName.trim()||`The ${COLOR_STARTERS[chosenColor].name} Mage`;
                onStart({ color:chosenColor, name, seed:Date.now() });
              }} style={{
                background:`linear-gradient(135deg,${MANA_COLORS_HEX[chosenColor]}20,${MANA_COLORS_HEX[chosenColor]}10)`,
                border:`2px solid ${MANA_COLORS_HEX[chosenColor]}`,
                color:MANA_COLORS_HEX[chosenColor],
                padding:"12px 32px", borderRadius:6, cursor:"pointer",
                fontSize:14, fontFamily:"'Cinzel',serif", letterSpacing:2,
              }}>✦ Enter Shandalar</button>
            </div>
          </div>
        )}
      </div>

      <div style={{ position:"absolute", bottom:20, fontSize:10, color:"rgba(100,80,40,0.4)", letterSpacing:2 }}>
        ALPHA — FOURTH EDITION CARD POOL &nbsp;|&nbsp; CLASSIC RULES
      </div>
    </div>
  );
}

// ============================================================
// MAIN GAME
// ============================================================
function Game({ startConfig, onReturnToTitle }) {
  const mapData = useMemo(()=>generateMap(startConfig.seed),[startConfig.seed]);
  const [tiles, setTiles] = useState(mapData.tiles);
  const [playerPos, setPlayerPos] = useState({ x:mapData.startX, y:mapData.startY });
  const [selectedTile, setSelectedTile] = useState(null);
  const [moveQueue, setMoveQueue] = useState([]);
  const [moveCount, setMoveCount] = useState(0);

  const starterData = COLOR_STARTERS[startConfig.color];
  const [player, setPlayer] = useState({
    name: startConfig.name,
    color: startConfig.color,
    hp: starterData.startHP,
    maxHP: starterData.startHP,
    gold: starterData.startGold,
    gems: 0,
  });

  const [deck, setDeck] = useState(() =>
    starterData.startDeck.map(name => SHOP_CARDS.find(c=>c.name===name)||{ name, cost:"", cmc:0, type:"Land", rarity:"C", text:"", color:"", price:0 })
  );
  const [binder, setBinder] = useState([]);
  const [artifacts, setArtifacts] = useState([...ARTIFACTS]);
  const [manaLinks, setManaLinks] = useState({ W:0, U:0, B:0, R:0, G:0 });
  const [magesDefeated, setMagesDefeated] = useState([]);
  const [manaLinkEvents, setManaLinkEvents] = useState([]);
  const [log, setLog] = useState([{ text:`${startConfig.name} enters the plane of Shandalar. The journey begins.`, type:LOG_TYPES.INFO, turn:0 }]);
  const [modal, setModal] = useState(null); // null | "town" | "dungeon" | "castle" | "encounter" | "deck"
  const [activeTile, setActiveTile] = useState(null);
  const [activeMonster, setActiveMonster] = useState(null);
  const [mapScale, setMapScale] = useState(1);
  const [viewport, setViewport] = useState({ x:Math.max(0,mapData.startX-8), y:Math.max(0,mapData.startY-6) });
  const mapRef = useRef(null);

  const addLog = useCallback((text, type=LOG_TYPES.INFO) => {
    setLog(prev=>[...prev.slice(-80), { text, type, turn:moveCount }]);
  },[moveCount]);

  const hasBoots = artifacts.some(a=>a.id==="boots"&&a.owned);

  // ---- MOVEMENT ----
  const revealAround = useCallback((nx, ny, tilesArr) => {
    const next = tilesArr.map(row=>[...row]);
    for (let dy=-2;dy<=2;dy++) for(let dx=-2;dx<=2;dx++){
      if(next[ny+dy]?.[nx+dx]) next[ny+dy][nx+dx] = {...next[ny+dy][nx+dx], revealed:true};
    }
    return next;
  },[]);

  const triggerEncounter = useCallback((tile, tilesArr) => {
    if(tile.structure||tile.terrain===TERRAIN.WATER) return false;
    const chance = tile.encounterChance;
    if(Math.random()>chance) return false;
    const monsterList = MONSTERS_BY_TERRAIN[tile.terrain.id]||MONSTERS_BY_TERRAIN.PLAINS;
    const tier = moveCount < 20 ? 1 : moveCount < 60 ? (Math.random()>0.5?2:1) : 2;
    const monster = { ...monsterList[Math.min(tier-1,monsterList.length-1)], tier };
    setActiveMonster(monster);
    setActiveTile(tile);
    setModal("encounter");
    return true;
  },[moveCount]);

  const executeMove = useCallback((target, tilesArr) => {
    const nx=target.x, ny=target.y;
    const t = tilesArr[ny][nx];
    if(t.terrain===TERRAIN.WATER) return;

    const moveCost = Math.max(1,(hasBoots?t.terrain.moveC-1:t.terrain.moveC));
    // Hunger every 15 moves
    let goldLoss=0;
    const newMoveCount = moveCount+1;
    if(newMoveCount%15===0){
      goldLoss=8;
      setPlayer(p=>({ ...p, gold:Math.max(0,p.gold-goldLoss) }));
      if(goldLoss>0) addLog(`You pay ${goldLoss}g for food and supplies.`, LOG_TYPES.WARN);
    }

    const revealedTiles = revealAround(nx,ny,tilesArr);
    setTiles(revealedTiles);
    setPlayerPos({ x:nx, y:ny });
    setMoveCount(newMoveCount);
    setViewport({ x:Math.max(0,Math.min(MAP_W-18,nx-9)), y:Math.max(0,Math.min(MAP_H-14,ny-7)) });

    // Tick down mana link events
    setManaLinkEvents(prev=>prev.map(ev=>({ ...ev, movesLeft:ev.movesLeft-1 })).filter(ev=>{
      if(ev.movesLeft<=0){
        setManaLinks(ml=>({ ...ml, [ev.color]:Math.min(5,(ml[ev.color]||0)+1) }));
        addLog(`⚠ ${MAGE_NAMES[ev.color]} establishes a mana link at ${ev.townName}!`, LOG_TYPES.DANGER);
        // Mark town with mana link
        setTiles(prev=>{
          const next=prev.map(r=>[...r]);
          if(next[ev.ty]?.[ev.tx]) next[ev.ty][ev.tx]={ ...next[ev.ty][ev.tx], manaLink:ev.color };
          return next;
        });
        return false;
      }
      return true;
    }));

    // Trigger new mana link events occasionally
    if(newMoveCount>5 && newMoveCount%12===0 && Math.random()>0.45){
      const aliveColors = MAGE_COLORS.filter(c=>!magesDefeated.includes(c));
      if(aliveColors.length){
        const color = aliveColors[Math.floor(Math.random()*aliveColors.length)];
        const towns = [];
        revealedTiles.forEach(row=>row.forEach(tile=>{
          if(tile.structure===STRUCTURE.TOWN&&tile.townData&&!tile.manaLink) towns.push(tile);
        }));
        if(towns.length){
          const target = towns[Math.floor(Math.random()*towns.length)];
          const minionNames = { W:["Holy Crusader","Serra's Knight"], U:["Tidal Phantom","Xylos's Agent"], B:["Skeletal Minion","Mortis's Shade"], R:["Goblin Horde","Karag's Raider"], G:["Vine Elemental","Sylvara's Chosen"] };
          const names = minionNames[color];
          const minionName = names[Math.floor(Math.random()*names.length)];
          const ev={ id:Date.now(), color, minionName, townName:target.townData.name, tx:target.x, ty:target.y, movesLeft:10 };
          setManaLinkEvents(prev=>[...prev, ev]);
          addLog(`🚨 ${MAGE_NAMES[color]} sends ${minionName} to seize ${target.townData.name}!`, LOG_TYPES.DANGER);
        }
      }
    }

    // Structure interaction
    if(t.structure){
      setActiveTile(revealedTiles[ny][nx]);
      if(t.structure===STRUCTURE.TOWN){ addLog(`You arrive at ${t.townData.name}.`,LOG_TYPES.INFO); setModal("town"); return; }
      if(t.structure===STRUCTURE.DUNGEON){ addLog(`The entrance to ${t.dungeonData.name} looms before you.`,LOG_TYPES.EVENT); setModal("dungeon"); return; }
      const castleStructIds = { W:"CASTLE_W", U:"CASTLE_U", B:"CASTLE_B", R:"CASTLE_R", G:"CASTLE_G" };
      if(Object.values(castleStructIds).includes(t.structure.id)){ addLog(`You approach ${t.castleData?.mage}'s stronghold.`,LOG_TYPES.EVENT); setModal("castle"); return; }
    }

    // Random encounter
    triggerEncounter(revealedTiles[ny][nx], revealedTiles);
  },[moveCount, magesDefeated, hasBoots, revealAround, triggerEncounter, addLog]);

  const handleTileClick = useCallback((tile) => {
    if(!tile.revealed) return;
    if(tile.terrain===TERRAIN.WATER) return;
    if(tile.x===playerPos.x&&tile.y===playerPos.y) { setSelectedTile(null); return; }
    const path = findPath(tiles, playerPos.x, playerPos.y, tile.x, tile.y, hasBoots);
    if(!path||path.length===0) { addLog("No path found to that location.",LOG_TYPES.WARN); return; }
    if(path.length===1){
      executeMove(path[0], tiles);
      setSelectedTile(null);
    } else {
      setSelectedTile(tile);
      // Move one step at a time toward target
      executeMove(path[0], tiles);
      setSelectedTile(null);
    }
  },[tiles, playerPos, hasBoots, executeMove, addLog]);

  // ---- TOWN ACTIONS ----
  const handleBuy = (card) => {
    if(player.gold<card.price){ addLog(`Not enough gold to buy ${card.name}.`,LOG_TYPES.WARN); return; }
    setPlayer(p=>({...p,gold:p.gold-card.price}));
    setBinder(b=>[...b,card]);
    addLog(`Purchased ${card.name} for ${card.price}g. Added to binder.`,LOG_TYPES.SUCCESS);
  };
  const handleRest = (cost) => {
    setPlayer(p=>({...p,hp:p.maxHP,gold:p.gold-cost}));
    addLog(`You rest at the inn, restoring to full health. Cost: ${cost}g.`,LOG_TYPES.SUCCESS);
  };
  const handleGetClue = () => {
    if(player.gold<25) return;
    setPlayer(p=>({...p,gold:p.gold-25}));
    // Reveal a random dungeon
    const dungeons=[];
    tiles.forEach(row=>row.forEach(t=>{ if(t.structure===STRUCTURE.DUNGEON&&!t.revealed) dungeons.push(t); }));
    if(dungeons.length){
      const d=dungeons[Math.floor(Math.random()*dungeons.length)];
      setTiles(prev=>{ const n=prev.map(r=>[...r]); n[d.y][d.x]={...n[d.y][d.x],revealed:true}; return n; });
      addLog(`The sage reveals the location of ${d.dungeonData.name}.`,LOG_TYPES.SUCCESS);
    } else { addLog("The sage finds no unknown dungeons to reveal.", LOG_TYPES.INFO); }
  };

  // ---- DUNGEON ----
  const handleEnterDungeon = () => {
    addLog(`You descend into ${activeTile?.dungeonData?.name}. (Duel engine: Phase 2)`,LOG_TYPES.EVENT);
    // Stub: grant a random card as dungeon reward
    const loot = activeTile?.dungeonData?.loot;
    if(loot?.length){
      const card = loot[Math.floor(Math.random()*loot.length)];
      setBinder(b=>[...b,card]);
      addLog(`You emerge victorious from the dungeon! Found: ${card.name}.`,LOG_TYPES.SUCCESS);
      setPlayer(p=>({...p,gold:p.gold+Math.floor(20+Math.random()*40)}));
    }
    setModal(null);
  };

  // ---- CASTLE ----
  const handleChallenge = () => {
    const color = activeTile?.castleData?.color;
    if(!color) return;
    addLog(`⚔ You challenge ${MAGE_NAMES[color]}! (Full duel engine: Phase 2)`,LOG_TYPES.EVENT);
    // Stub: 40% chance to win
    if(Math.random()>0.6){
      setMagesDefeated(prev=>[...prev,color]);
      setTiles(prev=>{
        const n=prev.map(r=>[...r]);
        n[activeTile.y][activeTile.x]={...n[activeTile.y][activeTile.x],castleData:{...n[activeTile.y][activeTile.x].castleData,defeated:true}};
        return n;
      });
      addLog(`✦ Victory! ${MAGE_NAMES[color]} is defeated! Their power fades from Shandalar.`,LOG_TYPES.SUCCESS);
      setPlayer(p=>({...p,gold:p.gold+100,gems:p.gems+3}));
      // Grant artifact
      const artMap={W:"ward",U:"stone",B:"amulet",R:"focus",G:"boots"};
      setArtifacts(prev=>prev.map(a=>a.id===artMap[color]?{...a,owned:true}:a));
      addLog(`You receive the ${artifacts.find(a=>a.id===artMap[color])?.name}!`,LOG_TYPES.SUCCESS);
    } else {
      addLog(`${MAGE_NAMES[color]} proves too powerful. You retreat with your life.`,LOG_TYPES.DANGER);
      setPlayer(p=>({...p,hp:Math.max(1,p.hp-Math.floor(p.maxHP*0.35))}));
      const anteLost = deck[Math.floor(Math.random()*deck.length)];
      if(anteLost) addLog(`You lose ${anteLost.name} as ante.`,LOG_TYPES.DANGER);
    }
    setModal(null);
  };

  // ---- ENCOUNTER ----
  const handleWin = (monster) => {
    const gold = 5+Math.floor(Math.random()*15);
    setPlayer(p=>({...p,gold:p.gold+gold}));
    const card = SHOP_CARDS.filter(c=>c.color===monster.deckColor)[Math.floor(Math.random()*SHOP_CARDS.filter(c=>c.color===monster.deckColor).length)];
    if(card){ setBinder(b=>[...b,card]); addLog(`Defeated ${monster.name}! Gained ${gold}g and ${card.name}.`,LOG_TYPES.SUCCESS); }
    else { addLog(`Defeated ${monster.name}! Gained ${gold}g.`,LOG_TYPES.SUCCESS); }
    setModal(null); setActiveMonster(null);
  };
  const handleFlee = () => {
    addLog("You retreat from the encounter.",LOG_TYPES.WARN);
    setModal(null); setActiveMonster(null);
  };

  // ---- DECK SWAP ----
  const handleSwap = (deckCard, binderCard) => {
    setDeck(prev=>prev.map(c=>c===deckCard?binderCard:c));
    setBinder(prev=>prev.map(c=>c===binderCard?deckCard:c));
    addLog(`Swapped ${deckCard.name} ↔ ${binderCard.name} in your deck.`,LOG_TYPES.INFO);
  };

  // ---- MANA LINK EVENTS ----
  const handleRespondToAlert = (ev) => {
    addLog(`You rush toward ${ev.townName} to intercept ${ev.minionName}!`,LOG_TYPES.EVENT);
    setManaLinkEvents(prev=>prev.filter(e=>e.id!==ev.id));
  };
  const handleDismissAlert = (ev) => {
    addLog(`You ignore the attack on ${ev.townName}. The mana link may be established.`,LOG_TYPES.WARN);
  };

  // ---- RENDER ----
  const viewW = Math.min(18, MAP_W);
  const viewH = Math.min(14, MAP_H);

  return (
    <div style={{
      minHeight:"100vh", background:"#050302", color:"#c0b090",
      fontFamily:"'Crimson Text',serif", display:"flex", flexDirection:"column",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&family=Cinzel+Decorative:wght@700&family=Crimson+Text:ital,wght@0,400;0,600;1,400&display=swap');
        @keyframes wizardPulse { 0%,100%{box-shadow:0 0 10px rgba(255,240,100,0.8),0 2px 4px rgba(0,0,0,0.5)} 50%{box-shadow:0 0 20px rgba(255,240,100,1),0 2px 8px rgba(0,0,0,0.7)} }
        @keyframes pulse { 0%,100%{opacity:0.6} 50%{opacity:1} }
        @keyframes alertPulse { 0%,100%{box-shadow:0 0 20px var(--alert-color,#f08040),0 4px 20px rgba(0,0,0,0.8)} 50%{box-shadow:0 0 35px var(--alert-color,#f08040),0 4px 20px rgba(0,0,0,0.8)} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        ::-webkit-scrollbar{width:6px;height:6px} ::-webkit-scrollbar-track{background:#0a0804} ::-webkit-scrollbar-thumb{background:#5a3810;border-radius:3px}
      `}</style>

      {/* Top bar */}
      <div style={{ padding:"8px 16px", borderBottom:"1px solid rgba(200,160,60,0.2)", display:"flex", justifyContent:"space-between", alignItems:"center", background:"rgba(0,0,0,0.4)" }}>
        <div style={{ fontFamily:"'Cinzel',serif", fontSize:14, color:"#c09040" }}>
          ✦ {player.name} &nbsp;·&nbsp; <ManaSymbol sym={player.color} size={13}/>&nbsp;
          <span style={{ fontSize:11, color:"#6a5020" }}>{COLOR_STARTERS[player.color].name} Mage</span>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={()=>setModal("deck")} style={{
            background:"transparent", border:"1px solid rgba(180,140,40,0.3)", color:"#a08040",
            padding:"4px 12px", borderRadius:4, cursor:"pointer", fontSize:11, fontFamily:"'Cinzel',serif",
          }}>📖 Deck ({deck.length})</button>
          <button onClick={()=>setMapScale(s=>s===1?0.8:1)} style={{
            background:"transparent", border:"1px solid rgba(180,140,40,0.3)", color:"#a08040",
            padding:"4px 12px", borderRadius:4, cursor:"pointer", fontSize:11, fontFamily:"'Cinzel',serif",
          }}>🔍 {mapScale===1?"Zoom Out":"Zoom In"}</button>
          <button onClick={onReturnToTitle} style={{
            background:"transparent", border:"1px solid rgba(180,80,40,0.3)", color:"#a06040",
            padding:"4px 12px", borderRadius:4, cursor:"pointer", fontSize:11, fontFamily:"'Cinzel',serif",
          }}>✕ Quit</button>
        </div>
      </div>

      <HUD player={player} manaLinks={manaLinks} magesDefeated={magesDefeated} artifacts={artifacts} moveCount={moveCount}/>

      {/* Main content */}
      <div style={{ flex:1, display:"flex", overflow:"hidden" }}>
        {/* Map */}
        <div style={{ flex:1, overflow:"hidden", position:"relative" }}>
          {/* Map legend */}
          <div style={{
            position:"absolute", top:8, left:8, zIndex:10,
            background:"rgba(0,0,0,0.75)", borderRadius:6, padding:"8px 12px",
            border:"1px solid rgba(200,160,60,0.2)", fontSize:10, color:"#8a7050",
            fontFamily:"'Cinzel',serif",
          }}>
            <div style={{ marginBottom:4, fontSize:9, color:"#6a5030", letterSpacing:1 }}>LEGEND</div>
            {[
              { icon:"🧙", label:"You" },
              { icon:"⌂", label:"Town" },
              { icon:"⚑", label:"Dungeon" },
              { icon:"♔", label:"Mage Castle" },
              { icon:"☀", label:"Plains" },
              { icon:"🌲", label:"Forest" },
              { icon:"⛰", label:"Mountain" },
            ].map(l=>(
              <div key={l.label} style={{ display:"flex", alignItems:"center", gap:6, marginBottom:2 }}>
                <span style={{ fontSize:12 }}>{l.icon}</span>
                <span>{l.label}</span>
              </div>
            ))}
          </div>

          {/* Mage status panel */}
          <div style={{
            position:"absolute", top:8, right:8, zIndex:10,
            background:"rgba(0,0,0,0.75)", borderRadius:6, padding:"8px 12px",
            border:"1px solid rgba(200,160,60,0.2)", fontSize:10,
            fontFamily:"'Cinzel',serif",
          }}>
            <div style={{ fontSize:9, color:"#6a5030", letterSpacing:1, marginBottom:6 }}>FIVE MAGES</div>
            {MAGE_COLORS.map(c=>{
              const defeated = magesDefeated.includes(c);
              const links = manaLinks[c]||0;
              const hasWard = artifacts.some(a=>a.id==="ward"&&a.owned);
              const threshold = hasWard?5:3;
              return (
                <div key={c} style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4 }}>
                  <ManaSymbol sym={c} size={11}/>
                  <span style={{ color:defeated?"#405030":links>=threshold?"#e02020":links>=threshold-1?"#e08020":"#a09070", fontSize:10 }}>
                    {MAGE_NAMES[c]}
                  </span>
                  <span style={{ color:"#6a5030", fontSize:9 }}>
                    {defeated?"✓":links+"/"+threshold}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Map grid */}
          <div ref={mapRef} style={{
            display:"grid",
            gridTemplateColumns:`repeat(${viewW},${TILE_SIZE*mapScale}px)`,
            gridTemplateRows:`repeat(${viewH},${TILE_SIZE*mapScale}px)`,
            gap:1,
            padding:8,
            background:"#080604",
          }}>
            {Array.from({length:viewH},(_, vy)=>
              Array.from({length:viewW},(_,vx)=>{
                const x=viewport.x+vx, y=viewport.y+vy;
                const tile=tiles[y]?.[x];
                if(!tile) return <div key={`${vx}-${vy}`} style={{ width:TILE_SIZE*mapScale,height:TILE_SIZE*mapScale,background:"#030202" }}/>;
                return (
                  <MapTile
                    key={`${x}-${y}`}
                    tile={tile}
                    isPlayer={x===playerPos.x&&y===playerPos.y}
                    isSelected={selectedTile?.x===x&&selectedTile?.y===y}
                    onClick={handleTileClick}
                    scale={mapScale}
                  />
                );
              })
            )}
          </div>

          {/* Scroll controls */}
          <div style={{ position:"absolute", bottom:8, left:"50%", transform:"translateX(-50%)", display:"flex", gap:4 }}>
            {[["↑",0,-1],["←",-1,0],["↓",0,1],["→",1,0]].map(([label,dx,dy])=>(
              <button key={label} onClick={()=>setViewport(v=>({
                x:Math.max(0,Math.min(MAP_W-viewW,v.x+dx*3)),
                y:Math.max(0,Math.min(MAP_H-viewH,v.y+dy*3))
              }))} style={{
                width:32,height:32,background:"rgba(0,0,0,0.7)",border:"1px solid rgba(200,160,60,0.3)",
                color:"#a08040",cursor:"pointer",borderRadius:4,fontSize:14,fontFamily:"'Cinzel',serif",
              }}>{label}</button>
            ))}
            <button onClick={()=>setViewport({
              x:Math.max(0,Math.min(MAP_W-viewW,playerPos.x-Math.floor(viewW/2))),
              y:Math.max(0,Math.min(MAP_H-viewH,playerPos.y-Math.floor(viewH/2))),
            })} style={{
              padding:"0 10px",height:32,background:"rgba(0,0,0,0.7)",border:"1px solid rgba(200,160,60,0.3)",
              color:"#c0a050",cursor:"pointer",borderRadius:4,fontSize:10,fontFamily:"'Cinzel',serif",
            }}>Center</button>
          </div>

          {/* Click instruction */}
          <div style={{ position:"absolute", bottom:50, left:"50%", transform:"translateX(-50%)",
            fontSize:10, color:"rgba(140,110,50,0.5)", fontFamily:"'Cinzel',serif", pointerEvents:"none" }}>
            Click any revealed tile to move • Click structures to interact
          </div>
        </div>

        {/* Right sidebar */}
        <div style={{ width:240, borderLeft:"1px solid rgba(200,160,60,0.2)", display:"flex", flexDirection:"column", background:"rgba(0,0,0,0.25)", overflow:"hidden" }}>
          <div style={{ padding:"10px 12px", borderBottom:"1px solid rgba(200,160,60,0.15)" }}>
            <div style={{ fontSize:11, fontFamily:"'Cinzel',serif", color:"#8a6030", marginBottom:6, letterSpacing:1 }}>CURRENT TILE</div>
            {(() => {
              const t=tiles[playerPos.y]?.[playerPos.x];
              if(!t) return null;
              return (
                <div>
                  <div style={{ fontSize:13, color:"#c0a060", fontFamily:"'Cinzel',serif" }}>
                    {t.structure?.label||t.terrain.label}
                  </div>
                  {t.structure===STRUCTURE.TOWN&&<div style={{ fontSize:11, color:"#a08050" }}>{t.townData?.name}</div>}
                  {t.structure?.id?.startsWith("CASTLE")&&<div style={{ fontSize:11, color:"#a08050" }}>{t.castleData?.mage}'s domain</div>}
                  <div style={{ fontSize:10, color:"#6a5020", marginTop:4 }}>
                    Reveal cost: {Math.max(1,(hasBoots?t.terrain.moveC-1:t.terrain.moveC))} move{t.terrain.moveC!==1?"s":""}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Deck preview */}
          <div style={{ padding:"10px 12px", borderBottom:"1px solid rgba(200,160,60,0.15)" }}>
            <div style={{ fontSize:11, fontFamily:"'Cinzel',serif", color:"#8a6030", marginBottom:6, letterSpacing:1 }}>
              YOUR DECK ({deck.length})
            </div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:4, maxHeight:100, overflow:"hidden" }}>
              {deck.slice(0,8).map((c,i)=>(
                <div key={i} style={{
                  background: c.color ? MANA_COLORS_HEX[c.color]+"30" : "rgba(255,255,255,0.05)",
                  border:"1px solid rgba(255,255,255,0.1)", borderRadius:3,
                  padding:"2px 5px", fontSize:9, color:"#a09060", fontFamily:"'Cinzel',serif",
                  whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", maxWidth:100,
                }}>{c.name}</div>
              ))}
              {deck.length>8&&<div style={{ fontSize:9, color:"#6a5020" }}>+{deck.length-8} more…</div>}
            </div>
            <button onClick={()=>setModal("deck")} style={{
              marginTop:8, width:"100%",
              background:"transparent", border:"1px solid rgba(180,140,40,0.25)",
              color:"#8a6030", padding:"4px", borderRadius:4,
              cursor:"pointer", fontSize:10, fontFamily:"'Cinzel',serif",
            }}>📖 Manage Deck</button>
          </div>

          {/* Binder */}
          <div style={{ padding:"10px 12px", borderBottom:"1px solid rgba(200,160,60,0.15)" }}>
            <div style={{ fontSize:11, fontFamily:"'Cinzel',serif", color:"#8a6030", marginBottom:4, letterSpacing:1 }}>
              BINDER ({binder.length} cards)
            </div>
            {binder.length===0
              ? <div style={{ fontSize:10, color:"#4a3820", fontStyle:"italic" }}>No cards yet. Win duels or shop in towns.</div>
              : <div style={{ display:"flex", flexWrap:"wrap", gap:3 }}>
                  {binder.slice(-6).map((c,i)=>(
                    <div key={i} style={{ width:8, height:12, borderRadius:1, background:MANA_COLORS_HEX[c.color]||"#888", opacity:0.7 }} title={c.name}/>
                  ))}
                  {binder.length>6&&<div style={{fontSize:9,color:"#6a5020"}}>+{binder.length-6}</div>}
                </div>
            }
          </div>

          {/* Log */}
          <div style={{ flex:1, padding:"10px 12px", display:"flex", flexDirection:"column", overflow:"hidden" }}>
            <div style={{ fontSize:11, fontFamily:"'Cinzel',serif", color:"#8a6030", marginBottom:6, letterSpacing:1 }}>CHRONICLE</div>
            <LogPanel log={log}/>
          </div>
        </div>
      </div>

      {/* Modals */}
      {modal==="town"&&activeTile?.townData&&(
        <TownModal
          town={activeTile.townData}
          player={player}
          onClose={()=>setModal(null)}
          onBuy={handleBuy}
          onRest={handleRest}
          onGetClue={handleGetClue}
          moveCount={moveCount}
        />
      )}
      {modal==="dungeon"&&activeTile?.dungeonData&&(
        <DungeonModal
          dungeon={activeTile.dungeonData}
          onClose={()=>setModal(null)}
          onEnter={handleEnterDungeon}
        />
      )}
      {modal==="castle"&&activeTile?.castleData&&(
        <CastleModal
          castleData={activeTile.castleData}
          structure={activeTile.structure}
          onClose={()=>setModal(null)}
          onChallenge={handleChallenge}
        />
      )}
      {modal==="encounter"&&activeMonster&&(
        <EncounterModal
          monster={activeMonster}
          playerHP={player.hp}
          playerMaxHP={player.maxHP}
          onWin={handleWin}
          onFlee={handleFlee}
          moveCount={moveCount}
        />
      )}
      {modal==="deck"&&(
        <DeckManager
          deck={deck}
          binder={binder}
          onClose={()=>setModal(null)}
          onSwap={handleSwap}
        />
      )}

      {/* Mana link alerts */}
      <ManaLinkAlert
        events={manaLinkEvents}
        onRespond={handleRespondToAlert}
        onDismiss={handleDismissAlert}
      />

      {/* Victory / defeat overlays */}
      {magesDefeated.length===5&&(
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.9)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:400 }}>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:40, marginBottom:16 }}>✦</div>
            <div style={{ fontSize:28, fontFamily:"'Cinzel Decorative',serif", color:"#f0d060", marginBottom:8 }}>Shandalar is Saved!</div>
            <div style={{ fontSize:14, color:"#a09060", fontFamily:"'Crimson Text',serif", marginBottom:24, fontStyle:"italic" }}>
              {player.name} has defeated all five mages. Arzakon's ritual is broken.
              <br/>The plane endures — for now.
            </div>
            <button onClick={onReturnToTitle} style={{
              background:"linear-gradient(135deg,#1a1404,#2e2008)",
              border:"2px solid rgba(200,160,40,0.6)", color:"#f0c040",
              padding:"12px 32px", borderRadius:6, cursor:"pointer",
              fontFamily:"'Cinzel',serif", fontSize:14, letterSpacing:2,
            }}>Return to Title</button>
          </div>
        </div>
      )}
      {MAGE_COLORS.some(c=>manaLinks[c]>=(artifacts.some(a=>a.id==="ward"&&a.owned)?5:3))&&!magesDefeated.includes(MAGE_COLORS.find(c=>manaLinks[c]>=(artifacts.some(a=>a.id==="ward"&&a.owned)?5:3)))&&(
        <div style={{ position:"fixed", inset:0, background:"rgba(20,0,0,0.92)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:400 }}>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:36, marginBottom:16 }}>💀</div>
            <div style={{ fontSize:24, fontFamily:"'Cinzel',serif", color:"#e03030", marginBottom:8 }}>Shandalar Falls</div>
            <div style={{ fontSize:13, color:"#a06050", fontFamily:"'Crimson Text',serif", marginBottom:24, fontStyle:"italic" }}>
              Arzakon's ritual completes. The barrier crumbles.
              <br/>The plane of Shandalar is lost.
            </div>
            <button onClick={onReturnToTitle} style={{
              background:"transparent", border:"2px solid rgba(200,60,40,0.5)", color:"#e06040",
              padding:"10px 28px", borderRadius:6, cursor:"pointer",
              fontFamily:"'Cinzel',serif", fontSize:13,
            }}>Accept Defeat</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// APP ROOT
// ============================================================
export default function App() {
  const [screen, setScreen] = useState("title");
  const [startConfig, setStartConfig] = useState(null);

  const handleStart = (config) => {
    setStartConfig(config);
    setScreen("game");
  };

  if(screen==="game"&&startConfig) {
    return <Game startConfig={startConfig} onReturnToTitle={()=>setScreen("title")}/>;
  }
  return <TitleScreen onStart={handleStart}/>;
}
