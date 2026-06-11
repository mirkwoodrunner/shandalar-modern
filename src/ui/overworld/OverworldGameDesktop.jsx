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

const OW_TOOLBAR_STYLES = `
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
  .ow-toolbar-ruleset select {
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
    viewOfs, enemies,
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
    <div style={{
      height: '100dvh', width: '100vw',
      background: '#0a0e08',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
      fontFamily: "'Crimson Text', serif",
    }}>
      <style>{OW_TOOLBAR_STYLES}</style>

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
            {'⚡'} Face Arzakon
          </button>
          <button
            onClick={() => {/* dismiss to keep playing */}}
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

      {/* -- TOP BAR --------------------------------------------------------- */}
      <div
        className="ow-toolbar"
        data-testid="ow-desktop-toolbar"
        style={{
          flexShrink: 0,
          padding: '6px 12px',
          borderBottom: '2px solid rgba(200,160,40,.3)',
          background: 'rgba(0,0,0,.7)',
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          overflowX: 'visible',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <span className="ow-toolbar-title" style={{ fontSize: 13, fontFamily: "'Cinzel Decorative',serif", color: '#d0a030', letterSpacing: 2 }}>
          SHANDALAR
        </span>

        <div className="ow-toolbar-ruleset">
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
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={anteEnabled}
            onChange={e => setAnteEnabled(e.target.checked)}
            style={{ accentColor: '#c0a040' }}
          />
          <span style={{ fontSize: 10, color: '#c0a040', fontFamily: "'Cinzel',serif" }}>Ante</span>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={foodEnabled}
            onChange={e => setFoodEnabled(e.target.checked)}
            style={{ accentColor: '#c0a040' }}
          />
          <span style={{ fontSize: 10, color: '#c0a040', fontFamily: "'Cinzel',serif" }}>{'\u{1F356}'} Food</span>
        </label>

        {['up','left','down','right'].map(d => (
          <button key={d}
            onClick={() => handleDpadDir(d)}
            style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(200,160,60,.2)', color: '#c0a040', width: 22, height: 22, borderRadius: 3, cursor: 'pointer', fontSize: 11 }}>
            {d === 'up' ? '▲' : d === 'down' ? '▼' : d === 'left' ? '◀' : '▶'}
          </button>
        ))}
        <button onClick={handleCenterPlayer}
          style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(200,160,60,.2)', color: '#c0a040', padding: '2px 8px', borderRadius: 3, cursor: 'pointer', fontSize: 10, fontFamily: "'Cinzel',serif" }}>
          {'\u{1F3AF}'} Center
        </button>

        <button onClick={() => setModal('deck')}
          style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(200,160,60,.3)', color: '#f0c040', padding: '3px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 10, fontFamily: "'Cinzel',serif" }}>
          {'\u{1F0CF}'} Deck ({deck.length})
        </button>

        <div className="ow-toolbar-right" style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          {isSandbox && (
            <div style={{
              fontSize: 9,
              color: '#60c0ff',
              fontFamily: "'Cinzel',serif",
              background: 'rgba(0,60,120,.4)',
              border: '1px solid rgba(60,120,200,.4)',
              borderRadius: 3,
              padding: '2px 7px',
              letterSpacing: 1,
            }}>
              {'\u{1F9EA}'} SANDBOX
            </div>
          )}
          <button onClick={onQuit}
            style={{ background: 'transparent', border: '1px solid rgba(180,80,40,.3)', color: '#a06040', padding: '3px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 10, fontFamily: "'Cinzel',serif" }}>
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
        <div style={{
          padding: '4px 12px',
          background: 'rgba(50,20,90,.5)',
          borderBottom: '1px solid rgba(150,80,200,.35)',
          fontSize: 11,
          color: '#c0a0f0',
          fontFamily: "'Cinzel',serif",
          letterSpacing: 0.5,
          flexShrink: 0,
        }}>
          {'\u{1F4E6}'} Delivering: {activeDelivery.item} {'→'} {activeDelivery.destTownName}
        </div>
      )}

      {/* -- MAIN CONTENT ---------------------------------------------------- */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', height: 0 }}>

        {/* -- MAP ----------------------------------------------------------- */}
        <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', minHeight: 0, height: '100%' }}>
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
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
          style={{
            width: 'clamp(160px,22vw,210px)',
            borderLeft: '2px solid rgba(180,140,60,.25)',
            display: log.length > 0 ? 'flex' : 'none', flexDirection: 'column',
            background: 'linear-gradient(180deg,#0e0c08,#0a0a08)',
            flexShrink: 0, overflow: 'hidden',
          }}
        >
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
                     t.structure === 'RUIN'   ? t.ruinData?.name :
                     t.terrain.label}
                  </div>
                  <div style={{ fontSize: 10, color: '#6a5020', marginTop: 3 }}>
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

          {/* World Magic Panel */}
          <WorldMagicPanel
            worldMagics={worldMagics}
            wmCooldowns={wmCooldowns}
            player={player}
            onActivate={handleActivateWorldMagic}
          />

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
