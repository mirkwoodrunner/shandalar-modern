// src/ui/duel/ChoiceModal.tsx
// Generic pendingChoice modal. Shared between DuelScreen (desktop) and
// DuelScreenMobile. Renders whatever {id,label}[] options array is attached
// to s.pendingChoice, regardless of which system created the choice
// (triggered ability, or a direct resolveEff call -- see createPendingChoice
// in DuelCore.js).

export function ChoiceModal({ pendingChoice, allBf, onResolve }: {
  pendingChoice: any; allBf: any[]; onResolve: (id: string) => void;
}) {
  const sourceCard = allBf.find((c: any) => c.iid === pendingChoice.sourceCardId);
  return (
    <div className="popover-overlay" data-testid="choice-modal">
      <div className="popover-content" onClick={e => e.stopPropagation()}>
        <h3>{sourceCard ? sourceCard.name : 'Triggered Ability'}</h3>
        <p>Choose:</p>
        {(pendingChoice.options ?? []).map((opt: any) => (
          <button
            key={opt.id}
            className="mana-choice-btn"
            data-testid={`choice-option-${opt.id}`}
            onClick={() => onResolve(opt.id)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
