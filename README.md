# Project Documentation

## Project Overview
This project aims to develop a digital adaptation of classic card games using an AI coordination framework. The focus is on creating deterministic gameplay that adheres to a single source of truth, ensuring a consistent experience across different platforms and players.

## Quick Links to Documentation
- [API Documentation](#)
- [Architecture Design](#)
- [Guidelines](#)

## Project Structure
- `src/` - Source code for the application.
- `docs/` - Documentation files.
- `tests/` - Test cases and scripts.

## Core Principles
1. **Determinism**: All actions and game states can be reproduced from the initial state.
2. **Single Source of Truth**: Game state is maintained in a centralized system to avoid inconsistencies.
3. **Layer Separation**: The architecture is divided into distinct layers, allowing for easier modifications and testing.
4. **Action Pipeline**: All actions are processed in a defined pipeline, ensuring they are applied sequentially and deterministically.

## Multi-AI Development Framework
The framework supports multiple AI systems working together, with defined roles and a hierarchical structure:
- **Lead AI**: Orchestrates the overall gameplay and order of actions.
- **Supporting AIs**: Assist in specific tasks like decision-making or resource management.

## GameAction Contract
All actions taken in the game adhere to the `GameAction` contract, which standardizes input and output for actions across all AIs.

## System Boundaries
Defining clear boundaries for the AI systems to operate within, ensuring that each AI respects the integrity of the game state.

## Getting Started Instructions
1. Clone the repository using `git clone <repo-url>`.
2. Install dependencies listed in `requirements.txt`.
3. Run the application using the command `python main.py`.

## Development with AI Models
Guidelines for integrating and developing custom AI models within the framework, including best practices for training and testing AIs.

## Prompt Organization
Best practices for organizing prompts used by AIs, ensuring clarity and efficiency in AI operations.

## Anti-Patterns
Common mistakes that should be avoided when developing within the framework, such as breaking determinism and ignoring the single source of truth.

## Game State Model
An overview of how the game state is represented and manipulated throughout the game's lifecycle.

## Non-Goals
- Creating a fully automated game experience without human oversight.
- Supporting overly complex AI interactions that compromise game performance.