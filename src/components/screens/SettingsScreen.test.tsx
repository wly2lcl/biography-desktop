import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsScreen from './SettingsScreen';
import { useGameStore } from '@/store/gameStore';
import { DEFAULT_SETTINGS } from '@/types/settings';
import { desktopDataGateway } from '@/infrastructure/desktopDataGateway';

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
    vi.spyOn(desktopDataGateway, 'getInfo').mockResolvedValue({
      path: '/managed/biography.db', size: 1024, sessionCount: 1, activeCount: 1,
    });
    vi.spyOn(desktopDataGateway, 'listBackups').mockResolvedValue([{
      path: '/managed/backups/backup.db',
      filename: 'backup.db',
      size: 512,
      modified: '2026-07-16',
    }]);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    useGameStore.setState({
      settings: { ...DEFAULT_SETTINGS, cloudPrivacyAcknowledged: true },
      apiKeyConfigured: false,
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

  it('hides persistent data operations in degraded memory mode', async () => {
    await act(async () => root.render(<SettingsScreen degradedMode />));
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

    expect(container.textContent).toContain('临时内存模式');
    expect(container.textContent).toContain('关闭应用后会丢失');
    expect(container.textContent).not.toContain('/managed/biography.db');
    expect(container.textContent).not.toContain('备份数据库');
    expect(desktopDataGateway.getInfo).not.toHaveBeenCalled();
    expect(desktopDataGateway.listBackups).not.toHaveBeenCalled();
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

  it('tests a draft connection without saving it', async () => {
    const testConnection = vi.fn().mockResolvedValue(true);
    const updateSettings = vi.fn().mockResolvedValue(undefined);
    useGameStore.setState({ testLlmConnection: testConnection, updateSettings });
    await act(async () => root.render(<SettingsScreen />));
    const testButton = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === '测试连接');
    await act(async () => testButton?.click());
    expect(testConnection).toHaveBeenCalledOnce();
    expect(updateSettings).not.toHaveBeenCalled();
    expect(container.textContent).toContain('连接成功');
  });

  it('clears a Web API key draft before switching provider scopes', async () => {
    delete window.__TAURI_INTERNALS__;
    const testConnection = vi.fn().mockResolvedValue(true);
    useGameStore.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        apiKey: 'deepseek-secret',
        cloudPrivacyAcknowledged: true,
      },
      testLlmConnection: testConnection,
    });
    await act(async () => root.render(<SettingsScreen />));

    const apiKeyInput = container.querySelector<HTMLInputElement>('#settings-api-key');
    expect(apiKeyInput?.value).toBe('deepseek-secret');
    const testButton = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === '测试连接');
    await act(async () => testButton?.click());
    expect(container.textContent).toContain('连接成功');
    const openai = container.querySelector<HTMLInputElement>(
      'input[name="llmProvider"][value="openai"]'
    );
    if (!openai) throw new Error('missing OpenAI provider control');
    await act(async () => {
      openai.click();
      await Promise.resolve();
    });

    expect(apiKeyInput?.value).toBe('');
    expect(container.textContent).not.toContain('连接成功');
    await act(async () => testButton?.click());
    expect(testConnection).toHaveBeenLastCalledWith(expect.objectContaining({
      llmProvider: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '',
    }));
  });

  it('clears a typed API key when the Base URL scope changes or becomes invalid', async () => {
    await act(async () => root.render(<SettingsScreen />));
    const apiKeyInput = container.querySelector<HTMLInputElement>('#settings-api-key');
    const baseUrlInput = container.querySelector<HTMLInputElement>('#settings-base-url');
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value'
    )?.set;
    if (!apiKeyInput || !baseUrlInput || !valueSetter) throw new Error('missing settings inputs');

    await act(async () => {
      valueSetter.call(apiKeyInput, 'first-secret');
      apiKeyInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      valueSetter.call(baseUrlInput, 'https://gateway.example.com/v1');
      baseUrlInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(apiKeyInput.value).toBe('');

    await act(async () => {
      valueSetter.call(apiKeyInput, 'second-secret');
      apiKeyInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      valueSetter.call(baseUrlInput, 'http://gateway.example.com/v1');
      baseUrlInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(apiKeyInput.value).toBe('');
    const testButton = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === '测试连接');
    const saveButton = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === '保存设置');
    expect(testButton?.disabled).toBe(true);
    expect(saveButton?.disabled).toBe(true);
  });

  it('backs up and clears ended sessions through the typed data gateway', async () => {
    window.alert = vi.fn();
    window.confirm = vi.fn(() => true);
    const alert = vi.mocked(window.alert);
    vi.spyOn(desktopDataGateway, 'backup').mockResolvedValue('/backups/new.db');
    vi.spyOn(desktopDataGateway, 'clearEndedSessions').mockResolvedValue(1);
    useGameStore.setState({
      prepareForDataMutation: vi.fn().mockResolvedValue(undefined),
      finishDataMutation: vi.fn(),
      checkResume: vi.fn().mockResolvedValue(undefined),
    });
    await act(async () => root.render(<SettingsScreen />));
    await act(async () => {
      await vi.waitFor(() => expect(desktopDataGateway.listBackups).toHaveBeenCalled());
    });
    const dataTab = [...container.querySelectorAll('button')]
      .find((button) => button.textContent === '数据');
    await act(async () => dataTab?.click());
    expect(container.textContent).toContain('backup.db');
    const backup = [...container.querySelectorAll('button')]
      .find((button) => button.textContent === '备份数据库');
    await act(async () => backup?.click());
    const cleanup = [...container.querySelectorAll('button')]
      .find((button) => button.textContent === '清理已结束会话');
    await act(async () => cleanup?.click());
    expect(desktopDataGateway.backup).toHaveBeenCalled();
    expect(desktopDataGateway.clearEndedSessions).toHaveBeenCalled();
    expect(alert.mock.calls.flat().join(' ')).toContain('/backups/new.db');
    expect(alert.mock.calls.flat().join(' ')).toContain('已清理 1 个');
  });

  it('restores a backup only after preparing the Store mutation boundary', async () => {
    window.confirm = vi.fn(() => true);
    window.alert = vi.fn();
    const prepare = vi.fn().mockResolvedValue(undefined);
    const finish = vi.fn();
    const checkResume = vi.fn().mockResolvedValue(undefined);
    useGameStore.setState({
      prepareForDataMutation: prepare,
      finishDataMutation: finish,
      checkResume,
      newGame: vi.fn(),
    });
    vi.spyOn(desktopDataGateway, 'restore').mockResolvedValue(undefined);
    await act(async () => root.render(<SettingsScreen />));
    await act(async () => {
      await vi.waitFor(() => expect(desktopDataGateway.listBackups).toHaveBeenCalled());
    });
    const dataTab = [...container.querySelectorAll('button')]
      .find((button) => button.textContent === '数据');
    await act(async () => dataTab?.click());
    expect(container.textContent).toContain('backup.db');
    const restore = [...container.querySelectorAll('button')]
      .find((button) => button.textContent === '恢复');
    expect(restore).toBeDefined();
    await act(async () => restore?.click());
    expect(prepare).toHaveBeenCalledOnce();
    expect(desktopDataGateway.restore).toHaveBeenCalledWith('/managed/backups/backup.db');
    expect(checkResume).toHaveBeenCalledWith({ throwOnError: true });
    expect(finish).toHaveBeenCalledOnce();
  });

  it('saves the current draft and closes the settings overlay', async () => {
    const updateSettings = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn();
    useGameStore.setState({ updateSettings, setShowSettings: close });
    await act(async () => root.render(<SettingsScreen />));
    const save = [...container.querySelectorAll('button')]
      .find((button) => button.textContent === '保存设置');
    await act(async () => save?.click());
    expect(updateSettings).toHaveBeenCalledWith(expect.objectContaining({
      llmProvider: 'deepseek',
      cloudPrivacyAcknowledged: true,
    }));
    expect(close).toHaveBeenCalledWith(false);
  });

  it('shows a save error without closing when persistence fails', async () => {
    const close = vi.fn();
    useGameStore.setState({
      updateSettings: vi.fn().mockRejectedValue(new Error('keyring locked')),
      setShowSettings: close,
    });
    await act(async () => root.render(<SettingsScreen />));
    const save = [...container.querySelectorAll('button')]
      .find((button) => button.textContent === '保存设置');
    await act(async () => save?.click());
    expect(container.textContent).toContain('keyring locked');
    expect(close).not.toHaveBeenCalled();
  });

  it('deletes an explicitly configured Keyring secret', async () => {
    const clear = vi.fn().mockResolvedValue(undefined);
    invokeMock.mockImplementation(async (command: string) => command === 'has_api_key');
    useGameStore.setState({ apiKeyConfigured: true, clearApiKey: clear });
    await act(async () => root.render(<SettingsScreen />));
    await act(async () => { await Promise.resolve(); });
    const remove = [...container.querySelectorAll('button')]
      .find((button) => button.textContent === '删除密钥');
    await act(async () => remove?.click());
    expect(clear).toHaveBeenCalledWith({
      llmProvider: 'deepseek',
      baseUrl: DEFAULT_SETTINGS.baseUrl,
    });
  });

  it('deletes the API key from the provider selected after the dialog opened', async () => {
    const clear = vi.fn().mockResolvedValue(undefined);
    invokeMock.mockImplementation(async (command: string) => command === 'has_api_key');
    useGameStore.setState({ apiKeyConfigured: true, clearApiKey: clear });
    await act(async () => root.render(<SettingsScreen />));
    const openai = container.querySelector<HTMLInputElement>('input[name="llmProvider"][value="openai"]');
    if (!openai) throw new Error('missing OpenAI provider control');
    await act(async () => openai.click());
    await act(async () => { await Promise.resolve(); });
    const remove = [...container.querySelectorAll('button')]
      .find((button) => button.textContent === '删除密钥');
    await act(async () => remove?.click());
    expect(clear).toHaveBeenCalledWith({
      llmProvider: 'openai',
      baseUrl: 'https://api.openai.com/v1',
    });
  });

  it('renders and edits context-budget controls on the advanced tab', async () => {
    const updateSettings = vi.fn().mockResolvedValue(undefined);
    useGameStore.setState({ updateSettings });
    await act(async () => root.render(<SettingsScreen />));
    const advanced = [...container.querySelectorAll('button')]
      .find((button) => button.textContent === '高级');
    await act(async () => advanced?.click());
    const input = container.querySelector<HTMLInputElement>('#param-contextWindow');
    expect(input).not.toBeNull();
    if (!input) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, '131072');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const save = [...container.querySelectorAll('button')]
      .find((button) => button.textContent === '保存设置');
    await act(async () => save?.click());
    expect(updateSettings).toHaveBeenCalledWith(expect.objectContaining({ contextWindow: 131072 }));
  });

  it('closes on Escape', async () => {
    const close = vi.fn();
    useGameStore.setState({ setShowSettings: close });
    await act(async () => root.render(<SettingsScreen />));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(close).toHaveBeenCalledWith(false);
  });
});
