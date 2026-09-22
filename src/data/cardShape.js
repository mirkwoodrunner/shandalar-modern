// src/data/cardShape.js
// Shared card-shape contract. Any array handed to makeCardInstance as its
// `pool` argument must satisfy this. Dependency-free by design: it defines the
// contract, it does not import or consume any pool. CARD_DB (src/data/cards.js)
// and CARD_DB_PREMODERN (src/data/cardsPremodern.js) both already satisfy it --
// see src/data/__tests__/cardShape.test.js.

// Derived from the fields every entry in CARD_DB and CARD_DB_PREMODERN carries
// in common (verified against the real data, not assumed). Pool-specific extras
// -- CARD_DB_PREMODERN's `set`/`legal`/`implemented`, CARD_DB's handler keys --
// are deliberately not part of the contract.
export const REQUIRED_CARD_FIELDS = [
  'id',
  'name',
  'type',
  'color',
  'cmc',
  'cost',
  'text',
  'rarity',
];

// Returns { valid, missing }. A field is "missing" when it is absent, null, or
// undefined -- present-but-empty (e.g. text: "") is a legal value and passes.
export function validateCardShape(card) {
  if (!card || typeof card !== 'object') {
    return { valid: false, missing: [...REQUIRED_CARD_FIELDS] };
  }
  const missing = REQUIRED_CARD_FIELDS.filter(f => card[f] === undefined || card[f] === null);
  return { valid: missing.length === 0, missing };
}
