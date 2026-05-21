# Changelog

## Unreleased

### Tier 2 — AI Heuristic Improvements

- **Change 1 — Scored spell evaluation**: Replaced `Math.random() >= profile.greedySpells` in the generic-spells block with a `scoreSpellValue(card, state, profile)` helper that scores spells 0–1 by situational value (lethal burn = 1.0, draw scales with hand deficit, life gain scales with low life). Gate is now `score * profile.greedySpells < 0.35`.
- **Change 2 — Threat-aware removal targeting**: Replaced highest-power targeting with `scoreThreat(creature, state)` which adds bonuses for flying, lifelink, deathtouch, trample, and first strike. Expensive removal (CMC ≥ 4) is withheld against trivial threats unless the opponent is at low life. Removed the `Math.random() < profile.removalPriority` gate.
- **Change 3 — Multi-blocker lethal prevention**: Added an aggregate lethal check at the top of `planBlock`. When total incoming damage ≥ AI life, attackers are sorted by power and chumped in order until damage drops below lethal.
- **Change 4 — Activated ability planner**: Added `planActivatedAbilities(state, profile)` called from `planMain` before `PASS_PRIORITY`. Handles Triskelion-style ping: kills the highest-threat one-toughness creature; fires at opponent face when their life ≤ 5.
- **Change 5 — Berserk prefers opposing attackers**: Berserk now targets the opponent's highest-power attacker first (they die at end of turn, making it effective removal); falls back to own attackers when no opponent attackers are present.

### Tier 1 — AI Bug Fixes

- **Fix 1 — `worthlessBlock` logic inverted**: Removed the `worthlessBlock` variable and its guard in `planBlock`; the inverted condition was refusing to block with the AI's best blocker.
- **Fix 2 — Remove diagnostic `console.warn` in `planAttack`**: Deleted the `console.warn('[AI] planAttack candidates:…')` line that fired on every combat phase.
- **Fix 3 — `RESOLVE_STACK` double-resolve**: Made the `RESOLVE_STACK` push in `aiDecide` conditional on the card being an instant under a non-batch ruleset; sorceries and permanents are already resolved by `CAST_SPELL`.
- **Fix 4 — `xVal: action._xVal ?? 3` arbitrary fallback**: Changed the default X-value fallback from `3` to `null` in the `CAST_SPELL` push.
- **Fix 5 — AI mulligan logic**: Added `shouldMulligan` function and wired it into `aiDecide`; the AI now mulligans hands with 0–1 lands or 6+ lands, capped at 2 mulligans and never below 5 cards.
