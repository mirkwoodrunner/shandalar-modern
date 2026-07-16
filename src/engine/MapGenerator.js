// src/engine/MapGenerator.js
// World grid generation and spatial utilities.
// Per SYSTEMS.md S7 and MECHANICS_INDEX.md S3.1
//
// CONSTRAINTS (ENGINE_CONTRACT_SPEC.md):
//   - Map generation is deterministic from rngSeed
//   - No runtime randomness outside seed system
//   - Node placement is mathematically derived

// --- CONSTANTS ----------------------------------------------------------------

export const MAP_W = 64;
export const MAP_H = 40;

export const TERRAIN = {
PLAINS:   { id:"PLAINS",   color:"#b5c87a", label:"Plains",   icon:"🌾",  moveC:1,  mana:"W" },
FOREST:   { id:"FOREST",   color:"#4a7c59", label:"Forest",   icon:"🌲", moveC:2,  mana:"G" },
SWAMP:    { id:"SWAMP",    color:"#4a5568", label:"Swamp",    icon:"🐸", moveC:3,  mana:"B" },
MOUNTAIN: { id:"MOUNTAIN", color:"#9b7355", label:"Mountain", icon:"⛰",  moveC:2,  mana:"R" },
ISLAND:   { id:"ISLAND",   color:"#4a90b8", label:"Island",   icon:"🏝",  moveC:2,  mana:"U" },
WATER:    { id:"WATER",    color:"#1a3a5c", label:"Water",    icon:"🌊",  moveC:99, mana:"U" },
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
export const MAGE_BOSS_ARCHS = { W:"BOSS_WHITE", U:"BOSS_BLUE", B:"BOSS_BLACK", R:"BOSS_RED", G:"BOSS_GREEN" };
export const CASTLE_NAMES = { W:"White Keep", U:"Azure Tower", B:"Shadow Spire", R:"Fire Citadel", G:"Root Throne" };
export const COLORS = ["W","U","B","R","G"];

export const WORLD_MAGICS = [
  {
    id: 'haggler_coin',
    name: "Haggler's Coin",
    icon: '🪙',
    type: 'passive',
    desc: 'Town card shops stock 2 extra cards.',
    rarity: 'U',
  },
  {
    id: 'tome_of_enlightenment',
    name: 'Tome of Enlightenment',
    icon: '📖',
    type: 'passive',
    desc: 'Removes the 4-copy limit on cards in your deck.',
    rarity: 'R',
  },
  {
    id: 'staff_of_thunder',
    name: 'Staff of Thunder',
    icon: '⚡',
    type: 'active',
    desc: 'Destroy the nearest enemy on the map. Costs 1 red amulet per use.',
    rarity: 'R',
    activeCost: { amuletColor: 'R', amount: 1 },
  },
  {
    id: 'sword_of_resistance',
    name: 'Sword of Resistance',
    icon: '🗡️',
    type: 'active',
    desc: 'Teleport to any town currently under attack. Free to use.',
    rarity: 'U',
    activeCost: null,
  },
  {
    id: 'dwarven_pick',
    name: 'Dwarven Pick',
    icon: '⛏️',
    type: 'passive',
    desc: 'Movement through Mountain terrain costs 1 instead of 2.',
    rarity: 'C',
  },
  {
    id: 'amulet_of_swampwalk',
    name: 'Amulet of Swampwalk',
    icon: '🐊',
    type: 'passive',
    desc: 'Movement through Swamp terrain costs 1 instead of 3.',
    rarity: 'C',
  },
  {
    id: 'orb_of_knowing',
    name: 'Orb of Knowing',
    icon: '🔮',
    type: 'passive',
    desc: 'Enemy tier is always visible before committing to fight.',
    rarity: 'U',
  },
  {
    id: 'nomads_map',
    name: "Nomad's Map",
    icon: '🗺️',
    type: 'active',
    desc: 'Reveals a 7×7 area of fog of war centered on your position. Free to use, once per 20 moves.',
    rarity: 'C',
    activeCost: null,
    cooldownMoves: 20,
  },
];

export const CASTLE_MODIFIERS = {
W:   { name:"Holy Ground",     desc:"All creatures have protection from non-white spells." },
U:   { name:"Tidal Lock",      desc:"Player may only cast one spell per turn." },
B:   { name:"Death's Embrace", desc:"Mage's creatures gain lifelink." },
R:   { name:"Inferno",         desc:"At end of each turn, all players take 1 damage." },
G:   { name:"Overgrowth",      desc:"All lands tap for 2 mana instead of 1." },
ARZ: { name:"Dominion",        desc:"Arzakon commands all five colors. The final battle begins." },
};

export const DUNGEON_MODIFIERS = [
{ id:"POWER_STRUGGLE", name:"Power Struggle",  desc:"Each turn a random card swaps between hands.", icon:"🔀" },
{ id:"CURSED_GROUND",  name:"Cursed Ground",   desc:"All creatures enter with a -1/-1 counter.",   icon:"☠" },
{ id:"MANA_SURGE",     name:"Mana Surge",      desc:"Both players gain +1 mana each turn.",         icon:"⚡" },
{ id:"SILENCE",        name:"Silence",         desc:"No instants may be cast.",                     icon:"🔇" },
{ id:"TWILIGHT",       name:"Eternal Twilight", desc:"No creatures may attack until turn 3.",        icon:"🌙" },
{ id:"OVERLOAD",       name:"Overload",         desc:"All spells cost 1 less (minimum 1).",          icon:"✨" },
];

export const DUNGEON_ARCHETYPES = [
"WHITE_WEENIE","BLUE_CONTROL","BLUE_TEMPO","BLACK_REANIMATOR",
"BLACK_CONTROL","RED_BURN","RED_AGGRO","GREEN_STOMPY","ARTIFACT_CONTROL",
];

export const MONSTER_TABLE = {
// hp is legacy display only; duel life is computed from difficulty.tierLife at encounter time
PLAINS:   [
{ name:"Pegasus Cavalry",    hp:10, archKey:"WHITE_WEENIE",    tier:1 },
{ name:"Knight of the Keep", hp:14, archKey:"WHITE_WEENIE",    tier:2 },
{ name:"Holy Crusader",      hp:18, archKey:"WHITE_WEENIE",    tier:3 },
],
FOREST:   [
{ name:"Forest Spider",      hp:10, archKey:"GREEN_STOMPY",    tier:1 },
{ name:"Elder Druid",        hp:14, archKey:"GREEN_STOMPY",    tier:2 },
{ name:"Ancient Wurm",       hp:18, archKey:"GREEN_STOMPY",    tier:3 },
],
SWAMP:    [
{ name:"Risen Zombie",       hp:10, archKey:"BLACK_CONTROL",   tier:1 },
{ name:"Shadow Specter",     hp:14, archKey:"BLACK_REANIMATOR",tier:2 },
{ name:"Mortis's Shade",     hp:18, archKey:"BLACK_REANIMATOR",tier:3 },
],
MOUNTAIN: [
{ name:"Goblin Raider",      hp:10, archKey:"RED_AGGRO",       tier:1 },
{ name:"Mountain Ogre",      hp:14, archKey:"RED_BURN",        tier:2 },
{ name:"Fire Giant",         hp:18, archKey:"RED_BURN",        tier:3 },
],
ISLAND:   [
{ name:"Reef Dancer",        hp:10, archKey:"BLUE_TEMPO",      tier:1 },
{ name:"Tidal Sorcerer",     hp:14, archKey:"BLUE_CONTROL",    tier:2 },
{ name:"Xylos's Agent",      hp:18, archKey:"BLUE_CONTROL",    tier:3 },
],
};

// All biome monster lists, flattened by biome key. Used to decouple encounter
// monster selection from terrain so the player sees a variety of monsters
// everywhere (difficulty still scales by tier, set by the caller).
const MONSTER_LISTS = Object.values(MONSTER_TABLE);

// Pick a tier-appropriate monster from a RANDOM biome list, independent of the
// tile terrain. `rand` is a 0..1 source injected by the caller (the overworld
// layer passes Math.random); this module stays free of ambient randomness.
export function pickMonster(tier, rand) {
  const list = MONSTER_LISTS[Math.floor(rand() * MONSTER_LISTS.length)];
  return list[Math.min(Math.max(tier, 1) - 1, list.length - 1)];
}

export const HENCHMAN_TABLE = [
{ name:'High Priest',     hp:24, archKey:'WHITE_WEENIE',    tier:4, color:'W' },
{ name:'Thought Invoker', hp:24, archKey:'BLUE_CONTROL',    tier:4, color:'U' },
{ name:'Necromancer',     hp:26, archKey:'BLACK_REANIMATOR',tier:4, color:'B' },
{ name:'War Mage',        hp:26, archKey:'RED_BURN',        tier:4, color:'R' },
{ name:'Summoner',        hp:27, archKey:'GREEN_STOMPY',    tier:4, color:'G' },
];

// Town and dungeon name pools
// Sized comfortably above each structure type's max spawn count (see spawn
// loops below) so the procedural fallbackName() below is never needed in
// normal play; it exists purely as a safety net.
const TOWN_POOL = [
"Ardestan","Veldatha","Morheim","Caelthas","Sunspire","Duskwall","Greymere",
"Thornhaven","Ironwake","Silverbend","Coldwater","Emberfield","Ashwood","Deepmoor",
"Starfall","Crestholm","Mistpeak","Dawncroft","Stonebridge","Oakhearth",
"Wraithmoor","Fenwick","Brightwater","Hollowmere","Ravenscar","Goldenvale",
"Thistledown","Windmere","Blackfen","Amberfall",
];
const DUNGEON_POOL = [
"Tomb of the Ancients","Cavern of Echoes","Vault of Shadows","The Sunken Library",
"Crypts of Mortum","Maze of Lost Souls","The Shattered Keep","Den of the Beast",
"Forgotten Catacombs","The Spiral Descent","Lair of the Wyrm","The Iron Labyrinth",
"Halls of the Drowned King","The Bonepit","Sanctum of the Void","The Gnawing Deep",
"Crypt of the Silent Bell","The Hollow Throne","Warrens of the Feral Court","The Weeping Vault",
"Pit of a Thousand Screams","The Obsidian Descent","Ossuary of the Forgotten","The Screaming Gallery",
];

const RUIN_POOL = [
  "Crumbled Watchtower", "Sunken Shrine", "Forsaken Outpost",
  "The Broken Arch", "Shattered Sanctum", "Overgrown Citadel",
  "Collapsed Vault", "The Rusted Gate", "Ancient Foundations",
  "Weathered Obelisk", "The Fallen Keep", "Dusty Reliquary",
  "The Cracked Rampart", "Scorched Cloister", "The Leaning Spire",
  "Buried Colonnade", "The Silent Cistern", "Toppled Monolith",
  "The Faded Threshold", "Ivy-Choked Bastion",
];

// Safety-net fallback for the rare case a structure count exceeds its name
// pool. Composes two thematic word fragments per type instead of a raw
// "Type14"-style placeholder, so immersion holds even at pool exhaustion.
// Routed through the seeded rng() passed in by generateMap (no Math.random()).
const FALLBACK_FRAGMENTS = {
  TOWN: {
    adj: ["Old","New","North","South","East","West","Upper","Lower","Little","Greater"],
    noun: ["Haven","Ford","Reach","Hollow","Cross","Watch","Mill","Vale","Rest","End"],
  },
  DUNGEON: {
    adj: ["Sunken","Forgotten","Hollow","Cursed","Silent","Buried","Broken","Shrouded"],
    noun: ["Depths","Passage","Warren","Chasm","Undercroft","Sepulcher","Labyrinth","Abyss"],
  },
  RUIN: {
    adj: ["Fallen","Crumbling","Weathered","Abandoned","Scattered","Broken","Faded"],
    noun: ["Colonnade","Archway","Bastion","Shrine","Foundation","Outpost","Gatehouse"],
  },
};

function fallbackName(type, rng) {
  const { adj, noun } = FALLBACK_FRAGMENTS[type];
  const a = adj[Math.floor(rng() * adj.length)];
  const n = noun[Math.floor(rng() * noun.length)];
  return `The ${a} ${n}`;
}

const GUILD_QUESTS = [
{ id:"q1", title:"Purge the Risen",  desc:"Defeat undead creatures in the nearby swamp.",        rewardId:"swords",       rewardType:"card", rewardGold:0  },
{ id:"q2", title:"Recover the Tome", desc:"Retrieve the lost tome from a dungeon.",              rewardId:null,           rewardType:"gold", rewardGold:60 },
{ id:"q3", title:"Defend the Gate",  desc:"Fend off the goblin horde from the mountains.",       rewardId:"wog",          rewardType:"card", rewardGold:0  },
{ id:"q4", title:"Chart the Wilds",  desc:"Explore 5 unrevealed tiles and report back.",         rewardId:null,           rewardType:"gold", rewardGold:40 },
{ id:"q5", title:"The Lost Spell",   desc:"Find a sage who knows the ancient counterspell.",     rewardId:"counterspell", rewardType:"card", rewardGold:0  },
];

// --- SEEDED RNG ----------------------------------------------------------------
// mulberry32 ? deterministic, reproducible.
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

// --- COHERENT VALUE NOISE -----------------------------------------------------
// Deterministic low-frequency noise used to cluster terrain into connected
// biome regions (instead of per-tile random checkerboard). All randomness comes
// from the seeded rng; field sampling consumes no rng.

// Cosine interpolation: smooth C1 blend between a and b, t in [0,1].
function cerp(a, b, t) {
  const f = (1 - Math.cos(t * Math.PI)) * 0.5;
  return a * (1 - f) + b * f;
}

// Build a gw x gh lattice of rng() values. Consumes gw*gh rng draws.
function buildLattice(rng, gw, gh) {
  const lat = new Array(gh);
  for (let j = 0; j < gh; j++) {
    lat[j] = new Array(gw);
    for (let i = 0; i < gw; i++) lat[j][i] = rng();
  }
  return lat;
}

// Sample a lattice at continuous grid coords (gx, gy) with cosine bilinear lerp.
function sampleLattice(lat, gx, gy) {
  const x0 = Math.floor(gx), y0 = Math.floor(gy);
  const x1 = x0 + 1,         y1 = y0 + 1;
  const tx = gx - x0,        ty = gy - y0;
  const top = cerp(lat[y0][x0], lat[y0][x1], tx);
  const bot = cerp(lat[y1][x0], lat[y1][x1], tx);
  return cerp(top, bot, ty);
}

// --- CONNECTIVITY HELPER ------------------------------------------------------

/**
 * BFS flood-fill over non-water tiles starting from (sx, sy).
 * Returns a Set of "x,y" keys for all reachable non-water cells.
 */
function floodFillLand(tiles, sx, sy) {
  const reachable = new Set();
  const key = (x, y) => `${x},${y}`;
  if (!tiles[sy]?.[sx] || tiles[sy][sx].terrain === TERRAIN.WATER) return reachable;

  const queue = [{ x: sx, y: sy }];
  reachable.add(key(sx, sy));
  const dirs = [[0,1],[0,-1],[1,0],[-1,0]];

  while (queue.length) {
    const { x, y } = queue.shift();
    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      const k = key(nx, ny);
      if (reachable.has(k)) continue;
      const t = tiles[ny]?.[nx];
      if (!t || t.terrain === TERRAIN.WATER) continue;
      reachable.add(k);
      queue.push({ x: nx, y: ny });
    }
  }
  return reachable;
}

