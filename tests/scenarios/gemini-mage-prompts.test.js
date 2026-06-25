// tests/scenarios/gemini-mage-prompts.test.js
// @gemini -- per-mage system prompt selection (pure, no API key needed)

import { describe, it, expect } from 'vitest';
import { selectSystemInstruction, SYSTEM_INSTRUCTION } from '../../src/engine/geminiPrompts.js';

describe('@gemini per-mage system prompt selection', () => {
  it('returns a mage-specific instruction for DELENIA', () => {
    const delenia = selectSystemInstruction('DELENIA');
    expect(delenia).toContain(SYSTEM_INSTRUCTION);
    expect(delenia).not.toBe(SYSTEM_INSTRUCTION);
    expect(delenia).toContain('white aggro-control');
  });

  it('returns a mage-specific instruction for XYLOS', () => {
    const xylos = selectSystemInstruction('XYLOS');
    expect(xylos).toContain(SYSTEM_INSTRUCTION);
    expect(xylos).not.toBe(SYSTEM_INSTRUCTION);
    expect(xylos).toContain('blue control');
  });

  it('returns a mage-specific instruction for MORTIS', () => {
    const mortis = selectSystemInstruction('MORTIS');
    expect(mortis).toContain(SYSTEM_INSTRUCTION);
    expect(mortis).not.toBe(SYSTEM_INSTRUCTION);
    expect(mortis).toContain('attrition-focused black');
  });

  it('falls back to the base instruction for unknown ids', () => {
    expect(selectSystemInstruction('NOT_A_MAGE')).toBe(SYSTEM_INSTRUCTION);
  });

  it('falls back to the base instruction for null/undefined/non-string', () => {
    expect(selectSystemInstruction(null)).toBe(SYSTEM_INSTRUCTION);
    expect(selectSystemInstruction(undefined)).toBe(SYSTEM_INSTRUCTION);
    expect(selectSystemInstruction(42)).toBe(SYSTEM_INSTRUCTION);
  });

  it('SYSTEM_INSTRUCTION is a non-empty string', () => {
    expect(typeof SYSTEM_INSTRUCTION).toBe('string');
    expect(SYSTEM_INSTRUCTION.length).toBeGreaterThan(0);
  });
});
