// src/game/engine.ts - Game engine core

import type {
  GameSession,
  Scenario,
  SystemProposal,
} from '../types/models';
import { SESSION_SCHEMA_VERSION } from '../types/models';
import { LLMError, type LLMConfig } from '../services/llm';
import { parseLLMJSON } from '../services/parser';
import { prompts } from '../services/prompts';
import { withRetry } from '../services/retry';
import { generateId } from '../utils/format';
import { fitPromptToContext } from '../services/contextBudget';
import type { GameEngineDependencies } from '../infrastructure/contracts';
import { defaultGameEngineDependencies } from '../infrastructure/defaults';

export interface GameEngineConfig {
  maxChoices: number;
  maxAutoContinue: number;
  summaryThreshold: number;
  summaryKeepLatest: number;
  maxQaHistory: number;
  maxScenariosInMemory: number;
  maxHistoryHardCap: number;
  llmMaxRetries: number;
}

const DEFAULT_ENGINE_CONFIG: GameEngineConfig = {
  maxChoices: 30,
  maxAutoContinue: 5,
  summaryThreshold: 15,
  summaryKeepLatest: 10,
  maxQaHistory: 20,
  maxScenariosInMemory: 2,
  maxHistoryHardCap: 45,
  llmMaxRetries: 3,
};

export class GameEngine {
  private config: GameEngineConfig;
  private readonly dependencies: GameEngineDependencies;

  constructor(
    config: Partial<GameEngineConfig> = {},
    dependencies: GameEngineDependencies = defaultGameEngineDependencies
  ) {
    this.config = { ...DEFAULT_ENGINE_CONFIG, ...config };
    this.dependencies = dependencies;
  }

  updateConfig(config: Partial<GameEngineConfig>): void {
    this.config = { ...this.config, ...config };
  }

  private retryAttempts(cap = Number.POSITIVE_INFINITY): number {
    const retries = Number.isFinite(this.config.llmMaxRetries)
      ? Math.max(0, Math.floor(this.config.llmMaxRetries))
      : DEFAULT_ENGINE_CONFIG.llmMaxRetries;
    const attempts = retries + 1;
    return Math.min(cap, attempts);
  }

  private fitPrompt(prompt: string, llmConfig: LLMConfig): string {
    const contextWindowTokens = llmConfig.contextWindow ?? 65536;
    const fitted = fitPromptToContext(prompt, {
      contextWindowTokens,
      reservedOutputTokens: llmConfig.maxTokens,
      safetyMarginTokens: Math.max(1024, Math.floor(contextWindowTokens * 0.05)),
    });
    if (!fitted.text) {
      throw new LLMError(
        'context_overflow',
        '模型上下文窗口不足以容纳输出预留和最小输入内容'
      );
    }
    return fitted.text;
  }

  /**
   * Start a new game (basic mode)
   */
  async startGame(
    playerName: string,
    worldName: string,
    gameMode: 'basic' | 'system',
    systemContext: string | null,
    llmConfig: LLMConfig,
    isBuiltIn: boolean,
    worldType: 'single' | 'directory',
    onToken?: (token: string) => void,
    signal?: AbortSignal
  ): Promise<GameSession> {
    const worldRef = {
      name: worldName,
      source: isBuiltIn ? 'builtin' as const : 'user' as const,
      type: worldType,
    };
    const worldContext = await this.dependencies.worlds.getContext(worldRef);

    const session: GameSession = {
      schemaVersion: SESSION_SCHEMA_VERSION,
      sessionId: generateId(),
      world: worldName,
      worldRef,
      gameMode,
      system: systemContext || undefined,
      player: {
        name: playerName,
        currentScenario: '',
        history: [],
        attributes: {},
        inventory: [],
        summary: '',
        qaHistory: [],
        createdAt: new Date().toISOString(),
      },
      scenarios: [],
      isActive: true,
      createdAt: new Date().toISOString(),
    };

    const sysCtx = this.loadSystemContext(session);
    const introPrompt = this.fitPrompt(prompts.format(prompts.introductionPrompt(), {
      world_context: worldContext,
      system_context: sysCtx,
      player_name: playerName,
    }), llmConfig);

    const fullText = await withRetry(
      () => this.dependencies.llm.streamText(
        [{ role: 'user', content: introPrompt }],
        llmConfig,
        onToken,
        signal
      ),
      { maxAttempts: this.retryAttempts(), signal }
    );

    let data: ReturnType<GameEngine['validateScenarioData']>;
    try {
      data = this.validateScenarioData(parseLLMJSON(fullText), true);
    } catch (error) {
      console.warn('LLM 序章响应无效，使用安全降级序章', error);
      data = {
        title: '序章',
        prologue: `${playerName}踏入了这个世界。`,
        description: '前路尚未展开，你需要决定迈出的第一步。',
        choices: [
          { id: 'a', text: '观察四周', description: '先了解身处的环境' },
          { id: 'b', text: '向前探索', description: '主动寻找故事的线索' },
        ],
      };
    }

    const prologueScenario: Scenario = {
      id: generateId(),
      title: data.title || '序章',
      description: (data.prologue || '') + '\n\n' + (data.description || ''),
      choices: (data.choices || []).map((c) => ({
        id: c.id,
        text: c.text,
        description: c.description,
      })),
    };

    session.scenarios = [prologueScenario];
    session.player.currentScenario = prologueScenario.id;

    return session;
  }

