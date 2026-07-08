// src/ui/overworld/OverworldGameDesktop.jsx
// Desktop overworld layout (> 640px). Receives ctrl prop from OverworldGame.jsx.
// No game state declared here. No handlers declared here.

import React from 'react';
import { WorldMap, HUDBar, MapLegend, MageStatusPanel, ManaLinkAlert } from './WorldMap.jsx';
import { TownModal, DungeonModal, CastleModal, DeckManager, RuinModal } from './EncounterModal.jsx';
import PreDuelPopup from './PreDuelPopup.jsx';
import PostDuelChoiceModal from './PostDuelChoiceModal.jsx';
import WorldMagicPanel from './WorldMagicPanel.jsx';
import { DuelLog as OWLog } from '../layout/TechnicalLog.jsx';
import { MAP_W, MAP_H, WORLD_MAGICS, MAGE_NAMES, TERRAIN } from '../../engine/MapGenerator.js';
import { CARD_DB } from '../../data/cards.js';
import RULESETS from '../../data/rulesets.js';

const OW_DESKTOP_THEME_STYLES = `
  /* Master Layout Container */
  .ow-desktop-root {
    height: 100dvh;
    width: 100vw;
    background-color: #0a0e08;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    font-family: 'Crimson Text', serif;
  }

  /* Critical Overlay Systems */
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
    font-size: 26px;
    font-family: 'Cinzel', serif;
    color: #e04040;
    letter-spacing: 2px;
    text-shadow: 0 0 10px rgba(224, 64, 64, 0.4);
  }
  .game-over-subtitle {
    font-size: 13px;
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
    font-size: 24px;
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
    max-width: 360px;
  }
  .arzakon-btn-charge {
    background: linear-gradient(135deg, #2a0808, #5a1010);
    border: 2px solid rgba(200, 60, 40, 0.6);
    color: #ff8060;
    padding: 14px 32px;
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

  /* Toolbar Shell & Quick Tactics */
  .ow-toolbar {
    flex-shrink: 0;
    padding: 6px 12px;
    border-bottom: 2px solid rgba(212, 175, 55, 0.25);
    background: rgba(10, 12, 8, 0.85);
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    overflow-x: visible;
    backdrop-filter: blur(5px);
  }
  .ow-toolbar-title {
    font-size: 13px;
    font-family: 'Cinzel Decorative', serif;
    color: #d0a030;
    letter-spacing: 2px;
  }
  .ow-toolbar-select {
    background: #14120e;
    border: 1px solid rgba(200, 160, 60, 0.35);
    color: #c0a040;
    border-radius: 4px;
    padding: 2px 6px;
    font-size: 11px;
    font-family: 'Cinzel', serif;
    cursor: pointer;
    outline: none;
  }
  .ow-toolbar-label {
    display: flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
    user-select: none;
    font-size: 11px;
    color: #c0a040;
    font-family: 'Cinzel', serif;
  }
  .ow-dpad-btn {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(200, 160, 60, 0.25);
    color: #c0a040;
    width: 24px;
    height: 24px;
    border-radius: 3px;
    cursor: pointer;
    font-size: 11px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s;
  }
  .ow-dpad-btn:hover {
    background: rgba(200, 160, 60, 0.1);
  }
  .ow-utility-btn {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(200, 160, 60, 0.3);
    color: #c0a040;
    padding: 3px 10px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 10px;
    font-family: 'Cinzel', serif;
    transition: background 0.15s;
  }
  .ow-utility-btn:hover {
    background: rgba(200, 160, 60, 0.1);
  }
  .ow-deck-btn {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(212, 175, 55, 0.4);
    color: #f0c040;
    padding: 3px 10px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 10px;
    font-family: 'Cinzel', serif;
    box-shadow: 0 0 8px rgba(240, 192, 64, 0.1);
  }
  .ow-deck-btn:hover {
    background: rgba(240, 192, 64, 0.1);
  }
  .ow-toolbar-right {
    margin-left: auto;
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .ow-sandbox-badge {
    font-size: 9px;
    color: #60c0ff;
    font-family: 'Cinzel', serif;
    background: rgba(0, 60, 120, 0.45);
    border: 1px solid rgba(60, 120, 200, 0.4);
    border-radius: 3px;
    padding: 2px 7px;
    letter-spacing: 1px;
  }
  .ow-quit-btn {
    background: transparent;
    border: 1px solid rgba(180, 80, 40, 0.35);
    color: #a06040;
    padding: 3px 10px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 10px;
    font-family: 'Cinzel', serif;
    transition: background 0.15s;
  }
  .ow-quit-btn:hover {
    background: rgba(180, 80, 40, 0.1);
  }

  /* Active Missions Bar */
  .ow-delivery-banner {
    padding: 5px 12px;
    background: rgba(45, 20, 80, 0.45);
    border-bottom: 1px solid rgba(150, 80, 200, 0.3);
    font-size: 11px;
    color: #c0a0f0;
    font-family: 'Cinzel', serif;
    letter-spacing: 0.5px;
    flex-shrink: 0;
  }

  /* Main Workspace Setup */
  .ow-workspace {
    flex: 1;
    display: flex;
    overflow: hidden;
    height: 0;
  }
  .ow-map-viewport {
    flex: 1;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    min-height: 0;
    height: 100%;
  }
  .ow-map-canvas-frame {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  /* Tactical Sidebar Modules */
  .ow-sidebar {
    width: clamp(170px, 22vw, 220px);
    border-left: 2px solid rgba(180, 140, 60, 0.25);
    display: flex;
    flex-direction: column;
    background: linear-gradient(180deg, #0a0805, #050503);
    flex-shrink: 0;
    overflow: hidden;
  }
  .ow-sidebar-panel {
    padding: 10px 12px;
    border-bottom: 1px solid rgba(212, 175, 55, 0.15);
    flex-shrink: 0;
  }
  .ow-sidebar-hdr {
    font-size: 10px;
    color: #8a6030;
    font-family: 'Cinzel', serif;
    margin-bottom: 5px;
    letter-spacing: 1px;
  }
  .ow-tile-name {
    font-size: 13px;
    color: #c0a060;
    font-family: 'Cinzel', serif;
  }
  .ow-tile-cost {
    font-size: 10px;
    color: #6a5020;
    margin-top: 3px;
  }
  .ow-mini-card-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    margin-bottom: 6px;
  }
  .ow-mini-card {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 3px;
    padding: 2px 5px;
    font-size: 8px;
    color: #a09060;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ow-mini-card-pip {
    width: 9px;
    height: 13px;
    border-radius: 1px;
    background: #504838;
    border: 1px solid rgba(255,255,255,0.05);
  }
  .ow-chronicle-header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 2px 12px 6px;
  }

  @media (max-width: 600px) {
    .ow-toolbar {
      flex-wrap: wrap;
      gap: 4px 8px;
      padding: 4px 8px;
    }
    .ow-toolbar-title {
      font-size: 14px;
      letter-spacing: 0.05em;
    }
    .ow-toolbar-select {
      font-size: 10px;
      padding: 2px 4px;
      max-width: 130px;
    }
    .ow-toolbar-right {
      flex-shrink: 1;
      gap: 6px;
    }
  }
`;

