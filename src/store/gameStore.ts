// src/store/gameStore.ts - Zustand game state management

import { create } from 'zustand';
import type {
  GameSession,
  Scenario,
  SystemProposal,
  WorldInfo,
  AppConfig,
  SessionSummary,
  ModelInfo,
  DownloadedModel,
  ServerStatus,
} from '../types/models';
import { SESSION_SCHEMA_VERSION } from '../types/models';
import type { AppSettings } from '../types/settings';
import { DEFAULT_SETTINGS } from '../types/settings';
import { GameEngine } from '../game/engine';
import { createStorage } from '../services/storage';
import { LLMError, type LLMConfig } from '../services/llm';
import { listWorlds } from '../services/world';
import {
  EXPERIMENTAL_PROVIDERS_ENABLED,
  loadSettings,
  saveSettings,
  loadApiKey,
  normalizeSettingsForBuild,
  saveApiKey,
  testConnection,
} from '../services/config';
import { generateId, generateQaId } from '../utils/format';
import { getErrorMessage } from '../utils/errors';

import { errorLogger } from '../services/errorLogger';

type Screen = 'start' | 'system' | 'game' | 'biography';

interface GameState {
  // Screen state
  currentScreen: Screen;
  showSettings: boolean;
  showWorldManager: boolean;

  // Game data
  session: GameSession | null;
  currentScenario: Scenario | null;
  systemProposals: SystemProposal[];
  selectedSystem: SystemProposal | null;
  pendingStartParams: { name: string; world: string; isBuiltIn: boolean; type: 'single' | 'directory' } | null;
  config: AppConfig | null;
  settings: AppSettings;
  worlds: WorldInfo[];
  resumeSessions: SessionSummary[];
  resumeWarning: string | null;

  // Streaming state
  isStreaming: boolean;
  streamedText: string;
  activeRequestId: string | null;
  activeRequestController: AbortController | null;
  isPersistingSession: boolean;
  isDataMutationInProgress: boolean;

  // UI state
  isLoading: boolean;
  loadingText: string;
  error: string | null;
  showConfirmEnd: boolean;
  showConfirmBio: boolean;

  // Engine & storage
  engine: GameEngine;
  storage: ReturnType<typeof createStorage>;

  // Phase 9: Local model management state
  serverStatus: ServerStatus | null;
  availableModels: ModelInfo[];
  downloadedModels: DownloadedModel[];
  downloadingModel: string | null;
  downloadProgress: number;

  // Actions - screen
  setScreen: (screen: Screen) => void;
  setShowSettings: (show: boolean) => void;
  setShowWorldManager: (show: boolean) => void;

  // Actions - config
  setConfig: (config: AppConfig) => void;
  loadConfig: () => Promise<void>;
  saveConfig: () => Promise<void>;

  // Actions - settings
  loadSettings: () => Promise<void>;
  updateSettings: (updates: Partial<AppSettings>) => Promise<void>;
  testLlmConnection: (draft?: AppSettings) => Promise<boolean>;

  // Actions - worlds
  loadWorlds: () => Promise<void>;

  // Phase 9: Local model actions
  refreshServerStatus: () => Promise<void>;
  refreshAvailableModels: () => Promise<void>;
  refreshDownloadedModels: () => Promise<void>;
  startLocalServer: (modelPath: string, gpuLayers?: number, contextSize?: number) => Promise<void>;
  stopLocalServer: () => Promise<void>;
  startDownloadModel: (modelId: string) => Promise<void>;
  cancelDownloadModel: () => Promise<void>;
  deleteDownloadedModel: (modelId: string) => Promise<void>;
  ensureBinary: () => Promise<string>;

  // Actions - game
  startBasicGame: (name: string, world: string, isBuiltIn: boolean, type: 'single' | 'directory') => Promise<void>;
  generateSystemProposals: (name: string, world: string, isBuiltIn: boolean, type: 'single' | 'directory') => Promise<void>;
  selectSystem: (proposal: SystemProposal) => void;
  startSystemGame: () => Promise<void>;
  makeChoice: (choiceId: string) => Promise<void>;
  generateBiography: () => Promise<void>;
  endGame: (generateBio?: boolean) => Promise<void>;
  skipBiography: () => void;
  newGame: () => void;
  checkResume: (options?: { throwOnError?: boolean }) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  resumeGame: (sessionId: string) => Promise<void>;
  prepareForDataMutation: () => Promise<void>;
  finishDataMutation: () => void;

  // Actions - QA
  askQuestion: (question: string) => Promise<void>;

  // Actions - utility
  setError: (error: string | null) => void;
  setShowConfirmEnd: (show: boolean) => void;
  setShowConfirmBio: (show: boolean) => void;
  appendStreamedText: (text: string) => void;
}

function configToLlm(config: AppConfig): LLMConfig {
  return {
    provider: config.provider,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: config.model,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    timeout: config.timeout,
  };
}

