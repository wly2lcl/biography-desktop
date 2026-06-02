import { describe, it, expect } from 'vitest';
import { prompts } from './prompts';

describe('PromptManager.format', () => {
  it('should replace all placeholders', () => {
    const result = prompts.format('Hello {name}, welcome to {place}', { name: 'World', place: 'Earth' } as any);
    expect(result).toBe('Hello World, welcome to Earth');
  });

  it('should replace all occurrences of same placeholder', () => {
    const result = prompts.format('{x} and {x}', { x: 'test' } as any);
    expect(result).toBe('test and test');
  });

  it('should leave placeholders unchanged when no matching key exists', () => {
    const result = prompts.format('Hello {name}', {} as any);
    expect(result).toBe('Hello {name}');
  });

  it('should not touch non-placeholder braces', () => {
    const result = prompts.format('JSON: {"key": "value"}', { key: 'ignored' } as any);
    expect(result).toContain('{"key": "value"}');
  });
});

describe('PromptManager.formatHistory', () => {
  it('should format empty history', () => {
    const result = prompts.formatHistory([]);
    expect(result).toContain('尚无经历');
  });

  it('should format history with entries', () => {
    const history = [
      { scenario: '第一章', scenarioDescription: 'Description 1', choice: '选择了A', choiceId: 'a' },
      { scenario: '第二章', scenarioDescription: 'Description 2', choice: '选择了B', choiceId: 'b' },
    ];
    const result = prompts.formatHistory(history);
    expect(result).toContain('第一章');
    expect(result).toContain('第二章');
    expect(result).toContain('选择了A');
  });

  it('should truncate long descriptions to 200 chars', () => {
    const longDesc = 'x'.repeat(300);
    const history = [{ scenario: 'Test', scenarioDescription: longDesc, choice: 'A', choiceId: 'a' }];
    const result = prompts.formatHistory(history);
    expect(result).toContain('…');
    expect(result).not.toContain('x'.repeat(201));
  });

  it('should include summary when provided', () => {
    const history = [{ scenario: 'Test', scenarioDescription: '', choice: 'A', choiceId: 'a' }];
    const result = prompts.formatHistory(history, 'This is a summary');
    expect(result).toContain('This is a summary');
    expect(result).toContain('故事概要');
  });
});

describe('PromptManager.formatLatestScene', () => {
  it('should return placeholder for empty history', () => {
    expect(prompts.formatLatestScene([])).toBe('（故事即将开始）');
  });

  it('should return latest scene info', () => {
    const history = [
      { scenario: 'Old', scenarioDescription: 'old desc', choice: 'old choice', choiceId: 'a' },
      { scenario: 'New', scenarioDescription: 'new desc', choice: 'new choice', choiceId: 'b' },
    ];
    const result = prompts.formatLatestScene(history);
    expect(result).toContain('New');
    expect(result).toContain('new desc');
    expect(result).not.toContain('Old');
  });
});

describe('PromptManager.formatSummaryOnly', () => {
  it('should return summary if available', () => {
    expect(prompts.formatSummaryOnly([], 'summary text')).toBe('summary text');
  });

  it('should return placeholder for empty history', () => {
    expect(prompts.formatSummaryOnly([])).toBe('（故事即将开始）');
  });

  it('should use last 5 entries only', () => {
    const history = Array.from({ length: 10 }, (_, i) => ({
      scenario: `场景${i + 1}`,
      scenarioDescription: '',
      choice: `选择${i + 1}`,
      choiceId: String(i + 1),
    }));
    const result = prompts.formatSummaryOnly(history);
    expect(result).toContain('场景6');
    expect(result).not.toContain('场景5');
  });

  it('should skip auto_continue choices', () => {
    const history = [
      { scenario: 'S1', scenarioDescription: '', choice: 'Choice1', choiceId: '__auto_continue__' },
      { scenario: 'S2', scenarioDescription: '', choice: 'Choice2', choiceId: 'b' },
    ];
    const result = prompts.formatSummaryOnly(history);
    expect(result).toContain('S2，Choice2');
    expect(result).not.toContain('Choice1');
  });
});

describe('PromptManager.formatQaHistory', () => {
  it('should return empty string for no history', () => {
    expect(prompts.formatQaHistory([])).toBe('');
  });

  it('should format Q&A entries', () => {
    const qaHistory = [
      { role: 'user', content: 'What is this?' },
      { role: 'assistant', content: 'This is a test' },
    ];
    const result = prompts.formatQaHistory(qaHistory);
    expect(result).toContain('问：What is this?');
    expect(result).toContain('答：This is a test');
  });

  it('should truncate long content to 200 chars', () => {
    const longContent = 'x'.repeat(300);
    const qaHistory = [{ role: 'user', content: longContent }];
    const result = prompts.formatQaHistory(qaHistory);
    expect(result.length).toBeLessThan(300);
  });
});

describe('PromptManager.formatHistoryForBiography', () => {
  it('should compress early chapters', () => {
    const history = Array.from({ length: 10 }, (_, i) => ({
      scenario: `场景${i + 1}`,
      scenarioDescription: `desc${i + 1}`,
      choice: `选择${i + 1}`,
      choiceId: String(i + 1),
    }));
    const result = prompts.formatHistoryForBiography(history);
    expect(result).toContain('早期经历');
    expect(result).toContain('关键篇章');
  });

  it('should handle empty history', () => {
    const result = prompts.formatHistoryForBiography([]);
    expect(result).toContain('尚未开始');
  });

  it('should include summary if provided', () => {
    const history = [{ scenario: 'S', scenarioDescription: '', choice: 'C', choiceId: '1' }];
    const result = prompts.formatHistoryForBiography(history, 'My summary');
    expect(result).toContain('My summary');
  });
});

describe('PromptManager.extractWorldThemes', () => {
  it('should return full content if under limit', () => {
    const content = 'Short content';
    expect(prompts.extractWorldThemes(content)).toBe(content);
  });

  it('should truncate at heading boundary', () => {
    const header = '# Overview\n\nSome introductory text about the world.\n\n';
    const section1 = '## Geography\n\nThe world is vast and varied, with mountains, forests, and rivers.\n'.repeat(20);
    const section2 = '## Factions\n\nThere are many factions vying for power.\n'.repeat(20);
    const section3 = '## History\n\nThe ancient history of this world is shrouded in mystery.\n'.repeat(20);
    const content = header + section1 + section2 + section3;
    const result = prompts.extractWorldThemes(content);
    expect(result).toContain('……');
    expect(result.length).toBeLessThan(content.length);
  });
});
