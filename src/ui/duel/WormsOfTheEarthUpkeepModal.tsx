// src/ui/duel/WormsOfTheEarthUpkeepModal.tsx
// Upkeep choice modal for Worms of the Earth: any player may sacrifice two
// lands or take 5 damage to destroy it, or decline and leave it in play.
// Shared between DuelScreen (desktop) and DuelScreenMobile.

export function WormsOfTheEarthUpkeepModal({ onResolve }: {
  onResolve: (choice: string) => void;
}) {
  return (
    <div className="popover-overlay" data-testid="worms-of-the-earth-upkeep-modal">
      <div className="popover-content" onClick={e => e.stopPropagation()} style={{
        border: '2px solid #c4a040', background: 'rgba(10,20,10,0.97)',
        fontFamily: 'var(--font-display)',
      }}>
        <h3 style={{ color: '#c4a040', fontFamily: 'var(--font-display)', marginBottom: 8 }}>
          Worms of the Earth
        </h3>
        <p style={{ color: '#ccc', marginBottom: 16 }}>
          You may sacrifice two lands or take 5 damage to destroy Worms of the Earth.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            data-testid="worms-sac-lands-button"
            onClick={() => onResolve('SAC_LANDS')}
            style={{
              border: '1px solid #6a9a5a', background: 'rgba(40,80,20,0.6)',
              color: '#80c040', padding: '8px 16px', borderRadius: 4,
              cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 13,
            }}
          >Sacrifice Two Lands</button>
          <button
            data-testid="worms-take-damage-button"
            onClick={() => onResolve('TAKE_DAMAGE')}
            style={{
              border: '1px solid #a04040', background: 'rgba(80,20,20,0.5)',
              color: '#e06060', padding: '8px 16px', borderRadius: 4,
              cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 13,
            }}
          >Take 5 Damage</button>
          <button
            data-testid="worms-decline-button"
            onClick={() => onResolve('DECLINE')}
            style={{
              border: '1px solid #777', background: 'rgba(40,40,40,0.6)',
              color: '#ccc', padding: '8px 16px', borderRadius: 4,
              cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 13,
            }}
          >Do Nothing</button>
        </div>
      </div>
    </div>
  );
}