/** Derive LLM config from settings */
function settingsToConfig(s: AppSettings): AppConfig {
  return {
    provider: s.llmProvider === 'openai' ? 'openai' : 'deepseek',
    apiKey: s.apiKey,
    baseUrl: s.baseUrl,
    model: s.model,
    temperature: s.temperature,
    maxTokens: s.maxTokens,
    timeout: s.timeout,
  };
}

function settingsFromConfig(
  current: AppSettings,
  config: AppConfig,
  apiKey: string
): AppSettings {
  const llmProvider = config.provider === 'openai' ? 'openai'
    : config.provider === 'deepseek' ? 'deepseek'
      : current.llmProvider;
  return normalizeSettingsForBuild({
    ...current,
    llmProvider,
    apiKey,
    baseUrl: config.baseUrl,
    model: config.model,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    timeout: config.timeout,
  });
}

function containsSettingsObject(raw: string | null): boolean {
  if (raw === null) return false;
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

const STABLE_CONFIG_PRESETS = {
  deepseek: { baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' },
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
} as const;

function normalizeUrl(value: string): string {
  return value.replace(/\/+$/, '').toLowerCase();
}

/** Keep legacy app_config useful without letting it revive hidden providers. */
function mergeLegacyConfig(
  current: AppConfig,
  legacy: Partial<AppConfig>,
  hasCurrentSettings: boolean
): AppConfig {
  if (EXPERIMENTAL_PROVIDERS_ENABLED) {
    return { ...current, ...legacy, apiKey: current.apiKey };
  }

  // app_settings is the current source of truth and has already been normalized.
  if (hasCurrentSettings) return current;

  const merged = { ...current };
  if (typeof legacy.temperature === 'number' && Number.isFinite(legacy.temperature)) {
    merged.temperature = legacy.temperature;
  }
  if (typeof legacy.maxTokens === 'number' && Number.isFinite(legacy.maxTokens)
    && legacy.maxTokens > 0) {
    merged.maxTokens = legacy.maxTokens;
  }
  if (typeof legacy.timeout === 'number' && Number.isFinite(legacy.timeout)
    && legacy.timeout > 0) {
    merged.timeout = legacy.timeout;
  }

  const legacyUrl = typeof legacy.baseUrl === 'string' ? normalizeUrl(legacy.baseUrl) : '';
  const provider = legacy.provider === 'deepseek' || legacy.provider === 'openai'
    ? legacy.provider
    : legacyUrl === normalizeUrl(STABLE_CONFIG_PRESETS.openai.baseUrl)
      ? 'openai'
      : legacyUrl === normalizeUrl(STABLE_CONFIG_PRESETS.deepseek.baseUrl)
        ? 'deepseek'
        : null;
  if (!provider) return merged;

  const preset = STABLE_CONFIG_PRESETS[provider];
  const usesOfficialEndpoint = legacyUrl === normalizeUrl(preset.baseUrl);
  return {
    ...merged,
    provider,
    baseUrl: preset.baseUrl,
    model: usesOfficialEndpoint && typeof legacy.model === 'string' && legacy.model.trim()
      ? legacy.model.trim()
      : preset.model,
  };
}

/** Categorize errors into user-friendly Chinese messages */
function formatErrorMessage(err: unknown, defaultMsg: string): string {
  if (err instanceof LLMError) {
    const messages: Record<LLMError['code'], string> = {
      authentication: 'API Key 无效或无权访问所选模型，请检查云端配置',
      rate_limit: '请求过于频繁或额度不足，请稍后重试',
      timeout: '请求超时，请检查网络或模型服务状态',
      network: '网络连接失败，请检查网络设置',
      server: '模型服务暂时不可用，请稍后重试',
      invalid_response: '模型返回了无效响应，请重试或更换模型',
      cancelled: '请求已取消',
    };
    return messages[err.code];
  }
  if (err instanceof Error) {
    const msg = err.message;
    // Network errors
    if (/fetch|network|ECONNREFUSED|ENOTFOUND|ERR_CONNECTION_REFUSED/i.test(msg)) {
      return '网络连接失败，请检查网络设置';
    }
    // Timeout
    if (/timeout|abort|timed ?out|ETIMEDOUT/i.test(msg)) {
      return '请求超时，请检查网络或 LLM 服务状态';
    }
    // Auth errors (401/403)
    if (/401|403|unauthorized|forbidden|invalid.*api.?key|api.?key.*invalid/i.test(msg)) {
      return 'API Key 无效或已过期，请重新配置';
    }
    // Rate limit (429)
    if (/429|rate.?limit|too many requests/i.test(msg)) {
      return '请求过于频繁，请稍后重试';
    }
    // JSON parse errors
    if (/JSON|parse|unexpected token/i.test(msg)) {
      return 'LLM 响应解析失败，已使用备选方案';
    }
    return `操作失败: ${msg}`;
  }
  const message = getErrorMessage(err, '');
  return message ? `操作失败: ${message}` : defaultMsg;
}

export const useGameStore = create<GameState>((set, get) => {
  const pendingSessionWrites = new Set<Promise<void>>();

  const persistSession = async (session: GameSession): Promise<void> => {
    let write: Promise<void>;
    try {
      write = get().storage.saveSession(session);
    } catch (error) {
      write = Promise.reject(error);
    }
    pendingSessionWrites.add(write);
    set({ isPersistingSession: true });
    try {
      await write;
    } finally {
      pendingSessionWrites.delete(write);
      if (pendingSessionWrites.size === 0) {
        set({ isPersistingSession: false });
      }
    }
  };

  const invalidateActiveRequest = (): void => {
    get().activeRequestController?.abort();
    set({
      isStreaming: false,
      streamedText: '',
      activeRequestId: null,
      activeRequestController: null,
    });
  };

  return ({
  // Initial state
  currentScreen: 'start',
  showSettings: false,
  showWorldManager: false,

  session: null,
  currentScenario: null,
  systemProposals: [],
  selectedSystem: null,
  pendingStartParams: null,
  config: null,
  settings: { ...DEFAULT_SETTINGS },
  worlds: [],
  resumeSessions: [],
  resumeWarning: null,

  isStreaming: false,
  streamedText: '',
  activeRequestId: null,
  activeRequestController: null,
  isPersistingSession: false,
  isDataMutationInProgress: false,

  isLoading: false,
  loadingText: '',
  error: null,
  showConfirmEnd: false,
  showConfirmBio: false,

  engine: new GameEngine(),
  storage: createStorage(),

  // Phase 9: Local model initial state
  serverStatus: null,
  availableModels: [],
  downloadedModels: [],
  downloadingModel: null,
  downloadProgress: 0,

  // Screen actions
  setScreen: (screen) => set({ currentScreen: screen }),
  setShowSettings: (show) => set({ showSettings: show }),
  setShowWorldManager: (show) => set({ showWorldManager: show }),

  // Config actions
  setConfig: (config) => set({ config }),

  loadConfig: async () => {
    const storage = get().storage;
    let apiKey = '';
    try {
      apiKey = await loadApiKey();
    } catch (error) {
      set({ error: formatErrorMessage(error, '无法读取系统钥匙串中的 API Key') });
    }

    try {
      const [raw, currentSettingsRaw] = await Promise.all([
        storage.getConfig('app_config'),
        storage.getConfig('app_settings'),
      ]);
      if (raw) {
        const parsedValue: unknown = JSON.parse(raw);
        const parsed = parsedValue && typeof parsedValue === 'object' && !Array.isArray(parsedValue)
          ? { ...parsedValue } as Partial<AppConfig>
          : {};
        const hadLegacyApiKey = Object.prototype.hasOwnProperty.call(parsed, 'apiKey');
        delete parsed.apiKey;
        const settings = get().settings;
        const hasCurrentSettings = containsSettingsObject(currentSettingsRaw);
        const current = { ...settingsToConfig(settings), apiKey };
        let config = mergeLegacyConfig(current, parsed, hasCurrentSettings);
        let synchronizedSettings = { ...settings, apiKey };
        if (!hasCurrentSettings) {
          synchronizedSettings = settingsFromConfig(settings, config, apiKey);
          config = { ...settingsToConfig(synchronizedSettings), apiKey };
          try {
            await saveSettings(
              (key, value) => storage.setConfig(key, value),
              synchronizedSettings
            );
          } catch {
            // Retry the migration on the next launch; keep both in-memory views consistent now.
          }
        }
        const sanitizedConfig: Partial<AppConfig> = { ...config };
        delete sanitizedConfig.apiKey;
        const sanitized = JSON.stringify(sanitizedConfig);
        if (hadLegacyApiKey || sanitized !== JSON.stringify(parsed)) {
          try {
            await storage.setConfig('app_config', sanitized);
          } catch {
            // In-memory normalization remains authoritative if cleanup cannot be persisted.
          }
        }
        set({ config, settings: synchronizedSettings });
      } else {
        // No stored config, derive from current settings
        const settings = get().settings;
        const config = { ...settingsToConfig(settings), apiKey };
        set({ config, settings: { ...settings, apiKey } });
      }
    } catch {
      // Derive from settings as fallback
      const settings = get().settings;
      const config = { ...settingsToConfig(settings), apiKey };
      set({ config, settings: { ...settings, apiKey } });
    }
  },

  saveConfig: async () => {
    const { config, storage } = get();
    if (!config) return;
    try {
      await saveApiKey(config.apiKey);
      const { apiKey, ...rest } = config;
      await storage.setConfig('app_config', JSON.stringify(rest));
    } catch (e) {
      console.error('Failed to save config:', e);
    }
  },

  // Settings actions
  loadSettings: async () => {
    const storage = get().storage;
    const settings = await loadSettings(
      (key) => storage.getConfig(key),
      (key, value) => storage.setConfig(key, value)
    );
    set({ settings, config: settingsToConfig(settings) });

    // Update engine config
    get().engine.updateConfig({
      maxChoices: settings.maxChoices,
      maxAutoContinue: settings.maxAutoContinue,
      summaryThreshold: settings.summaryThreshold,
      summaryKeepLatest: settings.summaryKeepLatest,
      maxQaHistory: settings.maxQaHistory,
      maxScenariosInMemory: settings.maxScenariosInMemory,
      maxHistoryHardCap: settings.summaryThreshold * 3,
      llmMaxRetries: settings.llmMaxRetries,
    });
  },

  updateSettings: async (updates) => {
    const previousSettings = get().settings;
    const previousConfig = get().config ?? settingsToConfig(previousSettings);
    const newSettings = normalizeSettingsForBuild({ ...previousSettings, ...updates });
    const newConfig = settingsToConfig(newSettings);
    const storage = get().storage;
    let keyWriteCompleted = false;
    try {
      await saveApiKey(newConfig.apiKey);
      keyWriteCompleted = true;
      await saveSettings((key, value) => storage.setConfig(key, value), newSettings);
      const { apiKey: _, ...rest } = newConfig;
      await storage.setConfig('app_config', JSON.stringify(rest));
    } catch (error) {
      const rollbackFailures: string[] = [];
      if (keyWriteCompleted) {
        try {
          await saveApiKey(previousSettings.apiKey);
        } catch (rollbackError) {
          rollbackFailures.push(rollbackError instanceof Error
            ? rollbackError.message : String(rollbackError));
        }
      }
      try {
        await saveSettings((key, value) => storage.setConfig(key, value), previousSettings);
        const { apiKey: _, ...rest } = previousConfig;
        await storage.setConfig('app_config', JSON.stringify(rest));
      } catch (rollbackError) {
        rollbackFailures.push(rollbackError instanceof Error
          ? rollbackError.message : String(rollbackError));
      }
      const message = error instanceof Error ? error.message : String(error);
      const rollbackNote = rollbackFailures.length > 0
        ? `；回滚失败：${rollbackFailures.join('；')}`
        : '';
      throw new Error(`保存设置失败：${message}${rollbackNote}`);
    }

    set({ settings: newSettings, config: newConfig });
    get().engine.updateConfig({
      maxChoices: newSettings.maxChoices,
      maxAutoContinue: newSettings.maxAutoContinue,
      summaryThreshold: newSettings.summaryThreshold,
      summaryKeepLatest: newSettings.summaryKeepLatest,
      maxQaHistory: newSettings.maxQaHistory,
      maxScenariosInMemory: newSettings.maxScenariosInMemory,
      maxHistoryHardCap: newSettings.summaryThreshold * 3,
      llmMaxRetries: newSettings.llmMaxRetries,
    });
  },

  testLlmConnection: async (draft) => {
    const settings = draft ?? get().settings;
    return testConnection(settings.baseUrl, settings.apiKey, settings.model);
  },

  // World actions
  loadWorlds: async () => {
    try {
      const worldMetas = await listWorlds();
      const worlds: WorldInfo[] = worldMetas.map((m) => ({
        name: m.name,
        filename: m.filename,
        description: m.description,
        isBuiltIn: m.isBuiltIn,
        type: m.type,
      }));
      set({ worlds });
    } catch (e) {
      console.error('Failed to load worlds:', e);
    }
  },

  // Game actions
  startBasicGame: async (name, world, isBuiltIn, type) => {
    const { config, engine, isStreaming, isDataMutationInProgress } = get();
    if (!config) {
      set({ error: '请先配置 LLM' });
      return;
    }
    if (isStreaming || isDataMutationInProgress) return;
    get().activeRequestController?.abort();
    const requestId = generateId();
    const requestController = new AbortController();

    // Create a placeholder scenario so the game screen can render immediately
    const placeholderScenario: Scenario = {
      id: generateId(),
      title: '序章',
      description: '',
      choices: [],
    };

    // Switch to game screen first with streaming state
    set({
      session: {
        schemaVersion: SESSION_SCHEMA_VERSION,
        sessionId: generateId(),
        world,
        worldRef: { name: world, source: isBuiltIn ? 'builtin' : 'user', type },
        gameMode: 'basic' as const,
        player: {
          name,
          currentScenario: '',
          history: [],
          attributes: {},
          inventory: [],
          summary: '',
          qaHistory: [],
          createdAt: new Date().toISOString(),
        },
        scenarios: [placeholderScenario],
        isActive: true,
        createdAt: new Date().toISOString(),
      },
      currentScenario: placeholderScenario,
      currentScreen: 'game',
      isStreaming: true,
      streamedText: '',
      activeRequestId: requestId,
      activeRequestController: requestController,
    });

    try {
      const llmConfig = configToLlm(config);
      const session = await engine.startGame(
        name,
        world,
        'basic',
        null,
        llmConfig,
        isBuiltIn,
        type,
        (token) => {
          if (token && get().activeRequestId === requestId) {
            set((state) => ({ streamedText: state.streamedText + token }));
          }
        },
        requestController.signal
      );

      if (get().activeRequestId !== requestId) return;
      await persistSession(session);
      if (get().activeRequestId !== requestId) return;

      set({
        session,
        currentScenario: session.scenarios[0],
        isStreaming: false,
        streamedText: '',
        activeRequestId: null,
        activeRequestController: null,
      });
    } catch (err) {
      errorLogger.error('startBasicGame failed', { playerName: name, world }, err as Error);
      if (get().activeRequestId === requestId) {
        set({
          error: formatErrorMessage(err, '开始游戏失败'),
          isStreaming: false,
          streamedText: '',
          activeRequestId: null,
          activeRequestController: null,
          currentScreen: 'start',
        });
      }
    }
  },

  generateSystemProposals: async (name, world, isBuiltIn, type) => {
    const { config, engine, isStreaming, isDataMutationInProgress } = get();
    if (!config) {
      set({ error: '请先配置 LLM' });
      return;
    }
    if (isStreaming || isDataMutationInProgress) return;
    get().activeRequestController?.abort();
    const requestId = generateId();
    const requestController = new AbortController();

    set({
      currentScreen: 'system',
      isStreaming: true,
      streamedText: '',
      systemProposals: [],
      selectedSystem: null,
      pendingStartParams: { name, world, isBuiltIn, type },
      activeRequestId: requestId,
      activeRequestController: requestController,
    });

    try {
      const llmConfig = configToLlm(config);
      const proposals = await engine.generateSystemProposals(
        name,
        world,
        isBuiltIn,
        type,
        llmConfig,
        (token) => {
          if (token && get().activeRequestId === requestId) {
            set((state) => ({ streamedText: state.streamedText + token }));
          }
        },
        requestController.signal
      );

      if (get().activeRequestId !== requestId) return;
      set({
        systemProposals: proposals,
        isStreaming: false,
        streamedText: '',
        activeRequestId: null,
        activeRequestController: null,
      });
    } catch (err) {
      if (get().activeRequestId === requestId) {
        set({
          error: formatErrorMessage(err, '生成系统方案失败'),
          isStreaming: false,
          streamedText: '',
          activeRequestId: null,
          activeRequestController: null,
        });
      }
    }
  },

  selectSystem: (proposal) => set({ selectedSystem: proposal }),

  startSystemGame: async () => {
    const {
      config,
      engine,
      selectedSystem,
      pendingStartParams,
      isStreaming,
      isDataMutationInProgress,
    } = get();
    if (!config || !selectedSystem || !pendingStartParams) return;
    if (isStreaming || isDataMutationInProgress) return;
    get().activeRequestController?.abort();
    const requestId = generateId();
    const requestController = new AbortController();

    // Create placeholder for immediate game screen render
    const placeholderScenario: Scenario = {
      id: generateId(),
      title: '序章',
      description: '',
      choices: [],
    };

    // Switch to game screen immediately with streaming state
    set({
      session: {
        schemaVersion: SESSION_SCHEMA_VERSION,
        sessionId: generateId(),
        world: pendingStartParams.world,
        worldRef: {
          name: pendingStartParams.world,
          source: pendingStartParams.isBuiltIn ? 'builtin' : 'user',
          type: pendingStartParams.type,
        },
        gameMode: 'system' as const,
        system: `${selectedSystem.title}\n\n${selectedSystem.description}\n\n${selectedSystem.abilities}`,
        player: {
          name: pendingStartParams.name,
          currentScenario: '',
          history: [],
          attributes: {},
          inventory: [],
          summary: '',
          qaHistory: [],
          createdAt: new Date().toISOString(),
        },
        scenarios: [placeholderScenario],
        isActive: true,
        createdAt: new Date().toISOString(),
      },
      currentScenario: placeholderScenario,
      currentScreen: 'game',
      isStreaming: true,
      streamedText: '',
      activeRequestId: requestId,
      activeRequestController: requestController,
    });

    try {
      const llmConfig = configToLlm(config);
      const newSession = await engine.startGame(
        pendingStartParams.name,
        pendingStartParams.world,
        'system',
        `${selectedSystem.title}\n\n${selectedSystem.description}\n\n${selectedSystem.abilities}`,
        llmConfig,
        pendingStartParams.isBuiltIn,
        pendingStartParams.type,
        (token) => {
          if (token && get().activeRequestId === requestId) {
            set((state) => ({ streamedText: state.streamedText + token }));
          }
        },
        requestController.signal
      );

      if (get().activeRequestId !== requestId) return;
      await persistSession(newSession);
      if (get().activeRequestId !== requestId) return;

      set({
        session: newSession,
        currentScenario: newSession.scenarios[0],
        isStreaming: false,
        streamedText: '',
        selectedSystem: null,
        pendingStartParams: null,
        activeRequestId: null,
        activeRequestController: null,
      });
    } catch (err) {
      if (get().activeRequestId === requestId) {
        set({
          error: formatErrorMessage(err, '开始游戏失败'),
          isStreaming: false,
          streamedText: '',
          pendingStartParams: null,
          activeRequestId: null,
          activeRequestController: null,
        });
      }
    }
  },

  makeChoice: async (choiceId) => {
    const { session, config, engine, isStreaming, isDataMutationInProgress } = get();
    if (!session || !config || isStreaming || isDataMutationInProgress) return;

    get().activeRequestController?.abort();
    const requestId = generateId();
    const requestController = new AbortController();
    const workingSession = JSON.parse(JSON.stringify(session)) as GameSession;
    set({
      isStreaming: true,
      streamedText: '',
      activeRequestId: requestId,
      activeRequestController: requestController,
    });

    try {
      const llmConfig = configToLlm(config);
      const result = await engine.processChoice(
        workingSession,
        choiceId,
        llmConfig,
        (token) => {
          if (get().activeRequestId === requestId) {
            set((state) => ({ streamedText: state.streamedText + token }));
          }
        },
        requestController.signal
      );

      if (get().activeRequestId !== requestId) return;
      await persistSession(result.session);
      if (get().activeRequestId !== requestId) return;

      set({
        session: result.session,
        currentScenario: result.scenario || result.session.scenarios[result.session.scenarios.length - 1],
        isStreaming: false,
        streamedText: '',
        activeRequestId: null,
        activeRequestController: null,
      });

      // If game ended, go to biography
      if (!result.session.isActive) {
        // Stay on game screen, show end choice
      }
    } catch (err) {
      errorLogger.error('makeChoice failed', { choiceId }, err as Error);
      if (get().activeRequestId === requestId) {
        set({
          error: formatErrorMessage(err, '处理选择失败'),
          isStreaming: false,
          streamedText: '',
          activeRequestId: null,
          activeRequestController: null,
        });
      }
    }
  },

  generateBiography: async () => {
    const { session, config, engine, isStreaming, isDataMutationInProgress } = get();
    if (!session || !config || isStreaming || isDataMutationInProgress) return;
    get().activeRequestController?.abort();
    const requestId = generateId();
    const requestController = new AbortController();

    // Switch to biography screen immediately with streaming state
    set({
      currentScreen: 'biography',
      session: { ...session, biography: '' },
      isLoading: false,
      isStreaming: true,
      streamedText: '',
      activeRequestId: requestId,
      activeRequestController: requestController,
    });

    try {
      const llmConfig = configToLlm(config);
      // Biography needs more output tokens (2000-4000 Chinese characters)
      const bioLlmConfig = { ...llmConfig, maxTokens: 8192 };
      const workingSession = JSON.parse(JSON.stringify(session)) as GameSession;
      await engine.generateBiography(
        workingSession,
        workingSession.worldRef.source === 'builtin',
        workingSession.worldRef.type,
        bioLlmConfig,
        (token) => {
          if (token && get().activeRequestId === requestId) {
            set((state) => ({ streamedText: state.streamedText + token }));
          }
        },
        requestController.signal
      );

      if (get().activeRequestId !== requestId) return;
      await persistSession(workingSession);
      if (get().activeRequestId !== requestId) return;

      set({
        session: workingSession,
        isStreaming: false,
        streamedText: '',
        activeRequestId: null,
        activeRequestController: null,
      });
    } catch (err) {
      errorLogger.error('generateBiography failed', { playerName: session.player.name }, err as Error);
      if (get().activeRequestId === requestId) {
        set({
          error: formatErrorMessage(err, '生成传记失败'),
          isStreaming: false,
          streamedText: '',
          activeRequestId: null,
          activeRequestController: null,
        });
      }
    }
  },

  endGame: async (generateBio = true) => {
    if (get().isDataMutationInProgress) return;
    get().activeRequestController?.abort();
    set({
      showConfirmEnd: false,
      showConfirmBio: false,
      isStreaming: false,
      streamedText: '',
      activeRequestId: null,
      activeRequestController: null,
    });
    const { session } = get();
    if (session) {
      const endedSession = { ...session, isActive: false, endReason: 'player_ended' as const };
      set({ session: endedSession });
      try {
        await persistSession(endedSession);
      } catch (err) {
        errorLogger.error('endGame persistence failed', { sessionId: session.sessionId }, err as Error);
        if (get().session?.sessionId === session.sessionId
          && get().session?.endReason === 'player_ended') {
          set({ session });
        }
        set({ error: formatErrorMessage(err, '保存结束状态失败') });
        throw err;
      }
    }
    if (generateBio) {
      await get().generateBiography();
    }
  },

  skipBiography: () => {
    get().activeRequestController?.abort();
    set({
      showConfirmBio: false,
      currentScreen: 'start',
      isStreaming: false,
      streamedText: '',
      activeRequestId: null,
      activeRequestController: null,
    });
  },

  newGame: () => {
    get().activeRequestController?.abort();
    set({
      currentScreen: 'start',
      session: null,
      currentScenario: null,
      systemProposals: [],
      selectedSystem: null,
      streamedText: '',
      isStreaming: false,
      activeRequestId: null,
      activeRequestController: null,
    });
  },

  checkResume: async (options) => {
    try {
      const { sessions, corruptedSessions } = await get().storage.listSessionsDetailed(true);
      const summaries: SessionSummary[] = sessions.map((s) => ({
        sessionId: s.sessionId,
        world: s.world,
        playerName: s.player.name,
        isActive: s.isActive,
        historyLength: s.player.history.length,
        createdAt: s.createdAt,
      }));
      const resumeWarning = corruptedSessions.length > 0
        ? `已跳过 ${corruptedSessions.length} 个损坏会话（${corruptedSessions
          .map((session) => session.sessionId)
          .join('、')}），其他旅程仍可继续。`
        : null;
      set({ resumeSessions: summaries, resumeWarning });
    } catch (err) {
      set({
        resumeSessions: [],
        resumeWarning: null,
        error: formatErrorMessage(err, '读取可恢复会话失败'),
      });
      if (options?.throwOnError) throw err;
    }
  },

  prepareForDataMutation: async () => {
    if (get().isDataMutationInProgress) {
      throw new Error('已有数据操作正在进行，请稍候');
    }
    set({ isDataMutationInProgress: true });
    invalidateActiveRequest();
    await Promise.allSettled([...pendingSessionWrites]);
  },

  finishDataMutation: () => set({ isDataMutationInProgress: false }),

  deleteSession: async (sessionId: string) => {
    const storage = get().storage;
    await storage.deleteSession(sessionId);
    // Refresh resume list
    await get().checkResume();
  },

  resumeGame: async (sessionId) => {
    try {
      const session = await get().storage.getSession(sessionId);
      if (session) {
        // Load persisted Q&A history
        try {
          const qaHistory = await get().storage.getQaHistory(session.sessionId);
          session.player.qaHistory = qaHistory;
        } catch {
          // Use in-memory history from the loaded session
        }

        set({
          session,
          currentScenario: session.player.currentScenario
            ? session.scenarios.find((scenario) => scenario.id === session.player.currentScenario)
              ?? session.scenarios[session.scenarios.length - 1]
            : session.scenarios[session.scenarios.length - 1],
          currentScreen: session.isActive || !session.biography ? 'game' : 'biography',
        });
      }
    } catch (err) {
      errorLogger.error('resumeGame failed', { sessionId }, err as Error);
      set({ error: formatErrorMessage(err, '恢复游戏失败') });
    }
  },

  // Phase 9: Local model actions
  refreshServerStatus: async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const status = await invoke('get_server_status') as ServerStatus;
      set({ serverStatus: status });
    } catch {
      set({ serverStatus: { is_running: false, pid: null, port: null, model_name: null, context_size: null, gpu_layers: null } });
    }
  },

  refreshAvailableModels: async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const models = await invoke('list_available_models') as ModelInfo[];
      set({ availableModels: models });
    } catch (e) {
      console.error('Failed to load available models:', e);
    }
  },

  refreshDownloadedModels: async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const models = await invoke('list_downloaded_models') as DownloadedModel[];
      set({ downloadedModels: models });
    } catch (e) {
      console.error('Failed to load downloaded models:', e);
    }
  },

  startLocalServer: async (modelPath: string, gpuLayers?: number, contextSize?: number) => {
    set({ isLoading: true, loadingText: '正在启动本地模型服务...' });
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const info = await invoke('start_server', {
        modelPath,
        gpuLayers: gpuLayers ?? 0,
        contextSize: contextSize ?? 4096,
      }) as { port: number; model_name: string };

      // Auto-configure LLM settings for local model
      const modelName = info.model_name.replace(/\.gguf$/, '');
      await get().updateSettings({
        llmProvider: 'llamacpp_local',
        baseUrl: `http://127.0.0.1:${info.port}`,
        model: modelName,
        apiKey: '',
        timeout: 300000, // 5 min timeout for local model loading
      });

      await get().refreshServerStatus();
      set({ isLoading: false, loadingText: '' });
    } catch (err) {
      set({
        error: formatErrorMessage(err, '启动本地模型服务失败'),
        isLoading: false,
        loadingText: '',
      });
    }
  },

  stopLocalServer: async () => {
    set({ isLoading: true, loadingText: '正在停止服务...' });
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('stop_server');
      set({ serverStatus: null, isLoading: false, loadingText: '' });
    } catch (err) {
      set({
        error: formatErrorMessage(err, '停止服务失败'),
        isLoading: false,
        loadingText: '',
      });
    }
  },

  startDownloadModel: async (modelId: string) => {
    set({ downloadingModel: modelId, downloadProgress: 0 });
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const { listen } = await import('@tauri-apps/api/event');

      // Listen for progress events
      const unlistenProgress = await listen<{ model_id: string; progress: number }>(
        'model_download_progress',
        (event) => {
          if (event.payload.model_id === modelId) {
            set({ downloadProgress: event.payload.progress });
          }
        }
      );

      // Listen for completion events
      const unlistenComplete = await listen<{ model_id: string; success: boolean; error?: string }>(
        'model_download_complete',
        async (event) => {
          await unlistenProgress();
          await unlistenComplete();
          if (event.payload.success) {
            set({ downloadingModel: null, downloadProgress: 0 });
            await get().refreshDownloadedModels();
          } else {
            set({
              downloadingModel: null,
              downloadProgress: 0,
              error: event.payload.error ?? '下载失败',
            });
          }
        }
      );

      await invoke('download_model', { modelId });
    } catch (err) {
      set({
        downloadingModel: null,
        downloadProgress: 0,
        error: formatErrorMessage(err, '下载模型失败'),
      });
    }
  },

  cancelDownloadModel: async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('cancel_download');
      set({ downloadingModel: null, downloadProgress: 0 });
    } catch (e) {
      console.error('Failed to cancel download:', e);
    }
  },

  deleteDownloadedModel: async (modelId: string) => {
    set({ isLoading: true, loadingText: '正在删除模型...' });
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('delete_model', { modelId });
      await get().refreshDownloadedModels();
      set({ isLoading: false, loadingText: '' });
    } catch (err) {
      set({
        error: formatErrorMessage(err, '删除模型失败'),
        isLoading: false,
        loadingText: '',
      });
    }
  },

  ensureBinary: async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('ensure_binary') as Promise<string>;
  },

  // QA actions
  askQuestion: async (question) => {
    const {
      session,
      config,
      engine,
      settings,
      isStreaming,
      isDataMutationInProgress,
    } = get();
    if (!session || !config || isStreaming || isDataMutationInProgress) return;

    // Prevent duplicate consecutive questions
    const currentHistory = session.player.qaHistory ?? [];
    const historyLimit = Math.max(1, Math.floor(settings.maxQaHistory));
    if (currentHistory.length > 0) {
      const lastMsg = currentHistory[currentHistory.length - 1];
      if (lastMsg.role === 'user' && lastMsg.content === question) {
        return;
      }
    }

    get().activeRequestController?.abort();
    const requestId = generateId();
    const requestController = new AbortController();

    // Create new session with user question added
    const updatedSession = {
      ...session,
      player: {
        ...session.player,
        qaHistory: [
          ...currentHistory,
          { role: 'user' as const, content: question, id: generateQaId() },
        ],
      },
    };

    // Update session immediately so UI shows the question
    set({
      session: updatedSession,
      streamedText: '',
      isStreaming: true,
      activeRequestId: requestId,
      activeRequestController: requestController,
    });

    try {
      const llmConfig = configToLlm(config);
      const querySession = {
        ...session,
        player: {
          ...session.player,
          qaHistory: currentHistory.slice(-historyLimit),
        },
      };
      const answer = await engine.answerQuery(
        querySession,
        question,
        llmConfig,
        (token) => {
          if (token && get().activeRequestId === requestId) {
            set((state) => ({ streamedText: state.streamedText + token }));
          }
        },
        requestController.signal
      );

      if (get().activeRequestId !== requestId) return;
      // Build final session with assistant answer
      const finalSession = {
        ...updatedSession,
        player: {
          ...updatedSession.player,
          qaHistory: [
            ...updatedSession.player.qaHistory,
            { role: 'assistant' as const, content: answer, id: generateQaId() },
          ].slice(-historyLimit),
        },
      };

      await persistSession(finalSession);
      if (get().activeRequestId !== requestId) return;

      // Clear streamedText after QA is done
      set({
        session: finalSession,
        streamedText: '',
        isStreaming: false,
        activeRequestId: null,
        activeRequestController: null,
      });
    } catch (err) {
      errorLogger.error('askQuestion failed', { question }, err as Error);
      if (get().activeRequestId === requestId) {
        set({
          session,
          error: formatErrorMessage(err, '问答失败'),
          streamedText: '',
          isStreaming: false,
          activeRequestId: null,
          activeRequestController: null,
        });
      }
    }
  },

  // Utility actions
  setError: (error) => set({ error }),
  setShowConfirmEnd: (show) => set({ showConfirmEnd: show }),
  setShowConfirmBio: (show) => set({ showConfirmBio: show }),
  appendStreamedText: (text) =>
    set((state) => ({ streamedText: state.streamedText + text })),
  });
});
