import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GameEngine } from './engine';
import type { LLMConfig, StableLlmProvider } from '../services/llm';
import { createStorage } from '../services/storage';

function streamResponse(text: string): Response {
  const payload = JSON.stringify({ choices: [{ delta: { content: text } }] });
  return new Response(`data: ${payload}\r\n\r\ndata: [DONE]`, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

const intro = JSON.stringify({
  title: '序章',
  prologue: '启程',
  description: '故事开始',
  choices: [{ id: 'a', text: '前进', description: '向前' }],
});

function scene(index: number): string {
  return JSON.stringify({
    title: `第${index}章`,
    description: `场景${index}`,
    choices: [{ id: 'a', text: '继续', description: '继续前进' }],
    ending: null,
  });
}

function autoScene(index: number): string {
  return JSON.stringify({
    title: `过场${index}`,
    description: `自动推进${index}`,
    choices: [],
    auto_continue: true,
    ending: null,
  });
}

describe.each<StableLlmProvider>(['deepseek', 'openai'])('%s adapter game flow', (provider) => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    delete window.__TAURI__;
    delete window.__TAURI_INTERNALS__;
    localStorage.setItem('bio_user_worlds', JSON.stringify(['custom.md']));
    localStorage.setItem('bio_world_custom.md', '# 用户世界\n一片测试大陆');
  });

  it('runs start -> three choices -> end -> biography with a user WorldRef', async () => {
    const outputs = [intro, scene(1), scene(2), scene(3), '这是未完待续的传记。'];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => streamResponse(outputs.shift() ?? ''));
    const config: LLMConfig = {
      provider,
      apiKey: 'test-key',
      baseUrl: provider === 'openai' ? 'https://api.openai.com/v1' : 'https://api.deepseek.com',
      model: provider === 'openai' ? 'gpt-4o-mini' : 'deepseek-chat',
      temperature: 0,
      maxTokens: 256,
      timeout: 5000,
    };
    const engine = new GameEngine();
    const session = await engine.startGame('测试者', 'custom.md', 'basic', null, config, false, 'single');
    expect(session.worldRef).toEqual({ name: 'custom.md', source: 'user', type: 'single' });

    for (let index = 0; index < 3; index++) {
      await engine.processChoice(session, 'a', config);
    }
    await engine.processChoice(session, 'end_journey', config);
    expect(session.endReason).toBe('player_ended');
    await expect(engine.generateBiography(session, false, 'single', config))
      .resolves.toContain('未完待续');
    const biographyRequest = JSON.parse(String(
      (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[4]?.[1]?.body
    ));
    expect(biographyRequest.messages[0].content).toContain('未完待续');
    expect(globalThis.fetch).toHaveBeenCalledTimes(5);

    const storage = createStorage();
    await storage.saveSession(session);
    await expect(storage.getSession(session.sessionId)).resolves.toMatchObject({
      worldRef: { name: 'custom.md', source: 'user', type: 'single' },
      endReason: 'player_ended',
      biography: '这是未完待续的传记。',
    });
  });
});

describe('awaited history compression', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    localStorage.setItem('bio_world_custom.md', '# 用户世界\n测试大陆');
  });

  const config: LLMConfig = {
    provider: 'deepseek',
    apiKey: 'key',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    temperature: 0,
    maxTokens: 256,
    timeout: 5000,
  };

  it('awaits cloud summary before returning and keeps the configured tail', async () => {
    const outputs = [intro, scene(1), scene(2), '已压缩的摘要'];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => streamResponse(outputs.shift() ?? ''));
    const engine = new GameEngine({ summaryThreshold: 2, summaryKeepLatest: 1 });
    const session = await engine.startGame('测试者', 'custom.md', 'basic', null, config, false, 'single');
    await engine.processChoice(session, 'a', config);
    await engine.processChoice(session, 'a', config);
    expect(session.player.summary).toBe('已压缩的摘要');
    expect(session.player.history).toHaveLength(1);
  });

  it('checks the hard cap first and deterministically falls back if summary fails', async () => {
    let request = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      request++;
      if (request === 1) return streamResponse(intro);
      if (request === 2) return streamResponse(scene(1));
      return new Response(JSON.stringify({ error: { message: 'bad summary' } }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    const engine = new GameEngine({
      maxChoices: 10,
      summaryThreshold: 99,
      summaryKeepLatest: 1,
      maxHistoryHardCap: 1,
    });
    const session = await engine.startGame('测试者', 'custom.md', 'basic', null, config, false, 'single');
    await engine.processChoice(session, 'a', config);
    await engine.processChoice(session, 'a', config);
    expect(session.endReason).toBe('max_history');
    expect(session.player.summary).toContain('序章');
    expect(session.player.history).toHaveLength(1);
  });
});

