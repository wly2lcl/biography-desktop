import { describe, expect, it } from 'vitest';
import { getErrorMessage } from './errors';

describe('getErrorMessage', () => {
  it('returns an Error message', () => {
    expect(getErrorMessage(new Error('磁盘已满'), '失败')).toBe('磁盘已满');
  });

  it('preserves and trims Tauri IPC string rejections', () => {
    expect(getErrorMessage('  备份版本不兼容  ', '失败')).toBe('备份版本不兼容');
  });

  it('uses the fallback for values without diagnostics', () => {
    expect(getErrorMessage(null, '未知错误')).toBe('未知错误');
    expect(getErrorMessage('   ', '未知错误')).toBe('未知错误');
  });
});
