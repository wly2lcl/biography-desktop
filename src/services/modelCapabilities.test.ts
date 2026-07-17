import { describe, expect, it } from 'vitest';
import { resolveModelCapability } from './modelCapabilities';

describe('model capabilities', () => {
  it('uses conservative provider defaults', () => {
    expect(resolveModelCapability('openai', 'gpt-4o-mini').contextWindowTokens).toBe(128000);
    expect(resolveModelCapability('deepseek', 'deepseek-chat').contextWindowTokens).toBe(65536);
  });

  it('honors a valid deployment override and reserves safe output space', () => {
    const capability = resolveModelCapability('openai', 'proxy-model', 8192, 9000);
    expect(capability.contextWindowTokens).toBe(8192);
    expect(capability.reservedOutputTokens).toBe(6144);
  });
});
