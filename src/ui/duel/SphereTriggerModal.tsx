// src/ui/duel/SphereTriggerModal.tsx
// Optional-pay modal for the Sphere lifegain cycle (Crystal Rod, Iron Star, Ivory Cup, Wooden Sphere).
// Shared between DuelScreen (desktop) and DuelScreenMobile.
// Renders when s.pendingSphereTrigger.controller === 'p'.

export function SphereTriggerModal({ sphereCardName, totalMana, onResolve }: {
  sphereCardName: string;
  totalMana: number;
  onResolve: (paid: boolean) => void;
}) {
  const canAfford = totalMana >= 1;
  return (
    <div className="popover-overlay" data-testid="sphere-trigger-modal">
      <div className="popover-content" onClick={e => e.stopPropagation()} style={{
        border: '2px solid #c4a040', background: 'rgba(10,20,10,0.97)',
        fontFamily: 'var(--font-display)',
      }}>
        <h3 style={{ color: '#c4a040', fontFamily: 'var(--font-display)', marginBottom: 8 }}>
          {sphereCardName}
        </h3>
        <p style={{ color: '#ccc', marginBottom: 12 }}>
          A matching spell was cast. Pay 1 generic mana to gain 1 life?
        </p>
        <p style={{ color: '#6a9a5a', fontSize: 12, marginBottom: 16 }}>
          Mana available: {totalMana}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            data-testid="sphere-pay-button"
            onClick={() => onResolve(true)}
            disabled={!canAfford}
            style={{
              border: canAfford ? '1px solid #6a9a5a' : '1px solid #444',
              background: canAfford ? 'rgba(40,80,20,0.6)' : 'rgba(40,40,40,0.4)',
              color: canAfford ? '#80c040' : '#555',
              padding: '8px 16px', borderRadius: 4,
              cursor: canAfford ? 'pointer' : 'not-allowed',
              fontFamily: 'var(--font-display)', fontSize: 13,
            }}
          >Pay 1 -- Gain 1 Life</button>
          <button
            data-testid="sphere-decline-button"
            onClick={() => onResolve(false)}
            style={{
              border: '1px solid #a04040', background: 'rgba(80,20,20,0.5)',
              color: '#e06060', padding: '8px 16px', borderRadius: 4,
              cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 13,
            }}
          >Decline</button>
        </div>
      </div>
    </div>
  );
}
