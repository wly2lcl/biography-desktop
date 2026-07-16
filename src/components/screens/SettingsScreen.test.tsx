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

  it('allows editing or clearing the stable provider Base URL', async () => {
    await act(async () => root.render(<SettingsScreen />));
    const input = container.querySelector<HTMLInputElement>('#settings-base-url');
    expect(input).not.toBeNull();
    expect(input?.disabled).toBe(false);

    await act(async () => {
      if (!input) return;
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(input?.value).toBe('');
    expect(container.textContent).toContain('留空时自动使用 https://api.deepseek.com');
  });

  it('blocks saving and connection tests for a remote HTTP Base URL', async () => {
    useGameStore.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        cloudPrivacyAcknowledged: true,
        baseUrl: 'http://gateway.example.com/v1',
      },
    });
    await act(async () => root.render(<SettingsScreen />));

    const input = container.querySelector<HTMLInputElement>('#settings-base-url');
    const testButton = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === '测试连接');
    const saveButton = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === '保存设置');

    expect(input?.value).toBe('http://gateway.example.com/v1');
    expect(container.textContent).toContain(
      '远程 Base URL 必须使用 HTTPS；HTTP 仅允许本机回环地址'
    );
    expect(testButton?.disabled).toBe(true);
    expect(saveButton?.disabled).toBe(true);
  });

  it.each([
    'http://localhost:8080',
    'http://127.0.0.1:8080/v1',
    'http://[::1]:8080',
  ])('allows a loopback HTTP Base URL: %s', async (baseUrl) => {
    useGameStore.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        cloudPrivacyAcknowledged: true,
        baseUrl,
      },
    });
    await act(async () => root.render(<SettingsScreen />));

    const testButton = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === '测试连接');
    const saveButton = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === '保存设置');

    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(testButton?.disabled).toBe(false);
    expect(saveButton?.disabled).toBe(false);
  });

  it('blocks an unstarted built-in local model with an empty Base URL', async () => {
    useGameStore.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        llmProvider: 'llamacpp_local',
        apiKey: '',
        baseUrl: '',
        model: '',
        cloudPrivacyAcknowledged: false,
      },
    });
    await act(async () => root.render(<SettingsScreen />));

    const testButton = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === '测试连接');
    const saveButton = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === '保存设置');

    expect(container.textContent).toContain('应用内置本地模型尚未启动，请先启动本地服务');
    expect(testButton?.disabled).toBe(true);
    expect(saveButton?.disabled).toBe(true);
  });
});
