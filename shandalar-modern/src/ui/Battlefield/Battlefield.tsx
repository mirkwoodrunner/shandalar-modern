import { Half } from './Half';
import { PhaseRibbon } from '../Phase/PhaseRibbon';
import type { CardData } from '../Card/types';

interface BattlefieldProps {
  phase: string;
  oppCards: CardData[];
  yourCards: CardData[];
  selCard: string | null;
  selTgt: string | null;
  attackers: string[];
  flashIids?: Set<string>;
  onCardClick?: (card: CardData) => void;
  onCardHover?: (iid: string | null) => void;
}

export function Battlefield({
  phase,
  oppCards,
  yourCards,
  selCard,
  selTgt,
  attackers,
  flashIids,
  onCardClick,
  onCardHover,
}: BattlefieldProps) {
  return (
    <>
      <Half
        side="opp"
        cards={oppCards}
        selCard={selCard}
        selTgt={selTgt}
        attackers={attackers}
        flashIids={flashIids}
        onCardClick={onCardClick}
        onCardHover={onCardHover}
      />
      <PhaseRibbon phase={phase} />
      <Half
        side="you"
        cards={yourCards}
        selCard={selCard}
        selTgt={selTgt}
        attackers={attackers}
        flashIids={flashIids}
        onCardClick={onCardClick}
        onCardHover={onCardHover}
      />
    </>
  );
}
