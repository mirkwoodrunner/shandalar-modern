// src/engine/MapGenerator.js
// World grid generation and spatial utilities.
// Per SYSTEMS.md §7 and MECHANICS_INDEX.md §3.1
//
// CONSTRAINTS (ENGINE_CONTRACT_SPEC.md):
//   - Map generation is deterministic from rngSeed
//   - No runtime randomness outside seed system
//   - Node placement is mathematically derived

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

export const MAP_W = 32;
export const MAP_H = 22;

export const TERRAIN = {
PLAINS:   { id:"PLAINS",   color:"#b5c87a", label:"Plains",   icon:"☀",  moveC:1,  mana:"W" },
FOREST:   { id:"FOREST",   color:"#4a7c59", label:"Forest",   icon:"🌲", moveC:2,  mana:"G" },
SWAMP:    { id:"SWAMP",    color:"#4a5568", label:"Swamp",    icon:"🌿", moveC:3,  mana:"B" },
MOUNTAIN: { id:"MOUNTAIN", color:"#9b7355", label:"Mountain", icon:"⛰",  moveC:2,  mana:"R" },
ISLAND:   { id:"ISLAND",   color:"#4a90b8", label:"Island",   icon:"~",  moveC:2,  mana:"U" },
WATER:    { id:"WATER",    color:"#1a3a5c", label:"Water",    icon:"≈",  moveC:99, mana:"U" },
};

export const MANA_HEX = {
W:"#f9f2d8", U:"#99ccee", B:"#bb99dd", R:"#ee8855", G:"#88cc66", C:"#aaaaaa",
};

export const MANA_SYM = {
W:"☀", U:"💧", B:"💀", R:"🔥", G:"🌿",
};

export const MAGE_NAMES   = { W:"Delenia", U:"Xylos",  B:"Mortis", R:"Karag",  G:"Sylvara" };
export const MAGE_TITLES  = { W:"the White Tyrant", U:"the Blue Schemer", B:"the Black Necromancer", R:"the Red Warlord", G:"the Green Ancient" };
export const MAGE_ARCHS   = { W:"WHITE_WEENIE", U:"BLUE_CONTROL", B:"BLACK_REANIMATOR", R:"RED_BURN", G:"GREEN_STOMPY" };
export const CASTLE_NAMES = { W:"White Keep", U:"Azure Tower", B:"Shadow Spire", R:"Fire Citadel", G:"Root Throne" };
export const COLORS = ["W","U","B","R","G"];

export const CASTLE_MODIFIERS = {
W:   { name:"Holy Ground",     desc:"All creatures have protection from non-white spells." },
U:   { name:"Tidal Lock",      desc:"Player may only cast one spell per turn." },
B:   { name:"Death's Embrace", desc:"Mage's creatures gain lifelink." },
R:   { name:"Inferno",         desc:"At end of each turn, all players take 1 damage." },
G:   { name:"Overgrowth",      desc:"All lands tap for 2 mana instead of 1." },
ARZ: { name:"Dominion",        desc:"Arzakon commands all five colors. The final battle begins." },
};

export const DUNGEON_MODIFIERS = [
{ id:"POWER_STRUGGLE", name:"Power Struggle",  desc:"Each turn a random card swaps between hands.", icon:"⇄" },
{ id:"CURSED_GROUND",  name:"Cursed Ground",   desc:"All creatures enter with a -1/-1 counter.",   icon:"☠" },
{ id:"MANA_SURGE",     name:"Mana Surge",      desc:"Both players gain +1 mana each turn.",         icon:"⚡" },
{ id:"SILENCE",        name:"Silence",         desc:"No instants may be cast.",                     icon:"🤫" },
{ id:"TWILIGHT",       name:"Eternal Twilight", desc:"No creatures may attack until turn 3.",        icon:"🌘" },
{ id:"OVERLOAD",       name:"Overload",         desc:"All spells cost 1 less (minimum 1).",          icon:"✦" },
];

