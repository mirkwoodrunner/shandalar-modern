// src/ui/duel/AbilityMenuPopover.tsx
// Popover listing a card's activatedAbilities for the player to choose one.
// Shared between DuelScreen.tsx (desktop) and DuelScreenMobile.tsx.

export function AbilityMenuPopover({ card, onSelect, onClose }: {
  card: any;
  onSelect: (abilityId: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="popover-overlay" data-testid="ability-menu" onClick={onClose}>
      <div className="popover-content" onClick={e => e.stopPropagation()}>
        <h3>{card.name}</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {/* Always offer the basic tap-for-mana option */}
          <button className="mana-choice-btn" data-testid="ability-option-tap_mana" onClick={() => onSelect('tap_mana')}>
            {'{T}'}: Add {'{C}'}
          </button>
          {(card.activatedAbilities ?? []).map((ab: any) => (
            <button
              key={ab.id}
              className="mana-choice-btn"
              data-testid={`ability-option-${ab.id}`}
              onClick={() => onSelect(ab.id)}
            >
              {ab.description}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
