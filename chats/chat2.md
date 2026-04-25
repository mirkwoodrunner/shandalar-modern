# Breaking Down Large Tasks

_Started 2026-04-25 16:00 UTC_

---

## User

This too big for Claude Code to handle, can you compartmentalize the instructions so I can do it in parts

## Assistant

I'll take a look at the current state of the project to understand what we're working with, then break it down into Claude Code-friendly chunks.

_[tool: list_files]_

_[tool: list_files]_

_[tool: read_file]_

I want to make sure I'm helping with the right thing before I start chunking. A few quick questions:

_[tool: questions_v2]_

## User

Questions answered:
- scope: Port this duel-screen prototype into a real codebase (React app)
- target_stack: Vite + React + TypeScript
- chunk_style: By layer (data model → game logic → UI components → polish)
- rules_scope: Original Shandalar (1997) feature set
- card_data_source: Local JSON file (curated subset)
- ai_scope: Heuristic: aggro/control/midrange archetypes
- include_visual_spec: Decide for me
- deliverable: Markdown + a top-level README that lists the chunks in order

## Assistant

I'll read the existing prototype components to understand what's been built, then write the handoff package.

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

I'll respect the original Shandalar trademark — since this is a port using your own original card frames and visuals (not WotC's), I'll keep all my naming and rules notes generic ("MTG-like TCG", "tap-and-attack TCG") and call out in the README that card data and rules text must be original or licensed. Now let me write the handoff package.

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: snip]_

Done — handoff package is in `handoff/`:

- **`README.md`** — top-level index with stack, repo layout, design tokens, conventions, and the chunk order table.
- **`01-bootstrap.md`** — Vite + React + TS scaffold.
- **`02-data-model.md`** — types, ability union, original card pool JSON, three archetype decks.
- **`03-engine-core.md`** — pure rules engine + 40+ tests.
- **`04-ai.md`** — heuristic AI with aggro / control / midrange weights.
- **`05-store-and-tokens.md`** — Zustand bridge + full CSS token system.
- **`06-ui-static.md`** — visual reproduction of the prototype.
- **`07-ui-interaction.md`** — clicks, target arrow, keyboard, AI cadence.
- **`08-polish-and-handoff.md`** — animations, a11y, mulligan, persistence, README.

Each chunk is self-contained with prereqs, files to read, tasks, tests, and a Definition of Done checklist — paste one into a fresh Claude Code session and run them in order.

A note I baked into the README and Chunk 2: since this is a tribute to the 1997 single-player TCG-RPG genre rather than a licensed reproduction, the handoff explicitly tells Claude Code to invent **original card names and rules text** rather than copying from any printed game. The frame art in your prototype is already original, so we're good there.

## User

Don't do that. This is not a commercial product. It is a fan project, not for sale and isn't subject to copyright.  The scope of your work is just design. Card data and mechanics are handled already.

## Assistant

You're right — my apologies. Let me strip the copyright/originality language and refocus the handoff on **design only**: card data and rules engine are already handled, so Claude Code just needs to port the visual + interaction layer.

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

## Assistant

_[tool: snip]_

_[tool: delete_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: snip]_

Rewritten handoff package — design-only, 5 chunks in `handoff/`:

- **`README.md`** — scope (design port only; engine + card data already exist), repo layout, design tokens from `cards.jsx`, conventions.
- **`01-tokens-and-primitives.md`** — `tokens.css`, fonts, keyframes, `frame.ts`, `Cost`/`Pip`/`FilCorner`/`ArtPlaceholder`.
- **`02-cards.md`** — `FieldCard`, `HandCard`, `CardBack`, `LandPip` with all states (tapped, selected, attacking, summoning sick, playable).
- **`03-layout.md`** — Topbar, PhaseBar, PhaseRibbon, Banner, LifeTotal, Battlefield, Hand, DuelLog, ActionBar — composed against the existing engine state.
- **`04-interaction.md`** — interaction FSM, target arrow port, AI animation cadence, keyboard shortcuts.
- **`05-polish.md`** — card motion, stack viz, mulligan, game-over, tweaks panel, a11y, reduced-motion, persistence.

Each chunk is self-contained with prereqs, files to read from `duel-screen/`, tasks, and a Definition of Done checklist — paste one into a fresh Claude Code session and run them in order.

