// src/store/gameStore.ts - Zustand game state management

import { create } from 'zustand';
import type {
  GameSession,
  Scenario,
  SystemProposal,
  WorldInfo,
  AppConfig,
  SessionSummary,
} from '../types/models';
import type { AppSettings } from '../types/settings';
import { DEFAULT_SETTINGS } from '../types/settings';
import { GameEngine } from '../game/engine';
import { createStorage } from '../services/storage';
import { streamChatText, type LLMConfig } from '../services/llm';
import { prompts } from '../services/prompts';
import { listWorlds, loadBuiltInWorld } from '../services/world';
import { loadSettings, saveSettings, loadApiKey, saveApiKey, testConnection } from '../services/config';
import { generateId, generateQaId } from '../utils/format';

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

  // Streaming state
  isStreaming: boolean;
  streamedText: string;

  // UI state
  isLoading: boolean;
  loadingText: string;
  error: string | null;
  showConfirmEnd: boolean;

  // Engine & storage
  engine: GameEngine;
  storage: ReturnType<typeof createStorage>;

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
  testLlmConnection: () => Promise<boolean>;

  // Actions - worlds
  loadWorlds: () => Promise<void>;

  // Actions - game
  startBasicGame: (name: string, world: string, isBuiltIn: boolean, type: 'single' | 'directory') => Promise<void>;
  generateSystemProposals: (name: string, world: string, isBuiltIn: boolean, type: 'single' | 'directory') => Promise<void>;
  selectSystem: (proposal: SystemProposal) => void;
  startSystemGame: () => Promise<void>;
  makeChoice: (choiceId: string) => Promise<void>;
  generateBiography: () => Promise<void>;
  endGame: () => void;
  newGame: () => void;
  checkResume: () => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  resumeGame: (sessionId: string) => Promise<void>;

  // Actions - QA
  askQuestion: (question: string) => Promise<void>;

  // Actions - utility
  setError: (error: string | null) => void;
  setShowConfirmEnd: (show: boolean) => void;
  appendStreamedText: (text: string) => void;
}

function configToLlm(config: AppConfig): LLMConfig {
  return {
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
    apiKey: s.apiKey,
    baseUrl: s.baseUrl,
    model: s.model,
    temperature: s.temperature,
    maxTokens: s.maxTokens,
    timeout: s.timeout,
  };
}

