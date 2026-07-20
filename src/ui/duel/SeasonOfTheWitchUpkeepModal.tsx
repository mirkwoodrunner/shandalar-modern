// src/ui/duel/SeasonOfTheWitchUpkeepModal.tsx
// Upkeep choice modal for Season of the Witch: sacrifice the enchantment
// unless you pay 2 life. Shared between DuelScreen (desktop) and
// DuelScreenMobile.

export function SeasonOfTheWitchUpkeepModal({ onResolve }: {
  onResolve: (choice: string) => void;
}) {
  return (
    <div className="popover-overlay" data-testid="season-of-the-witch-upkeep-modal">
      <div className="popover-content" onClick={e => e.stopPropagation()} style={{
        border: '2px solid #c4a040', background: 'rgba(10,20,10,0.97)',
        fontFamily: 'var(--font-display)',
      }}>
        <h3 style={{ color: '#c4a040', fontFamily: 'var(--font-display)', marginBottom: 8 }}>
          Season of the Witch
        </h3>
        <p style={{ color: '#ccc', marginBottom: 16 }}>
          Sacrifice Season of the Witch unless you pay 2 life.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            data-testid="season-of-the-witch-pay-life-button"
            onClick={() => onResolve('PAY_LIFE')}
            style={{
              border: '1px solid #6a9a5a', background: 'rgba(40,80,20,0.6)',
              color: '#80c040', padding: '8px 16px', borderRadius: 4,
              cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 13,
            }}
          >Pay 2 Life</button>
          <button
            data-testid="season-of-the-witch-sacrifice-button"
            onClick={() => onResolve('SACRIFICE')}
            style={{
              border: '1px solid #a04040', background: 'rgba(80,20,20,0.5)',
              color: '#e06060', padding: '8px 16px', borderRadius: 4,
              cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 13,
            }}
          >Sacrifice</button>
        </div>
      </div>
    </div>
  );
}
