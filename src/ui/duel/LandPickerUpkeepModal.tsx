// src/ui/duel/LandPickerUpkeepModal.tsx
// Generic "choose a land to sacrifice" upkeep modal, shared by Serendib
// Djinn (sacrifice a land, +3 damage if it's an Island) and Mana Vortex
// (sacrifice a land, no further consequence). Shared between DuelScreen
// (desktop) and DuelScreenMobile. Same structural/styling pattern as
// ForceOfNatureUpkeepModal/OptionalUntapModal, generalized to a dynamic list
// of buttons instead of a fixed pair.

export function LandPickerUpkeepModal({ title, description, lands, onResolve }: {
  title: string;
  description: string;
  lands: Array<{ iid: string; name: string; isIsland?: boolean }>;
  onResolve: (landIid: string) => void;
}) {
  return (
    <div className="popover-overlay" data-testid="land-picker-upkeep-modal">
      <div className="popover-content" onClick={e => e.stopPropagation()} style={{
        border: '2px solid #c4a040', background: 'rgba(10,20,10,0.97)',
        fontFamily: 'var(--font-display)',
      }}>
        <h3 style={{ color: '#c4a040', fontFamily: 'var(--font-display)', marginBottom: 8 }}>
          {title}
        </h3>
        <p style={{ color: '#ccc', marginBottom: 16 }}>
          {description}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 240, overflowY: 'auto' }}>
          {lands.map(land => (
            <button
              key={land.iid}
              data-testid={`land-picker-option-${land.iid}`}
              onClick={() => onResolve(land.iid)}
              style={{
                border: land.isIsland ? '1px solid #a04040' : '1px solid #6a9a5a',
                background: land.isIsland ? 'rgba(80,20,20,0.5)' : 'rgba(40,80,20,0.6)',
                color: land.isIsland ? '#e06060' : '#80c040',
                padding: '8px 16px', borderRadius: 4,
                cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 13,
              }}
            >{land.name}{land.isIsland ? ' (Island)' : ''}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
