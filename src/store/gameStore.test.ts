import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from './gameStore';
import { SESSION_SCHEMA_VERSION, type GameSession, type Scenario } from '../types/models';
import { DEFAULT_SETTINGS } from '../types/settings';

const scenario: Scenario = {
  id: 'scene', title: '场景', description: '正文',
  choices: [{ id: 'a', text: '继续' }],
};

function session(): GameSession {
  return {
    schemaVersion: SESSION_SCHEMA_VERSION,
    sessionId: 'session',
    world: 'world',
    worldRef: { name: 'world', source: 'builtin', type: 'directory' },
    gameMode: 'basic',
    player: {
      name: '角色', currentScenario: scenario.id, history: [], attributes: {}, inventory: [],
      summary: '', qaHistory: [], createdAt: '2026-01-01T00:00:00.000Z',
    },
    scenarios: [scenario],
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('game store request isolation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    delete window.__TAURI__;
    delete window.__TAURI_INTERNALS__;
    useGameStore.setState({
      session: session(),
      currentScenario: scenario,
      config: {
        provider: 'deepseek', apiKey: 'key', baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-chat', temperature: 0, maxTokens: 32, timeout: 1000,
      },
      settings: { ...DEFAULT_SETTINGS, cloudPrivacyAcknowledged: true },
      isStreaming: false,
      streamedText: '',
      activeRequestId: null,
      activeRequestController: null,
      isPersistingSession: false,
      isDataMutationInProgress: false,
      error: null,
      resumeWarning: null,
      resumeSessions: [],
    });
  });

  it('prevents duplicate choice submission in the Store layer', async () => {
    let resolveRequest: ((value: { session: GameSession; scenario: Scenario }) => void) | undefined;
    const process = vi.spyOn(useGameStore.getState().engine, 'processChoice')
      .mockImplementation(() => new Promise((resolve) => { resolveRequest = resolve; }));
    vi.spyOn(useGameStore.getState().storage, 'saveSession').mockResolvedValue(undefined);

    const first = useGameStore.getState().makeChoice('a');
    const second = useGameStore.getState().makeChoice('a');
    expect(process).toHaveBeenCalledTimes(1);
    resolveRequest?.({ session: session(), scenario });
    await Promise.all([first, second]);
    expect(useGameStore.getState().isStreaming).toBe(false);
  });

  it('ignores a response that arrives after the user starts a new game', async () => {
    let resolveRequest: ((value: { session: GameSession; scenario: Scenario }) => void) | undefined;
    const process = vi.spyOn(useGameStore.getState().engine, 'processChoice')
      .mockImplementation(() => new Promise((resolve) => { resolveRequest = resolve; }));
    const save = vi.spyOn(useGameStore.getState().storage, 'saveSession').mockResolvedValue(undefined);

    const pending = useGameStore.getState().makeChoice('a');
    const signal = process.mock.calls[0][4];
    useGameStore.getState().newGame();
    expect(signal?.aborted).toBe(true);
    resolveRequest?.({ session: session(), scenario });
    await pending;
    expect(useGameStore.getState().session).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });

  it('waits for an already-started session write before allowing a data mutation', async () => {
    let finishSave: (() => void) | undefined;
    vi.spyOn(useGameStore.getState().engine, 'processChoice')
      .mockResolvedValue({ session: session(), scenario });
    const save = vi.spyOn(useGameStore.getState().storage, 'saveSession')
      .mockImplementation(() => new Promise<void>((resolve) => { finishSave = resolve; }));

    const choice = useGameStore.getState().makeChoice('a');
    await vi.waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(useGameStore.getState().isPersistingSession).toBe(true);

    let mutationPrepared = false;
    const prepare = useGameStore.getState().prepareForDataMutation().then(() => {
      mutationPrepared = true;
    });
    await Promise.resolve();
    expect(mutationPrepared).toBe(false);
    expect(useGameStore.getState().isDataMutationInProgress).toBe(true);

    finishSave?.();
    await Promise.all([choice, prepare]);
    expect(mutationPrepared).toBe(true);
    expect(useGameStore.getState().isPersistingSession).toBe(false);
    expect(useGameStore.getState().activeRequestId).toBeNull();
    useGameStore.getState().finishDataMutation();
    expect(useGameStore.getState().isDataMutationInProgress).toBe(false);
  });

  it('invalidates an active request before it can start an old session write', async () => {
    let finishRequest:
      ((value: { session: GameSession; scenario: Scenario }) => void) | undefined;
    vi.spyOn(useGameStore.getState().engine, 'processChoice')
      .mockImplementation(() => new Promise((resolve) => { finishRequest = resolve; }));
    const save = vi.spyOn(useGameStore.getState().storage, 'saveSession')
      .mockResolvedValue(undefined);

    const choice = useGameStore.getState().makeChoice('a');
    await useGameStore.getState().prepareForDataMutation();
    finishRequest?.({ session: session(), scenario });
    await choice;

    expect(save).not.toHaveBeenCalled();
    expect(useGameStore.getState().activeRequestId).toBeNull();
    useGameStore.getState().finishDataMutation();
  });

  it('rejects a duplicate data mutation at the Store boundary', async () => {
    await useGameStore.getState().prepareForDataMutation();
    await expect(useGameStore.getState().prepareForDataMutation())
      .rejects.toThrow('已有数据操作正在进行');
    useGameStore.getState().finishDataMutation();
  });

  it('tests a draft cloud configuration without persisting it', async () => {
    const payload = JSON.stringify({ choices: [{ delta: { content: 'OK' } }] });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(`data: ${payload}\n\ndata: [DONE]\n\n`));
    const original = useGameStore.getState().settings;
    const draft = { ...original, llmProvider: 'openai' as const, model: 'draft-model' };
    await expect(useGameStore.getState().testLlmConnection(draft)).resolves.toBe(true);
    expect(useGameStore.getState().settings.model).toBe(original.model);
    expect(localStorage.getItem('bio_config_app_settings')).toBeNull();
  });

  it('loads world source/type metadata instead of marking every world built-in', async () => {
    localStorage.setItem('bio_user_worlds', JSON.stringify(['mine.md']));
    localStorage.setItem('bio_world_mine.md', '# Mine\n描述');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no listing'));
    await useGameStore.getState().loadWorlds();
    expect(useGameStore.getState().worlds).toContainEqual(expect.objectContaining({
      filename: 'mine.md', isBuiltIn: false, type: 'single',
    }));
    expect(useGameStore.getState().worlds).toContainEqual(expect.objectContaining({
      filename: 'world', isBuiltIn: true, type: 'directory',
    }));
  });

  it('keeps resumable sessions visible while warning about corrupted records', async () => {
    const valid = session();
    vi.spyOn(useGameStore.getState().storage, 'listSessionsDetailed').mockResolvedValue({
      sessions: [valid],
      corruptedSessions: [{ sessionId: 'broken-session', error: '会话数据损坏' }],
    });

    await useGameStore.getState().checkResume();

    expect(useGameStore.getState().resumeSessions).toEqual([
      expect.objectContaining({ sessionId: valid.sessionId }),
    ]);
    expect(useGameStore.getState().resumeWarning).toContain('broken-session');
  });

  it('surfaces a session-list read failure instead of silently hiding it', async () => {
    vi.spyOn(useGameStore.getState().storage, 'listSessionsDetailed')
      .mockRejectedValue(new Error('database unavailable'));

    await useGameStore.getState().checkResume();

    expect(useGameStore.getState().resumeSessions).toEqual([]);
    expect(useGameStore.getState().error).toContain('database unavailable');
  });

  it('rethrows a session-list read failure in strict refresh mode', async () => {
    const failure = new Error('strict database unavailable');
    vi.spyOn(useGameStore.getState().storage, 'listSessionsDetailed')
      .mockRejectedValue(failure);

    await expect(useGameStore.getState().checkResume({ throwOnError: true }))
      .rejects.toBe(failure);
    expect(useGameStore.getState().error).toContain('strict database unavailable');
  });

  it('loads and explicitly saves settings while updating engine limits', async () => {
    const storage = useGameStore.getState().storage;
    vi.spyOn(storage, 'getConfig').mockResolvedValue(null);
    const setConfig = vi.spyOn(storage, 'setConfig').mockResolvedValue(undefined);
    await useGameStore.getState().loadSettings();
    await useGameStore.getState().updateSettings({
      cloudPrivacyAcknowledged: true,
      maxChoices: 12,
    });
    expect(useGameStore.getState().settings.maxChoices).toBe(12);
    expect(setConfig).toHaveBeenCalled();
  });

  it('injects the dedicated API key into memory without relying on app settings', async () => {
    localStorage.setItem('bio_api_key', 'memory-only-key');
    vi.spyOn(useGameStore.getState().storage, 'getConfig').mockResolvedValue(null);
    await useGameStore.getState().loadConfig();
    expect(useGameStore.getState().config?.apiKey).toBe('memory-only-key');
    expect(useGameStore.getState().settings.apiKey).toBe('memory-only-key');
  });

  it('removes a legacy API key from backward-compatible app config storage', async () => {
    localStorage.setItem('bio_api_key', 'keyring-key');
    const storage = useGameStore.getState().storage;
    vi.spyOn(storage, 'getConfig').mockImplementation(async (key) => key === 'app_config'
      ? JSON.stringify({
        provider: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
        apiKey: 'legacy-plaintext-key',
      })
      : null);
    const write = vi.spyOn(storage, 'setConfig').mockResolvedValue(undefined);
    await useGameStore.getState().loadConfig();
    expect(useGameStore.getState().config?.apiKey).toBe('keyring-key');
    const migrated = JSON.parse(write.mock.calls[0][1] as string);
    expect(migrated).not.toHaveProperty('apiKey');
  });

  it('does not let legacy experimental app config override normalized stable settings', async () => {
    localStorage.setItem('bio_api_key', 'cloud-key');
    const storage = useGameStore.getState().storage;
    vi.spyOn(storage, 'getConfig').mockImplementation(async (key) => {
      if (key === 'app_settings') return JSON.stringify({
        llmProvider: 'ollama',
        baseUrl: 'http://localhost:11434/v1',
        model: 'local-model',
      });
      if (key === 'app_config') return JSON.stringify({
        provider: 'openai',
        baseUrl: 'http://localhost:11434/v1',
        model: 'local-model',
      });
      return null;
    });
    vi.spyOn(storage, 'setConfig').mockResolvedValue(undefined);

    await useGameStore.getState().loadSettings();
    await useGameStore.getState().loadConfig();

    expect(useGameStore.getState().config).toMatchObject({
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat',
      apiKey: 'cloud-key',
    });
  });

  it('migrates a supported legacy cloud config when app settings do not exist', async () => {
    const storage = useGameStore.getState().storage;
    vi.spyOn(storage, 'getConfig').mockImplementation(async (key) => key === 'app_config'
      ? JSON.stringify({
        provider: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4.1-mini',
        temperature: 0.25,
      })
      : null);
    vi.spyOn(storage, 'setConfig').mockResolvedValue(undefined);

    await useGameStore.getState().loadConfig();

    expect(useGameStore.getState().config).toMatchObject({
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4.1-mini',
      temperature: 0.25,
    });
    expect(useGameStore.getState().settings).toMatchObject({
      llmProvider: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4.1-mini',
      temperature: 0.25,
    });
    expect(storage.setConfig).toHaveBeenCalledWith(
      'app_settings',
      expect.stringContaining('"llmProvider":"openai"')
    );
  });

  it('keeps Store and API key unchanged when settings persistence fails', async () => {
    localStorage.setItem('bio_api_key', 'old-key');
    const previousSettings = {
      ...DEFAULT_SETTINGS,
      apiKey: 'old-key',
      cloudPrivacyAcknowledged: true,
    };
    useGameStore.setState({
      settings: previousSettings,
      config: {
        provider: 'deepseek', apiKey: 'old-key', baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-chat', temperature: 0.8, maxTokens: 4096, timeout: 120000,
      },
    });
    const storage = useGameStore.getState().storage;
    vi.spyOn(storage, 'setConfig')
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValue(undefined);

    await expect(useGameStore.getState().updateSettings({
      apiKey: 'new-key',
      model: 'changed-model',
    })).rejects.toThrow('database unavailable');

    expect(useGameStore.getState().settings).toEqual(previousSettings);
    expect(useGameStore.getState().config).toMatchObject({
      apiKey: 'old-key', model: 'deepseek-chat',
    });
    expect(localStorage.getItem('bio_api_key')).toBe('old-key');
  });

  it('preserves the keyring value when legacy app config is malformed', async () => {
    localStorage.setItem('bio_api_key', 'keyring-key');
    const storage = useGameStore.getState().storage;
    vi.spyOn(storage, 'getConfig').mockImplementation(async (key) => key === 'app_config'
      ? '{not-json'
      : null);

    await useGameStore.getState().loadConfig();

    expect(useGameStore.getState().config).toMatchObject({
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com',
      apiKey: 'keyring-key',
    });
  });

  it('starts a user-world game once and persists the completed introduction', async () => {
    const created = session();
    created.world = 'mine.md';
    created.worldRef = { name: 'mine.md', source: 'user', type: 'single' };
    const start = vi.spyOn(useGameStore.getState().engine, 'startGame').mockResolvedValue(created);
    const save = vi.spyOn(useGameStore.getState().storage, 'saveSession').mockResolvedValue(undefined);
    await useGameStore.getState().startBasicGame('角色名', 'mine.md', false, 'single');
    expect(start).toHaveBeenCalledWith(
      '角色名', 'mine.md', 'basic', null, expect.any(Object), false, 'single',
      expect.any(Function), expect.any(AbortSignal)
    );
    expect(save).toHaveBeenCalledWith(created);
    expect(useGameStore.getState()).toMatchObject({
      session: created, currentScreen: 'game', isStreaming: false, activeRequestId: null,
    });
  });

  it('generates and starts a system-mode game through the guarded request flow', async () => {
    const proposal = { id: 'p', title: '系统', description: '说明', abilities: '能力' };
    vi.spyOn(useGameStore.getState().engine, 'generateSystemProposals').mockResolvedValue([proposal]);
    await useGameStore.getState().generateSystemProposals('角色名', 'world', true, 'directory');
    expect(useGameStore.getState().systemProposals).toEqual([proposal]);

    useGameStore.getState().selectSystem(proposal);
    const created = { ...session(), gameMode: 'system' as const, system: '系统' };
    vi.spyOn(useGameStore.getState().engine, 'startGame').mockResolvedValue(created);
    vi.spyOn(useGameStore.getState().storage, 'saveSession').mockResolvedValue(undefined);
    await useGameStore.getState().startSystemGame();
    expect(useGameStore.getState()).toMatchObject({
      session: created, selectedSystem: null, pendingStartParams: null, isStreaming: false,
    });
  });

  it('generates an incomplete biography with the persisted user WorldRef', async () => {
    const ended = session();
    ended.world = 'mine.md';
    ended.worldRef = { name: 'mine.md', source: 'user', type: 'single' };
    ended.isActive = false;
    ended.endReason = 'player_ended';
    localStorage.setItem('bio_world_mine.md', '# Mine\n世界内容');
    useGameStore.setState({ session: ended, isStreaming: false, activeRequestId: null });
    const payload = JSON.stringify({ choices: [{ delta: { content: '未完待续的传记' } }] });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(`data: ${payload}\n\ndata: [DONE]\n\n`));
    const save = vi.spyOn(useGameStore.getState().storage, 'saveSession').mockResolvedValue(undefined);

    await useGameStore.getState().generateBiography();
    expect(useGameStore.getState().session?.biography).toContain('未完待续');
    expect(useGameStore.getState().currentScreen).toBe('biography');
    expect(save).toHaveBeenCalled();
  });

  it('aborts biography streaming when the user skips it', async () => {
    const ended = session();
    ended.world = 'mine.md';
    ended.worldRef = { name: 'mine.md', source: 'user', type: 'single' };
    ended.isActive = false;
    ended.endReason = 'player_ended';
    localStorage.setItem('bio_world_mine.md', '# Mine\n世界内容');
    useGameStore.setState({ session: ended, isStreaming: false });

    let fetchSignal: AbortSignal | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
      fetchSignal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        fetchSignal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
      });
    });

    const pending = useGameStore.getState().generateBiography();
    await vi.waitFor(() => expect(fetchSignal).toBeDefined());
    useGameStore.getState().skipBiography();

    expect(fetchSignal?.aborted).toBe(true);
    await pending;
    expect(useGameStore.getState()).toMatchObject({
      currentScreen: 'start',
      isStreaming: false,
      activeRequestId: null,
      activeRequestController: null,
      error: null,
    });
  });

  it('persists an answer and restores the exact current scenario on resume', async () => {
    const answerQuery = vi.spyOn(useGameStore.getState().engine, 'answerQuery')
      .mockResolvedValue('回答');
    const storage = useGameStore.getState().storage;
    const save = vi.spyOn(storage, 'saveSession').mockResolvedValue(undefined);
    await useGameStore.getState().askQuestion('问题');
    expect(useGameStore.getState().session?.player.qaHistory.map((item) => item.role))
      .toEqual(['user', 'assistant']);
    expect(answerQuery.mock.calls[0][0].player.qaHistory).toEqual([]);
    expect(save).toHaveBeenCalled();

    const restored = session();
    restored.scenarios = [
      { ...scenario, id: 'old' },
      { ...scenario, id: 'current' },
    ];
    restored.player.currentScenario = 'current';
    vi.spyOn(storage, 'getSession').mockResolvedValue(restored);
    vi.spyOn(storage, 'getQaHistory').mockResolvedValue([]);
    await useGameStore.getState().resumeGame(restored.sessionId);
    expect(useGameStore.getState().currentScenario?.id).toBe('current');
    expect(useGameStore.getState().currentScreen).toBe('game');
  });

  it('sends only prior QA context and persists no more than the configured limit', async () => {
    const existing = [
      { id: '1', role: 'user' as const, content: '旧问题一' },
      { id: '2', role: 'assistant' as const, content: '旧回答一' },
      { id: '3', role: 'user' as const, content: '旧问题二' },
      { id: '4', role: 'assistant' as const, content: '旧回答二' },
    ];
    const current = session();
    current.player.qaHistory = existing;
    useGameStore.setState({
      session: current,
      settings: { ...DEFAULT_SETTINGS, maxQaHistory: 3 },
    });
    const answerQuery = vi.spyOn(useGameStore.getState().engine, 'answerQuery')
      .mockResolvedValue('新回答');
    vi.spyOn(useGameStore.getState().storage, 'saveSession').mockResolvedValue(undefined);

    await useGameStore.getState().askQuestion('新问题');

    expect(answerQuery.mock.calls[0][0].player.qaHistory.map((item) => item.content))
      .toEqual(['旧回答一', '旧问题二', '旧回答二']);
    expect(answerQuery.mock.calls[0][0].player.qaHistory).not.toContainEqual(
      expect.objectContaining({ content: '新问题' })
    );
    expect(useGameStore.getState().session?.player.qaHistory.map((item) => item.content))
      .toEqual(['旧回答二', '新问题', '新回答']);
  });

  it('rolls back a failed question so the same question can be retried', async () => {
    const answerQuery = vi.spyOn(useGameStore.getState().engine, 'answerQuery')
      .mockRejectedValueOnce(new Error('network failed'))
      .mockResolvedValueOnce('重试成功');
    vi.spyOn(useGameStore.getState().storage, 'saveSession').mockResolvedValue(undefined);

    await useGameStore.getState().askQuestion('可以重试吗？');
    expect(useGameStore.getState().session?.player.qaHistory).toEqual([]);

    await useGameStore.getState().askQuestion('可以重试吗？');
    expect(answerQuery).toHaveBeenCalledTimes(2);
    const qaHistory = useGameStore.getState().session?.player.qaHistory ?? [];
    expect(qaHistory[qaHistory.length - 1]?.content).toBe('重试成功');
  });

  it('persists player ending and refreshes the resumable-session list after deletion', async () => {
    const storage = useGameStore.getState().storage;
    const save = vi.spyOn(storage, 'saveSession').mockResolvedValue(undefined);
    await useGameStore.getState().endGame(false);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({
      isActive: false, endReason: 'player_ended',
    }));

    vi.spyOn(storage, 'listSessionsDetailed').mockResolvedValue({
      sessions: [session()],
      corruptedSessions: [],
    });
    await useGameStore.getState().checkResume();
    expect(useGameStore.getState().resumeSessions).toHaveLength(1);
    vi.spyOn(storage, 'deleteSession').mockResolvedValue(true);
    await useGameStore.getState().deleteSession('session');
    expect(storage.deleteSession).toHaveBeenCalledWith('session');
  });

  it('publishes player-ended state before asynchronous persistence completes', async () => {
    let finishSave: (() => void) | undefined;
    vi.spyOn(useGameStore.getState().storage, 'saveSession').mockImplementation(
      () => new Promise<void>((resolve) => { finishSave = resolve; })
    );

    const pending = useGameStore.getState().endGame(false);
    expect(useGameStore.getState().session).toMatchObject({
      isActive: false,
      endReason: 'player_ended',
    });
    finishSave?.();
    await pending;
  });

  it('rejects ending when persistence fails so biography confirmation stays blocked', async () => {
    vi.spyOn(useGameStore.getState().storage, 'saveSession')
      .mockRejectedValue(new Error('database unavailable'));

    await expect(useGameStore.getState().endGame(false)).rejects.toThrow('database unavailable');
    expect(useGameStore.getState().error).toContain('database unavailable');
    expect(useGameStore.getState().session?.isActive).toBe(true);
    expect(useGameStore.getState().session?.endReason).toBeUndefined();
  });

  it('aborts an active request before ending the journey', async () => {
    const controller = new AbortController();
    useGameStore.setState({
      activeRequestId: 'active',
      activeRequestController: controller,
      isStreaming: true,
    });
    vi.spyOn(useGameStore.getState().storage, 'saveSession').mockResolvedValue(undefined);

    await useGameStore.getState().endGame(false);

    expect(controller.signal.aborted).toBe(true);
    expect(useGameStore.getState()).toMatchObject({
      isStreaming: false,
      activeRequestId: null,
      activeRequestController: null,
    });
  });
});
