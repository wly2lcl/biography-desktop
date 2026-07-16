import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createStorage, normalizeSession, SessionCorruptedError } from './storage';
import { SESSION_SCHEMA_VERSION, type GameSession } from '../types/models';

function legacySession(world = 'world') {
  return {
    sessionId: 'legacy-1',
    world,
    gameMode: 'basic' as const,
    player: {
      name: '旧角色',
      currentScenario: '',
      history: [],
      attributes: {},
      inventory: [],
      summary: '',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    scenarios: [{ id: 'scene-1', title: '序章', description: '开始', choices: [] }],
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('session v1 -> v2 normalization', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no directory listing'));
  });

  it('recognizes a built-in directory world and restores currentScenario', async () => {
    const session = await normalizeSession(legacySession());
    expect(session.schemaVersion).toBe(SESSION_SCHEMA_VERSION);
    expect(session.worldRef).toEqual({ name: 'world', source: 'builtin', type: 'directory' });
    expect(session.player.currentScenario).toBe('scene-1');
    expect(session.player.qaHistory).toEqual([]);
  });

  it('recognizes a user world from the Web world list', async () => {
    localStorage.setItem('bio_user_worlds', JSON.stringify(['mine.md']));
    localStorage.setItem('bio_world_mine.md', '# 我的世界\n描述');
    const session = await normalizeSession(legacySession('mine.md'));
    expect(session.worldRef).toEqual({ name: 'mine.md', source: 'user', type: 'single' });
  });

  it('re-resolves placeholder metadata emitted by an upgraded v1 SQLite row', async () => {
    const session = await normalizeSession({
      ...legacySession('world'),
      schemaVersion: 1,
      worldRef: { name: 'world', source: 'builtin', type: 'single' },
    });
    expect(session.worldRef.type).toBe('directory');
  });

  it('reports corrupted session data instead of silently replacing it', async () => {
    await expect(normalizeSession({ sessionId: 'bad' })).rejects.toBeInstanceOf(SessionCorruptedError);
  });

  it('rejects invalid v2 metadata instead of treating it as a legacy session', async () => {
    await expect(normalizeSession({
      ...legacySession(),
      schemaVersion: SESSION_SCHEMA_VERSION,
      worldRef: { name: 'world', source: 'unknown', type: 'directory' },
    })).rejects.toThrow('schema v2 缺少有效 WorldRef');
    await expect(normalizeSession({
      ...legacySession(),
      schemaVersion: 3,
    })).rejects.toThrow('不支持的 schemaVersion');
    await expect(normalizeSession({
      ...legacySession(),
      schemaVersion: SESSION_SCHEMA_VERSION,
      worldRef: { name: '', source: 'builtin', type: 'single' },
    })).rejects.toThrow('schema v2 缺少有效 WorldRef');
  });

  it('rejects sessions without a restorable scenario', async () => {
    await expect(normalizeSession({
      ...legacySession(),
      scenarios: [],
    })).rejects.toThrow('场景为空或历史格式无效');
  });

  it('uses WorldRef and the last valid scenario as normalized source values', async () => {
    const normalized = await normalizeSession({
      ...legacySession('legacy-display'),
      schemaVersion: SESSION_SCHEMA_VERSION,
      worldRef: { name: 'actual-world', source: 'user', type: 'single' },
      system: null,
      biography: null,
      player: { ...legacySession().player, currentScenario: 'missing' },
    });
    expect(normalized.world).toBe('actual-world');
    expect(normalized.player.currentScenario).toBe('scene-1');
    expect(normalized.system).toBeUndefined();
    expect(normalized.biography).toBeUndefined();
  });

  it('rejects malformed nested player and choice data', async () => {
    await expect(normalizeSession({
      ...legacySession(),
      player: { ...legacySession().player, qaHistory: 'not-an-array' },
    })).rejects.toThrow('玩家属性、物品、摘要或问答格式无效');
    await expect(normalizeSession({
      ...legacySession(),
      scenarios: [{ id: 'scene', choices: [{ id: 'a' }] }],
    })).rejects.toThrow('场景条目格式无效');
    await expect(normalizeSession({
      ...legacySession(),
      player: {
        ...legacySession().player,
        history: [{ scenario: '一', scenarioDescription: '二', choice: 3, choiceId: 'a' }],
      },
    })).rejects.toThrow('玩家历史、属性值、物品或问答条目无效');
    await expect(normalizeSession({
      ...legacySession(),
      player: { ...legacySession().player, attributes: { hp: 'many' } },
    })).rejects.toThrow('玩家历史、属性值、物品或问答条目无效');
  });
});

