// src/OverworldGame.jsx
// Overworld assembler. Wires MapGenerator, all UI sub-components, and DuelScreen.
// Per MECHANICS_INDEX.md §7.2 - presentation coordinator only.
// All map logic lives in MapGenerator.js; duel logic in DuelCore.js.

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';

// ── Engine ────────────────────────────────────────────────────────────────────
import {
generateMap, findPath, revealAround,
TERRAIN, COLORS, MAGE_NAMES, MAGE_ARCHS, CASTLE_MODIFIERS,
MANA_HEX, MANA_SYM, DUNGEON_ARCHETYPES, MONSTER_TABLE,
} from './engine/MapGenerator.js';
import { isLand } from './engine/DuelCore.js';
import { ARCHETYPES, CARD_DB } from './data/cards.js';
import RULESETS from './data/rulesets.js';

// ── UI ────────────────────────────────────────────────────────────────────────
import { WorldMap, HUDBar, MapLegend, MageStatusPanel, ManaLinkAlert } from './ui/overworld/WorldMap.jsx';
import { TownModal, DungeonModal, CastleModal, DeckManager, ScoreScreen } from './ui/overworld/EncounterModal.jsx';
import { DuelLog as OWLog } from './ui/layout/TechnicalLog.jsx';
import DuelScreen from './DuelScreen.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS (mirrors shandalar-phase4.jsx)
// ─────────────────────────────────────────────────────────────────────────────

const mkId = () => Math.random().toString(36).slice(2, 9);

const ART_REWARD = { W: 'ward', U: 'stone', B: 'amulet', R: 'focus', G: 'boots' };

const OW_ARTS = [
{ id: 'boots',  name: 'Magical Boots',  icon: '👢', desc: 'Movement cost -1 per tile (min 1).',      owned: false },
{ id: 'amulet', name: 'Amulet of Life', icon: '💎', desc: 'Maximum HP +5.',                           owned: false },
{ id: 'focus',  name: "Mage's Focus",   icon: '🔮', desc: 'Draw 1 extra card at duel start.',         owned: false },
{ id: 'ward',   name: "Arzakon's Ward", icon: '🛡', desc: 'Mana link threshold raised to 5.',         owned: false },
{ id: 'stone',  name: 'Scrying Stone',  icon: '🔯', desc: 'Free dungeon reveal per town visit.',      owned: false },
];

const START_DECKS = {
W: { hp: 22, maxHP: 22, gold: 40,  deckIds: ['savannah_lions','white_knight','serra_angel','swords','healing_salve','wog',...Array(9).fill('plains')] },
U: { hp: 18, maxHP: 18, gold: 50,  deckIds: ['counterspell','merfolk_pearl','air_elemental','ancestral','unsummon','braingeyser',...Array(9).fill('island')] },
B: { hp: 18, maxHP: 18, gold: 35,  deckIds: ['dark_ritual','hypnotic_specter','sengir_vampire','terror','demonic_tutor','mind_twist',...Array(9).fill('swamp')] },
R: { hp: 20, maxHP: 20, gold: 40,  deckIds: ['lightning_bolt','chain_lightning','fireball','goblin_king','shivan_dragon','lava_axe',...Array(9).fill('mountain')] },
G: { hp: 22, maxHP: 22, gold: 30,  deckIds: ['llanowar_elves','fyndhorn_elves','craw_wurm','force_of_nature','giant_growth','stream_of_life',...Array(9).fill('forest')] },
};

