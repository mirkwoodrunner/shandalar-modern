// src/ui/duel/SafeHavenUpkeepModal.tsx
// Upkeep choice modal for Safe Haven: optionally sacrifice the land to return
// every creature exiled with it. Shared between DuelScreen (desktop) and
// DuelScreenMobile.

export function SafeHavenUpkeepModal({ exiledCount, onResolve }: {
  exiledCount: number; onResolve: (choice: string) => void;
}) {
  return (
    <div className="popover-overlay" data-testid="safe-haven-upkeep-modal">
      <div className="popover-content" onClick={e => e.stopPropagation()} style={{
        border: '2px solid #c4a040', background: 'rgba(10,20,10,0.97)',
        fontFamily: 'var(--font-display)',
      }}>
        <h3 style={{ color: '#c4a040', fontFamily: 'var(--font-display)', marginBottom: 8 }}>
          Safe Haven
        </h3>
        <p style={{ color: '#ccc', marginBottom: 16 }}>
          You may sacrifice Safe Haven to return {exiledCount} exiled card{exiledCount === 1 ? '' : 's'} to the battlefield.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            data-testid="safe-haven-sacrifice-button"
            onClick={() => onResolve('SACRIFICE')}
            style={{
              border: '1px solid #6a9a5a', background: 'rgba(40,80,20,0.6)',
              color: '#80c040', padding: '8px 16px', borderRadius: 4,
              cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 13,
            }}
          >Sacrifice Safe Haven</button>
          <button
            data-testid="safe-haven-decline-button"
            onClick={() => onResolve('DECLINE')}
            style={{
              border: '1px solid #a04040', background: 'rgba(80,20,20,0.5)',
              color: '#e06060', padding: '8px 16px', borderRadius: 4,
              cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 13,
            }}
          >Keep Safe Haven</button>
        </div>
      </div>
    </div>
  );
}
