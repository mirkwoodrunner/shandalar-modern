// src/ui/duel/OptionalUntapModal.tsx
// Untap-step choice for permanents with "You may choose not to untap this
// during your untap step" (Ashnod's Battle Gear, Tawnos's Weaponry).
// Shared between DuelScreen (desktop) and DuelScreenMobile.
// Renders when s.pendingUpkeepChoice.handlerKey === 'optionalUntap' and s.active === 'p'.

export function OptionalUntapModal({ cardName, onResolve }: {
  cardName: string; onResolve: (choice: string) => void;
}) {
  return (
    <div className="popover-overlay" data-testid="optional-untap-modal">
      <div className="popover-content" onClick={e => e.stopPropagation()} style={{
        border: '2px solid #c4a040', background: 'rgba(10,20,10,0.97)',
        fontFamily: 'var(--font-display)',
      }}>
        <h3 style={{ color: '#c4a040', fontFamily: 'var(--font-display)', marginBottom: 8 }}>
          {cardName}
        </h3>
        <p style={{ color: '#ccc', marginBottom: 16 }}>
          You may choose not to untap {cardName} during your untap step.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            data-testid="optional-untap-untap-button"
            onClick={() => onResolve('UNTAP')}
            style={{
              border: '1px solid #6a9a5a', background: 'rgba(40,80,20,0.6)',
              color: '#80c040', padding: '8px 16px', borderRadius: 4,
              cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 13,
            }}
          >Untap</button>
          <button
            data-testid="optional-untap-keep-tapped-button"
            onClick={() => onResolve('KEEP_TAPPED')}
            style={{
              border: '1px solid #a04040', background: 'rgba(80,20,20,0.5)',
              color: '#e06060', padding: '8px 16px', borderRadius: 4,
              cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 13,
            }}
          >Keep Tapped</button>
        </div>
      </div>
    </div>
  );
}
