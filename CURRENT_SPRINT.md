# Current Sprint — Shandalar Modern

> **Last updated:** 2026-04-16  
> **Phase:** 5 — Card Effect Implementation (stub resolution)

---

## Where We Are

We are mid-way through **Phase 5**, which focuses on resolving all stubbed card
effects left over from earlier phases. The core game loop (drawing, playing
lands/spells, attacking, blocking, damage, turn cycle) is solid. Phase 5 is
filling in the remaining interactive effects so that the included card set plays
correctly.

---

## Just Completed (this session)

### Phase 5 Stub Effects — COMPLETE

All five previously stubbed card effects are now implemented in `DuelCore.js`:

| Effect | Card(s) | Status |
|---|---|---|
| `powerSink` | Power Sink | ✅ Confirmed complete (Phase 4) |
| `enchantCreature` | Holy Armor, Holy Strength, Lance, White Ward | ✅ Implemented (Phase 5) |
| `pumpPowerEOT` | Shivan Dragon activated ability (R) | ✅ Implemented (Phase 5) |
| `gainFlyingEOT` | Goblin Balloon Brigade activated ability (R) | ✅ Implemented (Phase 5) |
| `addManaAny` | Birds of Paradise activated ability (T) | ✅ Implemented (Phase 5) |

#### New systems added

- **`eotBuffs[]`** on card instances — temporary power/toughness buffs purged
  at the CLEANUP step each turn.
- **`enchantments[]`** on card instances — aura attachment with cascade removal
  via `zMove` when the host leaves the battlefield.
- **`getPow` / `getTou` / `hasKw`** updated to read both `eotBuffs` and
  `enchantments` arrays when computing effective stats/keywords.
- **`BopColorPicker`** UI component — mirrors `LotusColorPicker`; tapping Birds
  of Paradise opens a colour picker that adds 1 mana of the chosen colour.
- **`CHOOSE_BOP_COLOR`** and **`SET_PENDING_BOP`** reducer actions added to
  `duelReducer`.
- **`pendingBop`** state field added to `buildDuelState`.

#### Docs updated

- `docs/gdd.md` — stub effects table updated; all entries now show resolved.
- `docs/gdd.md` — Phase 5 section updated from "planned" to "in progress".

---

### Infrastructure — GitHub MCP Server on Render

- Deployed `github/github-mcp-server` to Render as a Docker service.
- Repo: `mirkwoodrunner/github-mcp-server`
- Service URL: `https://github-mcp-server-qtk1.onrender.com`
- Status: Live on free tier (cold starts expected after ~15 min idle).
- Auth to Claude.ai connectors pending — native GitHub connector is already
  connected and provides read access via web fetch.

---

## Up Next (Phase 5 — remaining)

| Item | Notes |
|---|---|
| **Sengir Vampire death trigger** | +1/+1 counter when a creature it dealt damage to dies |
| **Force of Nature upkeep prompt** | UI choice: pay GGGG or take 8 damage each upkeep |
| **First Strike two-step combat** | Separate first-strike damage step before normal damage |
| **LocalStorage save state** | Full run persistence across browser refreshes |
| **Quest completion triggers** | Wire quest objectives to in-game events |

---

## Known Blockers / Open Questions

- **Auth for MCP server:** Claude.ai connector auth is not yet wired to the
  Render-hosted MCP server. Current sessions use the native GitHub connector
  for read access. Write access (push, PR creation) works via the MCP tool
  calls within Claude Code sessions.
- **First Strike complexity:** True two-step combat will touch `DuelCore.js`
  combat resolution significantly — plan the state machine change before
  coding.
- **Sengir trigger timing:** Needs a "damaged by" tracking map on card
  instances, cleared each turn, checked in the `zMove` death handler.

---

## Branch / PR Notes

Active feature branch for this session: `claude/update-current-sprint-L1Bnc`

Previous merged work lives on:
- `claude/phase5-stub-effects-lEkav` — Phase 5 effect implementations
- `claude/fix-ai-mana-attacks-JR07N` — AI mana/attack fixes
- `claude/fix-ai-mana-burn-XuteF` — AI mana burn fixes
