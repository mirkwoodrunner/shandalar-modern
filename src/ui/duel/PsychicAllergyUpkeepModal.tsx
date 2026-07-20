// src/ui/duel/PsychicAllergyUpkeepModal.tsx
// Upkeep choice modal for Psychic Allergy: destroy the enchantment unless
// you sacrifice two Islands. Shared between DuelScreen (desktop) and
// DuelScreenMobile.

export function PsychicAllergyUpkeepModal({ onResolve }: {
  onResolve: (choice: string) => void;
}) {
  return (
    <div className="popover-overlay" data-testid="psychic-allergy-upkeep-modal">
      <div className="popover-content" onClick={e => e.stopPropagation()} style={{
        border: '2px solid #c4a040', background: 'rgba(10,20,10,0.97)',
        fontFamily: 'var(--font-display)',
      }}>
        <h3 style={{ color: '#c4a040', fontFamily: 'var(--font-display)', marginBottom: 8 }}>
          Psychic Allergy
        </h3>
        <p style={{ color: '#ccc', marginBottom: 16 }}>
          Destroy Psychic Allergy unless you sacrifice two Islands.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            data-testid="psychic-allergy-sacrifice-islands-button"
            onClick={() => onResolve('SACRIFICE_ISLANDS')}
            style={{
              border: '1px solid #6a9a5a', background: 'rgba(40,80,20,0.6)',
              color: '#80c040', padding: '8px 16px', borderRadius: 4,
              cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 13,
            }}
          >Sacrifice Two Islands</button>
          <button
            data-testid="psychic-allergy-let-die-button"
            onClick={() => onResolve('LET_IT_DIE')}
            style={{
              border: '1px solid #a04040', background: 'rgba(80,20,20,0.5)',
              color: '#e06060', padding: '8px 16px', borderRadius: 4,
              cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 13,
            }}
          >Let It Be Destroyed</button>
        </div>
      </div>
    </div>
  );
}
