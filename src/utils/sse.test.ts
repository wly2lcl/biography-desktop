import { describe, it, expect } from 'vitest';
import { escapeForSSE, unescapeSSE } from './sse';

describe('escapeForSSE', () => {
  it('should escape backslashes', () => {
    expect(escapeForSSE('hello\\world')).toBe('hello\\\\world');
  });

  it('should escape newlines', () => {
    expect(escapeForSSE('hello\nworld')).toBe('hello\\nworld');
  });

  it('should escape carriage returns', () => {
    expect(escapeForSSE('hello\rworld')).toBe('hello\\rworld');
  });
});

describe('unescapeSSE', () => {
  it('should unescape newlines', () => {
    expect(unescapeSSE('hello\\nworld')).toBe('hello\nworld');
  });

  it('should unescape carriage returns', () => {
    expect(unescapeSSE('hello\\rworld')).toBe('hello\rworld');
  });

  it('should unescape backslashes', () => {
    expect(unescapeSSE('hello\\\\world')).toBe('hello\\world');
  });

  it('should round-trip escape/unescape', () => {
    const original = 'hello\nworld\rtest';
    expect(unescapeSSE(escapeForSSE(original))).toBe(original);
  });
});