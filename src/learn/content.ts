// src/learn/content.ts
// User-facing framing strings for Learn Mode. No logic, no imports.
//
// Fan content posture is set in docs/LEARN_MODE_ROADMAP.md section 6. The short
// version: Learn Mode is free, unofficial, and presented as a tutorial rather
// than as a place to play Magic. Tier 1 overlaps Wizards' own new-player funnel
// more than any other part of this project, so the framing here is a release
// gate, not launch polish.

// Wizards' Fan Content Policy notice, in the policy's standard form.
//
// VERIFY THIS STRING against the live Fan Content Policy page before any public
// release. It was written from the policy's long-standing wording and could not
// be checked against the source from the build environment, which blocks egress
// to company.wizards.com. Policy text changes; this is the one string in the
// app where being approximately right is not good enough.
//
// The copyright sign is escaped rather than written literally so the source
// stays ASCII, matching the project's encoding rule for JSX emoji.
export const DISCLAIMER =
  'Learn Mode is unofficial Fan Content permitted under the Fan Content Policy. ' +
  'Not approved/endorsed by Wizards. Portions of the materials used are property of ' +
  'Wizards of the Coast. \u00A9Wizards of the Coast LLC.';

// Tutorial framing, shown under the title. States what this is for in one line,
// and what it is not.
export const TAGLINE =
  'A free, unofficial tutorial for learning Magic: The Gathering. ' +
  'It teaches the rules -- it is not a place to play games.';

// Release honesty. Tier 1 is the only tier that exists, and saying so up front
// costs nothing and sets the right expectation.
export const EARLY_ACCESS =
  'Early and incomplete. Right now this covers Tier 1 only: lands and mana, ' +
  'casting spells, who can attack, and winning this turn. More tiers are planned.';

// Free, always. The Fan Content Policy's core condition, and Scryfall's terms,
// both depend on it. Stated in the UI so it is a promise, not just a doc.
export const NO_MONEY = 'Free, with no ads and nothing to buy.';
