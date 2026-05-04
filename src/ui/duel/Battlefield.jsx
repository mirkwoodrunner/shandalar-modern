// src/ui/duel/Battlefield.jsx
// Renders both players' battlefield zones (land row + creatures + non-creature perms).
// Presentation only — no game logic. Per MECHANICS_INDEX.md S7.1

import React from 'react';
import { isLand, isCre } from '../../engine/DuelCore.js';
import { LandPip, FieldCard } from '../shared/Card.jsx';

const sortByName = arr => [...arr].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

// --- OPPONENT BATTLEFIELD ----------------------------------------------------

export function OpponentBattlefield({ state, onCardClick, onTipEnter, onTipLeave }) {
  const lands            = state.o.bf.filter(isLand);
  const nonLands         = state.o.bf.filter(c => !isLand(c));
  const creatures        = sortByName(nonLands.filter(c => isCre(c)));
  const nonCreaturePerms = sortByName(nonLands.filter(c => !isCre(c)));

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Land row */}
      <div style={{ padding: '5px 10px 4px', borderBottom: '1px solid rgba(120,80,20,.2)', background: 'rgba(0,0,0,.25)' }}>
        <div style={{ fontSize: 8, color: '#706028', fontFamily: "'Cinzel',serif", letterSpacing: 1, marginBottom: 4 }}>
          LANDS ({lands.length})
        </div>
        <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 4, minHeight: 36 }}>
          {lands.map(c => (
            <LandPip
              key={c.iid} card={c} tapped={c.tapped}
              selected={state.selTgt === c.iid}
              onClick={() => onCardClick(c, 'oBf')}
              onMouseMove={e => onTipEnter(c, e)}
              onMouseLeave={onTipLeave}
            />
          ))}
          {!lands.length && <span style={{ fontSize: 9, color: '#2a1808', fontStyle: 'italic', lineHeight: '28px' }}>—</span>}
        </div>
      </div>

      {/* Creatures row */}
      <div style={{ padding: '6px 10px 4px', minHeight: 90, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {creatures.length > 0 && (
          <>
            <div style={{ fontSize: 8, color: '#706028', fontFamily: "'Cinzel',serif", letterSpacing: 1 }}>
              CREATURES ({creatures.length})
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignContent: 'flex-start' }}>
              {creatures.map(c => (
                <div key={c.iid} onMouseMove={e => onTipEnter(c, e)} onMouseLeave={onTipLeave}>
                  <FieldCard
                    card={c} state={state}
                    selected={state.selTgt === c.iid}
                    attacking={state.attackers.includes(c.iid)}
                    onClick={() => onCardClick(c, 'oBf')}
                    sm
                  />
                </div>
              ))}
            </div>
          </>
        )}
        {!creatures.length && !nonCreaturePerms.length && (
          <span style={{ fontSize: 10, color: '#2a1808', fontStyle: 'italic' }}>No creatures in play</span>
        )}
      </div>

      {/* Non-creature permanents row (only when populated) */}
      {nonCreaturePerms.length > 0 && (
        <div style={{ padding: '4px 10px 8px', borderTop: '1px solid rgba(120,80,20,.15)', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 8, color: '#706028', fontFamily: "'Cinzel',serif", letterSpacing: 1 }}>
            ENCHANTMENTS / ARTIFACTS ({nonCreaturePerms.length})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignContent: 'flex-start' }}>
            {nonCreaturePerms.map(c => (
              <div key={c.iid} onMouseMove={e => onTipEnter(c, e)} onMouseLeave={onTipLeave}>
                <FieldCard
                  card={c} state={state}
                  selected={state.selTgt === c.iid}
                  attacking={false}
                  onClick={() => onCardClick(c, 'oBf')}
                  sm
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// --- PLAYER BATTLEFIELD -------------------------------------------------------

export function PlayerBattlefield({ state, onCardClick, onActivate, onTipEnter, onTipLeave }) {
  const lands            = state.p.bf.filter(isLand);
  const nonLands         = state.p.bf.filter(c => !isLand(c));
  const creatures        = sortByName(nonLands.filter(c => isCre(c)));
  const nonCreaturePerms = sortByName(nonLands.filter(c => !isCre(c)));

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Land row — fixed height, horizontal scroll per GDD Bug B7 fix */}
      <div style={{ flexShrink: 0, padding: '5px 10px 4px', borderBottom: '1px solid rgba(60,120,20,.2)', background: 'rgba(0,0,0,.2)' }}>
        <div style={{ fontSize: 8, color: '#407028', fontFamily: "'Cinzel',serif", letterSpacing: 1, marginBottom: 4 }}>
          YOUR LANDS ({lands.length})
        </div>
        <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 4, minHeight: 36 }}>
          {lands.map(c => (
            <LandPip
              key={c.iid} card={c} tapped={c.tapped}
              selected={state.selCard === c.iid || state.selTgt === c.iid}
              isPlayer
              onClick={() => onCardClick(c, 'pBf')}
              onMouseMove={e => onTipEnter(c, e)}
              onMouseLeave={onTipLeave}
            />
          ))}
          {!lands.length && <span style={{ fontSize: 9, color: '#182808', fontStyle: 'italic', lineHeight: '28px' }}>—</span>}
        </div>
      </div>

      {/* Creatures row — flex fills remaining space */}
      <div style={{ flex: 1, padding: '6px 10px 4px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {creatures.length > 0 && (
          <>
            <div style={{ fontSize: 8, color: '#407028', fontFamily: "'Cinzel',serif", letterSpacing: 1, flexShrink: 0 }}>
              YOUR CREATURES ({creatures.length})
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignContent: 'flex-start' }}>
              {creatures.map(c => (
                <div key={c.iid} onMouseMove={e => onTipEnter(c, e)} onMouseLeave={onTipLeave}>
                  <FieldCard
                    card={c} state={state}
                    selected={state.selCard === c.iid || state.selTgt === c.iid}
                    attacking={state.attackers.includes(c.iid)}
                    onClick={() => onCardClick(c, 'pBf')}
                    onActivate={onActivate}
                  />
                </div>
              ))}
            </div>
          </>
        )}
        {!creatures.length && !nonCreaturePerms.length && (
          <span style={{ fontSize: 10, color: '#182808', fontStyle: 'italic' }}>No permanents in play</span>
        )}
      </div>

      {/* Non-creature permanents row (only when populated) */}
      {nonCreaturePerms.length > 0 && (
        <div style={{ flexShrink: 0, padding: '4px 10px 8px', borderTop: '1px solid rgba(60,120,20,.15)', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 8, color: '#407028', fontFamily: "'Cinzel',serif", letterSpacing: 1 }}>
            YOUR ENCHANTMENTS / ARTIFACTS ({nonCreaturePerms.length})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignContent: 'flex-start' }}>
            {nonCreaturePerms.map(c => (
              <div key={c.iid} onMouseMove={e => onTipEnter(c, e)} onMouseLeave={onTipLeave}>
                <FieldCard
                  card={c} state={state}
                  selected={state.selCard === c.iid || state.selTgt === c.iid}
                  attacking={false}
                  onClick={() => onCardClick(c, 'pBf')}
                  onActivate={onActivate}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default { OpponentBattlefield, PlayerBattlefield };