const MINION_NAMES = {
W: ['Holy Crusader', "Serra's Knight"],
U: ['Tidal Phantom', "Xylos's Agent"],
B: ['Skeletal Minion', "Mortis's Shade"],
R: ['Goblin Horde', "Karag's Raider"],
G: ['Vine Elemental', "Sylvara's Chosen"],
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: build starting deck instances from id list
// ─────────────────────────────────────────────────────────────────────────────
function buildDeck(deckIds) {
return deckIds.map(id => {
const found = CARD_DB.find(c => c.id === id);
if (!found) {
// Fail-fast: log missing card so it's caught during development.
console.error(`[OverworldGame] Missing card in CARD_DB: "${id}"`);
return null;
}
return { ...found, iid: mkId() };
}).filter(Boolean);
}

// ─────────────────────────────────────────────────────────────────────────────
// OVERWORLD GAME
// ─────────────────────────────────────────────────────────────────────────────

/**

- @param {object} startConfig  { color: "W"|"U"|"B"|"R"|"G", name: string, seed: number }
- @param {function} onQuit     () => void - returns to title
- @param {function} onScore    (data) => void - hands off to ScoreScreen
  */
  export default function OverworldGame({ startConfig, onQuit, onScore }) {
  const { color, name, seed } = startConfig;
  const startDef = START_DECKS[color];

// ── Map ──────────────────────────────────────────────────────────────────
const shopPool = useMemo(() => CARD_DB.filter(c => !isLand(c)), []);
const { tiles: initTiles, startX, startY } = useMemo(
() => generateMap(seed, shopPool),
[seed, shopPool]
);
const [tiles, setTiles] = useState(initTiles);
const [pos, setPos]     = useState({ x: startX, y: startY });
const [moves, setMoves] = useState(0);

// ── Player ───────────────────────────────────────────────────────────────
const [player, setPlayer] = useState({
name, color,
hp: startDef.hp, maxHP: startDef.maxHP,
gold: startDef.gold, gems: 0,
});
const [deck, setDeck]         = useState(() => buildDeck(startDef.deckIds));
const [binder, setBinder]     = useState([]);
const [artifacts, setArtifacts] = useState([...OW_ARTS]);

// ── World pressure ───────────────────────────────────────────────────────
const [manaLinks, setManaLinks]       = useState({ W:0, U:0, B:0, R:0, G:0 });
const [magesDefeated, setMagesDefeated] = useState([]);
const [mlEvents, setMlEvents]         = useState([]);

// ── Run tracking ─────────────────────────────────────────────────────────
const [dungeonsCleared, setDungeonsCleared]   = useState(0);
const [townsSaved, setTownsSaved]             = useState(0);
const [manaLinksTotal, setManaLinksTotal]     = useState(0);
const [arzakonDefeated, setArzakonDefeated]   = useState(false);

// ── Duel bridge ──────────────────────────────────────────────────────────
const [duelCfg, setDuelCfg]         = useState(null);
const [dungeonProg, setDungeonProg] = useState(null);

// ── Ruleset / ante ───────────────────────────────────────────────────────
const [ruleset, setRuleset]       = useState(RULESETS.CLASSIC);
const [anteEnabled, setAnteEnabled] = useState(false);

// ── UI ───────────────────────────────────────────────────────────────────
const [modal, setModal]         = useState(null);
const [activeTile, setActiveTile] = useState(null);
const [log, setLog]             = useState([{ text: `${name} enters the plane of Shandalar.`, type: 'info' }]);

// ── Viewport ─────────────────────────────────────────────────────────────
const [viewOfs, setViewOfs]   = useState({ x: 0, y: 0 });
const [zoom, setZoom]         = useState(1);

// ── Derived ──────────────────────────────────────────────────────────────
const hasBoots  = artifacts.some(a => a.id === 'boots'  && a.owned);
const hasWard   = artifacts.some(a => a.id === 'ward'   && a.owned);
const hasFocus  = artifacts.some(a => a.id === 'focus'  && a.owned);
const hasStone  = artifacts.some(a => a.id === 'stone'  && a.owned);
const mlThreshold = hasWard ? 5 : 3;
const allMagesDown   = magesDefeated.length === 5;
const gameWon        = allMagesDown && arzakonDefeated;
const arzakonReady   = allMagesDown && !arzakonDefeated && !duelCfg;
const gameLost       = COLORS.some(c => manaLinks[c] >= mlThreshold && !magesDefeated.includes(c));

// ─────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────

const addLog = useCallback((text, type = 'info') => {
setLog(prev => [...prev.slice(-80), { text, type }]);
}, []);

// ─────────────────────────────────────────────────────────────────────────
// MOVEMENT & ENCOUNTER LOGIC
// ─────────────────────────────────────────────────────────────────────────

const doMove = useCallback((nx, ny) => {
// Reveal fog
const newTiles = revealAround(tiles, nx, ny);

```
// Move counters
const newMoves = moves + 1;
setMoves(newMoves);
setPos({ x: nx, y: ny });
setTiles(newTiles);

// Center viewport loosely on player
setViewOfs({ x: nx, y: ny });

// Hunger: 8g every 15 moves
if (newMoves > 0 && newMoves % 15 === 0) {
  setPlayer(p => {
    const cost = Math.min(p.gold, 8);
    if (cost < 8) addLog('⚠ Starving! No gold for food.', 'danger');
    else addLog(`Hungry. Spent 8g on provisions.`, 'info');
    return { ...p, gold: p.gold - cost };
  });
}

// Tick mana link event countdowns
let expiredEvents = [];
setMlEvents(prev => {
  const updated = prev
    .map(ev => ({ ...ev, movesLeft: ev.movesLeft - 1 }))
    .filter(ev => {
      if (ev.movesLeft <= 0) { expiredEvents.push(ev); return false; }
      return true;
    });
  return updated;
});
// Apply expired events as mana links
if (expiredEvents.length) {
  expiredEvents.forEach(ev => {
    if (magesDefeated.includes(ev.color)) return;
    setManaLinks(prev => ({ ...prev, [ev.color]: prev[ev.color] + 1 }));
    setManaLinksTotal(t => t + 1);
    setTiles(prev => {
      const n = prev.map(r => [...r]);
      if (n[ev.ty]?.[ev.tx]) n[ev.ty][ev.tx] = { ...n[ev.ty][ev.tx], manaLink: ev.color };
      return n;
    });
    addLog(`💀 ${MAGE_NAMES[ev.color]}'s minion seizes ${ev.townName}! Mana link established.`, 'danger');
  });
}

// Spawn new mana link event every 12 moves
if (newMoves > 5 && newMoves % 12 === 0 && Math.random() > 0.45) {
  const aliveColors = COLORS.filter(c => !magesDefeated.includes(c));
  if (aliveColors.length) {
    const evColor = aliveColors[Math.floor(Math.random() * aliveColors.length)];
    const townTargets = [];
    newTiles.forEach(row => row.forEach(t => {
      if (t.structure === 'TOWN' && t.townData && !t.manaLink) townTargets.push(t);
    }));
    if (townTargets.length) {
      const target = townTargets[Math.floor(Math.random() * townTargets.length)];
      const names = MINION_NAMES[evColor];
      const minionName = names[Math.floor(Math.random() * names.length)];
      const newEv = {
        id: Date.now(), color: evColor, minionName,
        townName: target.townData.name,
        tx: target.x, ty: target.y,
        movesLeft: 10,
      };
      setMlEvents(prev => [...prev, newEv]);
      addLog(`🚨 ${MAGE_NAMES[evColor]} sends ${minionName} to seize ${target.townData.name}!`, 'danger');
    }
  }
}

// Structure interaction
const t = newTiles[ny]?.[nx];
if (!t) return;
if (t.structure) {
  setActiveTile(t);
  if (t.structure === 'TOWN') {
    addLog(`You arrive at ${t.townData.name}.`, 'info');
    setModal('town');
    return;
  }
  if (t.structure === 'DUNGEON') {
    addLog(`The entrance to ${t.dungeonData.name} looms before you.`, 'event');
    setModal('dungeon');
    return;
  }
  if (t.structure === 'CASTLE') {
    addLog(`You approach ${t.castleData.mage}'s stronghold.`, 'event');
    setModal('castle');
    return;
  }
}

// Random encounter
if (t.terrain !== TERRAIN.WATER && Math.random() < t.encChance) {
  const mList = MONSTER_TABLE[t.terrain.id] || MONSTER_TABLE.PLAINS;
  const tier = newMoves < 20 ? 1 : newMoves < 60 ? (Math.random() > 0.5 ? 2 : 1) : 2;
  const monster = { ...mList[Math.min(tier - 1, mList.length - 1)], tier };
  addLog(`⚔ A ${monster.name} blocks your path!`, 'danger');
  launchDuel(monster.archKey, player.hp, 'monster');
}
```

}, [tiles, moves, magesDefeated, player.hp, addLog]); // eslint-disable-line react-hooks/exhaustive-deps

const handleTileClick = useCallback((tile) => {
if (!tile.revealed || tile.terrain === TERRAIN.WATER) return;
if (tile.x === pos.x && tile.y === pos.y) return;
const path = findPath(tiles, pos.x, pos.y, tile.x, tile.y);
if (!path || !path.length) { addLog('No path to that location.', 'warn'); return; }
doMove(path[0].x, path[0].y);
}, [tiles, pos, doMove, addLog]);

// ─────────────────────────────────────────────────────────────────────────
// MANA LINK ALERT HANDLERS
// ─────────────────────────────────────────────────────────────────────────

const handleRespondAlert = useCallback((ev) => {
// Rush toward the threatened town (path to it)
const path = findPath(tiles, pos.x, pos.y, ev.tx, ev.ty);
if (path?.length) doMove(path[0].x, path[0].y);
// Dismiss the event - player is now en route
setMlEvents(prev => prev.filter(e => e.id !== ev.id));
addLog(`Rushing to ${ev.townName}!`, 'info');
// Defending a town before the minion arrives counts as a town saved
setTownsSaved(t => t + 1);
}, [tiles, pos, doMove, addLog]);

const handleDismissAlert = useCallback((ev) => {
setMlEvents(prev => prev.filter(e => e.id !== ev.id));
addLog(`Ignoring ${MAGE_NAMES[ev.color]}'s minion. Risk accepted.`, 'warn');
}, [addLog]);