describe('automatic scene continuation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    localStorage.setItem('bio_world_custom.md', '# 用户世界\n测试大陆');
  });

  const config: LLMConfig = {
    provider: 'deepseek',
    apiKey: 'key',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    temperature: 0,
    maxTokens: 256,
    timeout: 5000,
  };

  it('continues empty-choice scenes within the same choice transaction', async () => {
    const outputs = [intro, autoScene(1), scene(2)];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => streamResponse(outputs.shift() ?? ''));
    const engine = new GameEngine({ maxAutoContinue: 3 });
    const session = await engine.startGame(
      '测试者', 'custom.md', 'basic', null, config, false, 'single'
    );

    const result = await engine.processChoice(session, 'a', config);

    expect(result.scenario?.title).toBe('第2章');
    expect(result.scenario?.choices).toHaveLength(1);
    expect(session.player.history.some((entry) => entry.choiceId === '__auto_continue__'))
      .toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });

  it('does not count automatic continuation as a player choice', async () => {
    const outputs = [intro, autoScene(1), scene(2)];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => streamResponse(outputs.shift() ?? ''));
    const engine = new GameEngine({ maxChoices: 2, maxAutoContinue: 3 });
    const session = await engine.startGame(
      '测试者', 'custom.md', 'basic', null, config, false, 'single'
    );

    await engine.processChoice(session, 'a', config);

    expect(session.isActive).toBe(true);
    expect(session.endReason).toBeUndefined();
  });

  it('injects safe choices when automatic continuation reaches its limit', async () => {
    const outputs = [intro, autoScene(1), autoScene(2)];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => streamResponse(outputs.shift() ?? ''));
    const engine = new GameEngine({ maxAutoContinue: 2 });
    const session = await engine.startGame(
      '测试者', 'custom.md', 'basic', null, config, false, 'single'
    );

    const result = await engine.processChoice(session, 'a', config);

    expect(result.scenario?.title).toBe('过场2');
    expect(result.scenario?.choices.map((choice) => choice.id)).toEqual(['a', 'b']);
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });

  it('falls back safely when an introduction has no choices', async () => {
    const invalidIntro = JSON.stringify({
      title: '序章', prologue: '开始', description: '正文', choices: [],
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(streamResponse(invalidIntro));
    const engine = new GameEngine();

    const session = await engine.startGame(
      '测试者', 'custom.md', 'basic', null, config, false, 'single'
    );

    expect(session.scenarios[0].choices.map((choice) => choice.id)).toEqual(['a', 'b']);
  });
});

