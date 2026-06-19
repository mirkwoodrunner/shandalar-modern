// src/hooks/useOverworldController.js
// Shared orchestration hook for both overworld layouts.
// Extracted from OverworldGame.jsx. All state, callbacks, effects, and
// viewport computation live here. Layout components receive the ctrl object.

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';

import {
  generateMap, findPath, revealAround,
  TERRAIN, COLORS, MAGE_NAMES, MAGE_TITLES, MAGE_ARCHS, CASTLE_MODIFIERS,
  MANA_SYM, DUNGEON_ARCHETYPES, pickMonster, HENCHMAN_TABLE, MAP_W, MAP_H,
  WORLD_MAGICS,
} from '../engine/MapGenerator.js';
import { isLand } from '../engine/DuelCore.js';
import { ARCHETYPES, CARD_DB } from '../data/cards.js';
import DIFFICULTIES, { generateStartingDeck } from '../data/difficulties.js';
import RULESETS from '../data/rulesets.js';
import { tickEnemyAI, GRACE_MOVE_THRESHOLD } from '../engine/EnemyAI.js';
import { drawCharacters } from '../ui/overworld/OverworldCanvas.js';
import { spriteForMonster } from '../ui/overworld/Sprite.jsx';
import { generateDungeon, checkLOS } from '../engine/DungeonGenerator.js';

// ---------------------------------------------------------------------------
// Module-level constants (shared by hook and layout components via import)
// ---------------------------------------------------------------------------

const mkId = () => Math.random().toString(36).slice(2, 9);

const QUESTS = [
  {
    id: 'q_duel3',
    title: 'Trial by Combat',
    desc: 'Win 3 duels anywhere in Shandalar.',
    reward: { type: 'gold', amount: 50 },
    condition: { type: 'duel_wins', target: 3 },
  },
  {
    id: 'q_dungeon1',
    title: 'Into the Dark',
    desc: 'Clear a dungeon (defeat all enemies and reach the exit).',
    reward: { type: 'gold', amount: 75 },
    condition: { type: 'dungeons_cleared', target: 1 },
  },
  {
    id: 'q_explore5',
    title: 'Chart the Wilds',
    desc: 'Reveal 5 new tiles by exploring.',
    reward: { type: 'gold', amount: 40 },
    condition: { type: 'tiles_revealed', target: 5 },
  },
  {
    id: 'q_monster5',
    title: 'Purge the Risen',
    desc: 'Defeat 5 monsters in the wilds.',
    reward: { type: 'card', cardId: 'swords_to_plowshares' },
    condition: { type: 'monster_wins', target: 5 },
  },
  {
    id: 'q_mage1',
    title: 'Prove Your Power',
    desc: 'Defeat a mage in their castle.',
    reward: { type: 'card', cardId: 'wrath_of_god' },
    condition: { type: 'mages_defeated', target: 1 },
  },
];

export const VIEW_W = 22;
export const VIEW_H = 14;

const VIEW_W_MOBILE = 14;
const VIEW_H_MOBILE = 16;

const ART_REWARD = { W: 'ward', U: 'stone', B: 'amulet', R: 'focus', G: 'boots' };

export const OW_ARTS = [
  { id: 'boots',  name: 'Magical Boots',  icon: '\u{1F462}', desc: 'Movement cost -1 per tile (min 1).',      owned: false },
  { id: 'amulet', name: 'Amulet of Life', icon: '\u{1F4FF}', desc: 'Maximum HP +5.',                           owned: false },
  { id: 'focus',  name: "Mage's Focus",   icon: '\u{1F52E}', desc: 'Draw 1 extra card at duel start.',         owned: false },
  { id: 'ward',   name: "Arzakon's Ward", icon: '\u{1F6E1}',  desc: 'Mana link threshold raised to 5.',         owned: false },
  { id: 'stone',  name: 'Scrying Stone',  icon: '\u{1F52D}', desc: 'Free dungeon reveal per town visit.',      owned: false },
];

const START_DECKS = {
  W: { hp: 22, maxHP: 22, gold: 40,  deckIds: ['savannah_lions','white_knight','serra_angel','swords','healing_salve','wog', ...Array(9).fill('plains')] },
  U: { hp: 18, maxHP: 18, gold: 50,  deckIds: ['counterspell','merfolk_pearl','air_elemental','ancestral','unsummon','braingeyser', ...Array(9).fill('island')] },
  B: { hp: 18, maxHP: 18, gold: 35,  deckIds: ['dark_ritual','hypnotic_specter','sengir_vampire','terror','demonic_tutor','mind_twist', ...Array(9).fill('swamp')] },
  R: { hp: 20, maxHP: 20, gold: 40,  deckIds: ['lightning_bolt','chain_lightning','fireball','goblin_king','shivan_dragon','lava_axe', ...Array(9).fill('mountain')] },
  G: { hp: 22, maxHP: 22, gold: 30,  deckIds: ['llanowar_elves','fyndhorn_elves','craw_wurm','force_of_nature','giant_growth','stream_of_life', ...Array(9).fill('forest')] },
};

const STRATEGY_FLAVORS = {
  aggro: 'Favors swift and overwhelming force.',
  control: 'Patient and precise, seeks advantage.',
  combo: 'Assembles arcane power for a devastating strike.',
  bomb: 'Commands overwhelming magical force.',
};

const MINION_NAMES = {
  W: ['Holy Crusader', "Serra's Knight"],
  U: ['Tidal Phantom', "Xylos's Agent"],
  B: ['Skeletal Minion', "Mortis's Shade"],
  R: ['Goblin Horde', "Karag's Raider"],
  G: ['Vine Elemental', "Sylvara's Chosen"],
};

const MAGE_ARCHKEY = {
  W: 'WHITE_WEENIE',
  U: 'BLUE_CONTROL',
  B: 'BLACK_REANIMATOR',
  R: 'RED_BURN',
  G: 'GREEN_STOMPY',
};

function spawnInitialEnemies(tiles, mapW, mapH) {
  const candidates = [];
  tiles.forEach(row => row.forEach(t => {
    if (t.terrain === TERRAIN.WATER) return;
    if (t.structure) return;
    candidates.push(t);
  }));

  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  const count = Math.min(40, Math.floor(candidates.length * 0.06));
  const spawns = candidates.slice(0, count);

  return spawns.map(t => {
    const cx = Math.floor(mapW / 2), cy = Math.floor(mapH / 2);
    const dist = Math.abs(t.x - cx) + Math.abs(t.y - cy);
    const tier = dist < 10 ? 1 : dist < 20 ? (Math.random() > 0.5 ? 2 : 1) : Math.min(3, 2 + (Math.random() > 0.7 ? 1 : 0));
    // Monster archetype is decoupled from terrain (variety); tier still scales by distance.
    const monster = pickMonster(tier, Math.random);
    const { kind: spriteKind, color: spriteColor } = spriteForMonster(monster.archKey, t.terrain.id);
    return {
      id: mkId(),
      x: t.x,
      y: t.y,
      tier,
      archKey: monster.archKey,
      name: monster.name,
      hp: monster.hp,
      terrain: t.terrain.id,
      spriteKind,
      spriteColor,
      animFrame: 0,
      dir: 'down',
    };
  });
}

function buildDeck(deckIds) {
  return deckIds.map(id => {
    const found = CARD_DB.find(c => c.id === id);
    if (!found) {
      console.error(`[OverworldGame] Missing card in CARD_DB: "${id}"`);
      return null;
    }
    return { ...found, iid: mkId() };
  }).filter(Boolean);
}

// ---------------------------------------------------------------------------
// HOOK
// ---------------------------------------------------------------------------