// ─────────────────────────────────────────────────────────────────────────
// DUEL BRIDGE
// ─────────────────────────────────────────────────────────────────────────

const launchDuel = useCallback((oppArchKey, overworldHP, context, castleMod = null, extraData = {}) => {
setDuelCfg({
pDeckIds: deck.map(c => c.id).filter(Boolean),
oppArchKey,
ruleset,
overworldHP,
castleMod,
anteEnabled,
context,
...extraData,
});
}, [deck, ruleset, anteEnabled]);

const handleDuelEnd = useCallback((outcome, duelState) => {
const won      = outcome === 'win';
const finalHP  = duelState?.p?.life ?? 1;
const ctx      = duelCfg?.context;

```
// ── Ante resolution ────────────────────────────────────────────────────
if (anteEnabled && duelState?.anteP && duelState?.anteO) {
  if (won) {
    setBinder(b => [...b, { ...duelState.anteO, iid: mkId() }]);
    addLog(`Ante claimed: ${duelState.anteO.name}!`, 'success');
  } else {
    const lost = duelState.anteP.id;
    setDeck(d => { const i = d.findIndex(x => x.id === lost); return d.filter((_, idx) => idx !== i); });
    addLog(`Ante lost: ${duelState.anteP.name}.`, 'danger');
  }
}

// ── Monster encounter ──────────────────────────────────────────────────
if (ctx === 'monster') {
  setPlayer(p => ({ ...p, hp: Math.max(1, finalHP) }));
  if (won) {
    const gold = 5 + Math.floor(Math.random() * 15);
    setPlayer(p => ({ ...p, gold: p.gold + gold }));
    const arch = ARCHETYPES[duelCfg.oppArchKey];
    const pool = CARD_DB.filter(c => c.color === arch?.color && !isLand(c));
    if (pool.length) {
      const reward = { ...pool[Math.floor(Math.random() * pool.length)], iid: mkId() };
      setBinder(b => [...b, reward]);
      addLog(`Victory! +${gold}g and ${reward.name}.`, 'success');
    } else {
      addLog(`Victory! +${gold}g.`, 'success');
    }
  } else {
    addLog(`Defeated. HP dropped to ${Math.max(1, finalHP)}.`, 'danger');
  }
}

// ── Castle / mage encounter ────────────────────────────────────────────
if (ctx === 'castle') {
  const col = duelCfg.castleColor;
  setPlayer(p => ({ ...p, hp: Math.max(1, finalHP) }));
  if (won && col) {
    setMagesDefeated(prev => [...prev, col]);
    // Mark tile as defeated
    setTiles(prev => {
      const n = prev.map(r => [...r]);
      n.forEach(row => row.forEach((t, xi) => {
        if (t.structure === 'CASTLE' && t.castleData?.color === col) {
          n[t.y][xi] = { ...t, castleData: { ...t.castleData, defeated: true } };
        }
      }));
      return n;
    });
    // Grant artifact
    const artId = ART_REWARD[col];
    setArtifacts(prev => prev.map(a => a.id === artId ? { ...a, owned: true } : a));
    const artName = OW_ARTS.find(a => a.id === artId)?.name;
    addLog(`✦ ${MAGE_NAMES[col]} is defeated! Artifact gained: ${artName}.`, 'success');
    // Amulet of Life: max HP +5
    if (artId === 'amulet') setPlayer(p => ({ ...p, maxHP: p.maxHP + 5, hp: Math.min(p.hp + 5, p.maxHP + 5) }));
  } else if (!won) {
    addLog(`Driven back from the castle. HP: ${Math.max(1, finalHP)}.`, 'danger');
  }
}

// ── Dungeon room ───────────────────────────────────────────────────────
if (ctx === 'dungeon') {
  setPlayer(p => ({ ...p, hp: Math.max(1, finalHP) }));
  if (won) {
    const prog = dungeonProg;
    const nextRoom = prog.room + 1;
    if (nextRoom < prog.totalRooms) {
      // More rooms remain - relaunch immediately
      const newProg = { ...prog, room: nextRoom };
      setDungeonProg(newProg);
      const nextArch = DUNGEON_ARCHETYPES[Math.floor(Math.random() * DUNGEON_ARCHETYPES.length)];
      addLog(`Room ${nextRoom + 1} of ${prog.totalRooms}. Descending further...`, 'event');
      setDuelCfg({
        pDeckIds: deck.map(c => c.id).filter(Boolean),
        oppArchKey: nextArch,
        ruleset,
        overworldHP: Math.max(1, finalHP),
        castleMod: prog.mod,
        anteEnabled: false,
        context: 'dungeon',
      });
      return; // skip clearing duelCfg
    } else {
      // Final room cleared - grant loot
      setDungeonsCleared(dc => dc + 1);
      const gold = 20 + Math.floor(Math.random() * 40);
      setPlayer(p => ({ ...p, gold: p.gold + gold }));
      const pool = CARD_DB.filter(c => c.rarity === 'R' && !isLand(c));
      const gems = 1 + Math.floor(Math.random() * 2);
      setPlayer(p => ({ ...p, gems: p.gems + gems }));
      if (pool.length) {
        const reward = { ...pool[Math.floor(Math.random() * pool.length)], iid: mkId() };
        setBinder(b => [...b, reward]);
        addLog(`Dungeon cleared! +${gold}g, +${gems}◆, and ${reward.name}.`, 'success');
      } else {
        addLog(`Dungeon cleared! +${gold}g, +${gems}◆.`, 'success');
      }
      setDungeonProg(null);
    }
  } else {
    // Lost in dungeon - clear progress, HP already depleted
    addLog(`Fled the dungeon. Progress lost.`, 'danger');
    setDungeonProg(null);
  }
}

// ── Arzakon ────────────────────────────────────────────────────────────
if (ctx === 'arzakon') {
  if (won) {
    setArzakonDefeated(true);
    addLog('⚡ Arzakon is defeated! Shandalar is free!', 'success');
    // Hand off to score screen
    onScore({
      name, color,
      magesDefeated: [...magesDefeated, ...(!magesDefeated.includes('arz') ? [] : [])],
      dungeonsCleared,
      townsSaved,
      manaLinksTotal,
      deckSize: deck.length,
      binderSize: binder.length,
      arzakonDefeated: true,
      won: true,
    });
    return;
  } else {
    setPlayer(p => ({ ...p, hp: Math.max(1, finalHP) }));
    addLog('Arzakon repels your challenge. Regroup and return.', 'danger');
  }
}

// Clear duel state
setDuelCfg(null);
```

}, [duelCfg, dungeonProg, anteEnabled, magesDefeated, dungeonsCleared, townsSaved, manaLinksTotal, deck, binder, ruleset, name, color, addLog, onScore]); // eslint-disable-line react-hooks/exhaustive-deps

