// src/ui/duel/upkeepChoiceRegistry.tsx
// Maps s.pendingUpkeepChoice.handlerKey to the modal that renders it and the
// props that modal needs. Mirrors the CARD_HANDLERS keyed-registry pattern in
// src/engine/cardHandlers.js. Add a new entry here whenever DuelCore.js queues
// a new pendingUpkeepChoice handlerKey -- do not add another hardcoded render
// branch in DuelScreen.tsx / DuelScreenMobile.tsx.

import { ForceOfNatureUpkeepModal } from './ForceOfNatureUpkeepModal';
import { OptionalUntapModal } from './OptionalUntapModal';
import { CurseArtifactUpkeepModal } from './CurseArtifactUpkeepModal';
import { RohgahhUpkeepModal } from './RohgahhUpkeepModal';
import { LandPickerUpkeepModal } from './LandPickerUpkeepModal';
import { SafeHavenUpkeepModal } from './SafeHavenUpkeepModal';
import { WormsOfTheEarthUpkeepModal } from './WormsOfTheEarthUpkeepModal';
import { SeasonOfTheWitchUpkeepModal } from './SeasonOfTheWitchUpkeepModal';
import { PsychicAllergyUpkeepModal } from './PsychicAllergyUpkeepModal';
import { isLand } from '../../engine/DuelCore.js';

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
  curseArtifactUpkeep: {
    component: CurseArtifactUpkeepModal,
    getProps: (s, choice, resolveUpkeepChoice) => ({
      artifactName: (s.p.bf as any[]).find((c: any) => c.iid === choice.iid)?.name ?? 'the artifact',
      onResolve: resolveUpkeepChoice,
    }),
  },
  rohgahhUpkeep: {
    component: RohgahhUpkeepModal,
    getProps: (s, _choice, resolveUpkeepChoice) => ({
      redMana: s.p.mana?.R ?? 0,
      onResolve: resolveUpkeepChoice,
    }),
  },
  serendibDjinnUpkeep: {
    component: LandPickerUpkeepModal,
    getProps: (s, _choice, resolveUpkeepChoice) => ({
      title: 'Serendib Djinn',
      description: "Sacrifice a land. Sacrificing an Island deals 3 damage to you.",
      lands: (s.p.bf as any[]).filter(isLand).map((c: any) => ({
        iid: c.iid, name: c.name, isIsland: !!c.subtype?.includes('Island'),
      })),
      onResolve: resolveUpkeepChoice,
    }),
  },
  manaVortexUpkeep: {
    component: LandPickerUpkeepModal,
    getProps: (s, _choice, resolveUpkeepChoice) => ({
      title: 'Mana Vortex',
      description: 'Sacrifice a land.',
      lands: (s.p.bf as any[]).filter(isLand).map((c: any) => ({
        iid: c.iid, name: c.name, isIsland: !!c.subtype?.includes('Island'),
      })),
      onResolve: resolveUpkeepChoice,
    }),
  },
  safeHavenUpkeep: {
    component: SafeHavenUpkeepModal,
    getProps: (s, choice, resolveUpkeepChoice) => ({
      exiledCount: ((s.p.bf as any[]).find((c: any) => c.iid === choice.iid)?.exiledIids ?? []).length,
      onResolve: resolveUpkeepChoice,
    }),
  },
  wormsOfTheEarthUpkeep: {
    component: WormsOfTheEarthUpkeepModal,
    getProps: (_s, _choice, resolveUpkeepChoice) => ({
      onResolve: resolveUpkeepChoice,
    }),
  },
  seasonOfTheWitchUpkeep: {
    component: SeasonOfTheWitchUpkeepModal,
    getProps: (_s, _choice, resolveUpkeepChoice) => ({
      onResolve: resolveUpkeepChoice,
    }),
  },
  psychicAllergyUpkeep: {
    component: PsychicAllergyUpkeepModal,
    getProps: (_s, _choice, resolveUpkeepChoice) => ({
      onResolve: resolveUpkeepChoice,
    }),
  },
};