  /**
   * Generate system proposals (system mode)
   */
  async generateSystemProposals(
    playerName: string,
    worldName: string,
    isBuiltIn: boolean,
    worldType: 'single' | 'directory',
    llmConfig: LLMConfig,
    onToken?: (token: string) => void,
    signal?: AbortSignal
  ): Promise<SystemProposal[]> {
    const worldContext = await this.dependencies.worlds.getContext({
      name: worldName,
      source: isBuiltIn ? 'builtin' : 'user',
      type: worldType,
    });

    const sysPrompt = this.fitPrompt(prompts.format(prompts.systemGenerationPrompt(), {
      world_context: worldContext,
      player_name: playerName,
    }), llmConfig);

    const fullText = await withRetry(
      () => this.dependencies.llm.streamText(
        [{ role: 'user', content: sysPrompt }],
        llmConfig,
        onToken,
        signal
      ),
      { maxAttempts: this.retryAttempts(), signal }
    );

    const proposals = parseLLMJSON(fullText);
    if (!Array.isArray(proposals) || proposals.length === 0) {
      throw new Error('系统方案响应不是非空数组');
    }
    return proposals.map((value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('系统方案格式无效');
      }
      const proposal = value as Record<string, unknown>;
      if (typeof proposal.id !== 'string' || typeof proposal.title !== 'string'
        || typeof proposal.description !== 'string' || typeof proposal.abilities !== 'string') {
        throw new Error('系统方案缺少必要字段');
      }
      return proposal as unknown as SystemProposal;
    });
  }

  /**
   * Process player's choice and generate next scenario
   */
  async processChoice(
    session: GameSession,
    choiceId: string,
    llmConfig: LLMConfig,
    onToken?: (token: string) => void,
    signal?: AbortSignal
  ): Promise<{ session: GameSession; scenario?: Scenario }> {
    const current = session.scenarios[session.scenarios.length - 1];
    if (!current) throw new Error('当前会话没有可用场景');
    if (choiceId !== 'end_journey' && !current.choices.some((choice) => choice.id === choiceId)) {
      throw new Error('选择已失效，请重新加载当前场景');
    }

    this.recordChoice(session, current, choiceId);

    if (choiceId === 'end') {
      session.isActive = false;
      session.endReason ??= 'story_ending';
      return { session };
    }

    if (choiceId === 'end_journey') {
      session.isActive = false;
      session.endReason = 'player_ended';
      return { session };
    }

    const nextData = await this.resolveNextScenario(session, current, llmConfig, onToken, signal);
    await this.applyNextScenario(session, nextData, llmConfig, onToken, signal);

    return { session, scenario: session.scenarios[session.scenarios.length - 1] };
  }

  /**
   * Generate biography
   */
  async generateBiography(
    session: GameSession,
    _isBuiltIn: boolean,
    _worldType: 'single' | 'directory',
    llmConfig: LLMConfig,
    onToken?: (token: string) => void,
    signal?: AbortSignal
  ): Promise<string> {
    const worldContext = await this.dependencies.worlds.getContext(session.worldRef);
    const isComplete = session.endReason === 'story_ending'
      || session.endReason === 'max_choices'
      || session.endReason === 'max_history'
      || !session.endReason;
    const worldThemes = prompts.extractWorldThemes(worldContext);
    const historyText = prompts.formatHistoryForBiography(
      session.player.history,
      session.player.summary,
      isComplete
    );

    const bioPrompt = this.fitPrompt(prompts.format(prompts.biographyPrompt(isComplete), {
      world_context: worldThemes,
      system_context: this.loadSystemContext(session),
      player_name: session.player.name,
      player_history: historyText,
    }), llmConfig);

    const biography = await withRetry(
      () => this.dependencies.llm.streamText(
        [{ role: 'user', content: bioPrompt }],
        llmConfig,
        onToken,
        signal
      ),
      { maxAttempts: this.retryAttempts(), signal }
    );

    session.biography = biography;
    return biography;
  }

  /**
   * Answer a query — returns the answer string only.
   * Does NOT mutate the session. The store handles QA history.
   */
  async answerQuery(
    session: GameSession,
    question: string,
    llmConfig: LLMConfig,
    onToken?: (token: string) => void,
    signal?: AbortSignal
  ): Promise<string> {
    const worldContext = await this.dependencies.worlds.getContext(session.worldRef);
    const historyText = prompts.formatHistory(session.player.history, session.player.summary);
    const qaHistoryContext = prompts.formatQaHistory(session.player.qaHistory);

    const qaPrompt = this.fitPrompt(prompts.format(prompts.qaPrompt(), {
      world_context: worldContext,
      system_context: this.loadSystemContext(session),
      player_name: session.player.name,
      inventory: session.player.inventory.join(', ') || '无',
      attributes: Object.entries(session.player.attributes)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ') || '无',
      summary: session.player.summary,
      player_history: historyText,
      qa_history_context: qaHistoryContext,
      question,
    }), llmConfig);

    return await withRetry(
      () => this.dependencies.llm.streamText(
        [{ role: 'user', content: qaPrompt }],
        llmConfig,
        onToken,
        signal
      ),
      { maxAttempts: this.retryAttempts(), signal }
    );
  }

  // ── Private methods ─────────────────────────────────────────────

  private recordChoice(
    session: GameSession,
    scenario: Scenario,
    choiceId: string
  ): void {
    const choice = scenario.choices.find((c) => c.id === choiceId);
    const choiceText = choice?.text || '(未知选择)';
    const descriptionText = choice?.description || choice?.text || '';

    session.player.history.push({
      scenario: scenario.title,
      scenarioDescription: descriptionText,
      choice: choiceText,
      choiceId,
    });
  }

  private async resolveNextScenario(
    session: GameSession,
    current: Scenario,
    llmConfig: LLMConfig,
    onToken?: (token: string) => void,
    signal?: AbortSignal
  ): Promise<unknown> {
    const playerChoiceCount = session.player.history.filter(
      (entry) => entry.choiceId !== '__auto_continue__'
    ).length;
    if (playerChoiceCount >= this.config.maxChoices) {
      session.isActive = false;
      session.endReason = 'max_choices';
      return this.endingScenario('legend');
    }

    if (session.player.history.length > this.config.maxHistoryHardCap) {
      session.isActive = false;
      session.endReason = 'max_history';
      return this.endingScenario('legend');
    }

    const worldContext = await this.dependencies.worlds.getContext(session.worldRef);

    const scenarioPromptText = this.fitPrompt(prompts.format(prompts.scenarioPrompt(), {
      world_context: worldContext,
      system_context: this.loadSystemContext(session),
      player_name: session.player.name,
      summary: prompts.formatSummaryOnly(session.player.history, session.player.summary),
      latest_scene: prompts.formatLatestScene(session.player.history),
      previous_choice: this.getPreviousChoice(session),
    }), llmConfig);

    const fullText = await withRetry(
      () => this.dependencies.llm.streamText(
        [{ role: 'user', content: scenarioPromptText }],
        llmConfig,
        onToken,
        signal
      ),
      { maxAttempts: this.retryAttempts(), signal }
    );

    try {
      return this.validateScenarioData(parseLLMJSON(fullText));
    } catch (error) {
      console.warn('LLM 场景响应无效，使用安全降级场景', error);
      return this.fallbackScenario(current);
    }
  }

  private async applyNextScenario(
    session: GameSession,
    data: unknown,
    llmConfig: LLMConfig,
    onToken?: (token: string) => void,
    signal?: AbortSignal
  ): Promise<void> {
    let nextData = data;
    let autoCount = 0;

    while (true) {
      const typed = nextData as Record<string, unknown>;
      const nextScenario: Scenario = {
        id: generateId(),
        title: (typed.title as string) || '新的篇章',
        description: (typed.description as string) || '',
        choices: ((typed.choices as unknown[]) || []).map(
          (choiceValue: unknown) => {
            const choice = choiceValue as Record<string, string>;
            return {
              id: choice.id,
              text: choice.text,
              description: choice.description,
            };
          }
        ),
      };

      if (typed.ending) {
        const ending = typed.ending as { type: string; description: string };
        if (ending.type) {
          session.isActive = false;
          session.endReason ??= 'story_ending';
          this.ensureEndChoice(nextScenario, ending);
        }
      }

      if (nextScenario.choices.length === 0 && !typed.ending) {
        autoCount++;
        if (autoCount >= this.config.maxAutoContinue) {
          nextScenario.choices = [
            { id: 'a', text: '继续前行', description: '沿着命运指引的方向前进' },
            { id: 'b', text: '另寻他路', description: '选择一条不同的道路' },
          ];
        } else {
          session.player.history.push({
            scenario: nextScenario.title,
            scenarioDescription: nextScenario.description,
            choice: '(故事继续)',
            choiceId: '__auto_continue__',
          });
          session.scenarios = [nextScenario];
          session.player.currentScenario = nextScenario.id;
          nextData = await this.resolveNextScenario(
            session,
            nextScenario,
            llmConfig,
            onToken,
            signal
          );
          continue;
        }
      }

      session.scenarios = [nextScenario];
      session.player.currentScenario = nextScenario.id;
      await this.maybeSummarize(session, llmConfig, signal);
      return;
    }
  }

  private summarizing = false;

  private async maybeSummarize(
    session: GameSession,
    llmConfig: LLMConfig,
    signal?: AbortSignal
  ): Promise<void> {
    if (this.summarizing) return;
    this.summarizing = true;

    try {
      const historyLen = session.player.history.length;

      if (historyLen > this.config.maxHistoryHardCap) {
        await this.generateSummary(session, llmConfig, signal);
      } else if (historyLen >= this.config.summaryThreshold) {
        await this.generateSummary(session, llmConfig, signal);
      }
    } finally {
      this.summarizing = false;
    }
  }

  private async generateSummary(
    session: GameSession,
    llmConfig: LLMConfig,
    signal?: AbortSignal
  ): Promise<void> {
    const keepCount = this.config.summaryKeepLatest;
    if (session.player.history.length <= keepCount) return;

    const toSummarize = session.player.history.slice(0, -keepCount);

    const deterministicFallback = (): string => [
      session.player.summary,
      toSummarize
        .map((entry) => `${entry.scenario} → ${entry.choice}`)
        .join('；'),
    ].filter(Boolean).join('\n');

    try {
      const summary = await withRetry(
        () => this.dependencies.llm.streamText(
          [{
            role: 'user',
            content: this.fitPrompt(prompts.format(prompts.summarizationPrompt(), {
              existing_summary: session.player.summary,
              new_events: prompts.formatHistory(toSummarize),
            }), { ...llmConfig, maxTokens: 1024 }),
          }],
          { ...llmConfig, temperature: 0, maxTokens: 1024 },
          undefined,
          signal
        ),
        { maxAttempts: this.retryAttempts(2), signal }
      );
      session.player.summary = summary.trim() || deterministicFallback();
    } catch (error) {
      if (error instanceof LLMError && error.code === 'cancelled') throw error;
      session.player.summary = deterministicFallback();
    }

    session.player.history = session.player.history.slice(-keepCount);
  }

  private validateScenarioData(data: unknown, introduction = false): Record<string, unknown> & {
    title: string;
    description: string;
    prologue: string;
    choices: Array<{ id: string; text: string; description?: string }>;
  } {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('场景响应不是对象');
    }
    const record = data as Record<string, unknown>;
    const title = typeof record.title === 'string' ? record.title.trim() : '';
    const description = typeof record.description === 'string' ? record.description : '';
    const prologue = typeof record.prologue === 'string' ? record.prologue : '';
    if (!title || (!description && !(introduction && prologue))) {
      throw new Error('场景缺少标题或正文');
    }
    if (!Array.isArray(record.choices)) throw new Error('场景选项不是数组');
    const choiceIds = new Set<string>();
    const choices = record.choices.map((value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('选项格式无效');
      }
      const choice = value as Record<string, unknown>;
      if (typeof choice.id !== 'string' || !choice.id.trim()
        || typeof choice.text !== 'string' || !choice.text.trim()) {
        throw new Error('选项缺少 id 或文本');
      }
      const id = choice.id.trim();
      if (choiceIds.has(id)) throw new Error('场景选项 id 重复');
      choiceIds.add(id);
      return {
        id,
        text: choice.text.trim(),
        description: typeof choice.description === 'string' ? choice.description : undefined,
      };
    });
    let hasEnding = false;
    if (record.ending !== undefined && record.ending !== null) {
      if (typeof record.ending !== 'object' || Array.isArray(record.ending)) {
        throw new Error('结束字段格式无效');
      }
      const ending = record.ending as Record<string, unknown>;
      if ((ending.type !== 'death' && ending.type !== 'peace' && ending.type !== 'legend')
        || typeof ending.description !== 'string') {
        throw new Error('结束字段缺少类型或描述');
      }
      hasEnding = true;
    }
    const autoContinue = record.auto_continue === true || record.autoContinue === true;
    if (choices.length === 0) {
      if (introduction) throw new Error('序章必须包含可用选项');
      if (!hasEnding && !autoContinue) throw new Error('空选项场景必须声明自动续接');
    } else if (autoContinue) {
      throw new Error('含选项场景不能声明自动续接');
    }
    return { ...record, title, description, prologue, choices };
  }

  private ensureEndChoice(scenario: Scenario, ending: { type: string; description: string }): void {
    if (!scenario.choices.some((c) => c.id === 'end')) {
      scenario.choices.push({
        id: 'end',
        text: '结束旅程',
        description: ending.description || '查看你的传记',
      });
    }
  }

  private endingScenario(type: string): Record<string, unknown> {
    return {
      title: '传奇的终章',
      description: `你的旅程已达到终点。这段传奇将被永远铭记。（${type}结局）`,
      choices: [{ id: 'end', text: '结束旅程', description: '查看你的传记' }],
      autoContinue: false,
      ending: { type, description: '' },
    };
  }

  private fallbackScenario(current: Scenario): Record<string, unknown> {
    return {
      title: current.title,
      description: current.description,
      choices: [
        { id: 'a', text: '继续前行', description: '沿着命运指引的方向前进' },
        { id: 'b', text: '另寻他路', description: '选择一条不同的道路' },
      ],
      autoContinue: false,
      ending: null,
    };
  }

  private loadSystemContext(session: GameSession): string {
    if (session.gameMode === 'system' && session.system) {
      return `【系统设定】\n${session.system}`;
    }
    return '';
  }

  private getPreviousChoice(session: GameSession): string {
    const history = session.player.history;
    if (!history.length) return '';
    return history[history.length - 1].choice;
  }
}

export function loadSystemContext(
  gameMode: 'basic' | 'system',
  systemText?: string
): string {
  if (gameMode === 'system' && systemText) {
    return `【系统设定】\n${systemText}`;
  }
  return '';
}