// ─────────────────────────────────────────────────────────────────────────
// ARZAKON LAUNCH
// ─────────────────────────────────────────────────────────────────────────

const launchArzakon = useCallback(() => {
addLog('⚡ Arzakon manifests! The final battle begins!', 'danger');
setDuelCfg({
pDeckIds: deck.map(c => c.id).filter(Boolean),
oppArchKey: 'FIVE_COLOR_BOMB',
ruleset,
overworldHP: ruleset.startingLife, // Full HP reset for Arzakon
castleMod: { name: 'Dominion', desc: 'Arzakon commands all five colors. The final battle for Shandalar begins.' },
anteEnabled: false,
context: 'arzakon',
});
}, [deck, ruleset, addLog]);

// ─────────────────────────────────────────────────────────────────────────
// TOWN ACTIONS
// ─────────────────────────────────────────────────────────────────────────

const handleBuy = useCallback((card, price) => {
if (player.gold < price) { addLog('Not enough gold.', 'warn'); return; }
setPlayer(p => ({ ...p, gold: p.gold - price }));
setBinder(b => [...b, { ...card, iid: mkId() }]);
addLog(`Purchased ${card.name} for ${price}g. Added to binder.`, 'success');
}, [player.gold, addLog]);

const handleSell = useCallback((card, price) => {
setBinder(b => b.filter(c => c.iid !== card.iid));
setPlayer(p => ({ ...p, gold: p.gold + price }));
addLog(`Sold ${card.name} for ${price}g.`, 'success');
}, [addLog]);

