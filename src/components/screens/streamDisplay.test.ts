import { describe, expect, it } from 'vitest';
import { shouldStreamScenarioText } from './streamDisplay';

describe('scenario stream display', () => {
  it('keeps the current scenario body visible while QA is streaming', () => {
    expect(shouldStreamScenarioText(true, true)).toBe(false);
  });

  it('shows streamed text for scenario generation only', () => {
    expect(shouldStreamScenarioText(true, false)).toBe(true);
    expect(shouldStreamScenarioText(false, false)).toBe(false);
  });
});