describe('WebStorage v2 round trip', () => {
  beforeEach(() => localStorage.clear());

  it.each([
    'player_ended',
    'story_ending',
    'max_choices',
    'max_history',
  ] as const)('preserves WorldRef and endReason %s', async (endReason) => {
    const session = {
      ...legacySession('mine.md'),
      schemaVersion: SESSION_SCHEMA_VERSION,
      worldRef: { name: 'mine.md', source: 'user', type: 'single' },
      endReason,
      isActive: false,
      player: { ...legacySession().player, qaHistory: [] },
    } satisfies GameSession;
    const storage = createStorage();
    await storage.saveSession(session);
    await expect(storage.getSession(session.sessionId)).resolves.toMatchObject({
      schemaVersion: 2,
      worldRef: session.worldRef,
      endReason,
      createdAt: session.createdAt,
    });
  });

  it('lists, paginates QA, stores config, and deletes sessions', async () => {
    const storage = createStorage();
    const session: GameSession = {
      ...(await normalizeSession(legacySession('world'))),
      player: {
        ...(await normalizeSession(legacySession('world'))).player,
        qaHistory: [
          { id: '1', role: 'user', content: '问一' },
          { id: '2', role: 'assistant', content: '答一' },
        ],
      },
    };
    await storage.saveSession(session);
    expect(await storage.listSessions(true)).toHaveLength(1);
    expect(await storage.getQaHistory(session.sessionId, 2, 1)).toEqual([session.player.qaHistory[1]]);
    await storage.setConfig('sample', 'value');
    expect(await storage.getConfig('sample')).toBe('value');
    expect(await storage.deleteSession(session.sessionId)).toBe(true);
    expect(localStorage.getItem(`bio_qa_${session.sessionId}`)).toBeNull();
    expect(await storage.deleteSession(session.sessionId)).toBe(false);
    expect(await storage.getSession(session.sessionId)).toBeNull();
  });

  it('keeps valid sessions while reporting corrupted local records', async () => {
    const storage = createStorage();
    const valid = await normalizeSession(legacySession('world'));
    await storage.saveSession(valid);
    localStorage.setItem('bio_session_broken-session', '{bad-json');

    await expect(storage.listSessions(true)).resolves.toEqual([
      expect.objectContaining({ sessionId: valid.sessionId }),
    ]);
    await expect(storage.listSessionsDetailed(true)).resolves.toMatchObject({
      sessions: [expect.objectContaining({ sessionId: valid.sessionId })],
      corruptedSessions: [expect.objectContaining({ sessionId: 'broken-session' })],
    });
  });

  it('returns diagnostics when every local session is corrupted', async () => {
    const storage = createStorage();
    localStorage.setItem('bio_session_broken-one', '{bad-json');
    localStorage.setItem('bio_session_broken-two', JSON.stringify({ sessionId: 'broken-two' }));

    await expect(storage.listSessions(true)).resolves.toEqual([]);
    const result = await storage.listSessionsDetailed(true);
    expect(result.sessions).toEqual([]);
    expect(result.corruptedSessions.map((item) => item.sessionId).sort()).toEqual([
      'broken-one',
      'broken-two',
    ]);
  });
});
