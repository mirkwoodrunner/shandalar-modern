// src/ui/duel/GabrielAngelfireUpkeepModal.tsx
// Gabriel Angelfire's upkeep choice: flying, first strike, trample, or
// rampage 3. Same structural convention as LandPickerUpkeepModal (fixed
// options instead of a dynamic list), kept separate since that component is
// land-specific and shared by two other cards.

const OPTIONS: Array<{ id: string; label: string }> = [
  { id: 'flying', label: 'Flying' },
  { id: 'first_strike', label: 'First Strike' },
  { id: 'trample', label: 'Trample' },
  { id: 'rampage_3', label: 'Rampage 3' },
];

export function GabrielAngelfireUpkeepModal({ onResolve }: {
  onResolve: (choice: string) => void;
}) {
  return (
    <div className="popover-overlay" data-testid="gabriel-angelfire-upkeep-modal">
      <div className="popover-content" onClick={e => e.stopPropagation()} style={{
        border: '2px solid #c4a040', background: 'rgba(10,20,10,0.97)',
        fontFamily: 'var(--font-display)',
      }}>
        <h3 style={{ color: '#c4a040', fontFamily: 'var(--font-display)', marginBottom: 8 }}>
          Gabriel Angelfire
        </h3>
        <p style={{ color: '#ccc', marginBottom: 16 }}>
          Choose an ability until end of turn.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {OPTIONS.map(opt => (
            <button
              key={opt.id}
              data-testid={`gabriel-angelfire-option-${opt.id}`}
              onClick={() => onResolve(opt.id)}
              style={{
                border: '1px solid #6a9a5a', background: 'rgba(40,80,20,0.6)',
                color: '#80c040', padding: '8px 16px', borderRadius: 4,
                cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 13,
              }}
            >{opt.label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