// --- MAP GENERATION -----------------------------------------------------------

/**

- Generate a complete 32?22 world map deterministically from a seed.
- Returns { tiles, startX, startY }
- 
- Per SYSTEMS.md S7 and GDD.md S3.1:
- - 8?10 towns, 6?8 dungeons, 5 mage castles (one per quadrant)
- - Fog of war: 5?5 reveal box centered on player
- - Player starts near center on a non-water, non-structure tile
    */
    export function generateMap(seed, shopCardPool = []) {
    const rng = makeRng(seed);
    const tiles = [];

// -- Terrain (coherent value noise) ---------------------------------------
// Biomes are clustered into connected regions via a low-frequency value-noise
// field so the renderer can autotile them (vs the old per-tile checkerboard).
//
// TERRAIN RNG BUDGET: exactly 241 rng() draws, all consumed building the two
// lattices below (54 + 187). Field sampling and biome bucketing use NO rng.
// This changes the downstream rng stream vs the old per-tile model (2560
// draws), so structure placement differs by seed -- still fully deterministic.
const CS1 = 8, CS2 = 4;
const gw1 = Math.ceil(MAP_W / CS1) + 1, gh1 = Math.ceil(MAP_H / CS1) + 1; // 9 x 6 = 54
const gw2 = Math.ceil(MAP_W / CS2) + 1, gh2 = Math.ceil(MAP_H / CS2) + 1; // 17 x 11 = 187
const lat1 = buildLattice(rng, gw1, gh1);
const lat2 = buildLattice(rng, gw2, gh2);
// (no further rng() draws in the terrain step)

// Pass 1: field + dist + water decision; collect land field values for quantile.
const field = [];
const water = [];
const landVals = [];
for (let y = 0; y < MAP_H; y++) {
  field[y] = [];
  water[y] = [];
  for (let x = 0; x < MAP_W; x++) {
    const o1 = sampleLattice(lat1, x / CS1, y / CS1);
    const o2 = sampleLattice(lat2, x / CS2, y / CS2);
    const f = (o1 + 0.5 * o2) / 1.5;
    field[y][x] = f;
    const nx = x / MAP_W - 0.5;
    const ny = y / MAP_H - 0.5;
    const dist = Math.sqrt(nx * nx + ny * ny);
    // Wavy, connected coast: noise wobbles the effective sea-level radius.
    const isWater = dist + (f - 0.5) * 0.18 > 0.46;
    water[y][x] = isWater;
    if (!isWater) landVals.push(f);
  }
}

// Quantile thresholds over LAND tiles only -> exact land biome proportions,
// independent of the noise distribution shape. Cost-monotonic biome ladder
// (ISLAND -> PLAINS -> FOREST -> SWAMP -> MOUNTAIN) keeps high-cost SWAMP a
// thin band rather than a basin, easing movement.
landVals.sort((a, b) => a - b);
const N = landVals.length || 1;
const cut = [0.28, 0.48, 0.68, 0.82];
const thr = cut.map((p) => landVals[Math.min(N - 1, Math.floor(p * N))] ?? 1);
const biomeFor = (f) =>
  f < thr[0] ? TERRAIN.ISLAND :
  f < thr[1] ? TERRAIN.PLAINS :
  f < thr[2] ? TERRAIN.FOREST :
  f < thr[3] ? TERRAIN.SWAMP  :
               TERRAIN.MOUNTAIN;

// Pass 2: build tile objects (shape + encChance unchanged).
for (let y = 0; y < MAP_H; y++) {
tiles[y] = [];
for (let x = 0; x < MAP_W; x++) {
const nx = x / MAP_W - 0.5;
const ny = y / MAP_H - 0.5;
const dist = Math.sqrt(nx * nx + ny * ny);
const terrain = water[y][x] ? TERRAIN.WATER : biomeFor(field[y][x]);

  tiles[y][x] = {
    x, y,
    terrain,
    structure: null,
    revealed: false,
    manaLink: null,
    townData: null,
    dungeonData: null,
    castleData: null,
    ruinData: null,
    encChance: 0.11 + dist * 0.14,
  };
}

}

// -- Structure placement helpers ------------------------------------------
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

// -- Towns (18-22) --------------------------------------------------------
const townNames = [...TOWN_POOL].sort(() => rng() - 0.5);
const townCount = 18 + Math.floor(rng() * 5);
for (let i = 0; i < townCount; i++) {
const p = spot(2, MAP_W - 2, 2, MAP_H - 2, 3);
if (!p) continue;
claim(p.x, p.y);
const stock = shopCardPool.length
? [...shopCardPool].sort(() => rng() - 0.5).slice(0, 6 + Math.floor(rng() * 5))
: [];
tiles[p.y][p.x].structure = "TOWN";
tiles[p.y][p.x].townData = {
name: townNames[i] || fallbackName('TOWN', rng),
stock,
quest: rng() > 0.4 ? GUILD_QUESTS[Math.floor(rng() * GUILD_QUESTS.length)] : null,
hasSage: rng() > 0.5,
hasBlackMarket: rng() > 0.75,
questDone: false,
conquered: false,
};
}

// Post-process: assign delivery quests to ~40% of towns
const townTiles = [];
tiles.forEach(row => row.forEach(t => { if (t.structure === 'TOWN') townTiles.push(t); }));

for (let i = 0; i < townTiles.length; i++) {
  if (rng() < 0.4 && townTiles.length > 1) {
    const others = townTiles.filter((_, j) => j !== i);
    const dest = others[Math.floor(rng() * others.length)];
    const DELIVERY_ITEMS = [
      'a sealed letter', 'a merchant ledger', 'a vial of reagents',
      'an enchanted scroll', 'a crown jewel', 'a bag of seeds',
    ];
    const item = DELIVERY_ITEMS[Math.floor(rng() * DELIVERY_ITEMS.length)];
    const DELIVERY_REWARDS = [
      { rewardType: 'manalink', rewardGold: 0, rewardId: null },
      { rewardType: 'gold',     rewardGold: 80, rewardId: null },
      { rewardType: 'card',     rewardGold: 0,  rewardId: null },
    ];
    const reward = DELIVERY_REWARDS[Math.floor(rng() * DELIVERY_REWARDS.length)];

    tiles[townTiles[i].y][townTiles[i].x].townData.quest = {
      id: `delivery_${i}`,
      title: `Deliver ${item}`,
      desc: `Carry ${item} to ${dest.townData.name}.`,
      conditionType: 'delivery',
      destTownName: dest.townData.name,
      item,
      accepted: false,
      completed: false,
      ...reward,
    };
  }
}

// -- Dungeons (14-16) -----------------------------------------------------
const dungeonNames = [...DUNGEON_POOL].sort(() => rng() - 0.5);
const dungeonCount = 14 + Math.floor(rng() * 3);
for (let i = 0; i < dungeonCount; i++) {
const p = spot(2, MAP_W - 2, 2, MAP_H - 2, 4);
if (!p) continue;
claim(p.x, p.y);
const mod = DUNGEON_MODIFIERS[Math.floor(rng() * DUNGEON_MODIFIERS.length)];
const rooms = 3 + Math.floor(rng() * 3);
tiles[p.y][p.x].structure = "DUNGEON";
tiles[p.y][p.x].dungeonData = {
name: dungeonNames[i] || fallbackName('DUNGEON', rng),
mod,
rooms,
domColor: COLORS[Math.floor(rng() * 5)],
loot: [], // populated by caller with rare cards
clued: false, // hidden until a sage or post-duel clue reveals it
};
}

// -- Ruins (10-14) --------------------------------------------------------
const ruinNames = [...RUIN_POOL].sort(() => rng() - 0.5);
const ruinCount = 10 + Math.floor(rng() * 5);
for (let i = 0; i < ruinCount; i++) {
  const p = spot(2, MAP_W - 2, 2, MAP_H - 2, 3);
  if (!p) continue;
  claim(p.x, p.y);
  tiles[p.y][p.x].structure = 'RUIN';
  tiles[p.y][p.x].ruinData = {
    name: ruinNames[i] || fallbackName('RUIN', rng),
    looted: false,
    hasGuardian: rng() < 0.33,
  };
}

// -- Mage Castles (5 ? one per quadrant + center) --------------------------
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

// -- Player start: near center --------------------------------------------
let startX = Math.floor(MAP_W / 2);
let startY = Math.floor(MAP_H / 2);
for (let r = 0; r < 8; r++) {
if (tiles[startY]?.[startX]?.terrain !== TERRAIN.WATER && !tiles[startY]?.[startX]?.structure) break;
startX += rng() > 0.5 ? 1 : -1;
startY += rng() > 0.5 ? 1 : -1;
startX = Math.max(1, Math.min(MAP_W - 2, startX));
startY = Math.max(1, Math.min(MAP_H - 2, startY));
}

  // -- Connectivity enforcement -------------------------------------------------
  // Flood-fill from player start. Any non-water tile that is unreachable gets
  // converted to WATER so the player can never be blocked from reaching it
  // (and can never see a structure they cannot path to).
  const reachable = floodFillLand(tiles, startX, startY);
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      if (tiles[y][x].terrain !== TERRAIN.WATER) {
        if (!reachable.has(`${x},${y}`)) {
          // Remove any structure that would have been stranded
          // NOTE (log-don't-fix): ruinData is not cleared here like the other
          // structure data fields -- pre-existing latent bug, left as-is.
          tiles[y][x].structure  = null;
          tiles[y][x].townData   = null;
          tiles[y][x].dungeonData = null;
          tiles[y][x].castleData = null;
          tiles[y][x].terrain    = TERRAIN.WATER;
        }
      }
    }
  }

// Reveal 5?5 box around start (GDD S3.1: "5?5 box centered on player")
for (let dy = -2; dy <= 2; dy++) {
for (let dx = -2; dx <= 2; dx++) {
if (tiles[startY + dy]?.[startX + dx]) {
tiles[startY + dy][startX + dx].revealed = true;
}
}
}

return { tiles, startX, startY };
}

// --- PATHFINDING --------------------------------------------------------------

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

- Reveal a 5?5 box of tiles around (cx, cy) in place.
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
