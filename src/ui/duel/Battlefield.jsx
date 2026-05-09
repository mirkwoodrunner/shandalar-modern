// src/ui/duel/Battlefield.jsx
// Renders both players' battlefield zones (land row + creatures + non-creature perms).
// Presentation only — no game logic. Per MECHANICS_INDEX.md S7.1

import React from 'react';
import { isLand, isCre } from '../../engine/DuelCore.js';
import { LandPip, FieldCard } from '../shared/Card.jsx';

const sortByName = arr => [...arr].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

const ROW_LABEL = {
  fontSize: 8,
  fontFamily: "'Cinzel',serif",
  letterSpacing: 1,
  marginBottom: 4,
  flexShrink: 0,
};

const CARD_ROW = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 5,
  alignContent: 'flex-start',
};

// --- OPPONENT BATTLEFIELD ----------------------------------------------------

export function OpponentBattlefield({ state, onCardClick, onTipEnter, onTipLeave }) {
  const lands            = state.o.bf.filter(isLand);
  const nonLands         = state.o.bf.filter(c => !isLand(c));
  const creatures        = sortByName(nonLands.filter(isCre));
  const nonCreaturePerms = sortByName(nonLands.filter(c => !isCre(c)));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>

      {/* Land row */}
      <div style={{ padding: '5px 10px 4px', borderBottom: '1px solid rgba(120,80,20,.2)', background: 'rgba(0,0,0,.25)', flexShrink: 0 }}>
        <div style={{ ...ROW_LABEL, color: '#706028' }}>LANDS ({lands.length})</div>
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

      {/* Creatures row — always rendered, min height so the zone is visible when empty */}
      <div style={{ padding: '6px 10px 4px', minHeight: 90, flexShrink: 0, borderBottom: nonCreaturePerms.length > 0 ? '1px solid rgba(120,80,20,.12)' : undefined }}>
        {creatures.length > 0 ? (
          <>
            <div style={{ ...ROW_LABEL, color: '#706028' }}>CREATURES ({creatures.length})</div>
            <div style={CARD_ROW}>
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
        ) : (
          <span style={{ fontSize: 9, color: '#2a1808', fontStyle: 'italic' }}>No creatures in play</span>
        )}
      </div>

      {/* Non-creature permanents row — only rendered when populated */}
      {nonCreaturePerms.length > 0 && (
        <div style={{ padding: '4px 10px 8px', flexShrink: 0 }}>
          <div style={{ ...ROW_LABEL, color: '#706028' }}>ENCHANTMENTS / ARTIFACTS ({nonCreaturePerms.length})</div>
          <div style={CARD_ROW}>
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
  const creatures        = sortByName(nonLands.filter(isCre));
  const nonCreaturePerms = sortByName(nonLands.filter(c => !isCre(c)));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>

      {/* Creatures row — closest to the middle of the battlefield (toward opponent) */}
      <div style={{ flex: 1, padding: '6px 10px 4px', overflow: 'auto', minHeight: 90, borderBottom: nonCreaturePerms.length > 0 ? '1px solid rgba(60,120,20,.15)' : undefined }}>
        {creatures.length > 0 ? (
          <>
            <div style={{ ...ROW_LABEL, color: '#407028' }}>YOUR CREATURES ({creatures.length})</div>
            <div style={CARD_ROW}>
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
        ) : (
          <span style={{ fontSize: 10, color: '#182808', fontStyle: 'italic' }}>No permanents in play</span>
        )}
      </div>

      {/* Non-creature permanents row — between creatures and lands */}
      {nonCreaturePerms.length > 0 && (
        <div style={{ flexShrink: 0, padding: '4px 10px 6px', borderBottom: '1px solid rgba(60,120,20,.15)' }}>
          <div style={{ ...ROW_LABEL, color: '#407028' }}>YOUR ENCHANTMENTS / ARTIFACTS ({nonCreaturePerms.length})</div>
          <div style={CARD_ROW}>
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

      {/* Land row — fixed at bottom */}
      <div style={{ flexShrink: 0, padding: '5px 10px 4px', borderTop: '1px solid rgba(60,120,20,.2)', background: 'rgba(0,0,0,.2)' }}>
        <div style={{ ...ROW_LABEL, color: '#407028' }}>YOUR LANDS ({lands.length})</div>
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
    </div>
  );
}

export default { OpponentBattlefield, PlayerBattlefield };