export const DUNGEON_ARCHETYPES = [
"WHITE_WEENIE","BLUE_CONTROL","BLUE_TEMPO","BLACK_REANIMATOR",
"BLACK_CONTROL","RED_BURN","RED_AGGRO","GREEN_STOMPY","ARTIFACT_CONTROL",
];

export const MONSTER_TABLE = {
PLAINS:   [
{ name:"Pegasus Cavalry",    hp:18, archKey:"WHITE_WEENIE",    tier:1 },
{ name:"Knight of the Keep", hp:22, archKey:"WHITE_WEENIE",    tier:2 },
{ name:"Holy Crusader",      hp:26, archKey:"WHITE_WEENIE",    tier:3 },
],
FOREST:   [
{ name:"Forest Spider",      hp:18, archKey:"GREEN_STOMPY",    tier:1 },
{ name:"Elder Druid",        hp:22, archKey:"GREEN_STOMPY",    tier:2 },
{ name:"Ancient Wurm",       hp:28, archKey:"GREEN_STOMPY",    tier:3 },
],
SWAMP:    [
{ name:"Risen Zombie",       hp:18, archKey:"BLACK_CONTROL",   tier:1 },
{ name:"Shadow Specter",     hp:22, archKey:"BLACK_REANIMATOR",tier:2 },
{ name:"Mortis's Shade",     hp:26, archKey:"BLACK_REANIMATOR",tier:3 },
],
MOUNTAIN: [
{ name:"Goblin Raider",      hp:16, archKey:"RED_AGGRO",       tier:1 },
{ name:"Mountain Ogre",      hp:22, archKey:"RED_BURN",        tier:2 },
{ name:"Fire Giant",         hp:28, archKey:"RED_BURN",        tier:3 },
],
ISLAND:   [
{ name:"Reef Dancer",        hp:18, archKey:"BLUE_TEMPO",      tier:1 },
{ name:"Tidal Sorcerer",     hp:22, archKey:"BLUE_CONTROL",    tier:2 },
{ name:"Xylos's Agent",      hp:26, archKey:"BLUE_CONTROL",    tier:3 },
],
};

// Town and dungeon name pools
const TOWN_POOL = [
"Ardestan","Veldatha","Morheim","Caelthas","Sunspire","Duskwall","Greymere",
"Thornhaven","Ironwake","Silverbend","Coldwater","Emberfield","Ashwood","Deepmoor",
"Starfall","Crestholm","Mistpeak","Dawncroft","Stonebridge","Oakhearth",
];
const DUNGEON_POOL = [
"Tomb of the Ancients","Cavern of Echoes","Vault of Shadows","The Sunken Library",
"Crypts of Mortum","Maze of Lost Souls","The Shattered Keep","Den of the Beast",
"Forgotten Catacombs","The Spiral Descent","Lair of the Wyrm","The Iron Labyrinth",
];

const GUILD_QUESTS = [
{ id:"q1", title:"Purge the Risen",  desc:"Defeat undead creatures in the nearby swamp.",        rewardId:"swords",       rewardType:"card", rewardGold:0  },
{ id:"q2", title:"Recover the Tome", desc:"Retrieve the lost tome from a dungeon.",              rewardId:null,           rewardType:"gold", rewardGold:60 },
{ id:"q3", title:"Defend the Gate",  desc:"Fend off the goblin horde from the mountains.",       rewardId:"wog",          rewardType:"card", rewardGold:0  },
{ id:"q4", title:"Chart the Wilds",  desc:"Explore 5 unrevealed tiles and report back.",         rewardId:null,           rewardType:"gold", rewardGold:40 },
{ id:"q5", title:"The Lost Spell",   desc:"Find a sage who knows the ancient counterspell.",     rewardId:"counterspell", rewardType:"card", rewardGold:0  },
];

// ─── SEEDED RNG ────────────────────────────────────────────────────────────────
// mulberry32 - deterministic, reproducible.
// All randomness in map generation must use this. Never Math.random().

