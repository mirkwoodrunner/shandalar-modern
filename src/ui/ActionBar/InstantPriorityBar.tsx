// src/ui/ActionBar/InstantPriorityBar.tsx
// Shown when a priority window is open and the player holds priority.
// Displays castable instants from hand and non-mana activated battlefield
// abilities. Positioned above ActionBar; z-index keeps it below targeting
// overlays (z-index 200).

import React from 'react';

interface ManaPool {
  W: number; U: number; B: number; R: number; G: number; C: number;
}

interface CardData {
  iid: string;
  name: string;
  cost?: string;
  type?: string;
  activated?: { cost: string; effect: string };
}

interface InstantPriorityBarProps {
  hand: CardData[];
  battlefield: CardData[];
  mana: ManaPool;
  onSelectCard: (iid: string) => void;
  onActivate: (card: CardData) => void;
  onPass: () => void;
}

function totalMana(pool: ManaPool): number {
  return pool.W + pool.U + pool.B + pool.R + pool.G + pool.C;
}

function canAffordCost(mana: ManaPool, cost: string | undefined): boolean {
  if (!cost) return false;
  const pip = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, generic: 0 };
  let i = 0;
  while (i < cost.length) {
    const ch = cost[i].toUpperCase();
    if ('WUBRG'.includes(ch)) { pip[ch as keyof typeof pip] = (pip[ch as keyof typeof pip] as number) + 1; i++; }
    else if (ch === 'C') { pip.C++; i++; }
    else if (ch === 'X') { i++; }
    else if (!isNaN(parseInt(ch))) {
      let n = '';
      while (i < cost.length && !isNaN(parseInt(cost[i]))) { n += cost[i]; i++; }
      pip.generic += parseInt(n);
    } else i++;
  }
  const pool = { ...mana };
  for (const c of ['W', 'U', 'B', 'R', 'G', 'C'] as const) {
    if (pool[c] < pip[c]) return false;
    pool[c] -= pip[c];
  }
  return totalMana(pool) >= pip.generic;
}

const MANA_ICONS: Record<string, string> = {
  W: '{W}', U: '{U}', B: '{B}', R: '{R}', G: '{G}', C: '{C}',
};

function formatCost(cost: string | undefined): string {
  if (!cost) return '';
  return cost.split('').map(ch => MANA_ICONS[ch.toUpperCase()] ?? ch).join('');
}

const PURE_MANA_EFFECTS = new Set([
  'addMana', 'addManaAny', 'addMana3Any',
]);

export function InstantPriorityBar({
  hand,
  battlefield,
  mana,
  onSelectCard,
  onActivate,
  onPass,
}: InstantPriorityBarProps) {
  const instants = hand.filter(
    c => c.type === 'Instant' || c.type === 'Interrupt'
  );

  const activatedBf = battlefield.filter(
    c => c.activated && !PURE_MANA_EFFECTS.has(c.activated.effect)
  );

  const hasOptions = instants.length > 0 || activatedBf.length > 0;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '6px 14px',
      background: 'linear-gradient(180deg, rgba(20,30,60,.95) 0%, rgba(10,15,35,.97) 100%)',
      borderTop: '1px solid rgba(80,120,220,.4)',
      borderBottom: '1px solid rgba(80,120,220,.25)',
      boxShadow: 'inset 0 1px 0 rgba(80,120,220,.15)',
      flexShrink: 0,
      flexWrap: 'wrap',
      zIndex: 200,
      position: 'relative',
    }}>
      <span style={{
        fontSize: 9,
        fontFamily: 'var(--font-display)',
        color: '#80a0e0',
        letterSpacing: 1,
        marginRight: 4,
        flexShrink: 0,
      }}>
        PRIORITY:
      </span>

      {!hasOptions && (
        <span style={{ fontSize: 10, color: '#506090', fontStyle: 'italic' }}>
          No instant-speed options
        </span>
      )}

      {instants.map(card => {
        const affordable = canAffordCost(mana, card.cost);
        return (
          <button
            key={card.iid}
            onClick={() => onSelectCard(card.iid)}
            title={`Cast ${card.name} (${card.cost ?? ''})`}
            style={{
              padding: '3px 8px',
              background: affordable
                ? 'rgba(40,60,140,.8)'
                : 'rgba(20,25,50,.5)',
              border: `1px solid ${affordable ? 'rgba(100,140,255,.6)' : 'rgba(60,80,140,.3)'}`,
              borderRadius: 3,
              color: affordable ? '#b0c8ff' : '#506090',
              fontSize: 10,
              fontFamily: 'var(--font-display)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'background .15s',
            }}
          >
            {card.name}
            {card.cost ? (
              <span style={{ marginLeft: 4, opacity: .7, fontSize: 9 }}>
                {formatCost(card.cost)}
              </span>
            ) : null}
          </button>
        );
      })}

      {activatedBf.map(card => {
        const costStr = card.activated?.cost ?? '';
        return (
          <button
            key={card.iid}
            onClick={() => onActivate(card)}
            title={`Activate ${card.name} [${costStr}]`}
            style={{
              padding: '3px 8px',
              background: 'rgba(40,80,60,.7)',
              border: '1px solid rgba(80,160,100,.4)',
              borderRadius: 3,
              color: '#80c090',
              fontSize: 10,
              fontFamily: 'var(--font-display)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {card.name}
            {costStr ? (
              <span style={{ marginLeft: 4, opacity: .7, fontSize: 9 }}>
                [{costStr}]
              </span>
            ) : null}
          </button>
        );
      })}

      <button
        onClick={onPass}
        style={{
          marginLeft: 'auto',
          padding: '3px 12px',
          background: 'rgba(60,20,20,.8)',
          border: '1px solid rgba(200,80,60,.4)',
          borderRadius: 3,
          color: '#e09080',
          fontSize: 10,
          fontFamily: 'var(--font-display)',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          letterSpacing: .5,
        }}
      >
        Pass Priority
      </button>
    </div>
  );
}
