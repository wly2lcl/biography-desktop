import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  extractWorldDescription,
  getWorldContext,
  listWorlds,
  loadBuiltInWorld,
  resolveWorldRef,
} from './world';

describe('world loading and legacy resolution', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('loads single and directory built-in worlds from their correct paths', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      return new Response(url.endsWith('/README.md') ? 'directory content' : 'single content');
    });
    await expect(loadBuiltInWorld('unique-single.md', 'single')).resolves.toBe('single content');
    await expect(loadBuiltInWorld('unique-directory', 'directory')).resolves.toBe('directory content');
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      '/worlds/unique-single.md',
      '/worlds/unique-directory/README.md',
    ]);
  });

  it('loads a user world without crossing an explicit WorldRef boundary', async () => {
    localStorage.setItem('bio_world_user.md', '# 用户\n内容');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 404 }));
    await expect(getWorldContext({ name: 'user.md', source: 'user', type: 'single' }))
      .resolves.toContain('内容');
    await expect(getWorldContext({ name: 'user.md', source: 'builtin', type: 'single' }))
      .rejects.toThrow('Failed to load world');
  });

  it('probes legacy locations before producing the normalized WorldRef', async () => {
    localStorage.setItem('bio_world_unlisted-user.md', '# 用户\n兼容内容');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 404 }));
    await expect(resolveWorldRef('unlisted-user.md')).resolves.toEqual({
      name: 'unlisted-user.md', source: 'user', type: 'single',
    });
  });

  it('lists and resolves user metadata while retaining built-ins', async () => {
    localStorage.setItem('bio_user_worlds', JSON.stringify(['mine.md']));
    localStorage.setItem('bio_world_mine.md', '# Mine\n第一段描述');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html></html>'));
    const worlds = await listWorlds();
    expect(worlds.some((world) => world.filename === 'world' && world.type === 'directory')).toBe(true);
    await expect(resolveWorldRef('mine.md')).resolves.toEqual({
      name: 'mine.md', source: 'user', type: 'single',
    });
    expect(extractWorldDescription('# 标题\n\n## 小节\n正文')).toBe('正文');
  });
});
