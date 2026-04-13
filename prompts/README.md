# AI Prompt Templates

This directory contains prompt templates organized by AI role for collaborative development with multiple AI models.

## AI Roles

Each role has specific responsibilities, constraints, and prompt templates designed for that role's function in the project.

### System Architect
**Directory**: [system-architect/](./system-architect/)

High-level reasoning model responsible for:
- Defining and evolving SYSTEMS.md
- Resolving contradictions in game design
- Approving or rejecting new mechanics
- Ensuring systemic consistency

**Authority Level**: HIGH

**Prompt Templates**:
1. Design Review & Consistency Check
2. Contradiction Resolution
3. Mechanic Approval Framework
4. System Design Framework
5. Design Intent Clarification

---

### Gameplay Programmer
**Directory**: [gameplay-programmer/](./gameplay-programmer/)

Implementation model responsible for:
- Implementing systems defined in SYSTEMS.md
- Writing pseudocode and production-ready code
- Refactoring systems into maintainable modules
- Translating mechanics into deterministic logic

**Authority Level**: MEDIUM

**Prompt Templates**:
1. System Implementation Plan
2. Refactoring Request
3. Bug Fix Diagnosis & Solution
4. Code Review Checklist
5. Performance Optimization
6. Module Interface Design

---

### Content Designer
**Directory**: [content-designer/](./content-designer/)

Content creation model responsible for:
- Creating cards, enemies, encounters, rewards
- Balancing numbers within SYSTEMS.md constraints
- Extending content pools (not systems)

**Authority Level**: LOW

**Prompt Templates**:
1. Card Design Framework
2. Encounter Design
3. Reward Pool Design
4. Enemy AI Behavior
5. Card Balance Analysis
6. Progression Curve Design

---

### Debug & Analysis
**Directory**: [debug-analysis/](./debug-analysis/)

Analysis and debugging model responsible for:
- Analyzing logs and game state issues
- Identifying rule violations or system mismatches
- Suggesting fixes grounded in SYSTEMS.md
- Detecting edge cases and infinite loops

**Authority Level**: LOW

**Prompt Templates**:
1. Rule Violation Investigation
2. Game State Audit
3. Determinism Verification
4. Edge Case Analysis
5. Performance Profiling
6. Log Analysis & Error Tracking

---

## How to Use These Prompts

### Step 1: Identify Your Role
Determine which AI role should handle your task:
- **System Architecture/Design decisions?** → System Architect
- **Code implementation/fixes?** → Gameplay Programmer
- **Card/encounter/reward creation?** → Content Designer
- **Issue investigation/testing?** → Debug & Analysis

### Step 2: Select the Appropriate Template
Navigate to your role's directory and choose the template that matches your task.

### Step 3: Fill in the Template
Replace all bracketed sections [LIKE THIS] with your specific context and details.

### Step 4: Submit to AI Model
Provide the completed prompt to the appropriate AI model.

### Step 5: Review Output
Review the output according to the output format specified in the template.

---

## Key Principles

### Authority Hierarchy
- **System Architect** has highest authority on design decisions
- **Gameplay Programmer** has authority on implementation details
- **Content Designer** creates within defined constraints
- **Debug & Analysis** suggests but doesn't implement

### Source of Truth
All prompts reference SYSTEMS.md as the authoritative source for game rules and behavior.

### Determinism
Every prompt emphasizes maintaining deterministic gameplay - all operations must be reproducible from GameState + rngSeed.

### Clear Boundaries
Each role has explicit constraints to prevent scope creep and maintain system integrity.

---

## Workflow Example

**Scenario**: Adding a new card mechanic

1. **Content Designer** uses the **Card Design Framework** template to propose a new card
2. **System Architect** reviews using the **Design Review & Consistency Check** template to ensure it fits existing systems
3. **Gameplay Programmer** uses the **System Implementation Plan** template to implement the mechanic
4. **Debug & Analysis** uses the **Edge Case Analysis** template to test corner scenarios
5. **Gameplay Programmer** uses the **Code Review Checklist** template for final validation

---

## Template Selection Guide

### For Design Questions
- Is this about game rules or mechanics? → **System Architect**
- Is this about which rule applies? → **System Architect**
- Is this ambiguous in SYSTEMS.md? → **System Architect**

### For Implementation Tasks
- Do I need to write code? → **Gameplay Programmer**
- Should I refactor existing code? → **Gameplay Programmer**
- Is there a bug to fix? → **Gameplay Programmer** (with Debug & Analysis help)

### For Content Creation
- Do I need to create cards? → **Content Designer**
- Should I design an encounter? → **Content Designer**
- Do I need to balance something? → **Content Designer**

### For Testing & Analysis
- Do I need to find a bug? → **Debug & Analysis**
- Is gameplay non-deterministic? → **Debug & Analysis**
- Do I need to test edge cases? → **Debug & Analysis**
- Do I need to analyze performance? → **Debug & Analysis**

---

## Escalation Paths

### When System Architect Should Review
- Design decisions affect multiple systems
- SYSTEMS.md is ambiguous about behavior
- New mechanics are proposed
- Rule contradictions exist

### When Gameplay Programmer Should Review
- Implementation details need discussion
- Code quality concerns arise
- Determinism needs verification
- Performance optimization is needed

### When Debug & Analysis Should Review
- Bugs are suspected
- Edge cases need testing
- Performance is degraded
- Game state seems inconsistent

---

## Related Documentation

- [../README.md](../README.md) - Project overview
- [../docs/SYSTEMS.md](../docs/SYSTEMS.md) - Authoritative game rules
- [../docs/AI.md](../docs/AI.md) - AI coordination framework
- [../docs/ENGINE_CONTRACT_SPEC.md](../docs/ENGINE_CONTRACT_SPEC.md) - System contracts
- [../CONTRIBUTING.md](../CONTRIBUTING.md) - Contribution guidelines
- [../CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md) - Community standards

---

## Tips for Best Results

1. **Be Specific**: Provide complete context and examples
2. **Reference SYSTEMS.md**: Always cite relevant sections
3. **Include Examples**: Show what you mean, don't just describe
4. **Ask Clear Questions**: State what you need from the AI
5. **Provide Constraints**: Explain what's off-limits
6. **Document Assumptions**: State what you're assuming about the problem

---

## Questions?

If you're unsure which template or role to use:
- Check the **Template Selection Guide** above
- Review [../docs/AI.md](../docs/AI.md) for detailed role descriptions
- Open an issue with the [AI Coordination](../.github/ISSUE_TEMPLATE/ai_coordination.md) template
