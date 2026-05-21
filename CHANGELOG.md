# Changelog

## Unreleased

### Tier 1 — AI Bug Fixes

- **Fix 1 — `worthlessBlock` logic inverted**: Removed the `worthlessBlock` variable and its guard in `planBlock`; the inverted condition was refusing to block with the AI's best blocker.
- **Fix 2 — Remove diagnostic `console.warn` in `planAttack`**: Deleted the `console.warn('[AI] planAttack candidates:…')` line that fired on every combat phase.
- **Fix 3 — `RESOLVE_STACK` double-resolve**: Made the `RESOLVE_STACK` push in `aiDecide` conditional on the card being an instant under a non-batch ruleset; sorceries and permanents are already resolved by `CAST_SPELL`.
- **Fix 4 — `xVal: action._xVal ?? 3` arbitrary fallback**: Changed the default X-value fallback from `3` to `null` in the `CAST_SPELL` push.
- **Fix 5 — AI mulligan logic**: Added `shouldMulligan` function and wired it into `aiDecide`; the AI now mulligans hands with 0–1 lands or 6+ lands, capped at 2 mulligans and never below 5 cards.
