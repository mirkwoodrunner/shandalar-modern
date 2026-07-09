// src/ui/duel/EngineErrorOverlay.tsx
// Blocking overlay shown when useDuelController.ts catches an otherwise-fatal
// error in the AI decision loop. Replaces a silent hang (e.g. the
// "Ending Turn..." button freezing forever with no explanation) with a
// visible, fail-fast error plus enough state context to diagnose it, and a
// guaranteed way out. Imported by DuelScreen.tsx and DuelScreenMobile.tsx;
// shared, presentation-only.

import React, { useState } from 'react';

interface Props {
  message: string;
  stack: string;
  context: string;
  onExit: () => void;
}

export function EngineErrorOverlay({ message, stack, context, onExit }: Props) {
  const [copied, setCopied] = useState(false);

  const debugText = `${message}\n\n--- stack ---\n${stack}\n\n--- state context ---\n${context}`;

  const handleCopy = () => {
    navigator.clipboard?.writeText(debugText).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 2000); },
      () => { /* clipboard unavailable; debug text is still visible below */ }
    );
  };

  return (
    <div className="popover-overlay" style={{ zIndex: 2000 }}>
      <div
        className="popover-content"
        style={{
          border: '2px solid #c04030',
          background: 'rgba(20,10,10,0.97)',
          fontFamily: 'var(--font-display)',
          maxWidth: 480,
          maxHeight: '70vh',
        }}
      >
        <h3 style={{ color: '#e06050', marginBottom: 8 }}>Duel Engine Error</h3>
        <p style={{ color: '#ddd', marginBottom: 12, fontSize: 13 }}>
          The AI hit an unexpected error and the duel can't continue safely.
          This has been logged to the console. Copy the details below if
          you're reporting this.
        </p>
        <pre
          style={{
            background: 'rgba(0,0,0,0.5)',
            border: '1px solid #442020',
            borderRadius: 4,
            padding: 10,
            fontSize: 11,
            lineHeight: 1.4,
            color: '#e0a090',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            maxHeight: 260,
            overflowY: 'auto',
            marginBottom: 14,
          }}
        >
          {debugText}
        </pre>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={handleCopy}
            style={{
              border: '1px solid #666',
              background: 'rgba(40,40,40,0.6)',
              color: '#ccc',
              padding: '8px 16px',
              borderRadius: 4,
              cursor: 'pointer',
              fontFamily: 'var(--font-display)',
              fontSize: 13,
              flex: 1,
            }}
          >
            {copied ? 'Copied!' : 'Copy Debug Info'}
          </button>
          <button
            onClick={onExit}
            style={{
              border: '1px solid #a04040',
              background: 'rgba(80,20,20,0.5)',
              color: '#e06060',
              padding: '8px 16px',
              borderRadius: 4,
              cursor: 'pointer',
              fontFamily: 'var(--font-display)',
              fontSize: 13,
              flex: 1,
            }}
          >
            Exit to Overworld
          </button>
        </div>
      </div>
    </div>
  );
}
