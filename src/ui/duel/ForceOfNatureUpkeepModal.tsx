// src/ui/duel/ForceOfNatureUpkeepModal.tsx
// Upkeep tribute modal for Force of Nature.
// Shared between DuelScreen (desktop) and DuelScreenMobile.
// Renders when s.pendingUpkeepChoice is set and s.active === 'p'.

export function ForceOfNatureUpkeepModal({ greenMana, onResolve }: {
  greenMana: number; onResolve: (choice: string) => void;
}) {
  const canAfford = (greenMana ?? 0) >= 4;
  return (
    <div className="popover-overlay" data-testid="fon-upkeep-modal">
      <div className="popover-content" onClick={e => e.stopPropagation()} style={{
        border: '2px solid #c4a040', background: 'rgba(10,20,10,0.97)',
        fontFamily: 'var(--font-display)',
      }}>
        <h3 style={{ color: '#c4a040', fontFamily: 'var(--font-display)', marginBottom: 8 }}>
          Force of Nature
        </h3>
        <p style={{ color: '#ccc', marginBottom: 12 }}>
          Force of Nature demands tribute. Pay GGGG or take 8 damage.
        </p>
        <p style={{ color: '#6a9a5a', fontSize: 12, marginBottom: 16 }}>
          Green mana available: {greenMana ?? 0}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            data-testid="fon-pay-button"
            onClick={() => onResolve('PAY_GGGG')}
            disabled={!canAfford}
            style={{
              border: canAfford ? '1px solid #6a9a5a' : '1px solid #444',
              background: canAfford ? 'rgba(40,80,20,0.6)' : 'rgba(40,40,40,0.4)',
              color: canAfford ? '#80c040' : '#555',
              padding: '8px 16px', borderRadius: 4,
              cursor: canAfford ? 'pointer' : 'not-allowed',
              fontFamily: 'var(--font-display)', fontSize: 13,
            }}
          >Pay GGGG</button>
          <button
            data-testid="fon-damage-button"
            onClick={() => onResolve('TAKE_DAMAGE')}
            style={{
              border: '1px solid #a04040', background: 'rgba(80,20,20,0.5)',
              color: '#e06060', padding: '8px 16px', borderRadius: 4,
              cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 13,
            }}
          >Take 8 Damage</button>
        </div>
      </div>
    </div>
  );
}
