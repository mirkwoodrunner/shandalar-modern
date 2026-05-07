// src/ui/duel/AIDebugPanel.jsx
// Read-only debug panel showing AI hand and library. Rendered only in sandbox mode.

import React from 'react';

const panelStyle = {
  width: 220,
  flexShrink: 0,
  background: '#0b0704',
  borderLeft: '1px solid #8a6a1a',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: "'Crimson Text',serif",
  overflow: 'hidden',
};

const headerStyle = {
  padding: '6px 10px 5px',
  flexShrink: 0,
  borderBottom: '1px solid rgba(138,106,26,.35)',
  fontSize: 9,
  fontFamily: "'Cinzel',serif",
  fontVariant: 'small-caps',
  letterSpacing: 2,
  color: '#c4a040',
};

const sectionLabelStyle = {
  fontSize: 8,
  fontFamily: "'Cinzel',serif",
  fontVariant: 'small-caps',
  letterSpacing: 1,
  color: '#7a6030',
  padding: '6px 10px 3px',
  flexShrink: 0,
  borderBottom: '1px solid rgba(138,106,26,.15)',
};

const listStyle = {
  overflowY: 'auto',
  padding: '4px 0',
};

const itemStyle = {
  display: 'flex',
  gap: 6,
  padding: '1px 10px',
  fontSize: 11,
  lineHeight: 1.5,
};

const posStyle = {
  fontFamily: "'Fira Code',monospace",
  fontSize: 10,
  color: '#4a3a20',
  minWidth: 22,
  textAlign: 'right',
  flexShrink: 0,
};

const nameStyle = {
  color: '#b09870',
};

function Section({ title, items, numbered, flex }) {
  return (
    <div style={{ flex, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
      <div style={sectionLabelStyle}>{title} ({items.length})</div>
      <div style={{ ...listStyle, flex: 1 }}>
        {items.length === 0 ? (
          <div style={{ ...itemStyle, color: '#3a2c18', fontStyle: 'italic' }}>—</div>
        ) : (
          items.map((name, i) => (
            <div key={i} style={itemStyle}>
              {numbered && <span style={posStyle}>{i + 1}.</span>}
              <span style={nameStyle}>{name}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function AIDebugPanel({ hand, lib }) {
  return (
    <div style={panelStyle}>
      <div style={headerStyle}>AI Debug</div>
      <Section title="Hand" items={hand.map(c => c.name)} numbered={false} flex="0 0 auto" />
      <Section title="Library" items={lib.map(c => c.name)} numbered={true} flex={1} />
    </div>
  );
}
