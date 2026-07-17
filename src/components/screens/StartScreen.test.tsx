import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StartScreen, { worldSelectionId } from './StartScreen';
import { useGameStore } from '@/store/gameStore';
import { DEFAULT_SETTINGS } from '@/types/settings';

describe('StartScreen world selection', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.setItem('bio_has_seen_onboarding', '1');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    useGameStore.setState({
      worlds: [
        {
          name: '同名世界',
          filename: 'shared.md',
          description: '内置版本',
          isBuiltIn: true,
          type: 'single',
        },
        {
          name: '同名世界',
          filename: 'shared.md',
          description: '用户版本',
          isBuiltIn: false,
          type: 'single',
        },
      ],
      resumeSessions: [],
      resumeWarning: '已跳过 1 个损坏会话（broken-session），其他旅程仍可继续。',
      error: null,
      isLoading: false,
      apiKeyConfigured: true,
      config: {
        provider: 'deepseek',
        apiKey: 'key',
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-chat',
        temperature: 0,
        maxTokens: 32,
        timeout: 1000,
      },
      settings: { ...DEFAULT_SETTINGS, cloudPrivacyAcknowledged: true },
      checkResume: vi.fn().mockResolvedValue(undefined),
      startBasicGame: vi.fn().mockResolvedValue(undefined),
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await act(async () => root.unmount());
    container.remove();
    localStorage.clear();
  });

  it('selects built-in and user worlds independently when filenames match', async () => {
    await act(async () => root.render(<StartScreen />));
    expect(container.querySelector('[role="status"]')?.textContent).toContain('broken-session');
    const select = container.querySelector<HTMLSelectElement>('#world-select');
    const input = container.querySelector<HTMLInputElement>('#player-name');
    const start = [...container.querySelectorAll('button')]
      .find((button) => button.textContent === '开始旅程');
    if (!select || !input || !start) throw new Error('missing start form controls');

    const options = [...select.options].slice(1);
    expect(options.map((option) => option.value)).toEqual([
      'builtin:single:shared.md',
      'user:single:shared.md',
    ]);
    expect(options.map((option) => option.textContent)).toEqual([
      '同名世界（内置）',
      '同名世界（用户）',
    ]);

    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
        ?.set?.call(input, '测试角色');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')
        ?.set?.call(select, worldSelectionId(useGameStore.getState().worlds[1]));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => start.click());
    expect(useGameStore.getState().startBasicGame).toHaveBeenLastCalledWith(
      '测试角色', 'shared.md', false, 'single'
    );

    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')
        ?.set?.call(select, worldSelectionId(useGameStore.getState().worlds[0]));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => start.click());
    expect(useGameStore.getState().startBasicGame).toHaveBeenLastCalledWith(
      '测试角色', 'shared.md', true, 'single'
    );
  });

  it('prompts for cloud configuration and privacy consent when consent is missing', async () => {
    useGameStore.setState({
      settings: { ...DEFAULT_SETTINGS, cloudPrivacyAcknowledged: false },
    });

    await act(async () => root.render(<StartScreen />));

    expect(container.textContent).toContain('请先完成云端模型配置与隐私确认');
  });
});
