import { describe, expect, it } from 'vitest';
import {
  availableInputTokens,
  estimateTokens,
  fitPromptToContext,
} from './contextBudget';

describe('context budget', () => {
  it('estimates CJK more conservatively than Latin characters', () => {
    expect(estimateTokens('江湖世界')).toBeGreaterThan(estimateTokens('abcd'));
  });

  it('keeps a prompt that fits', () => {
    const result = fitPromptToContext('short prompt', {
      contextWindowTokens: 4096,
      reservedOutputTokens: 512,
      safetyMarginTokens: 256,
    });
    expect(result.truncated).toBe(false);
    expect(result.text).toBe('short prompt');
  });

  it('preserves the beginning and end when deterministic truncation is required', () => {
    const text = `BEGIN-${'江湖'.repeat(4000)}-END`;
    const budget = {
      contextWindowTokens: 2048,
      reservedOutputTokens: 512,
      safetyMarginTokens: 256,
    };
    const result = fitPromptToContext(text, budget);
    expect(result.truncated).toBe(true);
    expect(result.text.startsWith('BEGIN-')).toBe(true);
    expect(result.text.endsWith('-END')).toBe(true);
    expect(result.estimatedInputTokens).toBeLessThanOrEqual(availableInputTokens(budget));
  });

  it('returns an empty prompt when output reservation consumes the window', () => {
    const result = fitPromptToContext('hello', {
      contextWindowTokens: 512,
      reservedOutputTokens: 400,
      safetyMarginTokens: 100,
    });
    expect(result.text).toBe('');
  });
});
