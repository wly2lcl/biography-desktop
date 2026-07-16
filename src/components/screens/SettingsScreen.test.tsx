import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsScreen from './SettingsScreen';
import { useGameStore } from '@/store/gameStore';
import { DEFAULT_SETTINGS } from '@/types/settings';

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));

describe('SettingsScreen data operation state', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'get_database_info') {
        return {
          path: '/managed/biography.db',
          size: 1024,
          sessionCount: 1,
          activeCount: 1,
        };
      }
      if (command === 'list_backups') {
        return [{
          path: '/managed/backups/backup.db',
          filename: 'backup.db',
          size: 512,
          modified: '2026-07-16',
        }];
      }
      return undefined;
    });
    window.__TAURI_INTERNALS__ = {};
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    useGameStore.setState({
      settings: { ...DEFAULT_SETTINGS, cloudPrivacyAcknowledged: true },
      isStreaming: false,
      isPersistingSession: false,
      isDataMutationInProgress: false,
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await act(async () => root.unmount());
    container.remove();
    delete window.__TAURI_INTERNALS__;
  });

  it.each([
    ['LLM request', { isStreaming: true }],
    ['session persistence', { isPersistingSession: true }],
    ['another data mutation', { isDataMutationInProgress: true }],
  ])('disables data actions during %s', async (_label, busyState) => {
    useGameStore.setState(busyState);
    await act(async () => root.render(<SettingsScreen />));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const dataTab = [...container.querySelectorAll('button')]
      .find((button) => button.textContent === '数据');
    if (!dataTab) throw new Error('missing data tab');
    await act(async () => {
      dataTab.click();
      await Promise.resolve();
    });

    const actionLabels = [
      '备份数据库',
      '清理已结束会话',
      '清理全部会话',
      '导出全部数据（JSON）',
      '导入全部数据（JSON）',
    ];
    for (const label of actionLabels) {
      const button = [...container.querySelectorAll<HTMLButtonElement>('button')]
        .find((candidate) => candidate.textContent?.trim() === label);
      expect(button, `missing ${label} button`).toBeDefined();
      expect(button?.disabled, `${label} should be disabled`).toBe(true);
    }
    expect(container.textContent).toContain('正在生成内容、保存会话或执行其他数据操作');
  });
});