const handleRest = useCallback((cost) => {
if (player.gold < cost) { addLog('Not enough gold for the inn.', 'warn'); return; }
setPlayer(p => ({ ...p, hp: p.maxHP, gold: p.gold - cost }));
addLog(`Rested at the inn - full HP restored. -${cost}g.`, 'success');
}, [player.gold, addLog]);

const handleSage = useCallback(() => {
if (player.gold < 25) { addLog('Need 25g for the sage.', 'warn'); return; }
// Scrying Stone: free first reveal per town visit
const cost = hasStone ? 0 : 25;
if (cost > 0) setPlayer(p => ({ ...p, gold: p.gold - cost }));
const dgs = [];
tiles.forEach(row => row.forEach(t => { if (t.structure === 'DUNGEON' && !t.revealed) dgs.push(t); }));
if (dgs.length) {
const d = dgs[Math.floor(Math.random() * dgs.length)];
setTiles(prev => {
const n = prev.map(r => [...r]);
n[d.y][d.x] = { ...n[d.y][d.x], revealed: true };
return n;
});
const costStr = cost === 0 ? '(free - Scrying Stone)' : `-${cost}g`;
addLog(`The sage reveals ${d.dungeonData.name}. ${costStr}`, 'success');
} else {
addLog('No unknown dungeons remain to reveal.', 'info');
}
}, [player.gold, tiles, hasStone, addLog]);

const handleTrade = useCallback((rarity) => {
if (rarity === 'C') {
const commons = binder.filter(c => c.rarity === 'C');
if (commons.length < 3) { addLog('Need 3 commons to trade.', 'warn'); return; }
const rm = commons.slice(0, 3);
const pool = CARD_DB.filter(c => c.rarity === 'U' && !isLand(c));
if (!pool.length) return;
const reward = { ...pool[Math.floor(Math.random() * pool.length)], iid: mkId() };
setBinder(b => [...b.filter(c => !rm.find(r => r.iid === c.iid)), reward]);
addLog(`Traded 3 commons → ${reward.name}.`, 'success');
} else if (rarity === 'U') {
const uncs = binder.filter(c => c.rarity === 'U');
if (uncs.length < 5) { addLog('Need 5 uncommons to trade.', 'warn'); return; }
const rm = uncs.slice(0, 5);
const pool = CARD_DB.filter(c => c.rarity === 'R' && !isLand(c));
if (!pool.length) return;
const reward = { ...pool[Math.floor(Math.random() * pool.length)], iid: mkId() };
setBinder(b => [...b.filter(c => !rm.find(r => r.iid === c.iid)), reward]);
addLog(`Traded 5 uncommons → ${reward.name}.`, 'success');
}
}, [binder, addLog]);

const handleGemBuy = useCallback((type) => {
if (type === 'rare') {
if (player.gems < 3) { addLog('Need 3◆ for a rare.', 'warn'); return; }
const pool = CARD_DB.filter(c => c.rarity === 'R' && !isLand(c));
if (!pool.length) return;
const r = { ...pool[Math.floor(Math.random() * pool.length)], iid: mkId() };
setBinder(b => [...b, r]);
setPlayer(p => ({ ...p, gems: p.gems - 3 }));
addLog(`Gem merchant: received ${r.name}. -3◆`, 'success');
} else if (type === 'hp') {
if (player.gems < 5) { addLog('Need 5◆ for max HP upgrade.', 'warn'); return; }
setPlayer(p => ({ ...p, maxHP: p.maxHP + 5, hp: p.hp + 5, gems: p.gems - 5 }));
addLog('Max HP +5. -5◆', 'success');
} else if (type === 'heal') {
if (player.gems < 2) { addLog('Need 2◆ for a full heal.', 'warn'); return; }
setPlayer(p => ({ ...p, hp: p.maxHP, gems: p.gems - 2 }));
addLog('Fully healed. -2◆', 'success');
}
}, [player.gems, addLog]);

