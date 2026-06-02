import { describe, it, expect } from 'vitest';
import { parseLLMJSON, cleanLLMOutput } from './parser';

describe('parseLLMJSON', () => {
  it('should parse valid JSON', () => {
    const result = parseLLMJSON('{"name": "test"}');
    expect(result).toEqual({ name: 'test' });
  });

  it('should parse JSON with thinking tags', () => {
    const result = parseLLMJSON('<thinking>reasoning</thinking>{"name": "test"}');
    expect(result).toEqual({ name: 'test' });
  });

  it('should parse JSON with markdown fences', () => {
    const result = parseLLMJSON('```json\n{"name": "test"}\n```');
    expect(result).toEqual({ name: 'test' });
  });

  it('should extract JSON array from text', () => {
    const result = parseLLMJSON('Some text [{"id": 1}] more text');
    expect(result).toEqual([{ id: 1 }]);
  });

  it('should extract balanced JSON object', () => {
    const result = parseLLMJSON('prefix {"a": {"b": 1}} suffix');
    expect(result).toEqual({ a: { b: 1 } });
  });

  it('should throw on invalid JSON', () => {
    expect(() => parseLLMJSON('not json at all')).toThrow();
  });

  it('should handle reasoning tags', () => {
    const result = parseLLMJSON('<reasoning>thinking</reasoning>{"key": "value"}');
    expect(result).toEqual({ key: 'value' });
  });

  it('should handle answer tags', () => {
    const result = parseLLMJSON('<answer>{"result": true}</answer>');
    expect(result).toEqual({ result: true });
  });
});

describe('cleanLLMOutput', () => {
  it('should remove thinking tags', () => {
    const result = cleanLLMOutput('Hello <thinking>secret</thinking> World');
    expect(result).toBe('Hello World');
  });

  it('should remove markdown fences', () => {
    const result = cleanLLMOutput('```json\n{"a": 1}\n```');
    expect(result).toBe('{"a": 1}');
  });
});