describe('engine response validation and terminal paths', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    localStorage.setItem('bio_world_custom.md', '# 用户世界\n测试大陆');
  });

  const config: LLMConfig = {
    provider: 'deepseek',
    apiKey: 'key',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    temperature: 0,
    maxTokens: 256,
    timeout: 5000,
  };

  it('generates and validates system proposals', async () => {
    const proposals = JSON.stringify([{
      id: 'scholar', title: '学者系统', description: '研究世界', abilities: '洞察',
    }]);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(streamResponse(proposals));
    const engine = new GameEngine();

    await expect(engine.generateSystemProposals(
      '测试者', 'custom.md', false, 'single', config
    )).resolves.toEqual([{
      id: 'scholar', title: '学者系统', description: '研究世界', abilities: '洞察',
    }]);
  });

  it.each([
    JSON.stringify([]),
    JSON.stringify([null]),
    JSON.stringify([{ id: 'bad', title: '缺字段' }]),
  ])('rejects malformed system proposals', async (payload) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(streamResponse(payload));
    const engine = new GameEngine();
    await expect(engine.generateSystemProposals(
      '测试者', 'custom.md', false, 'single', config
    )).rejects.toThrow();
  });

  it('answers a question with world, history, attributes, and system context', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(streamResponse('回答内容'));
    const engine = new GameEngine();
    const game = await engine.startGame(
      '测试者', 'custom.md', 'system', '洞察系统', config, false, 'single'
    );
    game.player.attributes = { 勇气: 3 };
    game.player.inventory = ['地图'];
    game.player.summary = '已经启程';
    game.player.qaHistory = [{ id: 'q1', role: 'user', content: '之前的问题' }];
    fetchMock.mockResolvedValueOnce(streamResponse('回答内容'));

    await expect(engine.answerQuery(game, '现在在哪里？', config)).resolves.toBe('回答内容');
    const body = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(body.messages[0].content).toContain('洞察系统');
    expect(body.messages[0].content).toContain('地图');
    expect(body.messages[0].content).toContain('勇气: 3');
  });

  it('uses a safe scenario when the model returns invalid choices', async () => {
    const invalid = JSON.stringify({
      title: '坏场景', description: '重复选项',
      choices: [{ id: 'a', text: '一' }, { id: 'a', text: '二' }], ending: null,
    });
    const outputs = [intro, invalid];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => streamResponse(outputs.shift() ?? ''));
    const engine = new GameEngine();
    const game = await engine.startGame(
      '测试者', 'custom.md', 'basic', null, config, false, 'single'
    );

    const result = await engine.processChoice(game, 'a', config);
    expect(result.scenario?.choices.map((choice) => choice.id)).toEqual(['a', 'b']);
    expect(result.scenario?.title).toBe('序章');
  });

  it('ends at the configured player-choice limit without another LLM request', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(streamResponse(intro));
    const engine = new GameEngine({ maxChoices: 1 });
    const game = await engine.startGame(
      '测试者', 'custom.md', 'basic', null, config, false, 'single'
    );

    const result = await engine.processChoice(game, 'a', config);
    expect(result.session).toMatchObject({ isActive: false, endReason: 'max_choices' });
    expect(result.scenario?.choices.some((choice) => choice.id === 'end')).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('accepts a validated story ending and supports its end choice', async () => {
    const ending = JSON.stringify({
      title: '终章', description: '故事完成', choices: [],
      ending: { type: 'peace', description: '安享余生' },
    });
    const outputs = [intro, ending];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => streamResponse(outputs.shift() ?? ''));
    const engine = new GameEngine();
    const game = await engine.startGame(
      '测试者', 'custom.md', 'basic', null, config, false, 'single'
    );

    const result = await engine.processChoice(game, 'a', config);
    expect(result.session).toMatchObject({ isActive: false, endReason: 'story_ending' });
    expect(result.scenario?.choices).toContainEqual(expect.objectContaining({ id: 'end' }));
    await expect(engine.processChoice(game, 'end', config)).resolves.toMatchObject({
      session: { isActive: false, endReason: 'story_ending' },
    });
  });

  it.each([
    'player_ended',
    'story_ending',
    'max_choices',
    'max_history',
  ] as const)('preserves endReason %s when accepting an ending panel', async (endReason) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(streamResponse(intro));
    const engine = new GameEngine();
    const game = await engine.startGame(
      '测试者', 'custom.md', 'basic', null, config, false, 'single'
    );
    game.isActive = false;
    game.endReason = endReason;
    game.scenarios = [{
      id: 'ending',
      title: '终章',
      description: '旅程结束',
      choices: [{ id: 'end', text: '完成旅程' }],
    }];

    await expect(engine.processChoice(game, 'end', config)).resolves.toMatchObject({
      session: { isActive: false, endReason },
    });
  });

  it('treats a legacy ending panel without endReason as a story ending', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(streamResponse(intro));
    const engine = new GameEngine();
    const game = await engine.startGame(
      '测试者', 'custom.md', 'basic', null, config, false, 'single'
    );
    game.isActive = false;
    game.endReason = undefined;
    game.scenarios = [{
      id: 'legacy-ending',
      title: '终章',
      description: '旅程结束',
      choices: [{ id: 'end', text: '完成旅程' }],
    }];

    await expect(engine.processChoice(game, 'end', config)).resolves.toMatchObject({
      session: { isActive: false, endReason: 'story_ending' },
    });
  });

  it('rejects stale choices and sessions without a scenario', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(streamResponse(intro));
    const engine = new GameEngine();
    const game = await engine.startGame(
      '测试者', 'custom.md', 'basic', null, config, false, 'single'
    );
    await expect(engine.processChoice(game, 'missing', config)).rejects.toThrow('选择已失效');
    game.scenarios = [];
    await expect(engine.processChoice(game, 'a', config)).rejects.toThrow('没有可用场景');
  });
});
