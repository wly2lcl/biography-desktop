// src/game/engine.ts - Game engine core

import type {
  GameSession,
  Scenario,
  SystemProposal,
} from '../types/models';
import { streamChatText, type LLMConfig } from '../services/llm';
import { parseLLMJSON } from '../services/parser';
import { prompts } from '../services/prompts';
import { withRetry } from '../services/retry';
import { getWorldContext } from '../services/world';
import { generateId } from '../utils/format';

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
  private autoCount = 0;
  private config: GameEngineConfig;

  constructor(config: Partial<GameEngineConfig> = {}) {
    this.config = { ...DEFAULT_ENGINE_CONFIG, ...config };
  }

  updateConfig(config: Partial<GameEngineConfig>): void {
    this.config = { ...this.config, ...config };
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
    onToken?: (token: string) => void
  ): Promise<GameSession> {
    const worldContext = await getWorldContext(worldName, isBuiltIn, worldType);

    const session: GameSession = {
      sessionId: generateId(),
      world: worldName,
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
    const introPrompt = prompts.format(prompts.introductionPrompt(), {
      world_context: worldContext,
      system_context: sysCtx,
      player_name: playerName,
    });

    const fullText = await withRetry(
      () => streamChatText(
        [{ role: 'user', content: introPrompt }],
        llmConfig,
        onToken
      ),
      { maxAttempts: this.config.llmMaxRetries }
    );

    const data = parseLLMJSON(fullText) as {
      prologue: string;
      title: string;
      description: string;
      choices: Array<{ id: string; text: string; description: string }>;
    };

    const prologueScenario: Scenario = {
      id: generateId(),
      title: data.title || '序章',
      description: data.prologue + '\n\n' + (data.description || ''),
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
    onToken?: (token: string) => void
  ): Promise<SystemProposal[]> {
    const worldContext = await getWorldContext(worldName, isBuiltIn, worldType);

    const sysPrompt = prompts.format(prompts.systemGenerationPrompt(), {
      world_context: worldContext,
      player_name: playerName,
    });

    const fullText = await withRetry(
      () => streamChatText(
        [{ role: 'user', content: sysPrompt }],
        llmConfig,
        onToken
      ),
      { maxAttempts: this.config.llmMaxRetries }
    );

    const proposals = parseLLMJSON(fullText) as SystemProposal[];
    return proposals;
  }

  /**
   * Process player's choice and generate next scenario
   */
  async processChoice(
    session: GameSession,
    choiceId: string,
    llmConfig: LLMConfig,
    onToken?: (token: string) => void
  ): Promise<{ session: GameSession; scenario?: Scenario }> {
    const current = session.scenarios[session.scenarios.length - 1];

    this.recordChoice(session, current, choiceId);

    if (choiceId === 'end') {
      session.isActive = false;
      return { session };
    }

    if (choiceId === 'end_journey') {
      session.isActive = false;
      return { session };
    }

    const nextData = await this.resolveNextScenario(session, current, llmConfig, onToken);
    this.applyNextScenario(session, nextData);

    return { session, scenario: session.scenarios[session.scenarios.length - 1] };
  }

  /**
   * Generate biography
   */
  async generateBiography(
    session: GameSession,
    isBuiltIn: boolean,
    worldType: 'single' | 'directory',
    llmConfig: LLMConfig,
    onToken?: (token: string) => void
  ): Promise<string> {
    const worldContext = await getWorldContext(session.world, isBuiltIn, worldType);
    const historyText = prompts.formatHistory(session.player.history);

    const bioPrompt = prompts.format(prompts.biographyPrompt(), {
      world_context: worldContext,
      system_context: this.loadSystemContext(session),
      player_name: session.player.name,
      player_history: historyText,
    });

    const biography = await withRetry(
      () => streamChatText(
        [{ role: 'user', content: bioPrompt }],
        llmConfig,
        onToken
      ),
      { maxAttempts: this.config.llmMaxRetries }
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
    isBuiltIn: boolean,
    worldType: 'single' | 'directory',
    llmConfig: LLMConfig,
    onToken?: (token: string) => void
  ): Promise<string> {
    const worldContext = await getWorldContext(session.world, isBuiltIn, worldType);
    const historyText = prompts.formatHistory(session.player.history, session.player.summary);
    const qaHistoryContext = prompts.formatQaHistory(session.player.qaHistory);

    const qaPrompt = prompts.format(prompts.qaPrompt(), {
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
    });

    return await withRetry(
      () => streamChatText(
        [{ role: 'user', content: qaPrompt }],
        llmConfig,
        onToken
      ),
      { maxAttempts: this.config.llmMaxRetries }
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
    onToken?: (token: string) => void
  ): Promise<unknown> {
    if (session.player.history.length >= this.config.maxChoices) {
      session.isActive = false;
      return this.endingScenario('legend');
    }

    if (session.player.history.length > this.config.maxHistoryHardCap) {
      session.isActive = false;
      return this.endingScenario('legend');
    }

    const worldContext = await getWorldContext(
      session.world,
      true,
      'single'
    );

    const scenarioPromptText = prompts.format(prompts.scenarioPrompt(), {
      world_context: worldContext,
      system_context: this.loadSystemContext(session),
      player_name: session.player.name,
      summary: prompts.formatSummaryOnly(session.player.history, session.player.summary),
      latest_scene: prompts.formatLatestScene(session.player.history),
      previous_choice: this.getPreviousChoice(session),
    });

    const fullText = await withRetry(
      () => streamChatText(
        [{ role: 'user', content: scenarioPromptText }],
        llmConfig,
        onToken
      ),
      { maxAttempts: this.config.llmMaxRetries }
    );

    try {
      return parseLLMJSON(fullText);
    } catch {
      return this.fallbackScenario(current);
    }
  }

  private applyNextScenario(session: GameSession, data: unknown): void {
    const typed = data as Record<string, unknown>;

    const nextScenario: Scenario = {
      id: generateId(),
      title: (typed.title as string) || '新的篇章',
      description: (typed.description as string) || '',
      choices: ((typed.choices as unknown[]) || []).map(
        (c: unknown) => {
          const choice = c as Record<string, string>;
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
        this.ensureEndChoice(nextScenario, ending);
      }
    }

    const choices = nextScenario.choices;
    if (!choices.length && !typed.ending) {
      this.autoCount++;
      if (this.autoCount >= this.config.maxAutoContinue) {
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
        this.maybeSummarize(session);
        return;
      }
    }

    this.autoCount = 0;
    session.scenarios = [nextScenario];
    session.player.currentScenario = nextScenario.id;

    this.maybeSummarize(session);
  }

  private async maybeSummarize(session: GameSession): Promise<void> {
    const historyLen = session.player.history.length;

    if (historyLen >= this.config.summaryThreshold) {
      try {
        await this.generateSummary(session);
      } catch {
        // Continue without summary
      }
      return;
    }

    if (historyLen > this.config.maxHistoryHardCap) {
      const keepLatest = session.player.history.slice(-this.config.summaryKeepLatest);
      const truncated = session.player.history.slice(0, -this.config.summaryKeepLatest);

      try {
        const eventsText = prompts.formatHistory(truncated);
        const newSummary = await streamChatText(
          [
            {
              role: 'user',
              content: prompts.format(prompts.summarizationPrompt(), {
                existing_summary: session.player.summary,
                new_events: eventsText,
              }),
            },
          ],
          { apiKey: '', baseUrl: '', model: '', temperature: 0, maxTokens: 1024, timeout: 30000 }
        );
        session.player.summary = newSummary;
      } catch {
        session.player.summary +=
          '\n' +
          truncated
            .slice(-5)
            .map((h) => `${h.scenario} → ${h.choice}`)
            .join('；');
      }

      session.player.history = keepLatest;
    }
  }

  private async generateSummary(session: GameSession): Promise<void> {
    const keepCount = this.config.summaryKeepLatest;
    if (session.player.history.length <= keepCount) return;

    const toSummarize = session.player.history.slice(0, -keepCount);

    session.player.summary +=
      '\n' +
      toSummarize.map((h) => `${h.scenario} → ${h.choice}`).join('；');

    session.player.history = session.player.history.slice(-keepCount);
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
