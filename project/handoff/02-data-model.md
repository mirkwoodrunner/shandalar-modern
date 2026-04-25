# Chunk 2 — Data Model & Card Pool

**Goal:** Define the canonical TypeScript types for cards, zones, players, and game state. Build a curated original card pool as JSON. No engine yet — only types and data.

## Prerequisites
- Chunk 1 complete.

## Read first
- `duel-screen/components/duelScreen.jsx` — see `MOCK_STATE` for shape inspiration.
- `duel-screen/components/cards.jsx` — `CFRAME`, `CCOLOR`, and `MANA_BG` define the legal color set.

## Types — `src/engine/types.ts`

```ts
export type Color = 'W' | 'U' | 'B' | 'R' | 'G';
export type ManaSym = Color | 'C';                 // C = colorless/generic
export type CardType = 'Land' | 'Creature' | 'Instant' | 'Sorcery' | 'Artifact' | 'Enchantment';
export type Phase =
  | 'UNTAP' | 'UPKEEP' | 'DRAW'
  | 'MAIN_1'
  | 'COMBAT_BEGIN' | 'COMBAT_ATTACKERS' | 'COMBAT_BLOCKERS' | 'COMBAT_DAMAGE' | 'COMBAT_END'
  | 'MAIN_2' | 'END' | 'CLEANUP';

export interface CardDef {
  id: string;            // pool id, e.g. "llanowar-elves"
  name: string;
  cost: string;          // "2GG", "" for lands
  type: CardType;
  subtype?: string;      // "Elf Druid", "Forest"
  color: Color | '';     // '' for colorless/lands
  power?: number;
  toughness?: number;
  produces?: ManaSym[];  // lands & mana sources
  text: string;          // rules text — rendered as-is, not parsed
  abilities: AbilityDef[]; // structured form of `text` — see Chunk 3
}

export interface CardInstance {
  iid: string;           // unique per game; assigned at deck-shuffle
  defId: string;         // → CardDef.id
  controller: 'p' | 'o';
  zone: Zone;
  tapped: boolean;
  summoningSick: boolean;
  damage: number;
  counters: Record<string, number>; // "+1/+1": 2, etc
}

export type Zone = 'library' | 'hand' | 'battlefield' | 'graveyard' | 'exile' | 'stack';

export interface PlayerState {
  side: 'p' | 'o';
  life: number;
  maxLife: number;
  manaPool: Record<ManaSym, number>;
  landDropsLeft: number;
  // libraries/hands/etc are derived from CardInstance[] indexed by zone
}

export interface GameState {
  turn: number;
  active: 'p' | 'o';
  priority: 'p' | 'o';
  phase: Phase;
  players: { p: PlayerState; o: PlayerState };
  cards: Record<string, CardInstance>;          // keyed by iid
  stack: string[];                              // iids on the stack, top = last
  attackers: string[];                          // iids declared as attackers
  blocks: Record<string, string[]>;             // attackerIid → blockerIids
  log: LogEvent[];
  rngSeed: number;
  ruleset: { name: 'Shandalar' | 'Modern'; startingLife: number; manaBurn: boolean };
}

export interface LogEvent {
  kind: 'turn' | 'phase' | 'play' | 'opp_play' | 'damage' | 'heal' | 'info' | 'system';
  text: string;
  turn: number;
}
```

## Abilities — keep it small

Define a discriminated union of **about 12 ability shapes** that cover the prototype's card pool. Don't try to model the full comprehensive rules.

```ts
export type AbilityDef =
  | { kind: 'tap-for-mana'; produces: ManaSym[] }
  | { kind: 'flying' }
  | { kind: 'first-strike' }
  | { kind: 'haste' }
  | { kind: 'trample' }
  | { kind: 'menace' }
  | { kind: 'vigilance' }
  | { kind: 'lifelink' }
  | { kind: 'deathtouch' }
  | { kind: 'etb-gain-life'; amount: number }
  | { kind: 'etb-draw'; amount: number }
  | { kind: 'deal-damage'; amount: number; target: 'any' | 'creature' | 'player' }
  | { kind: 'counter-spell' }
  | { kind: 'destroy-creature' }
  | { kind: 'pump'; power: number; toughness: number; until: 'eot' };
```

If a card from the prototype's mock list needs an ability you don't have here, **add it to this list**, don't bolt it on later.

## Card pool — `public/data/cards.json`

Build **40–60 original cards**, 5 colors balanced. Use the prototype's `MOCK_STATE` as a *style* reference but invent fresh names. Required:

- 5 basic lands (one per color), each `produces: [color]`.
- 2 dual lands.
- 4–6 creatures per color across costs 1–6.
- 2–3 instants per color.
- 1–2 sorceries per color.
- A handful of artifacts.

For each card, fill `abilities` with the structured form. `text` is the human-readable string the UI renders.

## Decks — `src/data/decks.ts`

Three pre-built 60-card decks aligned with Chunk 4's archetypes:

- `aggro-rg.ts` — Red/Green stomp. Mostly 1–3 cost creatures + burn.
- `control-ub.ts` — Blue/Black. Counters, removal, evasive flyers.
- `midrange-wg.ts` — White/Green. Curve creatures + life gain.

Each deck exports `{ name, archetype, cards: string[] }` where `cards` is an array of 60 `CardDef.id`s.

## Loader — `src/data/loadCards.ts`

```ts
export async function loadCardPool(): Promise<Record<string, CardDef>>;
export function buildDeck(cardPool, deckIds): CardInstance[]; // assigns iids, sets zone='library'
```

## Definition of Done

- [ ] `cards.json` has ≥40 cards, all 5 colors represented, all entries pass a JSON schema test.
- [ ] Three decks compile and each contains exactly 60 valid card ids.
- [ ] `tsc --noEmit` clean.
- [ ] A snapshot test in `src/data/__tests__/pool.test.ts` asserts pool size + per-color counts.
- [ ] No ability `kind` appears in any card's `abilities` that isn't in the union.
- [ ] All card names are original.

## Out of scope
The rules engine, rendering, anything React.