export function makeRng(seed) {
let s = seed | 0;
return function () {
s = (s + 0x6D2B79F5) | 0;
let t = Math.imul(s ^ (s >>> 15), 1 | s);
t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
}

// ─── MAP GENERATION ───────────────────────────────────────────────────────────

/**

- Generate a complete 32×22 world map deterministically from a seed.
- Returns { tiles, startX, startY }
- 
- Per SYSTEMS.md §7 and GDD.md §3.1:
- - 8-10 towns, 6-8 dungeons, 5 mage castles (one per quadrant)
- - Fog of war: 5×5 reveal box centered on player
- - Player starts near center on a non-water, non-structure tile
    */
    export function generateMap(seed, shopCardPool = []) {
    const rng = makeRng(seed);
    const tiles = [];

// ── Terrain ──────────────────────────────────────────────────────────────
for (let y = 0; y < MAP_H; y++) {
tiles[y] = [];
for (let x = 0; x < MAP_W; x++) {
const nx = x / MAP_W - 0.5;
const ny = y / MAP_H - 0.5;
const dist = Math.sqrt(nx * nx + ny * ny);
const v = rng();

  let terrain;
  if (dist > 0.45 && v > 0.3)  terrain = TERRAIN.WATER;
  else if (v < 0.18)            terrain = TERRAIN.MOUNTAIN;
  else if (v < 0.32)            terrain = TERRAIN.SWAMP;
  else if (v < 0.52)            terrain = TERRAIN.FOREST;
  else if (v < 0.72)            terrain = TERRAIN.PLAINS;
  else                          terrain = TERRAIN.ISLAND;

  tiles[y][x] = {
    x, y,
    terrain,
    structure: null,
    revealed: false,
    manaLink: null,
    townData: null,
    dungeonData: null,
    castleData: null,
    encChance: 0.11 + dist * 0.14,
  };
}

}

// ── Structure placement helpers ──────────────────────────────────────────
const used = new Set();
const claim = (x, y) => used.add(`${x},${y}`);
const spot = (x1, x2, y1, y2, minDist = 3) => {
for (let attempt = 0; attempt < 200; attempt++) {
const x = Math.floor(x1 + rng() * (x2 - x1));
const y = Math.floor(y1 + rng() * (y2 - y1));
if (!tiles[y]?.[x] || tiles[y][x].terrain === TERRAIN.WATER) continue;
if (used.has(`${x},${y}`)) continue;
let ok = true;
for (const key of used) {
const [ox, oy] = key.split(",").map(Number);
if (Math.abs(ox - x) + Math.abs(oy - y) < minDist) { ok = false; break; }
}
if (ok) return { x, y };
}
return null;
};

// ── Towns (8-10) ─────────────────────────────────────────────────────────
const townNames = [...TOWN_POOL].sort(() => rng() - 0.5);
const townCount = 8 + Math.floor(rng() * 3);
for (let i = 0; i < townCount; i++) {
const p = spot(2, MAP_W - 2, 2, MAP_H - 2, 3);
if (!p) continue;
claim(p.x, p.y);
const stock = shopCardPool.length
? [...shopCardPool].sort(() => rng() - 0.5).slice(0, 6 + Math.floor(rng() * 5))
: [];
tiles[p.y][p.x].structure = "TOWN";
tiles[p.y][p.x].townData = {
name: townNames[i] || `Town${i}`,
stock,
quest: rng() > 0.4 ? GUILD_QUESTS[Math.floor(rng() * GUILD_QUESTS.length)] : null,
hasSage: rng() > 0.5,
hasBlackMarket: rng() > 0.75,
questDone: false,
};
}

// ── Dungeons (6-8) ───────────────────────────────────────────────────────
const dungeonNames = [...DUNGEON_POOL].sort(() => rng() - 0.5);
const dungeonCount = 6 + Math.floor(rng() * 3);
for (let i = 0; i < dungeonCount; i++) {
const p = spot(2, MAP_W - 2, 2, MAP_H - 2, 4);
if (!p) continue;
claim(p.x, p.y);
const mod = DUNGEON_MODIFIERS[Math.floor(rng() * DUNGEON_MODIFIERS.length)];
const rooms = 3 + Math.floor(rng() * 3);
tiles[p.y][p.x].structure = "DUNGEON";
tiles[p.y][p.x].dungeonData = {
name: dungeonNames[i] || `Dungeon${i}`,
mod,
rooms,
domColor: COLORS[Math.floor(rng() * 5)],
loot: [], // populated by caller with rare cards
};
}

// ── Mage Castles (5 - one per quadrant + center) ──────────────────────────
const quads = [
{ x1:1,        x2:MAP_W/2-2, y1:1,        y2:MAP_H/2-2 },
{ x1:MAP_W/2+2,x2:MAP_W-2,   y1:1,        y2:MAP_H/2-2 },
{ x1:1,        x2:MAP_W/2-2, y1:MAP_H/2+2,y2:MAP_H-2   },
{ x1:MAP_W/2+2,x2:MAP_W-2,   y1:MAP_H/2+2,y2:MAP_H-2   },
{ x1:MAP_W/2-3,x2:MAP_W/2+3, y1:MAP_H/2-3,y2:MAP_H/2+3 },
];
[...COLORS].sort(() => rng() - 0.5).forEach((color, i) => {
const q = quads[i];
const p = spot(q.x1, q.x2, q.y1, q.y2, 5);
if (!p) return;
claim(p.x, p.y);
tiles[p.y][p.x].structure = "CASTLE";
tiles[p.y][p.x].castleData = {
color,
mage: MAGE_NAMES[color],
defeated: false,
};
});

// ── Player start: near center ────────────────────────────────────────────
let startX = Math.floor(MAP_W / 2);
let startY = Math.floor(MAP_H / 2);
for (let r = 0; r < 8; r++) {
if (tiles[startY]?.[startX]?.terrain !== TERRAIN.WATER && !tiles[startY]?.[startX]?.structure) break;
startX += rng() > 0.5 ? 1 : -1;
startY += rng() > 0.5 ? 1 : -1;
startX = Math.max(1, Math.min(MAP_W - 2, startX));
startY = Math.max(1, Math.min(MAP_H - 2, startY));
}

// Reveal 5×5 box around start (GDD §3.1: "5×5 box centered on player")
for (let dy = -2; dy <= 2; dy++) {
for (let dx = -2; dx <= 2; dx++) {
if (tiles[startY + dy]?.[startX + dx]) {
tiles[startY + dy][startX + dx].revealed = true;
}
}
}

return { tiles, startX, startY };
}

// ─── PATHFINDING ──────────────────────────────────────────────────────────────

/**

- BFS pathfinding over revealed, non-water tiles.
- Returns an array of {x,y} steps from (sx,sy) toward (ex,ey),
- or null if no path exists.
  */
  export function findPath(tiles, sx, sy, ex, ey) {
  if (!tiles[ey]?.[ex] || tiles[ey][ex].terrain === TERRAIN.WATER) return null;
  const visited = new Set([`${sx},${sy}`]);
  const queue = [{ x: sx, y: sy, path: [] }];
  const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];

while (queue.length) {
const { x, y, path } = queue.shift();
if (x === ex && y === ey) return path;
for (const [dx, dy] of dirs) {
const nx = x + dx;
const ny = y + dy;
const key = `${nx},${ny}`;
if (visited.has(key)) continue;
const t = tiles[ny]?.[nx];
if (!t || !t.revealed || t.terrain === TERRAIN.WATER) continue;
visited.add(key);
queue.push({ x: nx, y: ny, path: [...path, { x: nx, y: ny }] });
}
}
return null;
}

/**

- Reveal a 5×5 box of tiles around (cx, cy) in place.
- Returns new tiles array (immutable update).
  */
  export function revealAround(tiles, cx, cy) {
  const next = tiles.map(row => [...row]);
  for (let dy = -2; dy <= 2; dy++) {
  for (let dx = -2; dx <= 2; dx++) {
  if (next[cy + dy]?.[cx + dx]) {
  next[cy + dy][cx + dx] = { ...next[cy + dy][cx + dx], revealed: true };
  }
  }
  }
  return next;
  }

export default { generateMap, findPath, revealAround, makeRng };
