// src/engine/GeminiAdvisor.js
// Isolated async advisor module for Gemini LLM opponent integration.
//
// STRICT CONSTRAINTS:
//   - This module is async. It must never be imported by DuelCore.js or AI.js.
//   - It reads a serialized game state snapshot. It does not touch live GameState.
//   - It returns an action index (number) or null on failure.
//   - Callers must always handle null and fall back to the heuristic AI.
//
// PHASE GATING -- only call this module during:
//   MAIN_1, MAIN_2, COMBAT_ATTACKERS, COMBAT_BLOCKERS
// All other phases must bypass this module entirely.
//
// legalActions CONTRACT:
//   legalActions[0] must always be the passive/pass action.
//   This is enforced by computeLegalActions() in the engine.
//   On any failure or out-of-bounds return, this module defaults to index 0.

import { GoogleGenAI, Type } from '@google/genai';

// computeLegalActions is imported by callers (useDuelController.ts) before calling
// fetchGeminiMove. GeminiAdvisor itself does not import LegalActions -- it only
// receives the already-serialized state payload.
const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

const SYSTEM_INSTRUCTION = [
  'You are a competitive Magic: The Gathering AI playing in the Shandalar roguelike.',
  'The game uses Alpha/Beta rules. Analyze the game state JSON provided and select the',
  'single best tactical action index from the legalActions array.',
  'Prioritize removing threats, advancing board state, and dealing lethal damage.',
].join(' ');

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    selectedActionIndex: {
      type: Type.INTEGER,
      description: 'The index of the chosen action from the legalActions array.',
    },
    strategicReasoning: {
      type: Type.STRING,
      description: 'One sentence explaining the tactical reasoning.',
    },
  },
  required: ['selectedActionIndex'],
};

/**
 * Ask Gemini to select an action from the provided legal action list.
 *
 * @param {object} serializedState - Token-optimized game state snapshot.
 *   Must include a legalActions array where index 0 is always a pass/passive action.
 * @returns {Promise<{index: number, reasoning: string, sentPayload: object}|null>}
 *   Resolved decision, or null if the call fails or should fall back to heuristic AI.
 */
export async function fetchGeminiMove(serializedState) {
  const actions = serializedState?.legalActions;

  if (!actions || actions.length === 0) {
    console.warn('[GeminiAdvisor] Empty legalActions -- returning null.');
    return null;
  }

  // Trivial choice: only one option, no need to call the API.
  if (actions.length === 1) {
    return { index: 0, reasoning: '(only one legal action)', sentPayload: serializedState };
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        { role: 'user', parts: [{ text: JSON.stringify(serializedState) }] },
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    });

    const decision = JSON.parse(response.text);
    const idx = decision.selectedActionIndex;
    const reasoning = decision.strategicReasoning ?? '(no reasoning provided)';

    if (Number.isInteger(idx) && idx >= 0 && idx < actions.length) {
      return { index: idx, reasoning, sentPayload: serializedState };
    }

    console.warn(`[GeminiAdvisor] Out-of-bounds index ${idx} -- falling back to 0.`);
    return { index: 0, reasoning: `(out-of-bounds index ${idx}, defaulted to pass)`, sentPayload: serializedState };

  } catch (err) {
    console.error('[GeminiAdvisor] API call failed:', err?.message ?? err);
    return null;
  }
}
