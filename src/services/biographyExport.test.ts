import { describe, expect, it } from 'vitest';
import { buildBiographyText } from './biographyExport';
import { DEFAULT_SETTINGS } from '../types/settings';
import type { GameSession } from '../types/models';

const session: GameSession = {
  schemaVersion: 2,
  sessionId: 's1',
  world: '江湖',
  worldRef: { name: '江湖', source: 'builtin', type: 'single' },
  gameMode: 'basic',
  player: {
    name: '无名', currentScenario: '', history: [], attributes: {}, inventory: [],
    summary: '', qaHistory: [], createdAt: '2026-01-01T00:00:00.000Z',
  },
  scenarios: [],
  isActive: false,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('biography export', () => {
  it('includes portable metadata in Markdown output', () => {
    const output = buildBiographyText(
      session,
      '正文',
      DEFAULT_SETTINGS,
      'md',
      '2026-07-17T00:00:00.000Z'
    );
    expect(output).toContain('worldSource: builtin');
    expect(output).toContain('provider: deepseek');
    expect(output).toContain('# 【无名传奇】');
    expect(output).toContain('正文');
    expect(output).toContain('generatedAt: null');
  });

  it('uses the actual generation config after global settings change', () => {
    const generatedSession: GameSession = {
      ...session,
      biographyGeneration: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        generatedAt: '2026-07-16T03:04:05.000Z',
      },
    };
    const output = buildBiographyText(
      generatedSession,
      '正文',
      { ...DEFAULT_SETTINGS, llmProvider: 'deepseek', model: 'deepseek-chat' },
      'txt',
      '2026-07-17T00:00:00.000Z'
    );
    expect(output).toContain('生成配置：openai / gpt-4o-mini');
    expect(output).toContain('生成时间：2026-07-16T03:04:05.000Z');
    expect(output).toContain('导出时间：2026-07-17T00:00:00.000Z');
  });
});