export function useOverworldController({ startConfig, onQuit, onScore, isCompactMobile }) {
  const { color, name, seed, difficulty: difficultyId = 'APPRENTICE' } = startConfig;
  const difficulty = DIFFICULTIES[difficultyId] || DIFFICULTIES.APPRENTICE;
  const isSandbox = !!startConfig.sandbox;
  const useGemini = !!startConfig.useGemini;
  const startDef = START_DECKS[color];

  // -- Map ------------------------------------------------------------------
  const shopPool = useMemo(() => CARD_DB.filter(c => !isLand(c)), []);
  const { tiles: initTiles, startX, startY } = useMemo(() => {
    const result = generateMap(seed, shopPool);
    const questIds = QUESTS.map(q => q.id);
    result.tiles.forEach(row => row.forEach(t => {
      if (t.structure === 'TOWN' && t.townData) {
        const q = t.townData.quest;
        if (q && q.conditionType === 'delivery') {
          t.townData.hasGuildHall = true;
          t.townData.deliveryQuest = q;
          t.townData.questId = null;
        } else {
          t.townData.hasGuildHall = q !== null;
          t.townData.questId = t.townData.hasGuildHall
            ? questIds[Math.floor(Math.random() * questIds.length)]
            : null;
        }
        delete t.townData.quest;
        delete t.townData.questDone;
      }
    }));
    return result;
  }, [seed, shopPool]);

  const [tiles, setTiles] = useState(initTiles);
  const [pos, setPos]     = useState({ x: startX, y: startY });
  const [moves, setMoves] = useState(0);

  // -- Player ---------------------------------------------------------------
  const [player, setPlayer] = useState({
    name, color,
    hp: difficulty.startingLife, maxHP: difficulty.startingLife,
    gold: isSandbox ? 9999 : startDef.gold,
    gems: isSandbox ? 99 : 0,
    redAmulets: 0,
  });
  const [deck, setDeck]     = useState(() => {
    if (isSandbox) return [];
    const ids = generateStartingDeck(color, difficultyId, seed);
    return ids.map(id => {
      const def = CARD_DB.find(c => c.id === id);
      if (!def) return null;
      return { ...def, iid: mkId() };
    }).filter(Boolean);
  });
  const [binder, setBinder] = useState(() => {
    if (!isSandbox) return [];
    return CARD_DB.flatMap(card =>
      Array.from({ length: 4 }, () => ({ ...card, iid: mkId() }))
    );
  });
  const [artifacts, setArtifacts] = useState(() => {
    try {
      const stored = localStorage.getItem('shandalar_unlockables');
      if (stored) {
        const parsed = JSON.parse(stored);
        return OW_ARTS.map(art => ({ ...art, owned: parsed[art.id] ?? false }));
      }
    } catch (e) {
      console.error('[Shandalar] Failed to read shandalar_unlockables from localStorage:', e);
    }
    return [...OW_ARTS];
  });

  // -- World Magics ---------------------------------------------------------
  const [worldMagics, setWorldMagics] = useState([]);
  const [wmCooldowns, setWmCooldowns] = useState({});

  // -- World pressure -------------------------------------------------------
  const [manaLinks, setManaLinks]       = useState({ W:0, U:0, B:0, R:0, G:0 });
  const [magesDefeated, setMagesDefeated] = useState([]);
  const [mlEvents, setMlEvents]         = useState([]);

  // -- Run tracking ---------------------------------------------------------
  const [dungeonsCleared, setDungeonsCleared]   = useState(0);
  const [townsSaved, setTownsSaved]             = useState(0);
  const [manaLinksTotal, setManaLinksTotal]     = useState(0);
  const [arzakonDefeated, setArzakonDefeated]   = useState(false);

  // -- Quest system ---------------------------------------------------------
  const [activeQuest, setActiveQuest]     = useState(null);
  const [questProgress, setQuestProgress] = useState(0);
  const [questComplete, setQuestComplete] = useState(false);
  const [activeDelivery, setActiveDelivery] = useState(null);

  // -- Duel bridge ----------------------------------------------------------
  const [duelCfg, setDuelCfg]             = useState(null);
  const [duelScreenIsCompact, setDuelScreenIsCompact] = useState(false);
  const [dungeonProg, setDungeonProg]     = useState(null);
  const [encounterPopup, setEncounterPopup] = useState(null);
  const [postDuelChoice, setPostDuelChoice] = useState(null);

  // -- Dungeon map screen ---------------------------------------------------
  const [dungeonScreen, setDungeonScreen]       = useState(null);
  const [dungeonPlayerPos, setDungeonPlayerPos] = useState(null);
  const [treasureModal, setTreasureModal]       = useState(null);
  const pendingDungeonEntity = useRef(null);

  // -- Ruleset / ante -------------------------------------------------------
  const [ruleset, setRuleset]       = useState(RULESETS.CLASSIC);
  const [anteEnabled, setAnteEnabled] = useState(false);
  const [foodEnabled, setFoodEnabled] = useState(true);

  // -- UI -------------------------------------------------------------------
  const [modal, setModal]         = useState(null);
  const [activeTile, setActiveTile] = useState(null);
  const [log, setLog]             = useState(() => {
    const entries = [{ text: `${name} enters the plane of Shandalar.`, type: 'info' }];
    if (isSandbox) entries.push({ text: '\u{1F9EA} Sandbox mode: all cards available in binder.', type: 'info' });
    return entries;
  });

  // -- Viewport -------------------------------------------------------------
  const [viewOfs, setViewOfs] = useState({ x: startX, y: startY });

  const viewW = isCompactMobile ? VIEW_W_MOBILE : VIEW_W;
  const viewH = isCompactMobile ? VIEW_H_MOBILE : VIEW_H;

  // Compact mobile: topbar ~44px + tile-strip ~24px = 68px chrome
  const tileSize = useMemo(() => {
    if (!isCompactMobile) return 34;
    const availH = window.innerHeight - 68;
    const availW = window.innerWidth - 8;
    const byHeight = Math.floor(availH / viewH);
    const byWidth  = Math.floor(availW / viewW);
    return Math.max(16, Math.min(byHeight, byWidth));
  }, [isCompactMobile, viewH, viewW]);

  // -- Grace period ---------------------------------------------------------
  const graceMovesRef = useRef(0);
  // Stable per-duel key: incremented only at explicit duel launch.
  const duelKeyRef = useRef(0);

  // -- Canvas / animation ---------------------------------------------------
  const [enemies, setEnemies] = useState(() => spawnInitialEnemies(initTiles, MAP_W, MAP_H));
  const enemyTickRef  = useRef(0); // eslint-disable-line no-unused-vars
  const animFrameRef  = useRef(null);
  const playerAnimRef = useRef({ frame: 0, dir: 'down', moving: false });
  const canvasRef     = useRef(null);
  // Tap/click-move stops `moving` after a short timeout (mobile has no keyup).
  const tapMoveTimerRef = useRef(null);
  // Shared enemy idle-bob frame; advanced on a fixed timer in the rAF loop.
  const enemyFrameRef = useRef(0);
  // Last anim snapshot emitted to React, so we only re-render on visible change.
  const lastAnimRef   = useRef({ p: null, e: 0 });
  // React-visible mirror of the player/enemy animation refs (refs alone do not
  // trigger re-renders of the DOM <Sprite> elements in WorldMap).
  const [animState, setAnimState] = useState({
    player: playerAnimRef.current,
    enemyFrame: 0,
  });

  // -- Derived --------------------------------------------------------------
  const hasBoots       = artifacts.some(a => a.id === 'boots'  && a.owned);
  const hasWard        = artifacts.some(a => a.id === 'ward'   && a.owned);
  const hasFocus       = artifacts.some(a => a.id === 'focus'  && a.owned);
  const hasStone       = artifacts.some(a => a.id === 'stone'  && a.owned);
  const hasDwarvenPick = worldMagics.includes('dwarven_pick');
  const hasSwampwalk   = worldMagics.includes('amulet_of_swampwalk');
  const mlThreshold    = hasWard ? 5 : 3;
  const allMagesDown   = magesDefeated.length === 5;
  const gameWon        = allMagesDown && arzakonDefeated;
  const arzakonReady   = allMagesDown && !arzakonDefeated && !duelCfg;
  const gameLost       = COLORS.some(c => manaLinks[c] >= mlThreshold && !magesDefeated.includes(c));
  const conquestLost   = (() => {
    const flat = tiles.flat();
    const total = flat.filter(t => t.structure === 'TOWN').length;
    const conquered = flat.filter(t => t.townData?.conquered).length;
    return total > 0 && conquered >= Math.floor(total * 0.6);
  })();

  // -------------------------------------------------------------------------
  // UTILITIES
  // -------------------------------------------------------------------------

  const addLog = useCallback((text, type = 'info') => {
    setLog(prev => [...prev.slice(-80), { text, type }]);
  }, []);

  const checkQuestProgress = useCallback((eventType) => {
    if (!activeQuest || questComplete) return;
    const { condition } = activeQuest;
    if (condition.type !== eventType) return;
    setQuestProgress(prev => {
      const next = prev + 1;
      if (next >= condition.target) {
        setQuestComplete(true);
        addLog(`✦ Quest complete: ${activeQuest.title}! Visit a Guild Hall to claim your reward.`, 'success');
      }
      return next;
    });
  }, [activeQuest, questComplete, addLog]);

  // Load sandbox starting deck from public/sandbox-decklist.txt
  useEffect(() => {
    if (!isSandbox) return;
    fetch('/sandbox-decklist.txt')
      .then(r => r.text())
      .then(text => {
        const ids = [];
        for (const line of text.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const m = trimmed.match(/^(.+?)\s+x(\d+)$/i);
          if (!m) continue;
          const cardName = m[1].trim();
          const qty = parseInt(m[2], 10);
          const card = CARD_DB.find(c => c.name.toLowerCase() === cardName.toLowerCase());
          if (card) {
            for (let i = 0; i < qty; i++) ids.push(card.id);
          } else {
            console.error(`[Sandbox] Unknown card in sandbox-decklist.txt: "${cardName}"`);
          }
        }
        setDeck(buildDeck(ids));
      })
      .catch(err => console.error('[Sandbox] Failed to load sandbox-decklist.txt:', err));
  }, [isSandbox]);

  useEffect(() => {
    try {
      const toStore = {};
      for (const art of artifacts) {
        toStore[art.id] = art.owned;
      }
      localStorage.setItem('shandalar_unlockables', JSON.stringify(toStore));
    } catch (e) {
      console.error('[Shandalar] Failed to write shandalar_unlockables to localStorage:', e);
    }
  }, [artifacts]);

  // -------------------------------------------------------------------------
  // ENCOUNTER POPUP BUILDER
  // -------------------------------------------------------------------------

  const openEncounterPopup = useCallback((oppArchKey, overworldHP, context, castleMod = null, extraData = {}, monsterMeta = {}) => {
    const arch = ARCHETYPES[oppArchKey];

    let monsterName, monsterFlavor, monsterColor, canFlee, fleeCost;

    if (context === 'castle') {
      const col = extraData.castleColor;
      monsterName = MAGE_NAMES[col] || oppArchKey;
      monsterFlavor = MAGE_TITLES[col] || '';
      monsterColor = col;
      canFlee = false;
      fleeCost = 0;
    } else {
      monsterName = monsterMeta.monsterName || arch?.name || oppArchKey;
      monsterFlavor = STRATEGY_FLAVORS[arch?.strategy] || 'A dangerous adversary.';
      monsterColor = (arch?.color || '').slice(0, 1);
      canFlee = monsterMeta.canFlee !== undefined ? monsterMeta.canFlee : true;
      const tier = monsterMeta.tier || 1;
      fleeCost = Math.max(5, tier * 15 + Math.floor(Math.random() * 10));
    }

    let playerAnteCard = null;
    let opponentAnteCard = null;
    if (anteEnabled) {
      if (deck.length > 0) {
        playerAnteCard = deck[0];
      }
      const archColor = arch?.color || '';
      const colorKey = archColor.length === 1 ? archColor : '';
      const pool = CARD_DB.filter(c => !isLand(c) && c.color === colorKey);
      if (pool.length) {
        opponentAnteCard = { ...pool[Math.floor(Math.random() * pool.length)], iid: mkId() };
      }
    }

    const monsterTier = monsterMeta.tier || 1;
    const enemyDuelLife = context === 'monster'
      ? difficulty.tierLife[Math.min(monsterTier - 1, 2)]
      : (extraData.oppLife ?? null);

    setEncounterPopup({
      oppArchKey,
      overworldHP,
      context,
      castleMod,
      extraData: { ...extraData, ...(enemyDuelLife != null ? { oppLife: enemyDuelLife } : {}) },
      monsterName,
      monsterFlavor,
      monsterColor,
      playerAnteCard,
      opponentAnteCard,
      fleeCost,
      canFlee,
      tier: monsterMeta.tier || null,
    });
  }, [deck, anteEnabled, difficulty]);

  // -------------------------------------------------------------------------
  // DELIVERY COMPLETION
  // -------------------------------------------------------------------------

  const completeDelivery = useCallback(() => {
    const q = activeDelivery;
    if (!q) return;

    if (q.rewardType === 'manalink') {
      const aliveColors = COLORS.filter(c => !magesDefeated.includes(c));
      if (aliveColors.length) {
        const col = aliveColors[Math.floor(Math.random() * aliveColors.length)];
        setManaLinks(prev => ({ ...prev, [col]: prev[col] + 1 }));
        setManaLinksTotal(t => t + 1);
        addLog(`Delivered ${q.item}! Mana link earned (${MAGE_NAMES[col]}).`, 'success');
      }
    } else if (q.rewardType === 'gold') {
      setPlayer(p => ({ ...p, gold: p.gold + q.rewardGold }));
      addLog(`Delivered ${q.item}! +${q.rewardGold}g.`, 'success');
    } else if (q.rewardType === 'card') {
      const pool = CARD_DB.filter(c => !isLand(c));
      if (pool.length) {
        const reward = { ...pool[Math.floor(Math.random() * pool.length)], iid: mkId() };
        setBinder(b => [...b, reward]);
        addLog(`Delivered ${q.item}! Received ${reward.name}.`, 'success');
      }
    }

    setTiles(prev => {
      const n = prev.map(r => [...r]);
      n.forEach(row => row.forEach((t, xi) => {
        if (t.townData?.name === q.sourceTownName) {
          n[t.y][xi] = { ...t, townData: { ...t.townData, deliveryQuest: { ...t.townData.deliveryQuest, completed: true } } };
        }
      }));
      return n;
    });

    setActiveDelivery(null);
  }, [activeDelivery, magesDefeated, addLog]); // eslint-disable-line react-hooks/exhaustive-deps

  // -------------------------------------------------------------------------
  // MOVEMENT & ENCOUNTER LOGIC
  // -------------------------------------------------------------------------

  const doMove = useCallback((nx, ny) => {
    setWmCooldowns(prev => {
      const updated = { ...prev };
      for (const k in updated) { if (updated[k] > 0) updated[k]--; }
      return updated;
    });

    const newTiles = revealAround(tiles, nx, ny);

    let newlyRevealedCount = 0;
    for (let ry = 0; ry < newTiles.length; ry++) {
      for (let rx = 0; rx < newTiles[ry].length; rx++) {
        if (newTiles[ry][rx].revealed && !tiles[ry][rx].revealed) {
          newlyRevealedCount++;
        }
      }
    }

    const newMoves = moves + 1;
    setMoves(newMoves);
    graceMovesRef.current = Math.min(graceMovesRef.current + 1, GRACE_MOVE_THRESHOLD);
    setPos({ x: nx, y: ny });
    setTiles(newTiles);

    for (let i = 0; i < newlyRevealedCount; i++) {
      checkQuestProgress('tiles_revealed');
    }

    setViewOfs({ x: nx, y: ny });

    if (foodEnabled && newMoves > 0 && newMoves % 15 === 0) {
      setPlayer(p => {
        const cost = Math.min(p.gold, 8);
        if (cost < 8) addLog('\u{1F356} Starving! No gold for food.', 'danger');
        else addLog('Hungry. Spent 8g on provisions.', 'info');
        return { ...p, gold: p.gold - cost };
      });
    }

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
    if (expiredEvents.length) {
      expiredEvents.forEach(ev => {
        if (magesDefeated.includes(ev.color)) return;
        setManaLinks(prev => ({ ...prev, [ev.color]: prev[ev.color] + 1 }));
        setManaLinksTotal(t => t + 1);
        setTiles(prev => {
          const n = prev.map(r => [...r]);
          if (n[ev.ty]?.[ev.tx]) {
            const t = n[ev.ty][ev.tx];
            n[ev.ty][ev.tx] = {
              ...t,
              manaLink: ev.color,
              townData: t.townData ? { ...t.townData, conquered: true } : t.townData,
            };
          }
          return n;
        });
        addLog(`⚠ ${MAGE_NAMES[ev.color]} seizes ${ev.townName}! The town is conquered.`, 'danger');
      });
    }

    const aliveColors = COLORS.filter(c => !magesDefeated.includes(c));
    for (const evColor of aliveColors) {
      const linkCount = manaLinks[evColor] || 0;
      const interval = Math.max(6, 12 - linkCount * 2);
      if (newMoves > 5 && newMoves % interval === 0 && Math.random() > 0.45) {
        const spawnCount = linkCount >= mlThreshold - 1 ? 2 : 1;
        const townTargets = [];
        newTiles.forEach(row => row.forEach(t => {
          if (t.structure === 'TOWN' && t.townData && !t.manaLink) townTargets.push(t);
        }));
        if (!townTargets.length) continue;

        for (let s = 0; s < spawnCount; s++) {
          if (!townTargets.length) break;
          const idx = Math.floor(Math.random() * townTargets.length);
          const target = townTargets.splice(idx, 1)[0];
          const minionName = MINION_NAMES[evColor][Math.floor(Math.random() * MINION_NAMES[evColor].length)];
          const newEv = {
            id: Date.now() + s,
            color: evColor,
            minionName,
            townName: target.townData.name,
            tx: target.x,
            ty: target.y,
            movesLeft: 10,
          };
          setMlEvents(prev => [...prev, newEv]);
          addLog(`⚠ ${MAGE_NAMES[evColor]} sends ${minionName} to seize ${target.townData.name}!`, 'danger');
        }
        if (spawnCount === 2) {
          addLog(`\u{1F480} ${MAGE_NAMES[evColor]} is moments from victory -- two minions advance!`, 'danger');
        }
      }
    }

    const tCheck = newTiles[ny]?.[nx];
    if (tCheck && tCheck.terrain !== TERRAIN.WATER && Math.random() < 0.03) {
      const pool = WORLD_MAGICS.filter(wm => !worldMagics.includes(wm.id));
      if (pool.length) {
        const wm = pool[Math.floor(Math.random() * pool.length)];
        setWorldMagics(prev => [...prev, wm.id]);
        addLog(`✨ Discovered World Magic: ${wm.icon} ${wm.name} -- ${wm.desc}`, 'success');
      }
    }

    const t = newTiles[ny]?.[nx];
    if (!t) return;
    if (t.structure) {
      setActiveTile(t);
      if (t.structure === 'TOWN') {
        const respondingEv = mlEvents.find(e => e.responding && e.tx === nx && e.ty === ny);
        if (respondingEv) {
          setMlEvents(prev => prev.filter(e => e.id !== respondingEv.id));
          addLog(`You intercept ${MAGE_NAMES[respondingEv.color]}'s minion at ${respondingEv.townName}! Defend the town!`, 'danger');
          setModal(null);
          openEncounterPopup(
            MAGE_ARCHKEY[respondingEv.color],
            player.hp,
            'mana_link_defense',
            null,
            { manaLinkColor: respondingEv.color, townName: respondingEv.townName, tx: respondingEv.tx, ty: respondingEv.ty },
            {}
          );
          return;
        }
        addLog(`You arrive at ${t.townData.name}.`, 'info');
        setModal('town');
        if (activeDelivery && t.townData?.name === activeDelivery.destTownName) {
          completeDelivery();
        }
        return;
      }
      if (t.structure === 'DUNGEON') {
        if (!t.dungeonData?.clued) return;
        addLog(`The entrance to ${t.dungeonData.name} looms before you.`, 'event');
        setModal('dungeon');
        return;
      }
      if (t.structure === 'CASTLE') {
        addLog(`You approach ${t.castleData.mage}'s stronghold.`, 'event');
        setModal('castle');
        return;
      }
      if (t.structure === 'RUIN') {
        addLog(`You approach ${t.ruinData.name}.`, 'event');
        setModal('ruin');
        return;
      }
    }

    setEnemies(prev => {
      const caught = prev.find(e => e.x === nx && e.y === ny);
      if (caught) {
        const monster = { ...pickMonster(caught.tier, Math.random), tier: caught.tier };
        setTimeout(() => {
          openEncounterPopup(
            caught.archKey || monster.archKey,
            player.hp, 'monster', null, {},
            { monsterName: caught.name || monster.name, tier: caught.tier }
          );
        }, 0);
        return prev.filter(e => e.id !== caught.id);
      }
      return prev;
    });

    if (newMoves > 80 && t.terrain !== TERRAIN.WATER && Math.random() < 0.04) {
      const aliveHenchmen = HENCHMAN_TABLE.filter(h => !magesDefeated.includes(h.color));
      if (aliveHenchmen.length) {
        const h = aliveHenchmen[Math.floor(Math.random() * aliveHenchmen.length)];
        addLog(`⚠ ${h.name} bars your way!`, 'danger');
        openEncounterPopup(h.archKey, player.hp, 'monster', null, {}, {
          monsterName: h.name,
          tier: h.tier,
          canFlee: false,
        });
      }
    }
  }, [tiles, moves, manaLinks, mlEvents, magesDefeated, player.hp, foodEnabled, addLog, openEncounterPopup, checkQuestProgress, worldMagics, activeDelivery, completeDelivery]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTileClick = useCallback((tile) => {
    if (!tile.revealed || tile.terrain === TERRAIN.WATER) return;
    if (tile.x === pos.x && tile.y === pos.y) return;
    const path = findPath(tiles, pos.x, pos.y, tile.x, tile.y);
    if (!path || !path.length) { addLog('No path to that location.', 'warn'); return; }
    const step = path[0];
    // Mobile/tap parity: derive the walk direction from the first step's delta
    // (same up/down/left/right mapping as the keyboard DIRS table) and drive the
    // walk cycle. Mobile movement is an instant tile-swap with no keyup, so a
    // short timeout flips `moving` back off after a few animation frames. This
    // is intentionally a separate path from the keyboard handler's keydown/keyup
    // logic -- explicit duplication, not a shared platform-branched helper.
    const dx = step.x - pos.x;
    const dy = step.y - pos.y;
    const dir = dx < 0 ? 'left' : dx > 0 ? 'right' : dy < 0 ? 'up' : 'down';
    playerAnimRef.current = { ...playerAnimRef.current, dir, moving: true };
    if (tapMoveTimerRef.current) clearTimeout(tapMoveTimerRef.current);
    tapMoveTimerRef.current = setTimeout(() => {
      playerAnimRef.current = { ...playerAnimRef.current, moving: false };
    }, 280);
    doMove(step.x, step.y);
  }, [tiles, pos, doMove, addLog]);

  // -------------------------------------------------------------------------
  // MANA LINK ALERT HANDLERS
  // -------------------------------------------------------------------------

  const handleRespondAlert = useCallback((ev) => {
    setMlEvents(prev => prev.map(e => e.id === ev.id ? { ...e, responding: true } : e));
    const path = findPath(tiles, pos.x, pos.y, ev.tx, ev.ty);
    if (path?.length) doMove(path[0].x, path[0].y);
    addLog(`Rushing to ${ev.townName}!`, 'info');
  }, [tiles, pos, doMove, addLog]);

  const handleDismissAlert = useCallback((ev) => {
    setMlEvents(prev => prev.filter(e => e.id !== ev.id));
    addLog(`Ignoring ${MAGE_NAMES[ev.color]}'s minion. Risk accepted.`, 'warn');
  }, [addLog]);

  // -------------------------------------------------------------------------
  // DUEL BRIDGE
  // -------------------------------------------------------------------------

  const launchDuel = useCallback((oppArchKey, overworldHP, context, castleMod = null, extraData = {}) => {
    duelKeyRef.current += 1;
    setDuelScreenIsCompact(isCompactMobile);
    setDuelCfg({
      pDeckIds: deck.map(c => c.id).filter(Boolean),
      oppArchKey,
      ruleset,
      overworldHP,
      castleMod,
      anteEnabled,
      context, ...extraData,
      sandbox: isSandbox,
      _ts: Date.now(),
    });
  }, [deck, ruleset, anteEnabled, isCompactMobile]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDuelEnd = useCallback((outcome, duelState) => {
    const won     = outcome === 'win';
    const finalHP = duelState?.p?.life ?? 1;
    const ctx     = duelCfg?.context;

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

    if (won) {
      checkQuestProgress('duel_wins');
      if (ctx === 'monster') checkQuestProgress('monster_wins');
      if (ctx === 'castle')  checkQuestProgress('mages_defeated');
    }

    if (ctx === 'liberate') {
      setPlayer(p => ({ ...p, hp: Math.max(1, finalHP) }));
      const { townName, townColor } = duelCfg;
      if (won) {
        setTiles(prev => {
          const n = prev.map(r => [...r]);
          n.forEach(row => row.forEach((t, xi) => {
            if (t.townData?.name === townName) {
              n[t.y][xi] = {
                ...t,
                manaLink: null,
                townData: { ...t.townData, conquered: false },
              };
            }
          }));
          return n;
        });
        setManaLinks(prev => ({ ...prev, [townColor]: Math.max(0, prev[townColor] - 1) }));
        setManaLinksTotal(t => Math.max(0, t - 1));
        addLog(`${townName} liberated! The people cheer.`, 'success');
      } else {
        addLog(`Driven back. ${townName} remains occupied.`, 'danger');
      }
    }

    if (ctx === 'monster') {
      setPlayer(p => ({ ...p, hp: Math.max(1, finalHP) }));
      if (won) {
        const gold = 5 + Math.floor(Math.random() * 15);
        setPlayer(p => ({ ...p, gold: p.gold + gold }));
        const arch = ARCHETYPES[duelCfg.oppArchKey];
        if (arch?.color === 'R') {
          setPlayer(p => ({ ...p, redAmulets: (p.redAmulets || 0) + 1 }));
          addLog('\u{1F534} Red amulet obtained.', 'success');
        }
        addLog(`Victory! +${gold}g.`, 'success');
        const pool = CARD_DB.filter(c => c.color === arch?.color && !isLand(c));
        const cardReward = pool.length ? { ...pool[Math.floor(Math.random() * pool.length)], iid: mkId() } : null;
        const uncluedDungeons = tiles.flat().filter(t => t.dungeonData && !t.dungeonData.clued);
        const dungeonTile = uncluedDungeons.length
          ? uncluedDungeons[Math.floor(Math.random() * uncluedDungeons.length)]
          : null;
        const dungeonClue = dungeonTile
          ? { name: dungeonTile.dungeonData.name, terrain: dungeonTile.terrain, mod: dungeonTile.dungeonData.mod }
          : null;
        setPostDuelChoice({ cardReward, dungeonClue });
        setEnemies(prev => {
          const candidates = [];
          tiles.forEach(row => row.forEach(t => {
            if (!t.revealed && !t.structure && t.terrain !== TERRAIN.WATER) candidates.push(t);
          }));
          if (!candidates.length) return prev;
          const spawn = candidates[Math.floor(Math.random() * candidates.length)];
          const tier = Math.ceil(Math.random() * 2);
          const monster = pickMonster(tier, Math.random);
          const { kind: spriteKind, color: spriteColor } = spriteForMonster(monster.archKey, spawn.terrain.id);
          return [...prev, {
            id: mkId(),
            x: spawn.x,
            y: spawn.y,
            tier,
            archKey: monster.archKey,
            name: monster.name,
            hp: monster.hp,
            terrain: spawn.terrain.id,
            spriteKind,
            spriteColor,
            animFrame: 0,
            dir: 'down',
          }];
        });
      } else {
        addLog(`Defeated. HP dropped to ${Math.max(1, finalHP)}.`, 'danger');
      }
    }

    if (ctx === 'castle') {
      const col = duelCfg.castleColor;
      setPlayer(p => ({ ...p, hp: Math.max(1, finalHP) }));
      if (won && col) {
        setMagesDefeated(prev => [...prev, col]);
        setTiles(prev => {
          const n = prev.map(r => [...r]);
          n.forEach(row => row.forEach((t, xi) => {
            if (t.structure === 'CASTLE' && t.castleData?.color === col) {
              n[t.y][xi] = { ...t, castleData: { ...t.castleData, defeated: true } };
            }
          }));
          return n;
        });
        const artId = ART_REWARD[col];
        setArtifacts(prev => prev.map(a => a.id === artId ? { ...a, owned: true } : a));
        const artName = OW_ARTS.find(a => a.id === artId)?.name;
        addLog(`\u{1F3C6} ${MAGE_NAMES[col]} is defeated! Artifact gained: ${artName}.`, 'success');
        if (col === 'R') {
          setPlayer(p => ({ ...p, redAmulets: (p.redAmulets || 0) + 3 }));
          addLog('\u{1F534}\u{1F534}\u{1F534} Red amulets obtained.', 'success');
        }
        if (artId === 'amulet') setPlayer(p => ({ ...p, maxHP: p.maxHP + 5, hp: Math.min(p.hp + 5, p.maxHP + 5) }));
      } else if (!won) {
        addLog(`Driven back from the castle. HP: ${Math.max(1, finalHP)}.`, 'danger');
      }
    }

    if (ctx === 'dungeon_entity') {
      setPlayer(p => ({ ...p, hp: Math.max(1, finalHP) }));
      const entityId = pendingDungeonEntity.current;
      pendingDungeonEntity.current = null;
      if (won) {
        setDungeonScreen(prev => prev ? {
          ...prev,
          entities: prev.entities.map(e => e.id === entityId ? { ...e, defeated: true } : e),
        } : null);
        const gold = 5 + Math.floor(Math.random() * 15);
        setPlayer(p => ({ ...p, gold: p.gold + gold }));
        addLog(`Victory! +${gold}g. Returning to the dungeon.`, 'success');
      } else {
        addLog('Defeated in the dungeon depths. Retreating?', 'danger');
        setDungeonScreen(null);
        setDungeonPlayerPos(null);
        setDungeonProg(null);
      }
    }

    if (ctx === 'dungeon') {
      setPlayer(p => ({ ...p, hp: Math.max(1, finalHP) }));
      if (won) {
        const prog = dungeonProg;
        const nextRoom = prog.room + 1;
        if (nextRoom < prog.totalRooms) {
          const newProg = { ...prog, room: nextRoom };
          setDungeonProg(newProg);
          const nextArch = DUNGEON_ARCHETYPES[Math.floor(Math.random() * DUNGEON_ARCHETYPES.length)];
          addLog(`Room ${nextRoom + 1} of ${prog.totalRooms}. Descending further?`, 'event');
          duelKeyRef.current += 1;
          setDuelScreenIsCompact(isCompactMobile);
          setDuelCfg({
            pDeckIds: deck.map(c => c.id).filter(Boolean),
            oppArchKey: nextArch,
            ruleset,
            overworldHP: Math.max(1, finalHP),
            castleMod: prog.mod,
            anteEnabled: false,
            context: 'dungeon',
            sandbox: isSandbox,
            _ts: Date.now(),
          });
          return;
        } else {
          setDungeonsCleared(dc => dc + 1);
          checkQuestProgress('dungeons_cleared');
          const gold = 20 + Math.floor(Math.random() * 40);
          setPlayer(p => ({ ...p, gold: p.gold + gold }));
          const pool = CARD_DB.filter(c => c.rarity === 'R' && !isLand(c));
          const gems = 1 + Math.floor(Math.random() * 2);
          setPlayer(p => ({ ...p, gems: p.gems + gems }));
          if (pool.length) {
            const reward = { ...pool[Math.floor(Math.random() * pool.length)], iid: mkId() };
            setBinder(b => [...b, reward]);
            addLog(`Dungeon cleared! +${gold}g, +${gems}\u{1F4A0}, and ${reward.name}.`, 'success');
          } else {
            addLog(`Dungeon cleared! +${gold}g, +${gems}\u{1F4A0}.`, 'success');
          }
          setDungeonProg(null);
        }
      } else {
        addLog('Fled the dungeon. Progress lost.', 'danger');
        setDungeonProg(null);
      }
    }

    if (ctx === 'mana_link_defense') {
      setPlayer(p => ({ ...p, hp: Math.max(1, finalHP) }));
      const { manaLinkColor, townName } = duelCfg;
      if (won) {
        setTownsSaved(t => t + 1);
        addLog(`Victory! ${townName} is defended. No mana link established.`, 'success');
      } else {
        setManaLinks(ml => ({ ...ml, [manaLinkColor]: (ml[manaLinkColor] || 0) + 1 }));
        setTiles(prev => {
          const n = prev.map(r => [...r]);
          const { tx, ty } = duelCfg;
          if (n[ty]?.[tx]) n[ty][tx] = { ...n[ty][tx], manaLink: manaLinkColor };
          return n;
        });
        addLog(`Defeated. ${MAGE_NAMES[manaLinkColor]} establishes a mana link at ${townName}.`, 'danger');
      }
    }

    if (ctx === 'mana_link_reclaim') {
      setPlayer(p => ({ ...p, hp: Math.max(1, finalHP) }));
      const { manaLinkColor, townName, tx, ty } = duelCfg;
      if (won) {
        setManaLinks(ml => ({ ...ml, [manaLinkColor]: Math.max(0, (ml[manaLinkColor] || 0) - 1) }));
        setTiles(prev => {
          const n = prev.map(r => [...r]);
          if (n[ty]?.[tx]) n[ty][tx] = { ...n[ty][tx], manaLink: null };
          return n;
        });
        setTownsSaved(t => t + 1);
        addLog(`Victory! ${townName} is liberated from ${MAGE_NAMES[manaLinkColor]}'s grasp. Mana link removed.`, 'success');
      } else {
        addLog(`Defeated. ${townName} remains under ${MAGE_NAMES[manaLinkColor]}'s control.`, 'danger');
      }
    }

    if (ctx === 'arzakon') {
      if (won) {
        setArzakonDefeated(true);
        addLog('\u{1F3C6} Arzakon is defeated! Shandalar is free!', 'success');
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

    if (ctx === 'ruin_guardian') {
      setPlayer(p => ({ ...p, hp: Math.max(1, finalHP) }));
      if (won) {
        const ruinTile = duelCfg.ruinTile;
        if (ruinTile) {
          const t = tiles[ruinTile.y]?.[ruinTile.x];
          if (t) {
            setActiveTile(t);
            setModal('ruin');
          }
        }
      } else {
        addLog('The guardian drives you back from the ruins.', 'danger');
      }
    }

    graceMovesRef.current = 0;
    setDuelCfg(null);
  }, [duelCfg, dungeonProg, anteEnabled, magesDefeated, dungeonsCleared, townsSaved, manaLinksTotal, deck, binder, ruleset, name, color, addLog, onScore, checkQuestProgress, isCompactMobile]); // eslint-disable-line react-hooks/exhaustive-deps

  // -------------------------------------------------------------------------
  // ARZAKON LAUNCH
  // -------------------------------------------------------------------------

  const launchArzakon = useCallback(() => {
    addLog('⚡ Arzakon manifests! The final battle begins!', 'danger');
    duelKeyRef.current += 1;
    setDuelScreenIsCompact(isCompactMobile);
    setDuelCfg({
      pDeckIds: deck.map(c => c.id).filter(Boolean),
      oppArchKey: 'FIVE_COLOR_BOMB',
      ruleset,
      overworldHP: ruleset.startingLife,
      castleMod: { name: 'Dominion', desc: 'Arzakon commands all five colors. The final battle for Shandalar begins.' },
      anteEnabled: false,
      context: 'arzakon',
      useGemini,
      sandbox: isSandbox,
      _ts: Date.now(),
    });
  }, [deck, ruleset, addLog, isCompactMobile, useGemini]); // eslint-disable-line react-hooks/exhaustive-deps

  // -------------------------------------------------------------------------
  // TOWN ACTIONS
  // -------------------------------------------------------------------------

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
    addLog(`Rested at the inn -- full HP restored. -${cost}g.`, 'success');
  }, [player.gold, addLog]);

  const handleSage = useCallback(() => {
    if (player.gold < 25) { addLog('Need 25g for the sage.', 'warn'); return; }
    const cost = hasStone ? 0 : 25;
    if (cost > 0) setPlayer(p => ({ ...p, gold: p.gold - cost }));
    const dgs = [];
    tiles.forEach(row => row.forEach(t => { if (t.structure === 'DUNGEON' && !t.dungeonData?.clued) dgs.push(t); }));
    if (dgs.length) {
      const d = dgs[Math.floor(Math.random() * dgs.length)];
      setTiles(prev => {
        const n = prev.map(r => [...r]);
        n[d.y][d.x] = { ...n[d.y][d.x], revealed: true, dungeonData: { ...n[d.y][d.x].dungeonData, clued: true } };
        return n;
      });
      const costStr = cost === 0 ? '(free -- Scrying Stone)' : `-${cost}g`;
      addLog(`The sage reveals the location of ${d.dungeonData.name}. ${costStr}`, 'success');
    } else {
      if (cost > 0) setPlayer(p => ({ ...p, gold: p.gold + cost }));
      addLog('No hidden dungeons remain.', 'info');
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
      addLog(`Traded 3 commons -- ${reward.name}.`, 'success');
    } else if (rarity === 'U') {
      const uncs = binder.filter(c => c.rarity === 'U');
      if (uncs.length < 5) { addLog('Need 5 uncommons to trade.', 'warn'); return; }
      const rm = uncs.slice(0, 5);
      const pool = CARD_DB.filter(c => c.rarity === 'R' && !isLand(c));
      if (!pool.length) return;
      const reward = { ...pool[Math.floor(Math.random() * pool.length)], iid: mkId() };
      setBinder(b => [...b.filter(c => !rm.find(r => r.iid === c.iid)), reward]);
      addLog(`Traded 5 uncommons -- ${reward.name}.`, 'success');
    }
  }, [binder, addLog]);

  const handleGemBuy = useCallback((type) => {
    if (type === 'rare') {
      if (player.gems < 3) { addLog('Need 3\u{1F4A0} for a rare.', 'warn'); return; }
      const pool = CARD_DB.filter(c => c.rarity === 'R' && !isLand(c));
      if (!pool.length) return;
      const r = { ...pool[Math.floor(Math.random() * pool.length)], iid: mkId() };
      setBinder(b => [...b, r]);
      setPlayer(p => ({ ...p, gems: p.gems - 3 }));
      addLog(`Gem merchant: received ${r.name}. \u{1F4A0}-3`, 'success');
    } else if (type === 'hp') {
      if (player.gems < 5) { addLog('Need 5\u{1F4A0} for max HP upgrade.', 'warn'); return; }
      setPlayer(p => ({ ...p, maxHP: p.maxHP + 5, hp: p.hp + 5, gems: p.gems - 5 }));
      addLog('Max HP +5. \u{1F4A0}-5', 'success');
    } else if (type === 'heal') {
      if (player.gems < 2) { addLog('Need 2\u{1F4A0} for a full heal.', 'warn'); return; }
      setPlayer(p => ({ ...p, hp: p.maxHP, gems: p.gems - 2 }));
      addLog('Fully healed. \u{1F4A0}-2', 'success');
    }
  }, [player.gems, addLog]);

  // -------------------------------------------------------------------------
  // WORLD MAGIC ACTIVATION
  // -------------------------------------------------------------------------

  const handleActivateWorldMagic = useCallback((id) => {
    const wm = WORLD_MAGICS.find(w => w.id === id);
    if (!wm || wm.type !== 'active') return;

    if (id === 'staff_of_thunder') {
      if ((player.redAmulets || 0) < 1) {
        addLog('Staff of Thunder: Need 1 red amulet.', 'warn');
        return;
      }
      const nearest = enemies.reduce((best, e) => {
        const d = Math.abs(e.x - pos.x) + Math.abs(e.y - pos.y);
        const bd = best ? Math.abs(best.x - pos.x) + Math.abs(best.y - pos.y) : Infinity;
        return d < bd ? e : best;
      }, null);
      if (nearest) {
        setEnemies(prev => prev.filter(e => e.id !== nearest.id));
        setPlayer(p => ({ ...p, redAmulets: (p.redAmulets || 0) - 1 }));
        addLog(`⚡ Staff of Thunder! ${nearest.name} is dispersed.`, 'success');
      } else {
        addLog('Staff of Thunder: No enemies on the map to target.', 'info');
      }
      return;
    }

    if (id === 'sword_of_resistance') {
      let target = null;
      for (const row of tiles) {
        for (const t of row) {
          if (t.structure === 'TOWN' && t.manaLink !== null) { target = t; break; }
        }
        if (target) break;
      }
      if (target) {
        setPos({ x: target.x, y: target.y });
        setViewOfs({ x: target.x, y: target.y });
        setMlEvents(prev => prev.filter(e => !(e.tx === target.x && e.ty === target.y)));
        setActiveTile(target);
        setModal('town');
        addLog(`\u{1F5E1}️ Sword of Resistance! Teleported to ${target.townData.name}.`, 'success');
      } else {
        addLog('Sword of Resistance: No towns are under threat.', 'info');
      }
      return;
    }

    if (id === 'nomads_map') {
      if ((wmCooldowns['nomads_map'] || 0) > 0) {
        addLog(`Nomad's Map: Not ready yet (${wmCooldowns['nomads_map']} moves remaining).`, 'warn');
        return;
      }
      const newTiles = tiles.map(r => r.map(cell => ({ ...cell })));
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          const tx = pos.x + dx;
          const ty = pos.y + dy;
          if (newTiles[ty]?.[tx]) newTiles[ty][tx] = { ...newTiles[ty][tx], revealed: true };
        }
      }
      setTiles(newTiles);
      setWmCooldowns(prev => ({ ...prev, nomads_map: 20 }));
      addLog("\u{1F5FA}️ Nomad's Map: Revealed a 7x7 area of the map!", 'success');
      return;
    }
  }, [player.redAmulets, enemies, pos, tiles, wmCooldowns, addLog]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLearnWorldMagic = useCallback(() => {
    if (player.gold < 150) { addLog('Need 150g to learn a World Magic.', 'warn'); return; }
    const pool = WORLD_MAGICS.filter(wm => !worldMagics.includes(wm.id));
    if (!pool.length) { addLog('You have mastered all World Magics!', 'info'); return; }
    const wm = pool[Math.floor(Math.random() * pool.length)];
    setWorldMagics(prev => [...prev, wm.id]);
    setPlayer(p => ({ ...p, gold: p.gold - 150 }));
    addLog(`✨ The sage teaches you: ${wm.icon} ${wm.name} -- ${wm.desc}`, 'success');
  }, [player.gold, worldMagics, addLog]);

  // -------------------------------------------------------------------------
  // RUIN HANDLERS
  // -------------------------------------------------------------------------

  const handleRuinLoot = useCallback(() => {
    if (!activeTile?.ruinData || activeTile.ruinData.looted) return;

    const pool = CARD_DB.filter(c => !isLand(c));
    const weighted = pool.flatMap(c =>
      c.rarity === 'R' ? [c] : c.rarity === 'U' ? [c, c] : [c, c, c]
    );
    const reward = weighted[Math.floor(Math.random() * weighted.length)];
    const gold = 5 + Math.floor(Math.random() * 11);

    setBinder(b => [...b, { ...reward, iid: mkId() }]);
    setPlayer(p => ({ ...p, gold: p.gold + gold }));

    setTiles(prev => {
      const next = prev.map(r => [...r]);
      const t = next[activeTile.y][activeTile.x];
      next[activeTile.y][activeTile.x] = {
        ...t,
        ruinData: { ...t.ruinData, looted: true },
      };
      return next;
    });

    addLog(`Found ${reward.name} and ${gold}g in the ruins.`, 'success');
    setModal(null);
  }, [activeTile, addLog]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRuinGuardianFight = useCallback(() => {
    if (!activeTile?.ruinData) return;
    // Ruin guardians are tier 2, archetype decoupled from terrain.
    const guardian = pickMonster(2, Math.random);
    setModal(null);
    openEncounterPopup(
      guardian.archKey,
      player.hp,
      'ruin_guardian',
      null,
      { ruinTile: { x: activeTile.x, y: activeTile.y } },
      { monsterName: `${activeTile.ruinData.name} Guardian`, tier: 2 }
    );
  }, [activeTile, tiles, player.hp, openEncounterPopup]); // eslint-disable-line react-hooks/exhaustive-deps

  // -------------------------------------------------------------------------
  // DUNGEON ENTER
  // -------------------------------------------------------------------------

  const handleEnterDungeon = useCallback(() => {
    const dg = activeTile?.dungeonData;
    if (!dg) return;
    addLog(`You descend into ${dg.name}. Modifier: ${dg.mod.name}.`, 'event');
    const prog = { tile: activeTile, room: 0, totalRooms: dg.rooms, mod: dg.mod, entryHP: player.hp };
    setDungeonProg(prog);
    const generated = generateDungeon(dg, Date.now());
    setDungeonScreen(generated);
    setDungeonPlayerPos(generated.playerStart);
    setModal(null);
  }, [activeTile, player.hp, addLog]);

  // -------------------------------------------------------------------------
  // DUNGEON MAP HANDLERS
  // -------------------------------------------------------------------------

  const handleDungeonExit = useCallback(() => {
    addLog(`You emerge from ${dungeonScreen?.name || 'the dungeon'}.`, 'info');
    setDungeonsCleared(dc => dc + 1);
    checkQuestProgress('dungeons_cleared');
    setDungeonScreen(null);
    setDungeonPlayerPos(null);
    setDungeonProg(null);
    graceMovesRef.current = 0;
  }, [dungeonScreen, addLog, checkQuestProgress]);

  const handleDungeonInteract = useCallback((entity) => {
    setPlayer(p => ({ ...p, gold: p.gold + entity.gold }));
    if (entity.cardRarity) {
      const pool = CARD_DB.filter(c => c.rarity === entity.cardRarity && !isLand(c));
      if (pool.length) {
        const reward = { ...pool[Math.floor(Math.random() * pool.length)], iid: mkId() };
        setBinder(b => [...b, reward]);
        addLog(`Treasure: +${entity.gold}g and ${reward.name} added to binder.`, 'success');
      } else {
        addLog(`Treasure: +${entity.gold}g.`, 'success');
      }
    } else {
      addLog(`Treasure: +${entity.gold}g.`, 'success');
    }
    setDungeonScreen(prev => prev ? {
      ...prev,
      entities: prev.entities.map(e => e.id === entity.id ? { ...e, collected: true } : e),
    } : null);
    setTreasureModal(entity);
  }, [addLog]);

  const handleDungeonMove = useCallback((dx, dy) => {
    if (!dungeonScreen || !dungeonPlayerPos) return;
    const { x, y } = dungeonPlayerPos;
    const nx = x + dx;
    const ny = y + dy;

    if (nx < 0 || nx >= dungeonScreen.width || ny < 0 || ny >= dungeonScreen.height) return;
    if (dungeonScreen.grid[ny][nx].type === 'WALL') return;

    setDungeonPlayerPos({ x: nx, y: ny });

    setDungeonScreen(prev => {
      if (!prev) return prev;
      const newGrid = prev.grid.map(row => row.map(cell => ({ ...cell })));
      for (let ty = 0; ty < prev.height; ty++) {
        for (let tx = 0; tx < prev.width; tx++) {
          const cell = newGrid[ty][tx];
          if (cell.revealed || cell.type === 'WALL') continue;
          if (checkLOS(newGrid, nx, ny, tx, ty)) {
            newGrid[ty][tx] = { ...cell, revealed: true };
          }
        }
      }
      return { ...prev, grid: newGrid };
    });

    const entity = dungeonScreen.entities.find(e => e.x === nx && e.y === ny);
    if (!entity) return;
    if (entity.type === 'ENEMY' && !entity.defeated) {
      pendingDungeonEntity.current = entity.id;
      launchDuel(entity.archKey, player.hp, 'dungeon_entity', dungeonScreen.mod);
    } else if (entity.type === 'TREASURE' && !entity.collected) {
      handleDungeonInteract(entity);
    } else if (entity.type === 'EXIT') {
      handleDungeonExit();
    }
  }, [dungeonScreen, dungeonPlayerPos, player.hp, launchDuel, handleDungeonInteract, handleDungeonExit]); // eslint-disable-line react-hooks/exhaustive-deps

  // -------------------------------------------------------------------------
  // CASTLE CHALLENGE
  // -------------------------------------------------------------------------

  const handleChallenge = useCallback(() => {
    const col = activeTile?.castleData?.color;
    if (!col || activeTile.castleData.defeated) return;
    const mod = CASTLE_MODIFIERS[col];
    addLog(`⚔ You challenge ${MAGE_NAMES[col]}! Castle modifier: ${mod.name}.`, 'event');
    setModal(null);
    const bossLife = difficulty.bossBase + magesDefeated.length * difficulty.bossPerKill;
    openEncounterPopup(MAGE_ARCHS[col], player.hp, 'castle', mod, { castleColor: col, oppLife: bossLife });
  }, [activeTile, player.hp, openEncounterPopup, addLog, difficulty, magesDefeated]);

  // -------------------------------------------------------------------------
  // COUNTER-ATTACK (RECLAIM CORRUPTED TOWN)
  // -------------------------------------------------------------------------

  const handleCounterAttack = useCallback(() => {
    const tile = activeTile;
    if (!tile?.manaLink) return;
    const color = tile.manaLink;
    addLog(`You challenge ${MAGE_NAMES[color]}'s minion for control of ${tile.townData.name}!`, 'danger');
    setModal(null);
    openEncounterPopup(
      MAGE_ARCHKEY[color],
      player.hp,
      'mana_link_reclaim',
      null,
      { manaLinkColor: color, townName: tile.townData.name, tx: tile.x, ty: tile.y },
      {}
    );
  }, [activeTile, player.hp, openEncounterPopup, addLog]);

  // -------------------------------------------------------------------------
  // LIBERATE CONQUERED TOWN
  // -------------------------------------------------------------------------

  const handleLiberate = useCallback(() => {
    const tile = activeTile;
    if (!tile?.townData?.conquered) return;
    const conquColor = tile.manaLink;
    addLog(`You march to liberate ${tile.townData.name} from ${MAGE_NAMES[conquColor]}'s garrison!`, 'danger');
    setModal(null);
    openEncounterPopup(
      MAGE_ARCHKEY[conquColor],
      player.hp,
      'liberate',
      null,
      { townName: tile.townData.name, townColor: conquColor },
      { monsterName: `${MAGE_NAMES[conquColor]}'s Garrison`, tier: 3, canFlee: false }
    );
  }, [activeTile, player.hp, openEncounterPopup, addLog]);

  // -------------------------------------------------------------------------
  // DECK MANAGEMENT
  // -------------------------------------------------------------------------

  const handleSwap = useCallback((deckCard, binderCard) => {
    setDeck(d => d.map(c => c.iid === deckCard.iid ? { ...binderCard, iid: deckCard.iid } : c));
    setBinder(b => b.map(c => c.iid === binderCard.iid ? { ...deckCard, iid: binderCard.iid } : c));
    addLog(`Swapped ${deckCard.name} -- ${binderCard.name}.`, 'info');
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

  // -------------------------------------------------------------------------
  // VIEWPORT
  // -------------------------------------------------------------------------

  const handleScroll = useCallback((dir) => {
    setViewOfs(v => ({
      x: Math.max(0, Math.min(MAP_W - 1, v.x + (dir === 'left' ? -3 : dir === 'right' ? 3 : 0))),
      y: Math.max(0, Math.min(MAP_H - 1, v.y + (dir === 'up' ? -3 : dir === 'down' ? 3 : 0))),
    }));
  }, []);

  const handleCenterPlayer = useCallback(() => setViewOfs({ x: pos.x, y: pos.y }), [pos]);

  useEffect(() => {
    if (isCompactMobile) {
      setViewOfs({ x: pos.x, y: pos.y });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // fires once on mount

  // -------------------------------------------------------------------------
  // GAME-LOSS SIDE-EFFECTS
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (gameLost && !duelCfg) {
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

  useEffect(() => {
    if (conquestLost && !gameLost && !duelCfg) {
      addLog("Arzakon's forces have overrun Shandalar. The plane is lost.", 'danger');
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
  }, [conquestLost]); // eslint-disable-line react-hooks/exhaustive-deps

  // -------------------------------------------------------------------------
  // GAME LOOP -- rAF-based
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (modal || duelCfg || dungeonScreen || encounterPopup || postDuelChoice) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      return;
    }

    let frameCount = 0;
    const TICK_INTERVAL = 36;

    function loop() {
      frameCount++;

      if (frameCount % TICK_INTERVAL === 0) {
        setEnemies(prev => tickEnemyAI(prev, pos, tiles, TERRAIN, graceMovesRef.current));
      }

      if (playerAnimRef.current.moving && frameCount % 8 === 0) {
        playerAnimRef.current = {
          ...playerAnimRef.current,
          frame: (playerAnimRef.current.frame + 1) % 4,
        };
      }

      // Enemy idle-bob: a single shared frame cycling on a fixed timer,
      // independent of enemy movement (enemies are AI-driven, not input-driven).
      if (frameCount % 12 === 0) {
        enemyFrameRef.current = (enemyFrameRef.current + 1) % 4;
      }

      // Mirror the animation refs into React state only when the visible frame
      // actually changes, so the DOM <Sprite> elements update without a
      // re-render on every rAF tick.
      if (playerAnimRef.current !== lastAnimRef.current.p ||
          enemyFrameRef.current !== lastAnimRef.current.e) {
        lastAnimRef.current = { p: playerAnimRef.current, e: enemyFrameRef.current };
        setAnimState({ player: playerAnimRef.current, enemyFrame: enemyFrameRef.current });
      }

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        const viewport = {
          x: Math.max(0, Math.min(MAP_W - viewW, viewOfs.x - Math.floor(viewW / 2))),
          y: Math.max(0, Math.min(MAP_H - viewH, viewOfs.y - Math.floor(viewH / 2))),
        };
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawCharacters(ctx, {
          playerPos: pos,
          playerAnim: playerAnimRef.current,
          enemies,
          viewport,
          tileSize,
          tiles,
        });
      }

      const caught = enemies.find(e => e.x === pos.x && e.y === pos.y);
      if (caught) {
        const monster = { ...pickMonster(caught.tier, Math.random), tier: caught.tier };
        setEnemies(prev => prev.filter(e => e.id !== caught.id));
        openEncounterPopup(
          caught.archKey || monster.archKey, player.hp, 'monster', null, {},
          { monsterName: caught.name || monster.name, tier: caught.tier },
        );
        return;
      }

      animFrameRef.current = requestAnimationFrame(loop);
    }

    animFrameRef.current = requestAnimationFrame(loop);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [modal, duelCfg, dungeonScreen, encounterPopup, postDuelChoice, pos, tiles, enemies, viewOfs]); // eslint-disable-line react-hooks/exhaustive-deps

  // -------------------------------------------------------------------------
  // WASD / ARROW KEY MOVEMENT
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (modal || duelCfg || dungeonScreen || encounterPopup || postDuelChoice) return;

    const DIRS = {
      ArrowUp:    { dx:  0, dy: -1, dir: 'up'    },
      ArrowDown:  { dx:  0, dy:  1, dir: 'down'  },
      ArrowLeft:  { dx: -1, dy:  0, dir: 'left'  },
      ArrowRight: { dx:  1, dy:  0, dir: 'right' },
      w: { dx:  0, dy: -1, dir: 'up'    },
      s: { dx:  0, dy:  1, dir: 'down'  },
      a: { dx: -1, dy:  0, dir: 'left'  },
      d: { dx:  1, dy:  0, dir: 'right' },
    };

    const handleKeyDown = (e) => {
      const d = DIRS[e.key];
      if (!d) return;
      e.preventDefault();
      const nx = pos.x + d.dx;
      const ny = pos.y + d.dy;
      const target = tiles[ny]?.[nx];
      if (!target || target.terrain === TERRAIN.WATER) return;
      playerAnimRef.current = { ...playerAnimRef.current, dir: d.dir, moving: true };
      doMove(nx, ny);
    };

    const handleKeyUp = (e) => {
      if (DIRS[e.key]) {
        playerAnimRef.current = { ...playerAnimRef.current, moving: false };
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [modal, duelCfg, dungeonScreen, encounterPopup, postDuelChoice, pos, tiles, doMove]); // eslint-disable-line react-hooks/exhaustive-deps

  // -------------------------------------------------------------------------
  // TEST GLOBAL -- expose the live player-animation ref for e2e assertions.
  // Gated on sandbox mode, mirroring how the duel screen gates __duelState.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!isSandbox || typeof window === 'undefined') return undefined;
    window.__overworldAnim = () => ({
      player: { ...playerAnimRef.current },
      enemyFrame: enemyFrameRef.current,
    });
    return () => { delete window.__overworldAnim; };
  }, [isSandbox]);

  // -------------------------------------------------------------------------
  // RETURN
  // -------------------------------------------------------------------------

  return {
    // State
    tiles, pos, moves, player, deck, binder, artifacts,
    worldMagics, wmCooldowns, manaLinks, magesDefeated, mlEvents,
    dungeonsCleared, townsSaved, manaLinksTotal, arzakonDefeated,
    activeQuest, questProgress, questComplete, activeDelivery,
    duelCfg, duelScreenIsCompact, dungeonProg, encounterPopup, postDuelChoice,
    dungeonScreen, dungeonPlayerPos, treasureModal,
    ruleset, anteEnabled, foodEnabled,
    modal, activeTile, log,
    viewOfs, enemies,
    animState,

    // Setters
    setModal, setActiveTile, setPostDuelChoice, setEncounterPopup,
    setTreasureModal, setTiles, setDeck, setBinder, setPlayer,
    setRuleset, setAnteEnabled, setFoodEnabled,
    setActiveQuest, setQuestProgress, setQuestComplete, setActiveDelivery,

    // Derived flags
    hasBoots, hasWard, hasFocus, hasStone, hasDwarvenPick, hasSwampwalk,
    allMagesDown, gameWon, arzakonReady, gameLost, conquestLost, isSandbox,

    // Viewport
    viewW, viewH, tileSize,

    // Refs
    canvasRef, playerAnimRef, duelKeyRef,

    // Internal movement (used by desktop d-pad)
    doMove,

    // Handlers
    addLog,
    handleTileClick,
    handleCenterPlayer,
    handleScroll,
    handleRespondAlert,
    handleDismissAlert,
    handleBuy, handleSell, handleRest, handleSage, handleTrade, handleGemBuy,
    handleActivateWorldMagic, handleLearnWorldMagic,
    handleRuinLoot, handleRuinGuardianFight,
    handleEnterDungeon,
    handleDungeonExit, handleDungeonInteract, handleDungeonMove,
    handleChallenge, handleCounterAttack, handleLiberate,
    handleSwap, handleMoveToDeck, handleMoveToBinder,
    launchDuel, launchArzakon,
    handleDuelEnd,

    // Expose QUESTS for modal inline logic
    QUESTS,
  };
}
