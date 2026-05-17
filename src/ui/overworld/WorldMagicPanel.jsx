// src/ui/overworld/WorldMagicPanel.jsx
// Collapsible HUD panel showing owned World Magics and activation buttons.

import React, { useState } from 'react';
import { WORLD_MAGICS } from '../../engine/MapGenerator.js';

export default function WorldMagicPanel({ worldMagics, wmCooldowns, player, onActivate }) {
  const [collapsed, setCollapsed] = useState(true);

  const owned = WORLD_MAGICS.filter(wm => worldMagics.includes(wm.id));

  const canAffordCost = (wm) => {
    if (!wm.activeCost) return true;
    if (wm.activeCost.amuletColor === 'R') {
      return (player.redAmulets || 0) >= wm.activeCost.amount;
    }
    return true;
  };

  return (
    <div style={{
      borderBottom: '1px solid rgba(200,160,60,.15)',
      flexShrink: 0,
    }}>
      <button
        onClick={() => setCollapsed(c => !c)}
        style={{
          width: '100%',
          background: 'transparent',
          border: 'none',
          padding: '7px 12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
        }}
      >
        <span style={{ fontSize: 10, color: '#8a6030', fontFamily: "'Cinzel',serif", letterSpacing: 1 }}>
          WORLD MAGICS ({owned.length})
        </span>
        <span style={{ fontSize: 9, color: '#6a4820' }}>{collapsed ? '▶' : '▼'}</span>
      </button>

      {!collapsed && (
        <div style={{ padding: '0 12px 10px' }}>
          {owned.length === 0 ? (
            <div style={{ fontSize: 10, color: '#4a3820', fontStyle: 'italic' }}>
              None discovered yet.
            </div>
          ) : (
            owned.map(wm => {
              const cooldown = wmCooldowns[wm.id] || 0;
              const affordable = canAffordCost(wm);
              const disabled = cooldown > 0 || !affordable;
              return (
                <div key={wm.id} style={{
                  marginBottom: 6,
                  padding: '5px 7px',
                  background: 'rgba(255,255,255,.04)',
                  borderRadius: 4,
                  border: '1px solid rgba(200,160,60,.1)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 10, color: '#c0a060', fontFamily: "'Cinzel',serif" }}>
                      {wm.icon} {wm.name}
                    </span>
                    {wm.type === 'passive' ? (
                      <span style={{ fontSize: 8, color: '#6a5020', fontStyle: 'italic' }}>passive</span>
                    ) : (
                      <button
                        onClick={() => onActivate(wm.id)}
                        disabled={disabled}
                        title={
                          cooldown > 0 ? `Ready in ${cooldown} moves` :
                          !affordable ? 'Insufficient resources' : wm.desc
                        }
                        style={{
                          background: disabled
                            ? 'rgba(0,0,0,.3)'
                            : 'linear-gradient(135deg,#2a1a04,#4a3010)',
                          border: `1px solid ${disabled ? '#3a2810' : 'rgba(200,160,60,.5)'}`,
                          color: disabled ? '#4a3820' : '#f0c060',
                          padding: '2px 7px',
                          borderRadius: 3,
                          cursor: disabled ? 'not-allowed' : 'pointer',
                          fontFamily: "'Cinzel',serif",
                          fontSize: 9,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {cooldown > 0 ? `⏱ ${cooldown}` : '⚡ Use'}
                      </button>
                    )}
                  </div>
                  <div style={{ fontSize: 8, color: '#6a5020', marginTop: 2, lineHeight: 1.4 }}>
                    {wm.desc}
                    {wm.activeCost?.amuletColor === 'R' && (
                      <span style={{ color: '#e08060', marginLeft: 4 }}>
                        🔴 {player.redAmulets || 0}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
