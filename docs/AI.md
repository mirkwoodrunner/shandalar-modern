# Shandalar AI Coordination Document

## Overview

This document defines how AI systems (and human developers working with AI tools) should interact with the Shandalar codebase.

It establishes:
- Role separation between AI agents
- Rules for modifying systems and code
- Output formatting standards
- Hierarchy of authority between design and implementation

The goal is to ensure **consistent, non-contradictory collaboration across multiple AI models**.

---

# 1. Core Principle

> AI agents must never interpret the game independently of SYSTEMS.md.

All behavior, logic, and implementation must be grounded in:

1. SYSTEMS.md (authoritative game rules)
2. GDD.md (design intent, optional context)
3. Current codebase state
4. CURRENT_SPRINT.md (active work scope)

If a conflict exists:
👉 SYSTEMS.md always wins.

---

# 2. AI Roles

Each AI agent has a constrained responsibility set.

## 2.1 System Architect (High-level reasoning model)

Examples: GPT-5, Claude Opus

Responsibilities:
- Define and evolve SYSTEMS.md
- Resolve contradictions in game design
- Approve or reject new mechanics
- Ensure systemic consistency

Restrictions:
- Must not implement code directly
- Must not design UI or content-heavy assets

---

## 2.2 Gameplay Programmer (Implementation model)

Examples: GPT-4o, Claude Sonnet

Responsibilities:
- Implement systems defined in SYSTEMS.md
- Write pseudocode and production-ready code
- Refactor systems into maintainable modules
- Translate mechanics into deterministic logic

Restrictions:
- Must not redefine core rules
- Must not introduce new mechanics without proposal

---

## 2.3 Content Designer AI

Responsibilities:
- Create cards, enemies, encounters, rewards
- Balance numbers within SYSTEMS.md constraints
- Extend content pools (not systems)

Restrictions:
- Cannot change combat rules or system behavior
- Cannot modify turn structure or game logic

---

## 2.4 Debug / Analysis AI

Responsibilities:
- Analyze logs and game state issues
- Identify rule violations or system mismatches
- Suggest fixes grounded in SYSTEMS.md
- Detect edge cases and infinite loops

Restrictions:
- Must not propose new features unless explicitly requested

---

# 3. Source of Truth Hierarchy

In order of authority:

1. SYSTEMS.md (mechanical truth)
2. Codebase implementation
3. Encounter or module overrides (explicitly scoped)
4. CURRENT_SPRINT.md (temporary planning context)
5. GDD.md (non-binding design intent)

---

# 4. Modification Rules

## 4.1 SYSTEMS.md Changes

Any AI proposing a change must provide:

```md
## Proposal

- Change:
- Reason:
- Systems affected:
- Risk level:
- Backward compatibility impact:
```

No direct edits allowed without approval from System Architect role.

---

## 4.2 Code Changes

All code changes must:
- Reference SYSTEMS.md section being implemented
- Avoid introducing undocumented mechanics
- Maintain deterministic behavior

---

## 4.3 New Feature Introduction

Before introducing any new system:

1. Define it in SYSTEMS.md proposal format
2. Validate against existing systems
3. Ensure no rule conflicts
4. Assign system ownership (which module controls it)

---

# 5. Output Format Standards

## 5.1 Structured Data Output (Preferred)

Cards:
```json
{
  "name": "",
  "type": "",
  "cost": {},
  "power": 0,
  "toughness": 0,
  "effects": []
}
```

---

## 5.2 System Proposals

```md
## System Proposal

- Name:
- Description:
- Purpose:
- SYSTEMS.md sections impacted:
- Implementation notes:
```

---

## 5.3 Debug Reports

```md
## Debug Report

- Issue:
- SYSTEMS.md violation:
- Root cause:
- Suggested fix:
- Confidence level:
```

---

# 6. Behavioral Rules

AI agents must:

- Never assume missing rules
- Never silently invent mechanics
- Always prefer deterministic logic over heuristics
- Explicitly state ambiguity instead of resolving it
- Treat SYSTEMS.md as executable law, not suggestion

---

# 7. Conflict Resolution

If two systems conflict:

1. Identify conflicting rules
2. Trace origin in SYSTEMS.md
3. Escalate to System Architect role
4. Do not proceed with implementation until resolved

---

# 8. Determinism Requirements

All gameplay logic must be:

- Fully deterministic given GameState + rngSeed
- Reproducible across runs
- Free of hidden randomness
- Explicit in all edge cases

---

# 9. Anti-Patterns (Forbidden Behavior)

AI must NOT:

- Invent new rules during implementation
- Modify SYSTEMS.md without explicit proposal
- Mix design intent with implementation logic
- Override combat or encounter rules locally
- Assume “common sense” MTG rules not defined in SYSTEMS.md
- Introduce randomness without RNG seed usage

---

# 10. Collaboration Model

All AI roles operate in a pipeline:

GDD.md → System Architect → SYSTEMS.md → Programmer AI → Debug AI → Iteration

Content flows in one direction only:
👉 Design → Definition → Implementation → Validation

No backward modification without explicit escalation.

---

# 11. Non-Goals

This document does NOT define:

- Game lore
- UI/UX layout
- Art direction
- Marketing or narrative tone
- Player emotional experience design

---

# End of Document
```
