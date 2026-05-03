# Shandalar: Modern Edition

A browser-based reimplementation of the 1996 MicroProse *Magic: The Gathering* roguelike, built as a personal hobby project. Playable in desktop and mobile browsers.

## What It Is

A faithful but modernized recreation of the classic Shandalar game loop:
- Procedural overworld exploration (32×22 map)
- Ante-based duels against enemy wizards and dungeon creatures
- Town services: card trades, inn healing, gem merchant
- Mage castle boss fights and Arzakon final encounter
- Card art sourced from Scryfall (oldest classic printing preferred)

## Tech Stack

- **React + Vite** — browser-based, no backend
- **GitHub Codespaces** — primary development environment
- **Claude Code** — AI coding agent used for implementation

## Current Status

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Overworld map, fog of war, town/dungeon/castle modals | ✅ Complete |
| 2 | Duel engine, card DB, AI, combat pipeline | ✅ Complete |
| 3 | Overworld↔duel integration, ante, progression | ✅ Complete |
| 4 | Boss encounters, Arzakon endgame, stub resolution | ✅ Complete |
| 5 | Scryfall card art integration | ✅ Complete |

See [`docs/gdd.md`](docs/gdd.md) for the full design document and [`docs/CURRENT_SPRINT.md`](docs/CURRENT_SPRINT.md) for active work items.

## Running Locally

```bash
git clone <repo-url>
cd shandalar-modern
npm install
npm run dev
```

Requires Node 18+. Open `http://localhost:5173` in a browser.

## Documentation

|Document                                                    |Purpose                                          |
|------------------------------------------------------------|-------------------------------------------------|
|[`docs/gdd.md`](docs/gdd.md)                                |Game design document — authoritative design bible|
|[`docs/SYSTEMS.md`](docs/SYSTEMS.md)                        |Technical system specifications                  |
|[`docs/MECHANICS_INDEX.md`](docs/MECHANICS_INDEX.md)        |Mechanic-to-code traceability                    |
|[`docs/CURRENT_SPRINT.md`](docs/CURRENT_SPRINT.md)          |Active sprint and next items                     |
|[`scryfall/SCRYFALL_STATUS.md`](scryfall/SCRYFALL_STATUS.md)|Card database pipeline status                    |
|[`docs/AI.md`](docs/AI.md)                                  |AI coordination rules                            |

## License

MIT — see `LICENSE` for details.
