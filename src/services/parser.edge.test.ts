import { describe, it, expect } from 'vitest';
import { parseLLMJSON, cleanLLMOutput } from './parser';

describe('parseLLMJSON edge cases', () => {
  it('should handle multiple thinking tags', () => {
    const result = parseLLMJSON('<thinking>a</thinking>{"k":"v"}<thinking>b</thinking>');
    expect(result).toEqual({ k: 'v' });
  });

  it('should handle nested thinking tags content', () => {
    const result = parseLLMJSON('<thinking>some {json} here</thinking>\n{"valid": true}');
    expect(result).toEqual({ valid: true });
  });

  it('should handle markdown fences with language', () => {
    const result = parseLLMJSON('```\n{"a": 1}\n```');
    expect(result).toEqual({ a: 1 });
  });

  it('should handle mixed fences and tags', () => {
    const result = parseLLMJSON('<thinking>reasoning</thinking>\n```json\n{"result": "ok"}\n```');
    expect(result).toEqual({ result: 'ok' });
  });

  it('should handle JSON with unicode escapes', () => {
    const result = parseLLMJSON('{"name": "\\u4e16\\u754c"}');
    expect(result).toEqual({ name: '世界' });
  });

  it('should handle JSON with escaped quotes', () => {
    const result = parseLLMJSON('{"text": "He said \\"hello\\""}');
    expect(result).toEqual({ text: 'He said "hello"' });
  });

  it('should extract array from verbose text', () => {
    const result = parseLLMJSON('Here is the data:\n[{"id": 1}, {"id": 2}]\nHope this helps!');
    expect(result).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('should handle deeply nested objects', () => {
    const result = parseLLMJSON('{"a": {"b": {"c": {"d": 42}}}}');
    expect(result).toEqual({ a: { b: { c: { d: 42 } } } });
  });

  it('should handle null values in JSON', () => {
    const result = parseLLMJSON('{"a": null, "b": "test"}');
    expect(result).toEqual({ a: null, b: 'test' });
  });

  it('should handle empty object', () => {
    const result = parseLLMJSON('{}');
    expect(result).toEqual({});
  });

  it('should handle empty array', () => {
    const result = parseLLMJSON('[]');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([]);
  });

  it('should throw on completely invalid input', () => {
    expect(() => parseLLMJSON('<<<not json>>>')).toThrow();
  });

  it('should handle leading/trailing whitespace', () => {
    const result = parseLLMJSON('  \n  {"trimmed": true}  \n  ');
    expect(result).toEqual({ trimmed: true });
  });
});

describe('cleanLLMOutput', () => {
  it('should collapse multiple spaces', () => {
    expect(cleanLLMOutput('hello    world')).toBe('hello world');
  });

  it('should handle multiple thinking tags in sequence', () => {
    const result = cleanLLMOutput('<thinking>a</thinking> <reasoning>b</reasoning> Hello');
    expect(result).toBe('Hello');
  });

  it('should handle markdown with backticks in content', () => {
    const result = cleanLLMOutput('Use `code` here');
    expect(result).toBe('Use `code` here');
  });

  it('should return trimmed clean text', () => {
    expect(cleanLLMOutput('  text  ')).toBe('text');
  });
});