export default function OverworldGameDesktop({ ctrl, onQuit }) {
  const {
    tiles, pos, moves, player, deck, binder, artifacts,
    worldMagics, wmCooldowns, manaLinks, magesDefeated, mlEvents,
    activeQuest, questProgress, questComplete, activeDelivery,
    encounterPopup, postDuelChoice,
    ruleset, setRuleset, anteEnabled, setAnteEnabled, foodEnabled, setFoodEnabled,
    modal, setModal, activeTile, setActiveTile, log,
    viewOfs, enemies, animState,
    hasBoots, hasDwarvenPick, hasSwampwalk, hasStone,
    arzakonReady, gameLost, conquestLost, isSandbox, duelCfg,
    viewW, viewH, tileSize,
    canvasRef, playerAnimRef,
    addLog,
    handleTileClick, handleCenterPlayer,
    handleRespondAlert, handleDismissAlert,
    handleBuy, handleSell, handleRest, handleSage, handleTrade, handleGemBuy,
    handleActivateWorldMagic, handleLearnWorldMagic,
    handleRuinLoot, handleRuinGuardianFight,
    handleEnterDungeon,
    handleChallenge, handleCounterAttack, handleLiberate,
    handleSwap, handleMoveToDeck, handleMoveToBinder,
    launchDuel, launchArzakon,
    setEncounterPopup, setPostDuelChoice,
    setTiles, setDeck, setBinder, setPlayer,
    setActiveQuest, setQuestProgress, setQuestComplete, setActiveDelivery,
    QUESTS,
    doMove,
  } = ctrl;

  const handleDpadDir = (dir) => {
    const dx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
    const dy = dir === 'up'   ? -1 : dir === 'down'  ? 1 : 0;
    const nx = pos.x + dx;
    const ny = pos.y + dy;
    const target = tiles[ny]?.[nx];
    if (!target || target.terrain === TERRAIN.WATER) return;
    playerAnimRef.current = { ...playerAnimRef.current, dir, moving: true };
    doMove(nx, ny);
    setTimeout(() => {
      playerAnimRef.current = { ...playerAnimRef.current, moving: false };
    }, 200);
  };

  return (
    <div className="ow-desktop-root">
      <style>{OW_DESKTOP_THEME_STYLES}</style>

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
          <button onClick={() => {/* dismiss to keep playing */}} className="arzakon-btn-defer">
            Prepare further--
          </button>
        </div>
      )}

      {/* -- TOP BAR TOOLBAR ------------------------------------------------- */}
      <div className="ow-toolbar" data-testid="ow-desktop-toolbar">
        <span className="ow-toolbar-title">SHANDALAR</span>

        <div>
          <select
            className="ow-toolbar-select"
            value={ruleset.id}
            onChange={e => setRuleset(RULESETS[e.target.value])}
          >
            {Object.values(RULESETS).map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>

        <label className="ow-toolbar-label">
          <input
            type="checkbox"
            checked={anteEnabled}
            onChange={e => setAnteEnabled(e.target.checked)}
            style={{ accentColor: '#c0a040' }}
          />
          <span>Ante</span>
        </label>

        <label className="ow-toolbar-label">
          <input
            type="checkbox"
            checked={foodEnabled}
            onChange={e => setFoodEnabled(e.target.checked)}
            style={{ accentColor: '#c0a040' }}
          />
          <span>{'\u{1F356}'} Food</span>
        </label>

        {['up','left','down','right'].map(d => (
          <button key={d} onClick={() => handleDpadDir(d)} className="ow-dpad-btn">
            {d === 'up' ? '\u{25B2}' : d === 'down' ? '\u{25BC}' : d === 'left' ? '\u{25C0}' : '\u{25B6}'}
          </button>
        ))}

        <button onClick={handleCenterPlayer} className="ow-utility-btn">
          {'\u{1F3AF}'} Center
        </button>

        <button onClick={() => setModal('deck')} className="ow-deck-btn">
          {'\u{1F0CF}'} Deck ({deck.length})
        </button>

        <div className="ow-toolbar-right">
          {isSandbox && <div className="ow-sandbox-badge">{'\u{1F9EA}'} SANDBOX</div>}
          <button onClick={onQuit} className="ow-quit-btn">
            {'\u{1F6AA}'} Quit
          </button>
        </div>
      </div>

      {/* -- HUD BAR --------------------------------------------------------- */}
      <HUDBar
        player={player}
        manaLinks={manaLinks}
        magesDefeated={magesDefeated}
        artifacts={artifacts}
        moves={moves}
      />

      {/* -- DELIVERY BANNER ------------------------------------------------- */}
      {activeDelivery && (
        <div className="ow-delivery-banner">
          {'\u{1F4E6}'} Delivering: {activeDelivery.item} {'\u{2192}'} {activeDelivery.destTownName}
        </div>
      )}

      {/* -- MAIN CONTENT WORKSPACE ------------------------------------------ */}
      <div className="ow-workspace">

        {/* -- MAP VIEWPORT -------------------------------------------------- */}
        <div className="ow-map-viewport">
          <div className="ow-map-canvas-frame">
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
          </div>
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
            isMobile={false}
          />
        </div>

        {/* -- RIGHT SIDEBAR -------------------------------------------------- */}
        <div
          data-testid="ow-right-sidebar"
          className="ow-sidebar"
          style={{ display: log.length > 0 ? 'flex' : 'none' }}
        >
          {/* Current tile module */}
          <div className="ow-sidebar-panel">
            <div className="ow-sidebar-hdr">CURRENT TILE</div>
            {(() => {
              const t = tiles[pos.y]?.[pos.x];
              if (!t) return null;
              return (
                <div>
                  <div className="ow-tile-name">
                    {t.structure === 'TOWN'   ? t.townData?.name :
                     t.structure === 'CASTLE' ? `${t.castleData?.mage}'s stronghold` :
                     t.structure === 'DUNGEON'? t.dungeonData?.name :
                     t.structure === 'RUIN'   ? t.ruinData?.name :
                     t.terrain.label}
                  </div>
                  <div className="ow-tile-cost">
                    {(() => {
                      let c = t.terrain.moveC;
                      if (t.terrain.id === 'MOUNTAIN' && hasDwarvenPick) c = 1;
                      if (t.terrain.id === 'SWAMP' && hasSwampwalk) c = 1;
                      if (hasBoots) c = Math.max(1, c - 1);
                      return `Move cost: ${c}`;
                    })()}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Deck preview module */}
          <div className="ow-sidebar-panel">
            <div className="ow-sidebar-hdr">DECK ({deck.length})</div>
            <div className="ow-mini-card-grid">
              {deck.slice(0, 10).map((c, i) => (
                <div key={i} className="ow-mini-card" title={c.name}>
                  {c.name.slice(0, 10)}
                </div>
              ))}
              {deck.length > 10 && <div style={{ fontSize: 8, color: '#6a5020' }}>+{deck.length - 10}...</div>}
            </div>
            <div className="ow-sidebar-hdr" style={{ marginBottom: 4 }}>BINDER ({binder.length})</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
              {binder.slice(-8).map((c, i) => (
                <div key={i} className="ow-mini-card-pip" title={c.name} />
              ))}
              {binder.length > 8 && <div style={{ fontSize: 8, color: '#6a5020' }}>+{binder.length - 8}</div>}
            </div>
          </div>

          {/* World Magic Panel */}
          <WorldMagicPanel
            worldMagics={worldMagics}
            wmCooldowns={wmCooldowns}
            player={player}
            onActivate={handleActivateWorldMagic}
          />

          {/* Chronicle log */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '6px 0' }}>
            <div className="ow-chronicle-header-row">
              <div className="ow-sidebar-hdr" style={{ margin: 0 }}>CHRONICLE</div>
              <button
                onClick={() => {
                  const text = log.map(e => e.text).join('\n');
                  navigator.clipboard.writeText(text).catch(() => addLog('Clipboard unavailable.', 'warn'));
                }}
                className="ow-utility-btn"
                style={{ padding: '2px 7px', fontSize: 9 }}
                title="Copy chronicle to clipboard"
              >
                {'\u{1F4CB}'}
              </button>
            </div>
            <OWLog log={log} />
          </div>
        </div>
      </div>

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
