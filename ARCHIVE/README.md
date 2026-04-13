# ARCHIVE

This directory contains original files and historical artifacts from the Shandalar Modern project's development.

## Contents

### shandalar.jsx
Description: Original monolithic implementation of Shandalar Modern created by Claude AI

Purpose: 
- Initial prototype and proof-of-concept
- Foundation for all subsequent architectural decisions
- Historical baseline for project evolution

Key Features:
- Single-file JSX component structure
- Complete game logic in one module
- Early game mechanics implementation
- Pre-modularization phase

---

### shandalar-duel.jsx
Description: Extracted duel/combat system from the original implementation

Purpose:
- Iteration on combat mechanics
- Early attempt at system separation
- Foundation for current DuelCore.js

Key Features:
- Combat logic extraction
- Turn-based system implementation
- Early action resolution

Evolution Path:
Led to > docs/SYSTEMS.md Section 5 (Combat Rules)

---

### shandalar-phase3.jsx
Description: Third phase iteration with phase-based turn system

Purpose:
- Development of structured turn phases
- Early version of turn flow mechanics
- Testing phase-based architecture

Key Features:
- Phase enumeration and management
- Phase-specific action validation
- Turn progression logic

Evolution Path:
Led to > docs/SYSTEMS.md Section 3 (Turn System)

---

### shandalar-phase4.jsx
Description: Fourth phase iteration with enhanced phase management

Purpose:
- Refinement of phase system
- Integration of multiple game systems
- Pre-determinism architecture

Key Features:
- Advanced phase transitions
- Multi-system coordination
- Enhanced game state management

Evolution Path:
Led to > docs/ENGINE_CONTRACT_SPEC.md (System Contracts)

---

## Evolution Timeline

shandalar.jsx
    |
    v
shandalar-duel.jsx (Combat extraction)
    |
    v
shandalar-phase3.jsx (Phase system v1)
    |
    v
shandalar-phase4.jsx (Phase system v2)
    |
    v
Modern Modular Architecture
    |
    +-- docs/SYSTEMS.md (Specification)
    +-- docs/AI.md (Multi-AI Framework)
    +-- docs/ENGINE_CONTRACT_SPEC.md (Contracts)
    +-- src/ (Production code)

---

## How These Files Informed Current Architecture

### Determinism Requirements
- Original files used non-deterministic operations
- Led to requirement for rngSeed-based randomness
- Enforced in docs/SYSTEMS.md

### System Boundaries
- Early attempts at separation led to ENGINE_CONTRACT_SPEC.md
- Defined which systems control which state mutations
- DuelCore.js as authoritative system

### Multi-AI Coordination
- Original monolithic design couldn't support multiple AI roles
- Led to docs/AI.md framework
- Established role hierarchy and constraints

### SYSTEMS.md Specification
- Game rules extracted from implementations
- Formalized in docs/SYSTEMS.md
- Became source of truth for all contributions

---

## Using Archive Files

### For Learning
- Study progression from monolithic to modular design
- Understand why specific architectural patterns were chosen
- See how game mechanics evolved through iterations

### For Reference
- Compare current implementation against original approach
- Verify all original functionality preserved
- Track feature completeness

### For Decision Making
- Use as baseline when considering architectural changes
- Reference when evaluating breaking vs. non-breaking changes
- Historical context for design decisions

---

## Important Notes

- Not for Production Use: These files are archived and not maintained
- Historical Only: Do not reference for current implementation details
- Source of Truth: docs/SYSTEMS.md is authoritative
- Read-Only: No active development occurs here
- Pre-Determinism Era: Contain non-deterministic code patterns (intentional)

---

## Related Documentation

- README.md - Current project overview
- docs/SYSTEMS.md - Current authoritative game specification
- docs/AI.md - AI coordination and role definitions
- docs/ENGINE_CONTRACT_SPEC.md - System architecture
- CONTRIBUTING.md - Current contribution guidelines

---

## Archive Maintenance Policy

This directory is preserved as historical reference:
- Files are read-only and not modified
- No active development occurs here
- New archived materials follow same organizational pattern
- Timestamp files with dates when adding new materials (e.g., filename-YYYY-MM-DD.ext)

---

## Quick Reference: What Changed

Original vs Current:

Structure: Monolithic JSX -> Modular codebase
Specification: Code-driven -> SYSTEMS.md-driven
Determinism: Not enforced -> Strictly enforced
System Boundaries: Blurred -> Clear contracts
AI Support: Single AI -> Multi-AI framework
Authority: Code is source of truth -> SYSTEMS.md is source of truth
Documentation: Minimal -> Comprehensive
