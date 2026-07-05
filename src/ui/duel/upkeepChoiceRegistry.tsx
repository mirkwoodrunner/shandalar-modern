// src/ui/duel/upkeepChoiceRegistry.tsx
// Maps s.pendingUpkeepChoice.handlerKey to the modal that renders it and the
// props that modal needs. Mirrors the CARD_HANDLERS keyed-registry pattern in
// src/engine/cardHandlers.js. Add a new entry here whenever DuelCore.js queues
// a new pendingUpkeepChoice handlerKey -- do not add another hardcoded render
// branch in DuelScreen.tsx / DuelScreenMobile.tsx.

import { ForceOfNatureUpkeepModal } from './ForceOfNatureUpkeepModal';
import { OptionalUntapModal } from './OptionalUntapModal';

export const UPKEEP_CHOICE_MODALS: Record<string, {
  component: (props: any) => JSX.Element;
  getProps: (s: any, choice: any, resolveUpkeepChoice: (choice: string) => void) => any;
}> = {
  forceOfNatureUpkeep: {
    component: ForceOfNatureUpkeepModal,
    getProps: (s, _choice, resolveUpkeepChoice) => ({
      greenMana: s.p.mana?.G ?? 0,
      onResolve: resolveUpkeepChoice,
    }),
  },
  optionalUntap: {
    component: OptionalUntapModal,
    getProps: (_s, choice, resolveUpkeepChoice) => ({
      cardName: choice.cardName,
      onResolve: resolveUpkeepChoice,
    }),
  },
};
