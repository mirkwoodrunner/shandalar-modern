// src/ui/duel/RohgahhUpkeepModal.tsx
// Upkeep tribute modal for Rohgahh of Kher Keep: pay {R}{R}{R} or have it
// (and every Kobolds of Kher Keep you control) tapped and given to the
// opponent. Shared between DuelScreen (desktop) and DuelScreenMobile.
// Same structural/styling pattern as ForceOfNatureUpkeepModal.

export function RohgahhUpkeepModal({ redMana, onResolve }: {
  redMana: number; onResolve: (choice: string) => void;
}) {
  const canAfford = (redMana ?? 0) >= 3;
  return (
    <div className="popover-overlay" data-testid="rohgahh-upkeep-modal">
      <div className="popover-content" onClick={e => e.stopPropagation()} style={{
        border: '2px solid #c4a040', background: 'rgba(10,20,10,0.97)',
        fontFamily: 'var(--font-display)',
      }}>
        <h3 style={{ color: '#c4a040', fontFamily: 'var(--font-display)', marginBottom: 8 }}>
          Rohgahh of Kher Keep
        </h3>
        <p style={{ color: '#ccc', marginBottom: 12 }}>
          Pay {'{R}{R}{R}'}, or Rohgahh and all Kobolds of Kher Keep you control are tapped and given to your opponent.
        </p>
        <p style={{ color: '#a06a5a', fontSize: 12, marginBottom: 16 }}>
          Red mana available: {redMana ?? 0}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            data-testid="rohgahh-pay-button"
            onClick={() => onResolve('PAY')}
            disabled={!canAfford}
            style={{
              border: canAfford ? '1px solid #6a9a5a' : '1px solid #444',
              background: canAfford ? 'rgba(40,80,20,0.6)' : 'rgba(40,40,40,0.4)',
              color: canAfford ? '#80c040' : '#555',
              padding: '8px 16px', borderRadius: 4,
              cursor: canAfford ? 'pointer' : 'not-allowed',
              fontFamily: 'var(--font-display)', fontSize: 13,
            }}
          >Pay {'{R}{R}{R}'}</button>
          <button
            data-testid="rohgahh-decline-button"
            onClick={() => onResolve('DECLINE')}
            style={{
              border: '1px solid #a04040', background: 'rgba(80,20,20,0.5)',
              color: '#e06060', padding: '8px 16px', borderRadius: 4,
              cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 13,
            }}
          >Don't Pay</button>
        </div>
      </div>
    </div>
  );
}
