import { describe, it, expect } from 'vitest';
import { escapeForSSE, unescapeSSE } from './sse';

describe('escapeForSSE edge cases', () => {
  it('should handle empty string', () => {
    expect(escapeForSSE('')).toBe('');
  });

  it('should handle string with only special chars', () => {
    const result = escapeForSSE('\n\r\\');
    expect(result).toBe('\\n\\r\\\\');
  });

  it('should handle mixed content', () => {
    const result = escapeForSSE('Line 1\nLine 2\r\nLine 3\\end');
    expect(result).toBe('Line 1\\nLine 2\\r\\nLine 3\\\\end');
  });

  it('should handle unicode characters', () => {
    const input = '你好\n世界';
    expect(escapeForSSE(input)).toBe('你好\\n世界');
  });

  it('should handle emoji characters', () => {
    const input = 'Hello 👋\nWorld';
    expect(escapeForSSE(input)).toBe('Hello 👋\\nWorld');
  });

  it('should not affect normal text', () => {
    expect(escapeForSSE('hello world')).toBe('hello world');
  });
});

describe('unescapeSSE edge cases', () => {
  it('should handle empty string', () => {
    expect(unescapeSSE('')).toBe('');
  });

  it('should handle string with only escape sequences', () => {
    expect(unescapeSSE('\\n\\r\\\\')).toBe('\n\r\\');
  });

  it('should handle escaped backslash before newline', () => {
    // unescapeSSE first replaces \n (backslash-n) with newline, then \\ with \
    // Input: 'path\\nfile' (two backslashes + n) → first \n match turns it into path\ + newline + file
    const result = unescapeSSE('path\\\\nfile');
    expect(result).toBe('path' + '\\' + '\n' + 'file');
  });

  it('should handle unicode after unescaping', () => {
    const input = '你好\\n世界';
    expect(unescapeSSE(input)).toBe('你好\n世界');
  });

  it('should handle mixed escaped and normal content', () => {
    expect(unescapeSSE('line1\\nline2 normal\\r\\nline3')).toBe('line1\nline2 normal\r\nline3');
  });
});

describe('escapeForSSE ↔ unescapeSSE round-trip', () => {
  it('should round-trip normal text', () => {
    const input = 'hello world';
    expect(unescapeSSE(escapeForSSE(input))).toBe(input);
  });

  it('should round-trip text with newlines', () => {
    const input = 'line1\nline2\nline3';
    expect(unescapeSSE(escapeForSSE(input))).toBe(input);
  });

  it('should round-trip text with backslashes', () => {
    const input = 'path\\to\\file';
    expect(unescapeSSE(escapeForSSE(input))).toBe(input);
  });

  it('should round-trip mixed special chars', () => {
    const input = 'a\nb\rc\\d';
    expect(unescapeSSE(escapeForSSE(input))).toBe(input);
  });

  it('should round-trip unicode content', () => {
    const input = '中文\n日本語\r处理';
    expect(unescapeSSE(escapeForSSE(input))).toBe(input);
  });

  it('should round-trip very long text', () => {
    const input = 'a'.repeat(10000) + '\n' + 'b'.repeat(10000);
    expect(unescapeSSE(escapeForSSE(input))).toBe(input);
  });
});
