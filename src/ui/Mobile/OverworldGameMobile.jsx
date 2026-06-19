// src/ui/Mobile/OverworldGameMobile.jsx
// Compact mobile overworld layout (<= 640px). Receives ctrl prop from OverworldGame.jsx.
// Local state: drawerOpen, drawerTab. No game logic here.

import React, { useState } from 'react';
import { WorldMap, ManaLinkAlert } from '../overworld/WorldMap.jsx';
import { TownModal, DungeonModal, CastleModal, DeckManager, RuinModal } from '../overworld/EncounterModal.jsx';
import PreDuelPopup from '../overworld/PreDuelPopup.jsx';
import PostDuelChoiceModal from '../overworld/PostDuelChoiceModal.jsx';
import WorldMagicPanel from '../overworld/WorldMagicPanel.jsx';
import { MAP_W, MAP_H, WORLD_MAGICS, MAGE_NAMES } from '../../engine/MapGenerator.js';
import { CARD_DB } from '../../data/cards.js';
import RULESETS from '../../data/rulesets.js';

const MANA_SYM_LOCAL = {
  W: '☀️',
  U: '\u{1F4A7}',
  B: '\u{1F480}',
  R: '\u{1F525}',
  G: '\u{1F33F}',
};

export default function OverworldGameMobile({ ctrl, onQuit }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState('info');

  const {
    tiles, pos, player, deck, binder, artifacts,
    worldMagics, wmCooldowns, manaLinks, magesDefeated, mlEvents,
    activeDelivery, encounterPopup, postDuelChoice, duelCfg,
    anteEnabled, modal, setModal, activeTile,
    arzakonReady, gameLost, conquestLost, isSandbox,
    viewW, viewH, tileSize, viewOfs, enemies, animState,
    moves,
    canvasRef,
    handleTileClick, handleRespondAlert, handleDismissAlert,
    handleBuy, handleSell, handleRest, handleSage, handleTrade, handleGemBuy,
    handleActivateWorldMagic, handleLearnWorldMagic,
    handleRuinLoot, handleRuinGuardianFight,
    handleEnterDungeon, handleChallenge, handleCounterAttack, handleLiberate,
    handleSwap, handleMoveToDeck, handleMoveToBinder,
    launchDuel, launchArzakon,
    setEncounterPopup, setPostDuelChoice,
    setTiles, setDeck, setBinder, setPlayer,
    setActiveQuest, setQuestProgress, setQuestComplete, setActiveDelivery,
    addLog,
    hasBoots, hasDwarvenPick, hasSwampwalk,
    QUESTS,
    activeQuest, questProgress, questComplete,
    setRuleset, setAnteEnabled, setFoodEnabled, foodEnabled, ruleset,
  } = ctrl;

  return (
    <div style={{
      height: '100dvh', width: '100vw',
      background: '#0a0e08',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
      fontFamily: "'Crimson Text', serif",
    }}>

      {/* -- GAME-LOSS OVERLAY ----------------------------------------------- */}
      {(gameLost || conquestLost) && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.9)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 600,
          flexDirection: 'column', gap: 12,
        }}>
          <div style={{ fontSize: 40 }}>{'\u{1F480}'}</div>
          <div style={{ fontSize: 24, fontFamily: "'Cinzel',serif", color: '#e04040' }}>The Plane Falls</div>
          <div style={{ fontSize: 12, color: '#a06040', fontStyle: 'italic' }}>
            {conquestLost && !gameLost
              ? "Arzakon's armies have overrun Shandalar's towns--"
              : "Arzakon's mana links have consumed Shandalar--"}
          </div>
        </div>
      )}

      {/* -- ARZAKON READY OVERLAY ------------------------------------------- */}
      {arzakonReady && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500,
          flexDirection: 'column', gap: 16,
        }}>
          <div style={{ fontSize: 36 }}>{'\u{1F3C6}'}</div>
          <div style={{ fontSize: 22, fontFamily: "'Cinzel',serif", color: '#e0c040' }}>
            All Five Mages Defeated!
          </div>
          <div style={{ fontSize: 13, color: '#c0a060', fontStyle: 'italic', textAlign: 'center', maxWidth: 320 }}>
            Arzakon himself rises to defend the conquered plane. The final battle awaits.
          </div>
          <button
            onClick={launchArzakon}
            style={{
              background: 'linear-gradient(135deg,#2a0808,#5a1010)',
              border: '2px solid rgba(200,60,40,.6)',
              color: '#ff8060', padding: '12px 24px', borderRadius: 6,
              cursor: 'pointer', fontSize: 15, fontFamily: "'Cinzel',serif", letterSpacing: 2,
              boxShadow: '0 0 20px rgba(200,40,20,.4)',
            }}
          >
            {'⚡'} Face Arzakon
          </button>
          <button
            onClick={() => {/* dismiss */}}
            style={{
              background: 'transparent', border: '1px solid rgba(160,120,60,.3)',
              color: '#806040', padding: '8px 20px', borderRadius: 5,
              cursor: 'pointer', fontSize: 12, fontFamily: "'Cinzel',serif",
            }}
          >
            Prepare further--
          </button>
        </div>
      )}

      {/* -- TOPBAR (~44px) -------------------------------------------------- */}
      <div style={{
        height: 44, display: 'flex', alignItems: 'center',
        padding: '0 10px', gap: 8,
        background: 'rgba(0,0,0,.85)',
        borderBottom: '1px solid rgba(200,160,40,.25)',
        flexShrink: 0,
      }}>
        <span style={{
          fontFamily: "'Cinzel Decorative',serif", fontSize: 11,
          color: '#d0a030', letterSpacing: 2, flexShrink: 0,
        }}>
          SHANDALAR
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <div style={{
            width: 48, height: 6, background: 'rgba(255,255,255,.1)',
            borderRadius: 3, overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', borderRadius: 3,
              width: `${Math.max(0, (player.hp / player.maxHP) * 100)}%`,
              background: player.hp > player.maxHP * 0.5
                ? '#e05030' : player.hp > player.maxHP * 0.25 ? '#e09020' : '#c03020',
            }} />
          </div>
          <span style={{ fontSize: 10, color: '#c0a060', fontFamily: "'Cinzel',serif" }}>
            {player.hp}/{player.maxHP}
          </span>
        </div>

        <span style={{ fontSize: 10, color: '#c0a060', fontFamily: "'Cinzel',serif", flexShrink: 0 }}>
          {'\u{1F319}'}{player.gold}g
        </span>

        <span style={{ fontSize: 10, color: '#60c0ff', fontFamily: "'Cinzel',serif", flexShrink: 0 }}>
          {'\u{1F4A0}'}{player.gems ?? 0}
        </span>

        {activeDelivery && (
          <span style={{ fontSize: 9, color: '#c0a0f0', flexShrink: 0 }}>
            {'\u{1F4E6}'}
          </span>
        )}

        <div style={{ flex: 1 }} />

        <button
          onClick={() => setDrawerOpen(o => !o)}
          data-testid="ow-mobile-menu-btn"
          style={{
            background: 'rgba(255,255,255,.06)',
            border: '1px solid rgba(200,160,60,.3)',
            color: '#c0a040', borderRadius: 4,
            width: 32, height: 32,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', fontSize: 16, flexShrink: 0,
          }}
        >
          {drawerOpen ? '✕' : '☰'}
        </button>
      </div>

      {/* -- TILE STRIP (~24px) ---------------------------------------------- */}
      {(() => {
        const t = tiles[pos.y]?.[pos.x];
        if (!t) return null;
        let moveCost = t.terrain.moveC;
        if (t.terrain.id === 'MOUNTAIN' && hasDwarvenPick) moveCost = 1;
        if (t.terrain.id === 'SWAMP' && hasSwampwalk) moveCost = 1;
        if (hasBoots) moveCost = Math.max(1, moveCost - 1);
        const label =
          t.structure === 'TOWN'    ? t.townData?.name :
          t.structure === 'CASTLE'  ? `${t.castleData?.mage}'s Stronghold` :
          t.structure === 'DUNGEON' ? t.dungeonData?.name :
          t.structure === 'RUIN'    ? t.ruinData?.name :
          t.terrain.label;
        return (
          <div style={{
            height: 24, display: 'flex', alignItems: 'center',
            padding: '0 10px', gap: 8,
            background: 'rgba(0,0,0,.6)',
            borderBottom: '1px solid rgba(200,160,40,.1)',
            flexShrink: 0,
          }}>
            <span style={{ fontSize: 10, color: '#c0a060', fontFamily: "'Cinzel',serif", flex: 1 }}>
              {label}
            </span>
            <span style={{ fontSize: 9, color: '#6a5020' }}>
              Move: {moveCost}
            </span>
          </div>
        );
      })()}

      {/* -- MAP AREA (flex:1) ----------------------------------------------- */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}>
        <WorldMap
          tiles={tiles}
          playerPos={pos}
          viewport={{
            x: Math.max(0, Math.min(MAP_W - viewW, viewOfs.x - Math.floor(viewW / 2))),
            y: Math.max(0, Math.min(MAP_H - viewH, viewOfs.y - Math.floor(viewH / 2))),
          }}
          viewW={viewW}
          viewH={viewH}
          tileSize={tileSize}
          onTileClick={handleTileClick}
          canvasRef={canvasRef}
          enemies={enemies}
          playerAnim={animState.player}
          enemyAnim={animState.enemyFrame}
        />
        <ManaLinkAlert
          events={mlEvents}
          onRespond={handleRespondAlert}
          onDismiss={handleDismissAlert}
          isMobile={true}
        />
      </div>

      {/* -- QUICK-STAT BAR (~28px) ------------------------------------------ */}
      <div
        onClick={() => { setDrawerTab('mages'); setDrawerOpen(true); }}
        data-testid="ow-mobile-quickstat"
        style={{
          height: 28, display: 'flex', alignItems: 'center',
          padding: '0 10px', gap: 10,
          background: 'rgba(0,0,0,.75)',
          borderTop: '1px solid rgba(200,160,40,.15)',
          cursor: 'pointer', flexShrink: 0, overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <span style={{ fontSize: 9, color: '#8a6030', fontFamily: "'Cinzel',serif", flexShrink: 0 }}>
          MOVE {moves}
        </span>
        {['W','U','B','R','G'].map(c => {
          const count = manaLinks[c] || 0;
          const defeated = magesDefeated.includes(c);
          if (defeated) return null;
          return (
            <span key={c} style={{ fontSize: 11, flexShrink: 0 }}>
              {MANA_SYM_LOCAL[c]}
              <span style={{ fontSize: 8, color: count > 0 ? '#e06040' : '#3a3020' }}>
                {'●'.repeat(count)}{'○'.repeat(Math.max(0, 3 - count))}
              </span>
            </span>
          );
        })}
        {artifacts.filter(a => a.owned).map(a => (
          <span key={a.id} style={{ fontSize: 12, flexShrink: 0 }} title={a.name}>
            {a.icon}
          </span>
        ))}
      </div>

      {/* -- BOTTOM SHEET DRAWER --------------------------------------------- */}
      {drawerOpen && (
        <>
          <div
            onClick={() => setDrawerOpen(false)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)',
              zIndex: 300,
            }}
          />
          <div
            data-testid="ow-mobile-drawer"
            style={{
              position: 'fixed', bottom: 0, left: 0, right: 0,
              maxHeight: '70vh',
              background: 'linear-gradient(180deg,#0e0c08,#0a0a06)',
              border: '1px solid rgba(200,160,40,.2)',
              borderBottom: 'none',
              borderRadius: '12px 12px 0 0',
              zIndex: 301,
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Tab bar */}
            <div style={{
              display: 'flex', borderBottom: '1px solid rgba(200,160,40,.15)',
              flexShrink: 0,
            }}>
              {[
                { key: 'info',   label: 'Info'   },
                { key: 'mages',  label: 'Mages'  },
                { key: 'deck',   label: 'Deck'   },
                { key: 'magics', label: 'Magics' },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setDrawerTab(tab.key)}
                  data-testid={`ow-mobile-tab-${tab.key}`}
                  style={{
                    flex: 1, height: 36, border: 'none', cursor: 'pointer',
                    background: drawerTab === tab.key
                      ? 'rgba(200,160,40,.12)' : 'transparent',
                    borderBottom: drawerTab === tab.key
                      ? '2px solid #c0a040' : '2px solid transparent',
                    color: drawerTab === tab.key ? '#c0a040' : '#6a5020',
                    fontSize: 10, fontFamily: "'Cinzel',serif", letterSpacing: 1,
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
              {drawerTab === 'info'   && <DrawerInfo ctrl={ctrl} onQuit={onQuit} />}
              {drawerTab === 'mages'  && <DrawerMages ctrl={ctrl} />}
              {drawerTab === 'deck'   && <DrawerDeck ctrl={ctrl} />}
              {drawerTab === 'magics' && <DrawerMagics ctrl={ctrl} />}
            </div>
          </div>
        </>
      )}

      {/* -- MODALS ---------------------------------------------------------- */}

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
          manaLinkColor={activeTile.manaLink || null}
          onCounterAttack={handleCounterAttack}
          onLiberate={handleLiberate}
          worldMagics={worldMagics}
          totalWorldMagics={WORLD_MAGICS.length}
          onLearnWorldMagic={handleLearnWorldMagic}
          townQuestDef={
            (activeTile.townData.deliveryQuest && !activeTile.townData.deliveryQuest.completed)
              ? activeTile.townData.deliveryQuest
              : (activeTile.townData.questId ? QUESTS.find(q => q.id === activeTile.townData.questId) : null)
          }
          activeQuest={activeQuest}
          questProgress={questProgress}
          questComplete={questComplete}
          activeDelivery={activeDelivery}
          onQuestAccept={(quest) => {
            if (quest.conditionType === 'delivery') {
              setActiveDelivery({
                questId: quest.id,
                item: quest.item,
                destTownName: quest.destTownName,
                sourceTownName: activeTile.townData.name,
                rewardType: quest.rewardType,
                rewardGold: quest.rewardGold,
              });
              addLog(`Accepted: Deliver ${quest.item} to ${quest.destTownName}.`, 'info');
              setTiles(prev => {
                const n = prev.map(r => [...r]);
                n.forEach(row => row.forEach((t, xi) => {
                  if (t.townData?.name === activeTile.townData.name) {
                    n[t.y][xi] = { ...t, townData: { ...t.townData, deliveryQuest: { ...t.townData.deliveryQuest, accepted: true } } };
                  }
                }));
                return n;
              });
            } else {
              setActiveQuest(quest);
              setQuestProgress(0);
              setQuestComplete(false);
              addLog(`Quest accepted: ${quest.title}`, 'info');
            }
          }}
          onQuestAbandon={() => {
            setActiveQuest(null);
            setQuestProgress(0);
            setQuestComplete(false);
            addLog('Quest abandoned.', 'warn');
          }}
          onQuestClaim={() => {
            const reward = activeQuest?.reward;
            if (!reward) return;
            if (reward.type === 'gold') {
              setPlayer(p => ({ ...p, gold: p.gold + reward.amount }));
              addLog(`Received ${reward.amount}g.`, 'success');
            } else if (reward.type === 'card') {
              const card = CARD_DB.find(c => c.id === reward.cardId);
              if (card) {
                setBinder(b => [...b, { ...card, iid: Math.random().toString(36).slice(2, 9) }]);
                addLog(`Received ${card.name}!`, 'success');
              } else {
                console.error(`[Quest] Card not found in CARD_DB: "${reward.cardId}"`);
              }
            }
            setActiveQuest(null);
            setQuestComplete(false);
            setQuestProgress(0);
            addLog('Quest reward claimed!', 'success');
          }}
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

      {modal === 'ruin' && activeTile?.ruinData && (
        <RuinModal
          ruin={activeTile.ruinData}
          onClose={() => setModal(null)}
          onLoot={handleRuinLoot}
          onGuardianFight={handleRuinGuardianFight}
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
          worldMagics={worldMagics}
        />
      )}

      {encounterPopup && !duelCfg && (
        <PreDuelPopup
          popup={encounterPopup}
          player={player}
          anteEnabled={anteEnabled}
          worldMagics={worldMagics}
          isSandbox={isSandbox}
          onFight={() => {
            launchDuel(
              encounterPopup.oppArchKey,
              encounterPopup.overworldHP,
              encounterPopup.context,
              encounterPopup.castleMod,
              encounterPopup.extraData,
            );
            setEncounterPopup(null);
          }}
          onFlee={(cost) => {
            setPlayer(p => ({ ...p, gold: p.gold - cost }));
            addLog(`Paid ${cost}g to avoid the fight.`, 'warn');
            setEncounterPopup(null);
          }}
          onClose={() => {
            addLog('You withdraw from the encounter.', 'warn');
            setEncounterPopup(null);
          }}
        />
      )}

      {postDuelChoice && !duelCfg && (
        <PostDuelChoiceModal
          cardReward={postDuelChoice.cardReward}
          dungeonClue={postDuelChoice.dungeonClue}
          onTakeCard={() => {
            setBinder(b => [...b, postDuelChoice.cardReward]);
            addLog(`Added ${postDuelChoice.cardReward.name} to binder.`, 'success');
            setPostDuelChoice(null);
          }}
          onTakeClue={() => {
            if (postDuelChoice.dungeonClue) {
              setTiles(prev => {
                const n = prev.map(r => [...r]);
                n.forEach(row => row.forEach((t, xi) => {
                  if (t.dungeonData?.name === postDuelChoice.dungeonClue.name) {
                    n[t.y][xi] = { ...t, revealed: true, dungeonData: { ...t.dungeonData, clued: true } };
                  }
                }));
                return n;
              });
              addLog(`Dungeon revealed: ${postDuelChoice.dungeonClue.name}.`, 'event');
            }
            setPostDuelChoice(null);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DRAWER SUB-COMPONENTS
// ---------------------------------------------------------------------------

function DrawerInfo({ ctrl, onQuit }) {
  const {
    tiles, pos, hasDwarvenPick, hasSwampwalk, hasBoots,
    ruleset, setRuleset, anteEnabled, setAnteEnabled,
    foodEnabled, setFoodEnabled,
  } = ctrl;

  const t = tiles[pos.y]?.[pos.x];
  let moveCost = t?.terrain?.moveC ?? 1;
  if (t?.terrain?.id === 'MOUNTAIN' && hasDwarvenPick) moveCost = 1;
  if (t?.terrain?.id === 'SWAMP' && hasSwampwalk) moveCost = 1;
  if (hasBoots) moveCost = Math.max(1, moveCost - 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {t && (
        <div>
          <div style={{ fontSize: 9, color: '#8a6030', fontFamily: "'Cinzel',serif", marginBottom: 4, letterSpacing: 1 }}>
            CURRENT TILE
          </div>
          <div style={{ fontSize: 13, color: '#c0a060', fontFamily: "'Cinzel',serif" }}>
            {t.structure === 'TOWN'    ? t.townData?.name :
             t.structure === 'CASTLE'  ? `${t.castleData?.mage}'s Stronghold` :
             t.structure === 'DUNGEON' ? t.dungeonData?.name :
             t.structure === 'RUIN'    ? t.ruinData?.name :
             t.terrain.label}
          </div>
          <div style={{ fontSize: 10, color: '#6a5020', marginTop: 2 }}>
            Move cost: {moveCost}
          </div>
        </div>
      )}

      <div>
        <div style={{ fontSize: 9, color: '#8a6030', fontFamily: "'Cinzel',serif", marginBottom: 6, letterSpacing: 1 }}>
          LEGEND
        </div>
        {[
          ['\u{1F9D9}', 'You'],
          ['\u{1F3D8}️', 'Town'],
          ['⚔️', 'Dungeon'],
          ['\u{1F3F0}', 'Castle'],
          ['\u{1F3DB}️', 'Ruins'],
        ].map(([icon, label]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span style={{ fontSize: 14 }}>{icon}</span>
            <span style={{ fontSize: 11, color: '#a09060', fontFamily: "'Cinzel',serif" }}>{label}</span>
          </div>
        ))}
      </div>

      <div>
        <div style={{ fontSize: 9, color: '#8a6030', fontFamily: "'Cinzel',serif", marginBottom: 6, letterSpacing: 1 }}>
          SETTINGS
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div>
            <div style={{ fontSize: 9, color: '#8a6030', fontFamily: "'Cinzel',serif", marginBottom: 3 }}>
              RULESET
            </div>
            <select
              value={ruleset.id}
              onChange={e => setRuleset(RULESETS[e.target.value])}
              style={{
                background: '#1a1208', border: '1px solid rgba(200,160,60,.3)',
                color: '#c0a040', borderRadius: 4, padding: '4px 8px',
                fontSize: 11, fontFamily: "'Cinzel',serif", cursor: 'pointer',
                width: '100%',
              }}
            >
              {Object.values(RULESETS).map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox" checked={anteEnabled}
              onChange={e => setAnteEnabled(e.target.checked)}
              style={{ accentColor: '#c0a040', width: 16, height: 16 }}
            />
            <span style={{ fontSize: 11, color: '#c0a040', fontFamily: "'Cinzel',serif" }}>Ante</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox" checked={foodEnabled}
              onChange={e => setFoodEnabled(e.target.checked)}
              style={{ accentColor: '#c0a040', width: 16, height: 16 }}
            />
            <span style={{ fontSize: 11, color: '#c0a040', fontFamily: "'Cinzel',serif" }}>
              {'\u{1F356}'} Food
            </span>
          </label>
        </div>
      </div>

      <button
        onClick={onQuit}
        style={{
          background: 'transparent', border: '1px solid rgba(180,80,40,.4)',
          color: '#a06040', padding: '8px', borderRadius: 5,
          cursor: 'pointer', fontSize: 11, fontFamily: "'Cinzel',serif",
          width: '100%',
        }}
      >
        {'\u{1F6AA}'} Quit
      </button>
    </div>
  );
}

function DrawerMages({ ctrl }) {
  const { manaLinks, magesDefeated } = ctrl;
  const MAGE_DATA = [
    { color: 'W', icon: '☀️', name: 'Delenia'  },
    { color: 'U', icon: '\u{1F4A7}',    name: 'Xylos'    },
    { color: 'B', icon: '\u{1F480}',    name: 'Mortis'   },
    { color: 'R', icon: '\u{1F525}',    name: 'Karag'    },
    { color: 'G', icon: '\u{1F33F}',    name: 'Sylvara'  },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 9, color: '#8a6030', fontFamily: "'Cinzel',serif", letterSpacing: 1 }}>
        FIVE MAGES
      </div>
      {MAGE_DATA.map(({ color, icon, name }) => {
        const links = manaLinks[color] || 0;
        const defeated = magesDefeated.includes(color);
        return (
          <div key={color} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>{icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: defeated ? '#6a8060' : '#c0a060', fontFamily: "'Cinzel',serif" }}>
                {name} {defeated ? '(Defeated)' : ''}
              </div>
              {!defeated && (
                <div style={{ display: 'flex', gap: 3, marginTop: 2 }}>
                  {[0,1,2,3,4].map(i => (
                    <div key={i} style={{
                      width: 10, height: 10, borderRadius: 2,
                      background: i < links ? '#e06040' : 'rgba(255,255,255,.08)',
                      border: '1px solid rgba(255,255,255,.1)',
                    }} />
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DrawerDeck({ ctrl }) {
  const { deck, binder, setModal } = ctrl;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 9, color: '#8a6030', fontFamily: "'Cinzel',serif", letterSpacing: 1 }}>
          DECK ({deck.length})
        </div>
        <button
          onClick={() => setModal('deck')}
          style={{
            background: 'rgba(200,160,40,.1)', border: '1px solid rgba(200,160,40,.3)',
            color: '#c0a040', padding: '3px 10px', borderRadius: 4,
            cursor: 'pointer', fontSize: 9, fontFamily: "'Cinzel',serif",
          }}
        >
          Manage
        </button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
        {deck.slice(0, 12).map((c, i) => (
          <div key={i} style={{
            background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)',
            borderRadius: 3, padding: '2px 6px', fontSize: 9, color: '#a09060',
          }} title={c.name}>
            {c.name.slice(0, 12)}
          </div>
        ))}
        {deck.length > 12 && (
          <div style={{ fontSize: 9, color: '#6a5020', padding: '2px 4px' }}>
            +{deck.length - 12}
          </div>
        )}
      </div>
      <div style={{ fontSize: 9, color: '#8a6030', fontFamily: "'Cinzel',serif", letterSpacing: 1 }}>
        BINDER ({binder.length})
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
        {binder.slice(-10).map((c, i) => (
          <div key={i} style={{
            width: 11, height: 15, borderRadius: 1,
            background: '#888', opacity: 0.7,
          }} title={c.name} />
        ))}
        {binder.length > 10 && (
          <div style={{ fontSize: 8, color: '#6a5020' }}>+{binder.length - 10}</div>
        )}
      </div>
    </div>
  );
}

function DrawerMagics({ ctrl }) {
  const { worldMagics, wmCooldowns, player, handleActivateWorldMagic } = ctrl;
  return (
    <WorldMagicPanel
      worldMagics={worldMagics}
      wmCooldowns={wmCooldowns}
      player={player}
      onActivate={handleActivateWorldMagic}
    />
  );
}
