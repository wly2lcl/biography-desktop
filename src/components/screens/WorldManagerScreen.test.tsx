import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WorldManagerScreen from './WorldManagerScreen';
import { useGameStore } from '@/store/gameStore';
import * as worldService from '@/services/world';

describe('WorldManagerScreen editing', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    useGameStore.setState({
      session: null,
      worlds: [
        {
          name: 'mine world',
          filename: 'mine_world.md',
          type: 'single',
          description: '旧描述',
          isBuiltIn: false,
        },
        {
          name: 'directory world',
          filename: 'directory_world',
          type: 'directory',
          description: '',
          isBuiltIn: false,
        },
      ],
      loadWorlds: vi.fn().mockResolvedValue(undefined),
      setShowWorldManager: vi.fn(),
    });
    vi.spyOn(worldService, 'isTauri').mockReturnValue(false);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await act(async () => root.unmount());
    container.remove();
  });

  it('loads original content and overwrites the original filename when editing', async () => {
    const load = vi.spyOn(worldService, 'getWorldContext').mockResolvedValue('# 原内容\n不会被清空');
    localStorage.setItem('bio_user_worlds', JSON.stringify(['mine_world.md']));
    localStorage.setItem('bio_world_mine_world.md', '# 原内容\n不会被清空');

    await act(async () => root.render(<WorldManagerScreen />));
    const editButtons = [...container.querySelectorAll('button')]
      .filter((button) => button.textContent === '编辑');
    expect(editButtons).toHaveLength(1);

    await act(async () => editButtons[0].click());
    expect(load).toHaveBeenCalledWith({ name: 'mine_world.md', source: 'user', type: 'single' });

    const name = container.querySelector<HTMLInputElement>('#world-form-name');
    const content = container.querySelector<HTMLTextAreaElement>('#world-form-content');
    expect(name?.value).toBe('mine_world');
    expect(name?.disabled).toBe(true);
    expect(content?.value).toBe('# 原内容\n不会被清空');
    if (!content) throw new Error('missing editor');

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value',
      )?.set;
      if (!setter) throw new Error('missing textarea value setter');
      setter.call(content, '# 新内容\n\n这是一个经过修改的世界设定，包含足够的背景信息、人物关系、当前矛盾和故事冲突。角色将从一座边境城镇开始旅程。');
      content.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(content.value).toContain('# 新内容');
    const save = [...container.querySelectorAll('button')]
      .find((button) => button.textContent === '保存');
    expect(save?.disabled).toBe(false);
    await act(async () => save?.click());

    expect(localStorage.getItem('bio_world_mine_world.md')).toContain('# 新内容');
    expect(localStorage.getItem('bio_world_mine world.md')).toBeNull();
  });

  it('does not open an unsupported editor for directory worlds', async () => {
    await act(async () => root.render(<WorldManagerScreen />));
    const editButtons = [...container.querySelectorAll('button')]
      .filter((button) => button.textContent === '编辑');
    expect(editButtons).toHaveLength(1);
  });

  it('creates unique copies without overwriting an existing user world', async () => {
    useGameStore.setState({
      worlds: [{
        name: 'History', filename: 'history.md', type: 'single',
        description: 'built in', isBuiltIn: true,
      }],
    });
    vi.spyOn(worldService, 'getWorldContext').mockResolvedValue('# History\nNew content');
    localStorage.setItem('bio_user_worlds', JSON.stringify(['history-copy.md']));
    localStorage.setItem('bio_world_history-copy.md', '# Existing\nKeep me');

    await act(async () => root.render(<WorldManagerScreen />));
    const copy = [...container.querySelectorAll('button')]
      .find((button) => button.textContent === '复制为用户世界');
    if (!copy) throw new Error('missing copy action');
    await act(async () => copy.click());
    await act(async () => copy.click());

    expect(localStorage.getItem('bio_world_history-copy.md')).toBe('# Existing\nKeep me');
    expect(localStorage.getItem('bio_world_history-copy-2.md')).toBe('# History\nNew content');
    expect(localStorage.getItem('bio_world_history-copy-3.md')).toBe('# History\nNew content');
  });
});