// ─────────────────────────────────────────────────────────────────────────
// DUNGEON ENTER
// ─────────────────────────────────────────────────────────────────────────

const handleEnterDungeon = useCallback(() => {
const dg = activeTile?.dungeonData;
if (!dg) return;
addLog(`You descend into ${dg.name}. Modifier: ${dg.mod.name}.`, 'event');
const prog = { tile: activeTile, room: 0, totalRooms: dg.rooms, mod: dg.mod, entryHP: player.hp };
setDungeonProg(prog);
setModal(null);
const arch = DUNGEON_ARCHETYPES[Math.floor(Math.random() * DUNGEON_ARCHETYPES.length)];
launchDuel(arch, player.hp, 'dungeon', dg.mod);
}, [activeTile, player.hp, launchDuel, addLog]);

// ─────────────────────────────────────────────────────────────────────────
// CASTLE CHALLENGE
// ─────────────────────────────────────────────────────────────────────────

const handleChallenge = useCallback(() => {
const col = activeTile?.castleData?.color;
if (!col || activeTile.castleData.defeated) return;
const mod = CASTLE_MODIFIERS[col];
addLog(`⚔ You challenge ${MAGE_NAMES[col]}! Castle modifier: ${mod.name}.`, 'event');
setModal(null);
launchDuel(MAGE_ARCHS[col], player.hp, 'castle', mod, { castleColor: col });
}, [activeTile, player.hp, launchDuel, addLog]);

// ─────────────────────────────────────────────────────────────────────────
// DECK MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────

const handleSwap = useCallback((deckCard, binderCard) => {
setDeck(d => d.map(c => c.iid === deckCard.iid ? { ...binderCard, iid: deckCard.iid } : c));
setBinder(b => b.map(c => c.iid === binderCard.iid ? { ...deckCard, iid: binderCard.iid } : c));
addLog(`Swapped ${deckCard.name} ↔ ${binderCard.name}.`, 'info');
}, [addLog]);

const handleMoveToDeck = useCallback((card) => {
setBinder(b => b.filter(c => c.iid !== card.iid));
setDeck(d => [...d, { ...card, iid: card.iid || mkId() }]);
addLog(`Added ${card.name} to deck.`, 'info');
}, [addLog]);

const handleMoveToBinder = useCallback((card) => {
setDeck(d => d.filter(c => c.iid !== card.iid));
setBinder(b => [...b, { ...card, iid: card.iid || mkId() }]);
addLog(`Moved ${card.name} to binder.`, 'info');
}, [addLog]);

// ─────────────────────────────────────────────────────────────────────────
// VIEWPORT
// ─────────────────────────────────────────────────────────────────────────

const handleScroll = useCallback((dir) => {
setViewOfs(v => ({
x: Math.max(0, Math.min(32 - 1, v.x + (dir === 'left' ? -3 : dir === 'right' ? 3 : 0))),
y: Math.max(0, Math.min(22 - 1, v.y + (dir === 'up' ? -3 : dir === 'down' ? 3 : 0))),
}));
}, []);

const handleCenterPlayer = useCallback(() => setViewOfs({ x: pos.x, y: pos.y }), [pos]);

// ─────────────────────────────────────────────────────────────────────────
// GAME-LOSS side-effect
// ─────────────────────────────────────────────────────────────────────────
useEffect(() => {
if (gameLost && !duelCfg) {
// Brief delay then hand to score
const t = setTimeout(() => {
onScore({
name, color, magesDefeated, dungeonsCleared,
townsSaved, manaLinksTotal,
deckSize: deck.length, binderSize: binder.length,
arzakonDefeated: false, won: false,
});
}, 2000);
return () => clearTimeout(t);
}
}, [gameLost]); // eslint-disable-line react-hooks/exhaustive-deps

// ─────────────────────────────────────────────────────────────────────────
// RENDER - DUEL BRIDGE
// ─────────────────────────────────────────────────────────────────────────
if (duelCfg) {
return (
<DuelScreen
key={JSON.stringify({ ...duelCfg, _ts: Date.now() })}
config={duelCfg}
onDuelEnd={handleDuelEnd}
/>
);
}

