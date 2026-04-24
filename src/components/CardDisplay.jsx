import React from 'react';

function getDualLandColors(card) {
  if (!card.oracle_text) return null;

  const text = card.oracle_text;
  const dualPatterns = [
    /\{T\}:\s*Add\s+\{(.)\}\s+or\s+\{(.)\}\./i,
    /\{T\}:\s*Add\s+(\w+)\s+or\s+(\w+)\./i,
  ];

  for (const pattern of dualPatterns) {
    const match = text.match(pattern);
    if (match) {
      return [match[1], match[2]];
    }
  }
  return null;
}

function getManaSymbol(color) {
  const symbols = {
    W: '⚪',
    U: '🔵',
    B: '⚫',
    R: '🔴',
    G: '🟢',
  };
  return symbols[color] || '❓';
}

export default function CardDisplay({ card }) {
  if (!card) return null;

  return (
    <div className="card-display">
      <div className="card-mana-cost">
        {card.cmc !== undefined && (
          <div className="mana-value">{card.cmc}</div>
        )}
        {card.mana_cost && (
          <div className="mana-symbols">
            {card.mana_cost}
          </div>
        )}
      </div>
    </div>
  );
}
