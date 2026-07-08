// src/ui/Mobile/OverworldGameMobile.jsx
// Compact mobile overworld layout (<= 640px). Receives ctrl prop from OverworldGame.jsx.
// Local state: drawerOpen, drawerTab. No game logic here.
// Theme mirrors OverworldGameDesktop.jsx's gilded dark-fantasy styling.

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
  W: '\u{2600}\u{FE0F}',
  U: '\u{1F4A7}',
  B: '\u{1F480}',
  R: '\u{1F525}',
  G: '\u{1F33F}',
};

const OW_MOBILE_THEME_STYLES = `
  .ow-mobile-root {
    height: 100dvh;
    width: 100vw;
    background-color: #0a0e08;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    font-family: 'Crimson Text', serif;
  }

  .game-over-screen {
    position: fixed;
    inset: 0;
    background: rgba(5, 3, 2, 0.95);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 6000;
    flex-direction: column;
    gap: 12px;
    backdrop-filter: blur(4px);
  }
  .game-over-title {
    font-size: 22px;
    font-family: 'Cinzel', serif;
    color: #e04040;
    letter-spacing: 2px;
    text-shadow: 0 0 10px rgba(224, 64, 64, 0.4);
  }
  .game-over-subtitle {
    font-size: 12px;
    color: #a06040;
    font-style: italic;
  }

  .arzakon-ready-screen {
    position: fixed;
    inset: 0;
    background: rgba(5, 3, 2, 0.9);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 5000;
    flex-direction: column;
    gap: 16px;
    backdrop-filter: blur(3px);
  }
  .arzakon-ready-title {
    font-size: 20px;
    font-family: 'Cinzel', serif;
    color: #e0c040;
    letter-spacing: 1px;
    text-shadow: 0 0 12px rgba(224, 192, 64, 0.3);
  }
  .arzakon-ready-desc {
    font-size: 13px;
    color: #c0a060;
    font-style: italic;
    text-align: center;
    max-width: 320px;
  }
  .arzakon-btn-charge {
    background: linear-gradient(135deg, #2a0808, #5a1010);
    border: 2px solid rgba(200, 60, 40, 0.6);
    color: #ff8060;
    padding: 12px 24px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 15px;
    font-family: 'Cinzel', serif;
    letter-spacing: 2px;
    box-shadow: 0 0 25px rgba(200, 40, 20, 0.5);
    transition: transform 0.2s ease-in-out, filter 0.2s ease-in-out;
  }
  .arzakon-btn-charge:hover {
    filter: brightness(1.2);
    transform: scale(1.02);
  }
  .arzakon-btn-defer {
    background: transparent;
    border: 1px solid rgba(160, 120, 60, 0.3);
    color: #806040;
    padding: 8px 20px;
    border-radius: 5px;
    cursor: pointer;
    font-size: 12px;
    font-family: 'Cinzel', serif;
    transition: background 0.2s;
  }
  .arzakon-btn-defer:hover {
    background: rgba(160, 120, 60, 0.05);
  }

  .ow-mobile-topbar {
    height: 44px;
    display: flex;
    align-items: center;
    padding: 0 10px;
    gap: 8px;
    background: rgba(10, 12, 8, 0.9);
    border-bottom: 2px solid rgba(212, 175, 55, 0.25);
    backdrop-filter: blur(5px);
    flex-shrink: 0;
  }
  .ow-mobile-title {
    font-family: 'Cinzel Decorative', serif;
    font-size: 11px;
    color: #d0a030;
    letter-spacing: 2px;
    flex-shrink: 0;
  }
  .ow-mobile-hp-bar {
    width: 48px;
    height: 8px;
    background: #140d09;
    border-radius: 3px;
    border: 1px solid #3d2311;
    overflow: hidden;
    box-shadow: inset 0 1px 3px rgba(0,0,0,0.6);
  }
  .ow-mobile-menu-btn {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(200, 160, 60, 0.35);
    color: #c0a040;
    border-radius: 4px;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 16px;
    flex-shrink: 0;
    transition: background 0.15s;
  }
  .ow-mobile-menu-btn:hover {
    background: rgba(200, 160, 60, 0.1);
  }

  .ow-mobile-tilestrip {
    height: 24px;
    display: flex;
    align-items: center;
    padding: 0 10px;
    gap: 8px;
    background: rgba(10, 12, 8, 0.65);
    border-bottom: 1px solid rgba(212, 175, 55, 0.1);
    flex-shrink: 0;
  }

  .ow-mobile-quickstat {
    height: 28px;
    display: flex;
    align-items: center;
    padding: 0 10px;
    gap: 10px;
    background: rgba(10, 12, 8, 0.85);
    border-top: 1px solid rgba(212, 175, 55, 0.15);
    cursor: pointer;
    flex-shrink: 0;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .ow-mobile-drawer-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 300;
  }
  .ow-mobile-drawer {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    max-height: 70vh;
    background: linear-gradient(180deg, #14110c 0%, #0a0907 100%);
    border: 1px solid #362e1e;
    border-bottom: none;
    border-radius: 12px 12px 0 0;
    z-index: 301;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.75);
  }
  .ow-mobile-drawer-tabs {
    display: flex;
    border-bottom: 1px solid rgba(212, 175, 55, 0.15);
    flex-shrink: 0;
  }
  .ow-mobile-drawer-tab {
    flex: 1;
    height: 36px;
    border: none;
    cursor: pointer;
    font-size: 10px;
    font-family: 'Cinzel', serif;
    letter-spacing: 1px;
    transition: background 0.15s;
  }
  .ow-mobile-drawer-content {
    flex: 1;
    overflow-y: auto;
    padding: 10px 12px;
  }

  .ow-mobile-quit-btn {
    background: transparent;
    border: 1px solid rgba(180, 80, 40, 0.4);
    color: #a06040;
    padding: 8px;
    border-radius: 5px;
    cursor: pointer;
    font-size: 11px;
    font-family: 'Cinzel', serif;
    width: 100%;
    transition: background 0.15s;
  }
  .ow-mobile-quit-btn:hover {
    background: rgba(180, 80, 40, 0.1);
  }

  .ow-mobile-manage-btn {
    background: rgba(200, 160, 40, 0.1);
    border: 1px solid rgba(200, 160, 40, 0.3);
    color: #c0a040;
    padding: 3px 10px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 9px;
    font-family: 'Cinzel', serif;
    transition: background 0.15s;
  }
  .ow-mobile-manage-btn:hover {
    background: rgba(200, 160, 40, 0.2);
  }
`;

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
    <div className="ow-mobile-root">
      <style>{OW_MOBILE_THEME_STYLES}</style>

      {/* -- GAME-LOSS OVERLAY ----------------------------------------------- */}
      {(gameLost || conquestLost) && (
        <div className="game-over-screen">
          <div style={{ fontSize: 40 }}>{'\u{1F480}'}</div>
          <div className="game-over-title">The Plane Falls</div>
          <div className="game-over-subtitle">
            {conquestLost && !gameLost
              ? "Arzakon's armies have overrun Shandalar's towns--"
              : "Arzakon's mana links have consumed Shandalar--"}
          </div>
        </div>
      )}

      {/* -- ARZAKON READY OVERLAY ------------------------------------------- */}
      {arzakonReady && (
        <div className="arzakon-ready-screen">
          <div style={{ fontSize: 36 }}>{'\u{1F3C6}'}</div>
          <div className="arzakon-ready-title">All Five Mages Defeated!</div>
          <div className="arzakon-ready-desc">
            Arzakon himself rises to defend the conquered plane. The final battle awaits.
          </div>
          <button onClick={launchArzakon} className="arzakon-btn-charge">
            {'\u{26A1}'} Face Arzakon
          </button>
          <button onClick={() => {/* dismiss */}} className="arzakon-btn-defer">
            Prepare further--
          </button>
        </div>
      )}

      {/* -- TOPBAR ------------------------------------------------------------ */}
      <div className="ow-mobile-topbar">
        <span className="ow-mobile-title">SHANDALAR</span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <div className="ow-mobile-hp-bar">
            <div style={{
              height: '100%', borderRadius: 3,
              width: `${Math.max(0, (player.hp / player.maxHP) * 100)}%`,
              background: player.hp > player.maxHP * 0.5
                ? 'linear-gradient(90deg, #992211 0%, #d63622 100%)'
                : 'linear-gradient(90deg, #590a0a 0%, #991111 100%)',
              transition: 'width .4s ease-in-out',
            }} />
          </div>
          <span style={{ fontSize: 10, color: '#e07c5e', fontFamily: "'Cinzel',serif" }}>
            {player.hp}/{player.maxHP}
          </span>
        </div>

        <span style={{ fontSize: 10, color: '#e5b842', fontFamily: "'Cinzel',serif", flexShrink: 0 }}>
          {'\u{1FA99}'}{player.gold}g
        </span>

        <span style={{ fontSize: 10, color: '#b396f0', fontFamily: "'Cinzel',serif", flexShrink: 0 }}>
          {'\u{1F48E}'}{player.gems ?? 0}
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
          className="ow-mobile-menu-btn"
        >
          {drawerOpen ? '\u{2715}' : '\u{2630}'}
        </button>
      </div>

      {/* -- TILE STRIP -------------------------------------------------------- */}
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
          <div className="ow-mobile-tilestrip">
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

      {/* -- QUICK-STAT BAR ---------------------------------------------------- */}
      <div
        onClick={() => { setDrawerTab('mages'); setDrawerOpen(true); }}
        data-testid="ow-mobile-quickstat"
        className="ow-mobile-quickstat"
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
                {'\u{25CF}'.repeat(count)}{'\u{25CB}'.repeat(Math.max(0, 3 - count))}
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
            className="ow-mobile-drawer-backdrop"
          />
          <div
            data-testid="ow-mobile-drawer"
            className="ow-mobile-drawer"
          >
            {/* Tab bar */}
            <div className="ow-mobile-drawer-tabs">
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
                  className="ow-mobile-drawer-tab"
                  style={{
                    background: drawerTab === tab.key
                      ? 'rgba(200,160,40,.12)' : 'transparent',
                    borderBottom: drawerTab === tab.key
                      ? '2px solid #c0a040' : '2px solid transparent',
                    color: drawerTab === tab.key ? '#c0a040' : '#6a5020',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="ow-mobile-drawer-content">
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
          ['\u{1F3D8}\u{FE0F}', 'Town'],
          ['\u{2694}\u{FE0F}', 'Dungeon'],
          ['\u{1F3F0}', 'Castle'],
          ['\u{1F3DB}\u{FE0F}', 'Ruins'],
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
                background: '#14120e', border: '1px solid rgba(200,160,60,.35)',
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

      <button onClick={onQuit} className="ow-mobile-quit-btn">
        {'\u{1F6AA}'} Quit
      </button>
    </div>
  );
}

function DrawerMages({ ctrl }) {
  const { manaLinks, magesDefeated } = ctrl;
  const MAGE_DATA = [
    { color: 'W', icon: '\u{2600}\u{FE0F}', name: 'Delenia'  },
    { color: 'U', icon: '\u{1F4A7}',        name: 'Xylos'    },
    { color: 'B', icon: '\u{1F480}',        name: 'Mortis'   },
    { color: 'R', icon: '\u{1F525}',        name: 'Karag'    },
    { color: 'G', icon: '\u{1F33F}',        name: 'Sylvara'  },
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
        <button onClick={() => setModal('deck')} className="ow-mobile-manage-btn">
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
            background: '#504838', opacity: 0.9,
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
