import { beforeEach, describe, expect, it } from 'vitest';
import { errorLogger, sanitizeDiagnosticValue } from './errorLogger';
import { buildDiagnosticBundle } from './diagnostics';
import { DEFAULT_SETTINGS } from '../types/settings';

describe('diagnostic privacy', () => {
  beforeEach(() => localStorage.clear());
  it('redacts secrets and narrative inputs recursively', () => {
    const value = sanitizeDiagnosticValue({
      apiKey: 'secret',
      nested: { question: '我的问题', status: 'failed' },
    });
    expect(value).toEqual({
      apiKey: '[REDACTED]',
      nested: { question: '[REDACTED]', status: 'failed' },
    });
  });

  it('excludes secrets and narrative text from the exported bundle', () => {
    const error = new Error('服务端回显：私密剧情与 secret-key');
    error.stack = `Error: 服务端回显：私密剧情与 secret-key\n    at request (https://example.com/?prompt=私密剧情)`;
    errorLogger.error('服务端回显：不可分享的动态错误', {
      apiKey: 'secret-key',
      playerName: '张三',
      prompt: '私密剧情',
      reason: 'Promise rejection 包含私密问题',
      status: 500,
    }, error);
    const bundle = buildDiagnosticBundle({
      ...DEFAULT_SETTINGS,
      apiKey: 'secret-key',
    });
    expect(bundle).not.toContain('secret-key');
    expect(bundle).not.toContain('张三');
    expect(bundle).not.toContain('私密剧情');
    expect(bundle).not.toContain('私密问题');
    expect(bundle).not.toContain('不可分享的动态错误');
    expect(bundle).not.toContain('example.com');
    expect(bundle).not.toContain('stack');
    expect(bundle).toContain('[REDACTED]');
  });
});