// ─────────────────────────────────────────────────────────────────────────
// RENDER - OVERWORLD
// ─────────────────────────────────────────────────────────────────────────
return (
<div style={{
height: '100vh', width: '100vw',
background: '#0a0e08',
display: 'flex', flexDirection: 'column',
overflow: 'hidden',
fontFamily: "'Crimson Text', serif",
}}>

```
  {/* ── GAME-LOSS OVERLAY ─────────────────────────────────────────────── */}
  {gameLost && (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.9)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 600,
      flexDirection: 'column', gap: 12,
    }}>
      <div style={{ fontSize: 40 }}>💀</div>
      <div style={{ fontSize: 24, fontFamily: "'Cinzel',serif", color: '#e04040' }}>The Plane Falls</div>
      <div style={{ fontSize: 12, color: '#a06040', fontStyle: 'italic' }}>
        Arzakon's mana links have consumed Shandalar...
      </div>
    </div>
  )}

  {/* ── ARZAKON READY OVERLAY ─────────────────────────────────────────── */}
  {arzakonReady && (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500,
      flexDirection: 'column', gap: 16,
    }}>
      <div style={{ fontSize: 36 }}>⚡</div>
      <div style={{ fontSize: 22, fontFamily: "'Cinzel',serif", color: '#e0c040' }}>
        All Five Mages Defeated!
      </div>
      <div style={{ fontSize: 13, color: '#c0a060', fontStyle: 'italic', textAlign: 'center', maxWidth: 360 }}>
        Arzakon himself rises to defend the conquered plane. The final battle awaits.
      </div>
      <button
        onClick={launchArzakon}
        style={{
          background: 'linear-gradient(135deg,#2a0808,#5a1010)',
          border: '2px solid rgba(200,60,40,.6)',
          color: '#ff8060', padding: '14px 32px', borderRadius: 6,
          cursor: 'pointer', fontSize: 16, fontFamily: "'Cinzel',serif", letterSpacing: 2,
          boxShadow: '0 0 20px rgba(200,40,20,.4)',
        }}
      >
        ⚡ Face Arzakon
      </button>
      <button
        onClick={() => {/* dismiss to keep playing */}}
        style={{
          background: 'transparent', border: '1px solid rgba(160,120,60,.3)',
          color: '#806040', padding: '8px 20px', borderRadius: 5,
          cursor: 'pointer', fontSize: 12, fontFamily: "'Cinzel',serif",
        }}
      >
        Prepare further...
      </button>
    </div>
  )}

  {/* ── TOP BAR ───────────────────────────────────────────────────────── */}
  <div style={{
    flexShrink: 0,
    padding: '6px 12px',
    borderBottom: '2px solid rgba(200,160,40,.3)',
    background: 'rgba(0,0,0,.7)',
    display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
  }}>
    <span style={{ fontSize: 13, fontFamily: "'Cinzel Decorative',serif", color: '#d0a030', letterSpacing: 2 }}>
      SHANDALAR
    </span>

    {/* Ruleset selector */}
    <select
      value={ruleset.id}
      onChange={e => setRuleset(RULESETS[e.target.value])}
      style={{
        background: '#1a1208', border: '1px solid rgba(200,160,60,.3)',
        color: '#c0a040', borderRadius: 4, padding: '2px 6px', fontSize: 10,
        fontFamily: "'Cinzel',serif", cursor: 'pointer',
      }}
    >
      {Object.values(RULESETS).map(r => (
        <option key={r.id} value={r.id}>{r.name}</option>
      ))}
    </select>

    {/* Ante toggle */}
    <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
      <input
        type="checkbox"
        checked={anteEnabled}
        onChange={e => setAnteEnabled(e.target.checked)}
        style={{ accentColor: '#c0a040' }}
      />
      <span style={{ fontSize: 10, color: '#c0a040', fontFamily: "'Cinzel',serif" }}>Ante</span>
    </label>

    {/* Viewport controls */}
    {['up','left','down','right'].map(d => (
      <button key={d} onClick={() => handleScroll(d)}
        style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(200,160,60,.2)', color: '#c0a040', width: 22, height: 22, borderRadius: 3, cursor: 'pointer', fontSize: 11 }}>
        {d === 'up' ? '↑' : d === 'down' ? '↓' : d === 'left' ? '←' : '→'}
      </button>
    ))}
    <button onClick={handleCenterPlayer}
      style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(200,160,60,.2)', color: '#c0a040', padding: '2px 8px', borderRadius: 3, cursor: 'pointer', fontSize: 10, fontFamily: "'Cinzel',serif" }}>
      ⊙ Center
    </button>
    <button onClick={() => setZoom(z => z === 1 ? 0.8 : 1)}
      style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(200,160,60,.2)', color: '#c0a040', padding: '2px 8px', borderRadius: 3, cursor: 'pointer', fontSize: 10, fontFamily: "'Cinzel',serif" }}>
      {zoom === 1 ? '🔍 Zoom Out' : '🔍 Zoom In'}
    </button>

    {/* Deck button */}
    <button onClick={() => setModal('deck')}
      style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(200,160,60,.3)', color: '#f0c040', padding: '3px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 10, fontFamily: "'Cinzel',serif" }}>
      📖 Deck ({deck.length})
    </button>

    {/* Quit */}
    <button onClick={onQuit}
      style={{ marginLeft: 'auto', background: 'transparent', border: '1px solid rgba(180,80,40,.3)', color: '#a06040', padding: '3px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 10, fontFamily: "'Cinzel',serif" }}>
      ✕ Quit
    </button>
  </div>

  {/* ── HUD BAR ───────────────────────────────────────────────────────── */}
  <HUDBar
    player={player}
    manaLinks={manaLinks}
    magesDefeated={magesDefeated}
    artifacts={artifacts}
    moves={moves}
  />

  {/* ── MAIN CONTENT ──────────────────────────────────────────────────── */}
  <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

    {/* ── MAP ─────────────────────────────────────────────────────────── */}
    <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
      <WorldMap
        tiles={tiles}
        pos={pos}
        viewOfs={viewOfs}
        zoom={zoom}
        onTileClick={handleTileClick}
      />
      <MapLegend />
      <MageStatusPanel
        manaLinks={manaLinks}
        magesDefeated={magesDefeated}
        artifacts={artifacts}
      />
      <ManaLinkAlert
        events={mlEvents}
        onRespond={handleRespondAlert}
        onDismiss={handleDismissAlert}
      />
    </div>

    {/* ── RIGHT SIDEBAR ────────────────────────────────────────────────── */}
    <div style={{
      width: 'clamp(160px,22vw,210px)',
      borderLeft: '2px solid rgba(180,140,60,.25)',
      display: 'flex', flexDirection: 'column',
      background: 'linear-gradient(180deg,#0e0c08,#0a0a08)',
      flexShrink: 0, overflow: 'hidden',
    }}>
      {/* Current tile info */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(200,160,60,.15)', flexShrink: 0 }}>
        <div style={{ fontSize: 10, color: '#8a6030', fontFamily: "'Cinzel',serif", marginBottom: 4, letterSpacing: 1 }}>
          CURRENT TILE
        </div>
        {(() => {
          const t = tiles[pos.y]?.[pos.x];
          if (!t) return null;
          return (
            <div>
              <div style={{ fontSize: 13, color: '#c0a060', fontFamily: "'Cinzel',serif" }}>
                {t.structure === 'TOWN'   ? t.townData?.name :
                 t.structure === 'CASTLE' ? `${t.castleData?.mage}'s stronghold` :
                 t.structure === 'DUNGEON'? t.dungeonData?.name :
                 t.terrain.label}
              </div>
              <div style={{ fontSize: 10, color: '#6a5020', marginTop: 3 }}>
                Move cost: {Math.max(1, hasBoots ? t.terrain.moveC - 1 : t.terrain.moveC)}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Deck preview */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(200,160,60,.15)', flexShrink: 0 }}>
        <div style={{ fontSize: 10, color: '#8a6030', fontFamily: "'Cinzel',serif", marginBottom: 5, letterSpacing: 1 }}>
          DECK ({deck.length})
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 6 }}>
          {deck.slice(0, 10).map((c, i) => (
            <div key={i} style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 3, padding: '2px 5px', fontSize: 8, color: '#a09060' }} title={c.name}>
              {c.name.slice(0, 10)}
            </div>
          ))}
          {deck.length > 10 && <div style={{ fontSize: 8, color: '#6a5020' }}>+{deck.length - 10}...</div>}
        </div>
        <div style={{ fontSize: 10, color: '#8a6030', fontFamily: "'Cinzel',serif", marginBottom: 4 }}>
          BINDER ({binder.length})
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
          {binder.slice(-8).map((c, i) => (
            <div key={i} style={{ width: 9, height: 13, borderRadius: 1, background: '#888', opacity: 0.7 }} title={c.name} />
          ))}
          {binder.length > 8 && <div style={{ fontSize: 8, color: '#6a5020' }}>+{binder.length - 8}</div>}
        </div>
      </div>

      {/* Chronicle log */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '6px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 12px 6px' }}>
          <div style={{ fontSize: 10, color: '#8a6030', fontFamily: "'Cinzel',serif", letterSpacing: 1 }}>CHRONICLE</div>
          <button
            onClick={() => {
              const text = log.map(e => e.text).join('\n');
              navigator.clipboard.writeText(text).catch(() => addLog('Clipboard unavailable.', 'warn'));
            }}
            style={{ background: 'transparent', border: '1px solid rgba(150,120,60,.3)', color: '#806040', padding: '2px 7px', borderRadius: 3, cursor: 'pointer', fontSize: 9, fontFamily: "'Cinzel',serif" }}
            title="Copy chronicle to clipboard"
          >
            📋
          </button>
        </div>
        <OWLog log={log} />
      </div>
    </div>
  </div>

  {/* ── MODALS ────────────────────────────────────────────────────────── */}

  {modal === 'town' && activeTile?.townData && (
    <TownModal
      town={activeTile.townData}
      player={player}
      binder={binder}
      onClose={() => setModal(null)}
      onBuy={handleBuy}
      onSell={handleSell}
      onRest={handleRest}
      onSage={handleSage}
      onTrade={handleTrade}
      onGemBuy={handleGemBuy}
    />
  )}

  {modal === 'dungeon' && activeTile?.dungeonData && (
    <DungeonModal
      dungeon={activeTile.dungeonData}
      onClose={() => setModal(null)}
      onEnter={handleEnterDungeon}
    />
  )}

  {modal === 'castle' && activeTile?.castleData && (
    <CastleModal
      castleData={activeTile.castleData}
      onClose={() => setModal(null)}
      onChallenge={handleChallenge}
    />
  )}

  {modal === 'deck' && (
    <DeckManager
      deck={deck}
      binder={binder}
      onClose={() => setModal(null)}
      onSwap={handleSwap}
      onMoveToDeck={handleMoveToDeck}
      onMoveToBinder={handleMoveToBinder}
    />
  )}
</div>
```

);
}