export const useGameStore = create<GameState>((set, get) => ({
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

  isStreaming: false,
  streamedText: '',

  isLoading: false,
  loadingText: '',
  error: null,
  showConfirmEnd: false,

  engine: new GameEngine(),
  storage: createStorage(),

  // Screen actions
  setScreen: (screen) => set({ currentScreen: screen }),
  setShowSettings: (show) => set({ showSettings: show }),
  setShowWorldManager: (show) => set({ showWorldManager: show }),

  // Config actions
  setConfig: (config) => set({ config }),

  loadConfig: async () => {
    const storage = get().storage;
    try {
      const apiKey = await loadApiKey();
      const raw = await storage.getConfig('app_config');
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AppConfig>;
        const settings = get().settings;
        set({ config: { ...settings, ...parsed, apiKey } as AppConfig });
      } else {
        // No stored config, derive from current settings
        set({ config: settingsToConfig(get().settings) });
      }
    } catch {
      // Derive from settings as fallback
      set({ config: settingsToConfig(get().settings) });
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
    const settings = await loadSettings((key) => storage.getConfig(key));
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
    const newSettings = { ...get().settings, ...updates };
    const newConfig = settingsToConfig(newSettings);
    set({ settings: newSettings, config: newConfig });

    // Update engine
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

    // Save
    const storage = get().storage;
    await saveSettings((key, value) => storage.setConfig(key, value), newSettings);
    // Also persist the config for backward compatibility
    await saveApiKey(newConfig.apiKey);
    const { apiKey: _, ...rest } = newConfig;
    await storage.setConfig('app_config', JSON.stringify(rest));
  },

  testLlmConnection: async () => {
    const { settings } = get();
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
      }));
      set({ worlds });
    } catch (e) {
      console.error('Failed to load worlds:', e);
    }
  },

  // Game actions
  startBasicGame: async (name, world, isBuiltIn, type) => {
    const { config, engine, storage } = get();
    if (!config) {
      set({ error: '请先配置 LLM' });
      return;
    }

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
        sessionId: generateId(),
        world,
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
          set((state) => ({ streamedText: state.streamedText + token }));
        }
      );

      await storage.saveSession(session);

      set({
        session,
        currentScenario: session.scenarios[0],
        isStreaming: false,
        streamedText: '',
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : '开始游戏失败',
        isStreaming: false,
        streamedText: '',
        currentScreen: 'start',
      });
    }
  },

  generateSystemProposals: async (name, world, isBuiltIn, type) => {
    const { config, engine } = get();
    if (!config) {
      set({ error: '请先配置 LLM' });
      return;
    }

    set({
      currentScreen: 'system',
      isStreaming: true,
      streamedText: '',
      systemProposals: [],
      selectedSystem: null,
      pendingStartParams: { name, world, isBuiltIn, type },
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
          set((state) => ({ streamedText: state.streamedText + token }));
        }
      );

      set({
        systemProposals: proposals,
        isStreaming: false,
        streamedText: '',
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : '生成系统方案失败',
        isStreaming: false,
        streamedText: '',
      });
    }
  },

  selectSystem: (proposal) => set({ selectedSystem: proposal }),

  startSystemGame: async () => {
    const { config, engine, storage, selectedSystem, pendingStartParams } = get();
    if (!config || !selectedSystem || !pendingStartParams) return;

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
        sessionId: generateId(),
        world: pendingStartParams.world,
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
          set((state) => ({ streamedText: state.streamedText + token }));
        }
      );

      await storage.saveSession(newSession);

      set({
        session: newSession,
        currentScenario: newSession.scenarios[0],
        isStreaming: false,
        streamedText: '',
        selectedSystem: null,
        pendingStartParams: null,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : '开始游戏失败',
        isStreaming: false,
        streamedText: '',
        pendingStartParams: null,
      });
    }
  },

  makeChoice: async (choiceId) => {
    const { session, config, engine, storage } = get();
    if (!session || !config) return;

    set({ isStreaming: true, streamedText: '' });

    try {
      const llmConfig = configToLlm(config);
      const result = await engine.processChoice(session, choiceId, llmConfig, (token) => {
        set((state) => ({ streamedText: state.streamedText + token }));
      });

      await storage.saveSession(result.session);

      set({
        session: result.session,
        currentScenario: result.scenario || result.session.scenarios[result.session.scenarios.length - 1],
        isStreaming: false,
        streamedText: '',
      });

      // If game ended, go to biography
      if (!result.session.isActive) {
        // Stay on game screen, show end choice
      }
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : '处理选择失败',
        isStreaming: false,
        streamedText: '',
      });
    }
  },

  generateBiography: async () => {
    const { session, config, storage } = get();
    if (!session || !config) return;

    // Switch to biography screen immediately with streaming state
    set({
      currentScreen: 'biography',
      session: { ...session, biography: '' },
      isLoading: false,
      isStreaming: true,
      streamedText: '',
    });

    try {
      const llmConfig = configToLlm(config);
      // Biography needs more output tokens (2000-4000 Chinese characters)
      const bioLlmConfig = { ...llmConfig, maxTokens: 8192 };

      let worldContent = '';
      try {
        worldContent = await loadBuiltInWorld(session.world, 'single');
      } catch {
        try {
          worldContent = await loadBuiltInWorld(session.world, 'directory');
        } catch {
          worldContent = '未知世界';
        }
      }

      // Use compressed world themes + compressed history for biography
      // This preserves narrative richness while fitting within token limits
      const worldThemes = prompts.extractWorldThemes(worldContent);
      const biographyHistory = prompts.formatHistoryForBiography(
        session.player.history,
        session.player.summary
      );

      const bioPrompt = prompts.format(prompts.biographyPrompt(), {
        world_context: worldThemes,
        system_context: session.system || '',
        player_name: session.player.name,
        player_history: biographyHistory,
      });

      const biography = await streamChatText(
        [{ role: 'user', content: bioPrompt }],
        bioLlmConfig,
        (token) => {
          set((state) => ({ streamedText: state.streamedText + token }));
        }
      );

      const updatedSession = { ...session, biography };
      await storage.saveSession(updatedSession);

      set({
        session: updatedSession,
        isStreaming: false,
        streamedText: '',
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : '生成传记失败',
        isStreaming: false,
        streamedText: '',
      });
    }
  },

  endGame: () => {
    set({ showConfirmEnd: false });
    const { session, storage } = get();
    if (session) {
      session.isActive = false;
      storage.saveSession(session);
    }
    // Go to biography
    get().generateBiography();
  },

  newGame: () => {
    set({
      currentScreen: 'start',
      session: null,
      currentScenario: null,
      systemProposals: [],
      selectedSystem: null,
      streamedText: '',
      isStreaming: false,
    });
  },

  checkResume: async () => {
    try {
      const sessions = await get().storage.listSessions(true);
      const summaries: SessionSummary[] = sessions.map((s) => ({
        sessionId: s.sessionId,
        world: s.world,
        playerName: s.player.name,
        isActive: s.isActive,
        historyLength: s.player.history.length,
        createdAt: s.createdAt,
      }));
      set({ resumeSessions: summaries });
    } catch {
      // No sessions to resume
    }
  },

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
        set({
          session,
          currentScenario: session.scenarios[session.scenarios.length - 1],
          currentScreen: session.isActive ? 'game' : 'biography',
        });
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : '恢复游戏失败' });
    }
  },

  // QA actions
  askQuestion: async (question) => {
    const { session, config, storage, engine } = get();
    if (!session || !config) return;

    // Prevent duplicate consecutive questions
    const currentHistory = session.player.qaHistory ?? [];
    if (currentHistory.length > 0) {
      const lastMsg = currentHistory[currentHistory.length - 1];
      if (lastMsg.role === 'user' && lastMsg.content === question) {
        return;
      }
    }

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
    });

    try {
      const llmConfig = configToLlm(config);
      const answer = await engine.answerQuery(
        updatedSession,
        question,
        true,
        'single',
        llmConfig,
        (token) => {
          set((state) => ({ streamedText: state.streamedText + token }));
        }
      );

      // Build final session with assistant answer
      const finalSession = {
        ...updatedSession,
        player: {
          ...updatedSession.player,
          qaHistory: [
            ...updatedSession.player.qaHistory,
            { role: 'assistant' as const, content: answer, id: generateQaId() },
          ],
        },
      };

      await storage.saveSession(finalSession);

      // Clear streamedText after QA is done
      set({
        session: finalSession,
        streamedText: '',
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : '问答失败',
        streamedText: '',
      });
    }
  },

  // Utility actions
  setError: (error) => set({ error }),
  setShowConfirmEnd: (show) => set({ showConfirmEnd: show }),
  appendStreamedText: (text) =>
    set((state) => ({ streamedText: state.streamedText + text })),
}));
